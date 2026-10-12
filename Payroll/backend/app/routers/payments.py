"""Payment log: amounts paid to employees, either from a payroll run or set
manually from the days a person attended. Entries are append-only."""
import csv
import io
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models import PayrollEmployee, PayrollPayment
from app.routers.auth import require_admin
from app.services import attendance_calc as calc
from app.services.common import audit, get_settings, working_weekdays

router = APIRouter(prefix="/api/v1/payments", tags=["payments"], dependencies=[Depends(require_admin)])


class PaymentIn(BaseModel):
    employee_id: int
    period: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: Literal["CASH", "MOMO", "BANK"] = "CASH"
    reference: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=255)


def _out(p: PayrollPayment) -> dict:
    return {
        "id": p.id, "employee_id": p.employee_id,
        "employee_name": p.employee.full_name if p.employee else None,
        "employee_code": p.employee.employee_code if p.employee else None,
        "period": p.period, "days_attended": p.days_attended, "days_total": p.days_total,
        "amount": p.amount, "method": p.method, "reference": p.reference, "note": p.note,
        "source": p.source, "run_id": p.run_id, "paid_by": p.paid_by, "paid_at": p.paid_at,
    }


@router.get("")
def list_payments(
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    employee_id: int | None = None,
    limit: int = Query(default=300, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    stmt = select(PayrollPayment).options(joinedload(PayrollPayment.employee))
    if period:
        stmt = stmt.where(PayrollPayment.period == period)
    if employee_id:
        stmt = stmt.where(PayrollPayment.employee_id == employee_id)
    rows = db.execute(stmt.order_by(PayrollPayment.paid_at.desc()).limit(limit)).scalars().all()
    total = sum((p.amount for p in rows), Decimal("0"))
    by_method: dict[str, Decimal] = {}
    for p in rows:
        by_method[p.method] = by_method.get(p.method, Decimal("0")) + p.amount
    return {"items": [_out(p) for p in rows], "total": total, "by_method": by_method, "count": len(rows)}


@router.post("", status_code=201)
def record_payment(payload: PaymentIn, db: Session = Depends(get_db)):
    """Log a payment. The days attended for the month are captured with it."""
    e = db.get(PayrollEmployee, payload.employee_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    start, end, label = calc.parse_month(payload.period)
    s = get_settings(db)
    weekdays = working_weekdays(s)
    holidays = calc.holidays_for(db, start, end)
    recs = calc.load_records(db, [e.id], start, end).get(e.id, {})
    m = calc.month_summary(e, start, end, recs, s, weekdays, holidays, date.today())
    p = PayrollPayment(
        employee_id=e.id, period=label, days_attended=m["days_attended"], days_total=m["days_total"],
        amount=payload.amount, method=payload.method,
        reference=(payload.reference or "").strip() or None, note=(payload.note or "").strip() or None,
        source="MANUAL", paid_by="admin",
    )
    db.add(p)
    db.flush()
    audit(db, "PAYMENT", "payment", p.id,
          f"Paid GH₵{p.amount} to {e.employee_code} for {label} ({m['days_attended']}/{m['days_total']} days) via {p.method}")
    db.commit()
    db.refresh(p)
    p.employee = e
    return _out(p)


@router.get("/export.csv")
def export_payments(period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    stmt = select(PayrollPayment).options(joinedload(PayrollPayment.employee))
    if period:
        stmt = stmt.where(PayrollPayment.period == period)
    rows = db.execute(stmt.order_by(PayrollPayment.paid_at.desc())).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Paid at", "Code", "Employee", "Period", "Days attended", "Working days", "Amount", "Method", "Reference", "Note", "Source", "Recorded by"])
    for p in rows:
        w.writerow([p.paid_at.strftime("%Y-%m-%d %H:%M"), p.employee.employee_code, p.employee.full_name, p.period,
                    p.days_attended, p.days_total, p.amount, p.method, p.reference or "", p.note or "", p.source, p.paid_by])
    return StreamingResponse(
        iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="payments_{period or "all"}.csv"'},
    )
