"""Payroll runs, payslips, adjustments and statutory / bank exports.

Flow: create a run for a period -> payslips are generated per active
employee from attendance, holidays, leave, components, loans, overtime and
Ghana statutory deductions -> admin reviews and adds bonuses/deductions ->
approve (loan balances are reduced) -> mark paid (locks the run).
"""
import csv
import io
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models import (
    PayrollEmployee, PayrollLoan, PayrollLoanRepayment, PayrollPayment, PayrollPayslip,
    PayrollPayslipItem, PayrollRun,
)
from app.routers.auth import require_admin
from app.schemas import (
    PayrollRunCreate, PayrollRunOut, PayslipItemIn, PayslipOut, PayslipUpdate,
)
from app.services.common import audit, get_settings
from app.services.engine import finalize, generate_payslips

router = APIRouter(prefix="/api/v1/payroll", tags=["payroll"], dependencies=[Depends(require_admin)])

ZERO = Decimal("0")


def _run_out(run: PayrollRun) -> PayrollRunOut:
    slips = run.payslips
    return PayrollRunOut(
        id=run.id, label=run.label, period_start=run.period_start,
        period_end=run.period_end, status=run.status, created_at=run.created_at,
        approved_at=run.approved_at, paid_at=run.paid_at,
        payslips_count=len(slips),
        total_gross=sum((p.gross_pay for p in slips), ZERO),
        total_net=sum((p.net_pay for p in slips), ZERO),
        total_paye=sum((p.paye for p in slips), ZERO),
        total_ssnit_employee=sum((p.ssnit_employee for p in slips), ZERO),
        total_ssnit_employer=sum((p.ssnit_employer for p in slips), ZERO),
    )


def slip_out(s: PayrollPayslip, run: PayrollRun | None = None, company=None) -> PayslipOut:
    e = s.employee
    run = run or s.run
    return PayslipOut(
        id=s.id, run_id=s.run_id, employee_id=s.employee_id,
        days_present=s.days_present, days_late=s.days_late,
        days_absent=s.days_absent, days_leave=s.days_leave,
        days_half=s.days_half, days_holiday=s.days_holiday,
        days_expected=s.days_expected, days_payable=s.days_payable,
        overtime_hours=s.overtime_hours, overtime_pay=s.overtime_pay,
        basic_pay=s.basic_pay, allowances=s.allowances, deductions=s.deductions,
        loan_deduction=s.loan_deduction, ssnit_employee=s.ssnit_employee,
        paye=s.paye, ssnit_employer=s.ssnit_employer, taxable_income=s.taxable_income,
        gross_pay=s.gross_pay, net_pay=s.net_pay, notes=s.notes, created_at=s.created_at,
        employee_name=e.full_name if e else None,
        employee_code=e.employee_code if e else None,
        department=e.department if e else None,
        position=e.position if e else None,
        ssnit_number=e.ssnit_number if e else None,
        tin_number=e.tin_number if e else None,
        payment_method=e.payment_method if e else None,
        bank_name=e.bank_name if e else None,
        bank_account=e.bank_account if e else None,
        run_label=run.label if run else None,
        run_status=run.status if run else None,
        period_start=run.period_start if run else None,
        period_end=run.period_end if run else None,
        items=list(s.items),
        company_name=company.company_name if company else None,
        company_address=company.company_address if company else None,
        company_tin=company.company_tin if company else None,
    )


def _load_run(db: Session, run_id: int) -> PayrollRun:
    run = db.execute(
        select(PayrollRun).options(joinedload(PayrollRun.payslips)).where(PayrollRun.id == run_id)
    ).unique().scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Payroll run not found")
    return run


@router.get("/runs", response_model=list[PayrollRunOut])
def list_runs(db: Session = Depends(get_db)):
    runs = db.execute(
        select(PayrollRun).options(joinedload(PayrollRun.payslips)).order_by(PayrollRun.created_at.desc())
    ).unique().scalars().all()
    return [_run_out(r) for r in runs]


