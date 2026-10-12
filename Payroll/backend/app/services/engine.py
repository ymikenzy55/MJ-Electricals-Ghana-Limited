"""Payroll calculation engine.

`generate_payslips` builds one payslip per eligible employee for a run from
attendance, public holidays, approved leave, recurring components, staff
loans, overtime and the Ghana statutory deductions. `finalize` recomputes the
totals of a single payslip from its line items and is shared by the
generator and by the manual-adjustment endpoints.
"""
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.statutory import compute_paye, compute_ssnit, money
from app.models import (
    PayrollAttendance, PayrollComponent, PayrollEmployee, PayrollLoan,
    PayrollPayslip, PayrollPayslipItem, PayrollRun, PayrollSetting,
)
from app.services.common import (
    daterange, holiday_dates, working_days_between, working_weekdays,
)

ZERO = Decimal("0")
EARNING_KINDS = {"ALLOWANCE", "BONUS"}


def _hours(rec: PayrollAttendance) -> Decimal:
    if not rec.check_in or not rec.check_out or rec.check_out <= rec.check_in:
        return ZERO
    return Decimal(str((rec.check_out - rec.check_in).total_seconds() / 3600))


def finalize(slip: PayrollPayslip, emp: PayrollEmployee, s: PayrollSetting) -> None:
    """Recompute all money fields of a payslip from basic/overtime + items."""
    allowances = sum((i.amount for i in slip.items if i.kind in EARNING_KINDS), ZERO)
    taxable_allow = sum((i.amount for i in slip.items if i.kind in EARNING_KINDS and i.taxable), ZERO)
    loans = sum((i.amount for i in slip.items if i.kind == "LOAN"), ZERO)
    deductions = sum((i.amount for i in slip.items if i.kind not in EARNING_KINDS), ZERO)

    basic = Decimal(str(slip.basic_pay))
    overtime = Decimal(str(slip.overtime_pay))

    ssnit_emp = ssnit_er = ZERO
    if s.ssnit_enabled and not emp.ssnit_exempt:
        ssnit_emp, ssnit_er = compute_ssnit(basic, s.ssnit_employee_rate, s.ssnit_employer_rate)

    taxable = max(basic + taxable_allow + overtime - ssnit_emp, ZERO)
    paye = compute_paye(taxable, s.tax_bands) if s.paye_enabled else ZERO

    slip.allowances = money(allowances)
    slip.deductions = money(deductions)
    slip.loan_deduction = money(loans)
    slip.ssnit_employee = ssnit_emp
    slip.ssnit_employer = ssnit_er
    slip.taxable_income = money(taxable)
    slip.paye = paye
    slip.gross_pay = money(basic + allowances + overtime)
    slip.net_pay = money(slip.gross_pay - ssnit_emp - paye - deductions)


def _apply_attendance(
    emp: PayrollEmployee, run: PayrollRun, s: PayrollSetting,
    records: dict[date, PayrollAttendance], holidays: dict[date, str],
    weekdays: set[int], today: date,
) -> dict:
    eff_start = max(run.period_start, emp.hire_date) if emp.hire_date else run.period_start
    eff_end = min(run.period_end, emp.termination_date) if emp.termination_date else run.period_end

    full_expected = len(
        [d for d in daterange(run.period_start, run.period_end) if d.weekday() in weekdays]
    )
    out = {
        "present": 0, "late": 0, "absent": 0, "leave": 0, "half": 0, "holiday": 0,
        "payable": Decimal("0"), "expected": Decimal(full_expected),
        "ot_hours": ZERO, "late_count": 0,
    }
    if eff_start > eff_end:
        return out

    std_hours = Decimal(str(s.standard_hours_per_day or 8))
    for d in daterange(eff_start, eff_end):
        rec = records.get(d)
        working = d.weekday() in weekdays
        if working and d in holidays:
            out["holiday"] += 1
            out["payable"] += 1
        elif working:
            if rec is None:
                if d > today:
                    out["payable"] += 1  # future day, assumed worked
                else:
                    out["absent"] += 1
            elif rec.status == "PRESENT":
                out["present"] += 1
                out["payable"] += 1
            elif rec.status == "LATE":
                out["late"] += 1
                out["late_count"] += 1
                out["payable"] += 1
            elif rec.status == "HALF_DAY":
                out["half"] += 1
                out["payable"] += Decimal("0.5")
            elif rec.status == "LEAVE":
                out["leave"] += 1
                out["payable"] += 1
            else:  # ABSENT
                out["absent"] += 1
        if rec is not None and s.overtime_enabled:
            worked = _hours(rec)
            if worked > 0 and rec.status in ("PRESENT", "LATE", "HALF_DAY"):
                if working and d not in holidays:
                    out["ot_hours"] += max(worked - std_hours, ZERO)
                else:  # rest day / public holiday, all hours are overtime
                    out["ot_hours"] += worked
    return out


