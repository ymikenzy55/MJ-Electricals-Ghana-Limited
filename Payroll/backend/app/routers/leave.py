"""Leave management (admin): requests, approvals, balances."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models import PayrollEmployee, PayrollLeaveRequest
from app.routers.auth import require_admin
from app.schemas import LeaveBalance, LeaveCreate, LeaveDecision, LeaveOut
from app.services import leave as svc

router = APIRouter(prefix="/api/v1/leave", tags=["leave"], dependencies=[Depends(require_admin)])


def _get(db: Session, req_id: int) -> PayrollLeaveRequest:
    req = db.execute(
        select(PayrollLeaveRequest).options(joinedload(PayrollLeaveRequest.employee))
        .where(PayrollLeaveRequest.id == req_id)
    ).scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Leave request not found")
    return req


@router.get("", response_model=list[LeaveOut])
def list_requests(
    status: str | None = None,
    employee_id: int | None = None,
    year: int | None = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
):
    stmt = select(PayrollLeaveRequest).options(joinedload(PayrollLeaveRequest.employee))
    if status:
        stmt = stmt.where(PayrollLeaveRequest.status == status)
    if employee_id:
        stmt = stmt.where(PayrollLeaveRequest.employee_id == employee_id)
    if year:
        stmt = stmt.where(PayrollLeaveRequest.start_date >= date(year, 1, 1), PayrollLeaveRequest.start_date <= date(year, 12, 31))
    rows = db.execute(stmt.order_by(PayrollLeaveRequest.created_at.desc()).limit(500)).scalars().all()
    return [svc.leave_out(r) for r in rows]


@router.post("", response_model=LeaveOut, status_code=201)
def create_request(payload: LeaveCreate, db: Session = Depends(get_db)):
    """Admin records leave on an employee's behalf (goes straight to pending)."""
    if not payload.employee_id:
        raise HTTPException(422, "employee_id is required")
    emp = db.get(PayrollEmployee, payload.employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    req = svc.create_request(db, emp, payload.leave_type, payload.start_date, payload.end_date, payload.reason, "admin")
    db.commit()
    return svc.leave_out(_get(db, req.id))


@router.get("/balances", response_model=list[LeaveBalance])
def balances(year: int | None = Query(default=None, ge=2000, le=2100), db: Session = Depends(get_db)):
    year = year or date.today().year
    emps = db.execute(
        select(PayrollEmployee).where(PayrollEmployee.status == "ACTIVE").order_by(PayrollEmployee.full_name)
    ).scalars().all()
    return [svc.balance_for(db, e, year) for e in emps]


@router.post("/{req_id}/approve", response_model=LeaveOut)
def approve(req_id: int, payload: LeaveDecision | None = None, db: Session = Depends(get_db)):
    req = _get(db, req_id)
    svc.approve(db, req, "admin", payload.note if payload else None)
    db.commit()
    return svc.leave_out(_get(db, req_id))


@router.post("/{req_id}/reject", response_model=LeaveOut)
def reject(req_id: int, payload: LeaveDecision | None = None, db: Session = Depends(get_db)):
    req = _get(db, req_id)
    svc.reject(db, req, "admin", payload.note if payload else None)
    db.commit()
    return svc.leave_out(_get(db, req_id))


@router.post("/{req_id}/cancel", response_model=LeaveOut)
def cancel(req_id: int, db: Session = Depends(get_db)):
    req = _get(db, req_id)
    svc.cancel(db, req, "admin")
    db.commit()
    return svc.leave_out(_get(db, req_id))
