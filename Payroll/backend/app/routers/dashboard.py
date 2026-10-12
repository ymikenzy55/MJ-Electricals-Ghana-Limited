"""Payroll dashboard aggregate endpoint."""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select, text
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models import (
    PayrollAttendance, PayrollEmployee, PayrollLeaveRequest, PayrollLoan,
    PayrollPayslip, PayrollRun,
)
from app.routers.auth import require_admin
from app.schemas import DashboardStats

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"], dependencies=[Depends(require_admin)])


@router.get("/stamp")
def stamp(db: Session = Depends(get_db)):
    """Fingerprint of everything the admin screens show. The app polls this and
    reloads the open page when it changes (a kiosk punch, a leave request, an
    edit from another computer …)."""
    v = db.execute(text("""
        SELECT md5(concat_ws('|',
          (SELECT count(*) || ':' || COALESCE(max(id), 0) || ':' || count(check_out) FROM payroll_attendance),
          (SELECT count(*) || ':' || COALESCE(max(id), 0) FROM payroll_audit_logs),
          (SELECT count(*) || ':' || COALESCE(max(id), 0) FROM payroll_leave_requests),
          (SELECT string_agg(status, '') FROM payroll_leave_requests),
          (SELECT string_agg(status, '') FROM payroll_runs),
          (SELECT count(*) || ':' || string_agg(status, '') FROM payroll_employees),
          (SELECT count(*) || ':' || COALESCE(max(id), 0) FROM payroll_scan_attempts),
          (SELECT count(*) || ':' || COALESCE(max(id), 0) FROM payroll_payments)
        ))
    """)).scalar_one()
    return {"v": v}


@router.get("/stats", response_model=DashboardStats)
def stats(db: Session = Depends(get_db)):
    today = date.today()
    # One round trip for the employee counts and one for today's attendance
    # instead of a query per number (the database is remote).
    total, active, departments = db.execute(
        select(
            func.count(),
            func.count(case((PayrollEmployee.status == "ACTIVE", 1))),
            func.count(func.distinct(PayrollEmployee.department)),
        )
    ).one()
    att = dict(db.execute(
        select(PayrollAttendance.status, func.count())
        .where(PayrollAttendance.date == today).group_by(PayrollAttendance.status)
    ).all())
    pending_runs = db.scalar(select(func.count()).select_from(PayrollRun).where(PayrollRun.status == "DRAFT")) or 0
    pending_leave = db.scalar(select(func.count()).select_from(PayrollLeaveRequest).where(PayrollLeaveRequest.status == "PENDING")) or 0
    loans = db.scalar(select(func.count()).select_from(PayrollLoan).where(PayrollLoan.status == "ACTIVE")) or 0
    last = db.execute(
        select(PayrollRun).options(joinedload(PayrollRun.payslips))
        .order_by(PayrollRun.created_at.desc()).limit(1)
    ).unique().scalar_one_or_none()
    ytd = db.scalar(
        select(func.coalesce(func.sum(PayrollPayslip.net_pay), 0))
        .join(PayrollRun, PayrollRun.id == PayrollPayslip.run_id)
        .where(PayrollRun.status.in_(("APPROVED", "PAID")), PayrollRun.period_end >= date(today.year, 1, 1))
    ) or 0
    return DashboardStats(
        total_employees=total, active_employees=active,
        present_today=att.get("PRESENT", 0), late_today=att.get("LATE", 0),
        absent_today=att.get("ABSENT", 0), on_leave_today=att.get("LEAVE", 0),
        pending_runs=pending_runs, pending_leave=pending_leave, active_loans=loans,
        last_run_total=sum((p.net_pay for p in last.payslips), 0) if last else 0,
        payroll_ytd=ytd, departments=departments,
    )