def generate_payslips(db: Session, run: PayrollRun, s: PayrollSetting) -> int:
    """(Re)create payslips for `run`. Manual items on existing payslips are kept."""
    weekdays = working_weekdays(s)
    holidays = holiday_dates(db, run.period_start, run.period_end)
    today = date.today()

    # carry over manual items across regeneration
    kept: dict[int, list[tuple[str, str, Decimal, bool]]] = defaultdict(list)
    kept_notes: dict[int, str | None] = {}
    for old in list(run.payslips):
        for it in old.items:
            if it.source == "MANUAL":
                kept[old.employee_id].append((it.kind, it.name, it.amount, it.taxable))
        kept_notes[old.employee_id] = old.notes
        db.delete(old)
    db.flush()
    run.payslips = []

    employees = db.execute(
        select(PayrollEmployee).where(PayrollEmployee.status == "ACTIVE")
    ).scalars().all()
    if not employees:
        return 0
    emp_ids = [e.id for e in employees]

    # ---- bulk-load everything once (remote DB: avoid per-employee queries)
    att_rows = db.execute(
        select(PayrollAttendance).where(
            PayrollAttendance.employee_id.in_(emp_ids),
            PayrollAttendance.date >= run.period_start,
            PayrollAttendance.date <= run.period_end,
        )
    ).scalars().all()
    att: dict[int, dict[date, PayrollAttendance]] = defaultdict(dict)
    for r in att_rows:
        att[r.employee_id][r.date] = r

    comps: dict[int, list[PayrollComponent]] = defaultdict(list)
    for c in db.execute(
        select(PayrollComponent).where(
            PayrollComponent.employee_id.in_(emp_ids), PayrollComponent.is_active.is_(True)
        )
    ).scalars():
        if c.start_date and c.start_date > run.period_end:
            continue
        if c.end_date and c.end_date < run.period_start:
            continue
        comps[c.employee_id].append(c)

    loans: dict[int, list[PayrollLoan]] = defaultdict(list)
    for ln in db.execute(
        select(PayrollLoan).where(
            PayrollLoan.employee_id.in_(emp_ids),
            PayrollLoan.status == "ACTIVE", PayrollLoan.balance > 0,
        )
    ).scalars():
        loans[ln.employee_id].append(ln)

    std_hours = Decimal(str(s.standard_hours_per_day or 8))
    count = 0
    for emp in employees:
        # Skip people who were not employed at all during the period.
        if emp.hire_date and emp.hire_date > run.period_end:
            continue
        if emp.termination_date and emp.termination_date < run.period_start:
            continue

        a = _apply_attendance(emp, run, s, att.get(emp.id, {}), holidays, weekdays, today)
        base = Decimal(str(emp.base_salary))
        if emp.salary_type == "DAILY":
            basic = money(base * a["payable"])
            hourly = base / std_hours
        else:
            expected = a["expected"] or Decimal(s.working_days_per_month or 26)
            basic = money(base * a["payable"] / expected) if expected else ZERO
            hourly = base / Decimal(s.working_days_per_month or 26) / std_hours

        ot_pay = ZERO
        if s.overtime_enabled and a["ot_hours"] > 0:
            ot_pay = money(a["ot_hours"] * hourly * Decimal(str(s.overtime_multiplier)))

        slip = PayrollPayslip(
            run_id=run.id, employee_id=emp.id,
            days_present=a["present"], days_late=a["late"], days_absent=a["absent"],
            days_leave=a["leave"], days_half=a["half"], days_holiday=a["holiday"],
            days_expected=a["expected"], days_payable=a["payable"],
            overtime_hours=money(a["ot_hours"]), overtime_pay=ot_pay,
            basic_pay=basic, notes=kept_notes.get(emp.id),
        )
        items: list[PayrollPayslipItem] = []
        for c in comps.get(emp.id, []):
            items.append(PayrollPayslipItem(
                kind=c.kind, name=c.name, amount=c.amount, taxable=c.taxable,
                source="COMPONENT", ref_id=c.id,
            ))
        if s.late_deduction_enabled and a["late_count"] and s.late_deduction_amount:
            items.append(PayrollPayslipItem(
                kind="LATE", name=f"Late arrivals ({a['late_count']})",
                amount=money(Decimal(a["late_count"]) * Decimal(str(s.late_deduction_amount))),
                taxable=False, source="LATE",
            ))
        for ln in loans.get(emp.id, []):
            amt = min(Decimal(str(ln.installment)), Decimal(str(ln.balance)))
            if amt > 0:
                items.append(PayrollPayslipItem(
                    kind="LOAN", name=f"Loan repayment, {ln.reason or 'staff loan'}",
                    amount=money(amt), taxable=False, source="LOAN", ref_id=ln.id,
                ))
        for kind, name, amount, taxable in kept.get(emp.id, []):
            items.append(PayrollPayslipItem(
                kind=kind, name=name, amount=amount, taxable=taxable, source="MANUAL",
            ))
        slip.items = items
        finalize(slip, emp, s)
        db.add(slip)
        count += 1
    return count