@router.post("/runs", response_model=PayrollRunOut, status_code=status.HTTP_201_CREATED)
def create_run(payload: PayrollRunCreate, db: Session = Depends(get_db)):
    """Create a payroll run and generate payslips for all active employees."""
    if payload.period_end < payload.period_start:
        raise HTTPException(422, "period_end must be on or after period_start")
    if (payload.period_end - payload.period_start).days > 62:
        raise HTTPException(422, "A payroll period cannot be longer than about two months")
    overlap = db.execute(select(PayrollRun).where(
        PayrollRun.period_start <= payload.period_end,
        PayrollRun.period_end >= payload.period_start,
    ).limit(1)).scalar_one_or_none()
    if overlap:
        raise HTTPException(409, f"Payroll period overlaps an existing run ({overlap.label})")

    run = PayrollRun(
        label=payload.label, period_start=payload.period_start,
        period_end=payload.period_end, status="DRAFT",
    )
    db.add(run)
    db.flush()
    s = get_settings(db)
    n = generate_payslips(db, run, s)
    audit(db, "CREATE", "payroll_run", run.id, f"Created {run.label} with {n} payslips")
    db.commit()
    return _run_out(_load_run(db, run.id))


@router.get("/runs/{run_id}", response_model=PayrollRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    return _run_out(_load_run(db, run_id))


@router.post("/runs/{run_id}/regenerate", response_model=PayrollRunOut)
def regenerate_run(run_id: int, db: Session = Depends(get_db)):
    """Recalculate a draft run from the latest attendance, leave and settings.
    Manual bonuses / deductions are kept."""
    run = _load_run(db, run_id)
    if run.status != "DRAFT":
        raise HTTPException(409, "Only draft runs can be recalculated")
    n = generate_payslips(db, run, get_settings(db))
    audit(db, "REGENERATE", "payroll_run", run.id, f"Recalculated {run.label} ({n} payslips)")
    db.commit()
    return _run_out(_load_run(db, run_id))


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = _load_run(db, run_id)
    if run.status != "DRAFT":
        raise HTTPException(409, "Only draft runs can be deleted. Re-open an approved run first.")
    audit(db, "DELETE", "payroll_run", run.id, f"Deleted draft run {run.label}")
    db.delete(run)
    db.commit()


def _apply_loans(db: Session, run: PayrollRun) -> None:
    for slip in run.payslips:
        for it in slip.items:
            if it.source != "LOAN" or not it.ref_id:
                continue
            loan = db.get(PayrollLoan, it.ref_id)
            if not loan or loan.status != "ACTIVE":
                continue
            amt = min(Decimal(str(it.amount)), Decimal(str(loan.balance)))
            loan.balance = loan.balance - amt
            if loan.balance <= 0:
                loan.balance = ZERO
                loan.status = "CLEARED"
            db.add(PayrollLoanRepayment(loan_id=loan.id, payslip_id=slip.id, amount=amt))


def _revert_loans(db: Session, run: PayrollRun) -> None:
    slip_ids = [p.id for p in run.payslips]
    if not slip_ids:
        return
    reps = db.execute(
        select(PayrollLoanRepayment).where(PayrollLoanRepayment.payslip_id.in_(slip_ids))
    ).scalars().all()
    for rep in reps:
        loan = db.get(PayrollLoan, rep.loan_id)
        if loan:
            loan.balance = loan.balance + rep.amount
            if loan.status == "CLEARED":
                loan.status = "ACTIVE"
        db.delete(rep)


@router.post("/runs/{run_id}/approve", response_model=PayrollRunOut)
def approve_run(run_id: int, db: Session = Depends(get_db)):
    run = _load_run(db, run_id)
    if run.status != "DRAFT":
        raise HTTPException(409, f"Run is already {run.status.lower()}")
    if not run.payslips:
        raise HTTPException(409, "This run has no payslips to approve")
    negative = [p for p in run.payslips if p.net_pay < 0]
    if negative:
        names = ", ".join(p.employee.full_name for p in negative[:3])
        raise HTTPException(409, f"Net pay is negative for: {names}. Adjust deductions before approving.")
    _apply_loans(db, run)
    run.status = "APPROVED"
    run.approved_at = datetime.now(timezone.utc)
    audit(db, "APPROVE", "payroll_run", run.id, f"Approved {run.label}")
    db.commit()
    return _run_out(_load_run(db, run_id))


@router.post("/runs/{run_id}/reopen", response_model=PayrollRunOut)
def reopen_run(run_id: int, db: Session = Depends(get_db)):
    """Send an approved (not yet paid) run back to draft for corrections."""
    run = _load_run(db, run_id)
    if run.status != "APPROVED":
        raise HTTPException(409, "Only approved runs can be re-opened")
    _revert_loans(db, run)
    run.status = "DRAFT"
    run.approved_at = None
    audit(db, "REOPEN", "payroll_run", run.id, f"Re-opened {run.label}")
    db.commit()
    return _run_out(_load_run(db, run_id))


@router.post("/runs/{run_id}/mark-paid", response_model=PayrollRunOut)
def mark_paid(run_id: int, db: Session = Depends(get_db)):
    run = _load_run(db, run_id)
    if run.status != "APPROVED":
        raise HTTPException(409, "Run must be approved before marking paid")
    run.status = "PAID"
    run.paid_at = datetime.now(timezone.utc)
    period = run.period_start.strftime("%Y-%m")
    for slip in run.payslips:
        if slip.net_pay > 0:
            db.add(PayrollPayment(
                employee_id=slip.employee_id, period=period,
                days_attended=slip.days_payable, days_total=int(slip.days_expected or 0),
                amount=slip.net_pay, method=slip.employee.payment_method or "BANK",
                note=f"{run.label} net pay", source="PAYROLL_RUN", run_id=run.id, paid_by="admin",
            ))
    audit(db, "MARK_PAID", "payroll_run", run.id, f"Marked {run.label} paid")
    db.commit()
    return _run_out(_load_run(db, run_id))


@router.get("/runs/{run_id}/payslips", response_model=list[PayslipOut])
def run_payslips(run_id: int, db: Session = Depends(get_db)):
    run = _load_run(db, run_id)
    slips = db.execute(
        select(PayrollPayslip)
        .options(joinedload(PayrollPayslip.employee))
        .join(PayrollEmployee, PayrollPayslip.employee_id == PayrollEmployee.id)
        .where(PayrollPayslip.run_id == run_id)
        .order_by(PayrollEmployee.full_name)
    ).scalars().all()
    return [slip_out(s, run) for s in slips]


def _load_slip(db: Session, slip_id: int) -> PayrollPayslip:
    slip = db.execute(
        select(PayrollPayslip).options(
            joinedload(PayrollPayslip.employee), joinedload(PayrollPayslip.run),
        ).where(PayrollPayslip.id == slip_id)
    ).scalar_one_or_none()
    if not slip:
        raise HTTPException(404, "Payslip not found")
    return slip


@router.get("/payslips/{slip_id}", response_model=PayslipOut)
def get_payslip(slip_id: int, db: Session = Depends(get_db)):
    return slip_out(_load_slip(db, slip_id), company=get_settings(db))


@router.patch("/payslips/{slip_id}", response_model=PayslipOut)
def update_payslip(slip_id: int, payload: PayslipUpdate, db: Session = Depends(get_db)):
    slip = _load_slip(db, slip_id)
    if slip.run.status != "DRAFT":
        raise HTTPException(409, "Only draft runs can be edited")
    slip.notes = payload.notes
    db.commit()
    return slip_out(slip, company=get_settings(db))


@router.post("/payslips/{slip_id}/items", response_model=PayslipOut, status_code=201)
def add_item(slip_id: int, payload: PayslipItemIn, db: Session = Depends(get_db)):
    """Add a one-off bonus / allowance / deduction; SSNIT, PAYE and net are recalculated."""
    slip = _load_slip(db, slip_id)
    if slip.run.status != "DRAFT":
        raise HTTPException(409, "Only draft runs can be edited")
    slip.items.append(PayrollPayslipItem(
        kind=payload.kind, name=payload.name, amount=payload.amount,
        taxable=payload.taxable if payload.kind != "DEDUCTION" else False, source="MANUAL",
    ))
    finalize(slip, slip.employee, get_settings(db))
    audit(db, "ADJUST", "payslip", slip.id, f"Added {payload.kind} '{payload.name}' ₵{payload.amount} for {slip.employee.employee_code}")
    db.commit()
    db.refresh(slip)
    return slip_out(slip, company=get_settings(db))


@router.delete("/payslips/{slip_id}/items/{item_id}", response_model=PayslipOut)
def delete_item(slip_id: int, item_id: int, db: Session = Depends(get_db)):
    slip = _load_slip(db, slip_id)
    if slip.run.status != "DRAFT":
        raise HTTPException(409, "Only draft runs can be edited")
    item = next((i for i in slip.items if i.id == item_id), None)
    if not item:
        raise HTTPException(404, "Line item not found")
    slip.items.remove(item)
    finalize(slip, slip.employee, get_settings(db))
    audit(db, "ADJUST", "payslip", slip.id, f"Removed '{item.name}' for {slip.employee.employee_code}")
    db.commit()
    db.refresh(slip)
    return slip_out(slip, company=get_settings(db))


# ------------------------------ Exports ---------------------------------

def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return StreamingResponse(
        iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/runs/{run_id}/export/{kind}.csv")
def export_run(run_id: int, kind: str, db: Session = Depends(get_db)):
    """kind: register (full payroll register) | bank (payment schedule) |
    ssnit (SSNIT contribution schedule) | paye (GRA PAYE schedule)."""
    run = _load_run(db, run_id)
    slips = db.execute(
        select(PayrollPayslip).options(joinedload(PayrollPayslip.employee))
        .join(PayrollEmployee, PayrollPayslip.employee_id == PayrollEmployee.id)
        .where(PayrollPayslip.run_id == run_id).order_by(PayrollEmployee.full_name)
    ).scalars().all()
    tag = run.label.replace(" ", "_")
    if kind == "register":
        rows = [["Code", "Employee", "Department", "Days payable", "Basic", "Allowances", "Overtime",
                 "Gross", "SSNIT (5.5%)", "Taxable income", "PAYE", "Loans", "Other deductions", "Net pay", "Employer SSNIT (13%)"]]
        for p in slips:
            e = p.employee
            rows.append([e.employee_code, e.full_name, e.department or "", p.days_payable, p.basic_pay,
                         p.allowances, p.overtime_pay, p.gross_pay, p.ssnit_employee, p.taxable_income,
                         p.paye, p.loan_deduction, p.deductions - p.loan_deduction, p.net_pay, p.ssnit_employer])
        rows.append(["", "TOTAL", "", "", sum(p.basic_pay for p in slips), sum(p.allowances for p in slips),
                     sum(p.overtime_pay for p in slips), sum(p.gross_pay for p in slips),
                     sum(p.ssnit_employee for p in slips), sum(p.taxable_income for p in slips),
                     sum(p.paye for p in slips), sum(p.loan_deduction for p in slips),
                     sum(p.deductions - p.loan_deduction for p in slips),
                     sum(p.net_pay for p in slips), sum(p.ssnit_employer for p in slips)])
        return _csv_response(rows, f"register_{tag}.csv")
    if kind == "bank":
        rows = [["Code", "Employee", "Payment method", "Bank / Network", "Account / MoMo number", "Net pay"]]
        for p in slips:
            if p.net_pay > 0:
                e = p.employee
                rows.append([e.employee_code, e.full_name, e.payment_method, e.bank_name or "", e.bank_account or "", p.net_pay])
        rows.append(["", "TOTAL", "", "", "", sum(p.net_pay for p in slips if p.net_pay > 0)])
        return _csv_response(rows, f"payments_{tag}.csv")
    if kind == "ssnit":
        rows = [["SSNIT No.", "Employee", "Basic salary", "Employee 5.5%", "Employer 13%", "Total contribution"]]
        for p in slips:
            e = p.employee
            rows.append([e.ssnit_number or "", e.full_name, p.basic_pay, p.ssnit_employee, p.ssnit_employer,
                         p.ssnit_employee + p.ssnit_employer])
        rows.append(["", "TOTAL", sum(p.basic_pay for p in slips), sum(p.ssnit_employee for p in slips),
                     sum(p.ssnit_employer for p in slips),
                     sum(p.ssnit_employee + p.ssnit_employer for p in slips)])
        return _csv_response(rows, f"ssnit_{tag}.csv")
    if kind == "paye":
        rows = [["TIN", "Employee", "Gross pay", "SSNIT relief", "Taxable income", "PAYE"]]
        for p in slips:
            e = p.employee
            rows.append([e.tin_number or "", e.full_name, p.gross_pay, p.ssnit_employee, p.taxable_income, p.paye])
        rows.append(["", "TOTAL", sum(p.gross_pay for p in slips), sum(p.ssnit_employee for p in slips),
                     sum(p.taxable_income for p in slips), sum(p.paye for p in slips)])
        return _csv_response(rows, f"paye_{tag}.csv")
    raise HTTPException(404, "Unknown export")


@router.get("/reports/summary")
def payroll_summary(year: int | None = Query(default=None, ge=2000, le=2100), db: Session = Depends(get_db)):
    """Month-by-month payroll totals and a department breakdown of the latest run."""
    year = year or datetime.now().year
    runs = db.execute(
        select(PayrollRun).options(joinedload(PayrollRun.payslips).joinedload(PayrollPayslip.employee))
        .where(PayrollRun.period_end >= datetime(year, 1, 1).date(), PayrollRun.period_start <= datetime(year, 12, 31).date())
        .order_by(PayrollRun.period_start)
    ).unique().scalars().all()
    months = []
    for r in runs:
        sl = r.payslips
        months.append({
            "run_id": r.id, "label": r.label, "status": r.status,
            "period_start": r.period_start, "period_end": r.period_end,
            "employees": len(sl),
            "gross": sum((p.gross_pay for p in sl), ZERO),
            "ssnit_employee": sum((p.ssnit_employee for p in sl), ZERO),
            "ssnit_employer": sum((p.ssnit_employer for p in sl), ZERO),
            "paye": sum((p.paye for p in sl), ZERO),
            "net": sum((p.net_pay for p in sl), ZERO),
            "employer_cost": sum((p.gross_pay + p.ssnit_employer for p in sl), ZERO),
        })
    latest = runs[-1] if runs else None
    depts: dict[str, dict] = defaultdict(lambda: {"employees": 0, "gross": ZERO, "net": ZERO})
    if latest:
        for p in latest.payslips:
            d = depts[p.employee.department or "Unassigned"]
            d["employees"] += 1
            d["gross"] += p.gross_pay
            d["net"] += p.net_pay
    totals = {
        k: sum((m[k] for m in months), ZERO)
        for k in ("gross", "ssnit_employee", "ssnit_employer", "paye", "net", "employer_cost")
    }
    return {
        "year": year, "months": months, "totals": totals,
        "latest_run": latest.label if latest else None,
        "departments": [{"department": k, **v} for k, v in sorted(depts.items())],
    }
