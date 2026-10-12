"""Leave rules shared by the admin and worker-portal routers."""
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PayrollAttendance, PayrollEmployee, PayrollLeaveRequest
from app.schemas import LeaveBalance, LeaveOut
from app.services.common import (
    audit, daterange, get_settings, holiday_dates, working_days_between, working_weekdays,
)

# Leave that reduces the annual entitlement.
ENTITLEMENT_TYPES = ("ANNUAL",)


def leave_out(r: PayrollLeaveRequest) -> LeaveOut:
    out = LeaveOut.model_validate(r)
    if r.employee:
        out.employee_name = r.employee.full_name
        out.employee_code = r.employee.employee_code
    return out


def balance_for(db: Session, emp: PayrollEmployee, year: int) -> LeaveBalance:
    s = get_settings(db)

    def total(status: str) -> int:
        return db.scalar(
            select(func.coalesce(func.sum(PayrollLeaveRequest.days), 0)).where(
                PayrollLeaveRequest.employee_id == emp.id,
                PayrollLeaveRequest.leave_type.in_(ENTITLEMENT_TYPES),
                PayrollLeaveRequest.status == status,
                PayrollLeaveRequest.start_date >= date(year, 1, 1),
                PayrollLeaveRequest.start_date <= date(year, 12, 31),
            )
        ) or 0

    used, pending = total("APPROVED"), total("PENDING")
    return LeaveBalance(
        employee_id=emp.id, employee_name=emp.full_name, employee_code=emp.employee_code,
        year=year, entitlement=s.annual_leave_days, used=used, pending=pending,
        remaining=max(s.annual_leave_days - used - pending, 0),
    )


def create_request(
    db: Session, emp: PayrollEmployee, leave_type: str, start: date, end: date,
    reason: str | None, actor: str,
) -> PayrollLeaveRequest:
    if end < start:
        raise HTTPException(422, "End date must be on or after the start date")
    if (end - start).days > 120:
        raise HTTPException(422, "Leave requests cannot span more than 120 days")
    s = get_settings(db)
    holidays = holiday_dates(db, start, end)
    days = len(working_days_between(start, end, working_weekdays(s), holidays))
    if days == 0:
        raise HTTPException(422, "The selected dates contain no working days")

    overlap = db.execute(
        select(PayrollLeaveRequest).where(
            PayrollLeaveRequest.employee_id == emp.id,
            PayrollLeaveRequest.status.in_(("PENDING", "APPROVED")),
            PayrollLeaveRequest.start_date <= end,
            PayrollLeaveRequest.end_date >= start,
        ).limit(1)
    ).scalar_one_or_none()
    if overlap:
        raise HTTPException(409, "You already have a leave request covering some of these dates")

    if leave_type in ENTITLEMENT_TYPES:
        bal = balance_for(db, emp, start.year)
        if days > bal.remaining:
            raise HTTPException(409, f"Only {bal.remaining} annual leave day(s) remaining (requested {days}).")

    req = PayrollLeaveRequest(
        employee_id=emp.id, leave_type=leave_type, start_date=start, end_date=end,
        days=days, reason=reason, status="PENDING",
    )
    db.add(req)
    db.flush()
    audit(db, "LEAVE_REQUEST", "leave", req.id,
          f"{emp.employee_code} requested {days} day(s) {leave_type} {start}→{end}", actor=actor)
    return req


def _tag(req_id: int) -> str:
    return f"Leave #{req_id}"


def approve(db: Session, req: PayrollLeaveRequest, actor: str, note: str | None) -> None:
    if req.status != "PENDING":
        raise HTTPException(409, f"Request is already {req.status.lower()}")
    s = get_settings(db)
    weekdays = working_weekdays(s)
    holidays = holiday_dates(db, req.start_date, req.end_date)
    status = "ABSENT" if req.leave_type == "UNPAID" else "LEAVE"
    for d in daterange(req.start_date, req.end_date):
        if d.weekday() not in weekdays or d in holidays:
            continue
        rec = db.execute(select(PayrollAttendance).where(
            PayrollAttendance.employee_id == req.employee_id, PayrollAttendance.date == d
        )).scalar_one_or_none()
        label = f"{_tag(req.id)}: {req.leave_type.title()}{' (unpaid)' if status == 'ABSENT' else ''}"
        if rec is None:
            db.add(PayrollAttendance(employee_id=req.employee_id, date=d, status=status, notes=label))
        elif rec.check_in is None:  # never overwrite a real punch
            rec.status, rec.notes = status, label
    req.status = "APPROVED"
    req.decided_by, req.decided_at, req.decision_note = actor, datetime.now(timezone.utc), note
    audit(db, "LEAVE_APPROVE", "leave", req.id, f"Approved leave #{req.id} ({req.days} days)", actor=actor)


def reject(db: Session, req: PayrollLeaveRequest, actor: str, note: str | None) -> None:
    if req.status != "PENDING":
        raise HTTPException(409, f"Request is already {req.status.lower()}")
    req.status = "REJECTED"
    req.decided_by, req.decided_at, req.decision_note = actor, datetime.now(timezone.utc), note
    audit(db, "LEAVE_REJECT", "leave", req.id, f"Rejected leave #{req.id}", actor=actor)


def cancel(db: Session, req: PayrollLeaveRequest, actor: str) -> None:
    if req.status not in ("PENDING", "APPROVED"):
        raise HTTPException(409, f"Request is already {req.status.lower()}")
    if req.status == "APPROVED":
        for rec in db.execute(select(PayrollAttendance).where(
            PayrollAttendance.employee_id == req.employee_id,
            PayrollAttendance.date >= req.start_date, PayrollAttendance.date <= req.end_date,
            PayrollAttendance.notes.like(f"{_tag(req.id)}:%"),
        )).scalars():
            db.delete(rec)
    req.status = "CANCELLED"
    req.decided_by, req.decided_at = actor, datetime.now(timezone.utc)
    audit(db, "LEAVE_CANCEL", "leave", req.id, f"Cancelled leave #{req.id}", actor=actor)
