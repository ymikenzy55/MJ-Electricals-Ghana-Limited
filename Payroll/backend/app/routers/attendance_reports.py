"""Admin attendance views: the office QR, the daily board (who is absent),
the monthly report, per-worker detail and the scan log."""
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import PayrollAttendance, PayrollEmployee, PayrollPayment, PayrollScanAttempt
from app.routers.auth import require_admin
from app.services import attendance_calc as calc
from app.services.common import audit, get_settings, working_weekdays
from app.services.geo import maps_url

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance-reports"], dependencies=[Depends(require_admin)])

QR_PREFIX = "MJATT1."


def _ensure_code(db: Session) -> str:
    s = get_settings(db)
    if not s.workplace_code:
        s.workplace_code = secrets.token_urlsafe(18)
        audit(db, "QR_CREATED", "settings", 1, "Office attendance QR generated")
        db.commit()
    return s.workplace_code


def _qr_payload(db: Session) -> dict:
    s = get_settings(db)
    code = _ensure_code(db)
    return {
        "payload": QR_PREFIX + code, "office_name": s.office_name,
        "lat": float(s.office_lat), "lng": float(s.office_lng), "radius_m": s.geofence_radius_m,
        "maps_url": maps_url(s.office_lat, s.office_lng),
    }


@router.get("/qr")
def get_qr(db: Session = Depends(get_db)):
    """The single QR to print and put on the office wall."""
    return _qr_payload(db)


@router.post("/qr/rotate")
def rotate_qr(db: Session = Depends(get_db)):
    """Issue a new code. The old printed QR stops working immediately."""
    s = get_settings(db)
    s.workplace_code = secrets.token_urlsafe(18)
    audit(db, "QR_ROTATED", "settings", 1, "Office attendance QR regenerated; the old printout no longer works")
    db.commit()
    return _qr_payload(db)


# --------------------------------- daily ---------------------------------

@router.get("/daily")
def daily_board(day: date | None = Query(default=None, alias="date"), db: Session = Depends(get_db)):
    """Everyone, with who is present, late, on leave and who was not present."""
    day = day or date.today()
    today = date.today()
    s = get_settings(db)
    weekdays = working_weekdays(s)
    holidays = calc.holidays_for(db, day, day)
    emps = db.execute(
        select(PayrollEmployee).where(PayrollEmployee.status == "ACTIVE").order_by(PayrollEmployee.full_name)
    ).scalars().all()
    recs = {r.employee_id: r for r in db.execute(
        select(PayrollAttendance).where(PayrollAttendance.date == day)
    ).scalars()}
    rows = []
    counts = {"PRESENT": 0, "LATE": 0, "ABSENT": 0, "LEAVE": 0, "HALF_DAY": 0}
    for e in emps:
        if e.hire_date and e.hire_date > day:
            continue
        r = recs.get(e.id)
        st = calc.day_status(day, r, weekdays, holidays, today)
        if st in counts:
            counts[st] += 1
        rows.append({
            "employee_id": e.id, "employee_code": e.employee_code, "employee_name": e.full_name,
            "department": e.department, "position": e.position, "phone": e.phone,
            "status": st,
            "check_in": r.check_in if r else None, "check_out": r.check_out if r else None,
            "hours": calc.hours_between(r) if r else Decimal("0"),
            "late_minutes": calc.late_minutes(r, s) if r and r.status == "LATE" else 0,
            "distance_m": r.check_in_distance_m if r else None,
            "check_out_distance_m": r.check_out_distance_m if r else None,
            "maps_url": maps_url(r.check_in_lat, r.check_in_lng) if r else None,
            "source": r.source if r else None,
            "flagged": bool(r.flagged) if r else False, "flag_reason": r.flag_reason if r else None,
        })
    return {
        "date": day, "is_working_day": day.weekday() in weekdays and day not in holidays,
        "holiday": holidays.get(day), "summary": counts, "total": len(rows), "rows": rows,
        "office": {"name": s.office_name, "lat": float(s.office_lat), "lng": float(s.office_lng), "radius_m": s.geofence_radius_m},
    }


# -------------------------------- monthly --------------------------------

@router.get("/monthly")
def monthly_report(month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Standard monthly register: every worker with days attended out of the working days."""
    try:
        start, end, label = calc.parse_month(month)
    except ValueError:
        raise HTTPException(422, "Use a month like 2026-09")
    today = date.today()
    s = get_settings(db)
    weekdays = working_weekdays(s)
    holidays = calc.holidays_for(db, start, end)
    emps = db.execute(
        select(PayrollEmployee).where(PayrollEmployee.status.in_(("ACTIVE", "SUSPENDED", "TERMINATED")))
        .order_by(PayrollEmployee.full_name)
    ).scalars().all()
    recs = calc.load_records(db, [e.id for e in emps], start, end)
    paid = calc.paid_by_employee(db, label)
    rows = []
    for e in emps:
        if e.hire_date and e.hire_date > end:
            continue
        if e.termination_date and e.termination_date < start:
            continue
        m = calc.month_summary(e, start, end, recs.get(e.id, {}), s, weekdays, holidays, today)
        sug = calc.suggested_amount(e, m["days_attended"], m["days_total"])
        rows.append({
            "employee_id": e.id, "employee_code": e.employee_code, "employee_name": e.full_name,
            "department": e.department, "status": e.status, **m,
            "suggested_amount": sug, "paid_amount": paid.get(e.id, Decimal("0")),
        })
    total_working = max((r["days_total"] for r in rows), default=0)
    return {"month": label, "working_days": total_working, "employees": len(rows), "rows": rows}


@router.get("/monthly/{employee_id}")
def monthly_detail(employee_id: int, month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """One worker's month, day by day, with where each scan happened."""
    e = db.get(PayrollEmployee, employee_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    start, end, label = calc.parse_month(month)
    today = date.today()
    s = get_settings(db)
    weekdays = working_weekdays(s)
    holidays = calc.holidays_for(db, start, end)
    recs = calc.load_records(db, [e.id], start, end).get(e.id, {})
    m = calc.month_summary(e, start, end, recs, s, weekdays, holidays, today)
    days = []
    d = start
    while d <= end:
        r = recs.get(d)
        days.append({
            "date": d, "weekday": d.strftime("%a"),
            "status": calc.day_status(d, r, weekdays, holidays, today),
            "holiday": holidays.get(d),
            "check_in": r.check_in if r else None, "check_out": r.check_out if r else None,
            "hours": calc.hours_between(r) if r else Decimal("0"),
            "late_minutes": calc.late_minutes(r, s) if r and r.status == "LATE" else 0,
            "distance_m": r.check_in_distance_m if r else None,
            "maps_url": maps_url(r.check_in_lat, r.check_in_lng) if r else None,
            "source": r.source if r else None, "notes": r.notes if r else None,
            "flagged": bool(r.flagged) if r else False, "flag_reason": r.flag_reason if r else None,
        })
        d += timedelta(days=1)
    pays = db.execute(
        select(PayrollPayment).where(PayrollPayment.employee_id == e.id, PayrollPayment.period == label)
        .order_by(PayrollPayment.paid_at.desc())
    ).scalars().all()
    return {
        "employee": {
            "id": e.id, "code": e.employee_code, "name": e.full_name, "department": e.department,
            "position": e.position, "phone": e.phone, "email": e.email, "salary_type": e.salary_type,
            "base_salary": e.base_salary, "payment_method": e.payment_method,
            "bank_name": e.bank_name, "bank_account": e.bank_account, "hire_date": e.hire_date,
        },
        "month": label, "summary": m,
        "suggested_amount": calc.suggested_amount(e, m["days_attended"], m["days_total"]),
        "paid_amount": sum((p.amount for p in pays), Decimal("0")),
        "days": days,
        "payments": [{
            "id": p.id, "amount": p.amount, "method": p.method, "reference": p.reference,
            "note": p.note, "paid_at": p.paid_at, "paid_by": p.paid_by, "source": p.source,
            "days_attended": p.days_attended, "days_total": p.days_total,
        } for p in pays],
    }


# --------------------------------- scan log ---------------------------------

@router.get("/scans")
def scan_log(
    date_from: date | None = None, date_to: date | None = None,
    flagged_only: bool = False, limit: int = Query(default=300, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Every scan received, accepted or refused, with the reported location."""
    date_from = date_from or (date.today() - timedelta(days=7))
    date_to = date_to or date.today()
    start = datetime.combine(date_from, datetime.min.time()).astimezone()
    end = datetime.combine(date_to + timedelta(days=1), datetime.min.time()).astimezone()
    stmt = select(PayrollScanAttempt, PayrollEmployee).outerjoin(
        PayrollEmployee, PayrollEmployee.id == PayrollScanAttempt.employee_id
    ).where(PayrollScanAttempt.at >= start, PayrollScanAttempt.at < end)
    if flagged_only:
        stmt = stmt.where((PayrollScanAttempt.flagged.is_(True)) | (PayrollScanAttempt.result != "OK"))
    rows = db.execute(stmt.order_by(PayrollScanAttempt.at.desc()).limit(limit)).all()
    return [{
        "id": a.id, "at": a.at, "kind": a.kind, "result": a.result, "message": a.message,
        "employee_id": a.employee_id, "employee_name": e.full_name if e else None,
        "employee_code": e.employee_code if e else None,
        "lat": float(a.lat) if a.lat is not None else None, "lng": float(a.lng) if a.lng is not None else None,
        "accuracy_m": a.accuracy_m, "distance_m": a.distance_m, "flagged": a.flagged,
        "maps_url": maps_url(a.lat, a.lng),
    } for a, e in rows]
