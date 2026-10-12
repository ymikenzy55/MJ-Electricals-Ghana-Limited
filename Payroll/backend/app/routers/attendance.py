"""Attendance endpoints, kiosk check-in/out plus admin views and reports."""
import csv
import io
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import AttemptGuard, hash_secret, needs_rehash, verify_secret, workplace_token
from app.models import PayrollAttendance, PayrollEmployee
from app.routers.auth import require_admin
from app.schemas import (
    AttendanceOut, AttendanceReportRow, AttendanceSummary, KioskPunch, ManualAttendance,
)
from app.services.common import audit, get_settings, is_late

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])

_kiosk_ip = AttemptGuard(60, 60)          # generic request flood per IP
_pin_guard = AttemptGuard(5, 15 * 60)     # wrong PINs per employee code + IP


def _out(a: PayrollAttendance) -> AttendanceOut:
    return AttendanceOut(
        id=a.id, employee_id=a.employee_id, date=a.date,
        check_in=a.check_in, check_out=a.check_out, status=a.status,
        notes=a.notes,
        employee_name=a.employee.full_name if a.employee else None,
        employee_code=a.employee.employee_code if a.employee else None,
    )


def _throttle(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    if _kiosk_ip.blocked(ip):
        raise HTTPException(429, "Too many kiosk requests; try again shortly")
    _kiosk_ip.fail(ip)  # counts every call; window slides after 60s
    return ip


def _kiosk_employee(payload: KioskPunch, request: Request, db: Session) -> PayrollEmployee:
    ip = _throttle(request)
    code = payload.employee_code.strip().upper()
    key = f"{ip}|{code}"
    if _pin_guard.blocked(key):
        raise HTTPException(429, "Too many wrong PIN attempts. Try again in a few minutes.")
    emp = db.execute(
        select(PayrollEmployee).where(PayrollEmployee.employee_code == code)
    ).scalar_one_or_none()
    s = get_settings(db)
    # Same error for unknown code and wrong PIN so codes cannot be enumerated.
    bad = HTTPException(401, "Invalid employee code or PIN")
    if not emp:
        _pin_guard.fail(key)
        raise bad
    if emp.pin_hash and (s.kiosk_require_pin or payload.pin):
        if not payload.pin or not verify_secret(payload.pin, emp.pin_hash):
            _pin_guard.fail(key)
            raise bad
        if needs_rehash(emp.pin_hash):
            emp.pin_hash = hash_secret(payload.pin)
    elif s.kiosk_require_pin and not emp.pin_hash:
        raise HTTPException(403, "No PIN set for this employee, ask your administrator.")
    _pin_guard.clear(key)
    if emp.status != "ACTIVE":
        raise HTTPException(403, f"Employee is {emp.status.lower()}")
    return emp


# ------------------------- Kiosk (public) -----------------------------

@router.post("/check-in", response_model=AttendanceOut, status_code=201)
def check_in(payload: KioskPunch, request: Request, db: Session = Depends(get_db)):
    """Retired: attendance is now recorded by scanning the office QR in the worker portal."""
    raise HTTPException(410, "Attendance is recorded by scanning the office QR code in the worker portal.")
    emp = _kiosk_employee(payload, request, db)
    s = get_settings(db)
    today = date.today()
    now = datetime.now(timezone.utc)
    existing = db.execute(
        select(PayrollAttendance).where(
            PayrollAttendance.employee_id == emp.id, PayrollAttendance.date == today,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Already checked in today")
    status_ = "LATE" if is_late(now.astimezone(), s) else "PRESENT"
    rec = PayrollAttendance(employee_id=emp.id, date=today, check_in=now, status=status_)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _out(rec)


@router.post("/check-out", response_model=AttendanceOut)
def check_out(payload: KioskPunch, request: Request, db: Session = Depends(get_db)):
    """Retired: see check_in."""
    raise HTTPException(410, "Attendance is recorded by scanning the office QR code in the worker portal.")
    emp = _kiosk_employee(payload, request, db)
    rec = db.execute(
        select(PayrollAttendance).where(
            PayrollAttendance.employee_id == emp.id, PayrollAttendance.date == date.today(),
        )
    ).scalar_one_or_none()
    if not rec or not rec.check_in:
        raise HTTPException(404, "No check-in found for today")
    if rec.check_out:
        raise HTTPException(409, "Already checked out today")
    rec.check_out = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rec)
    return _out(rec)


@router.get("/workplace-token", dependencies=[Depends(require_admin)])
def get_workplace_token():
    """Token embedded in today's workplace QR code (admin-only)."""
    return {"token": workplace_token(), "date": date.today().isoformat()}


# -------------------------- Admin views -------------------------------

@router.get("", response_model=list[AttendanceOut], dependencies=[Depends(require_admin)])
def list_attendance(
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: int | None = None,
    status: str | None = None,
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    stmt = select(PayrollAttendance).options(joinedload(PayrollAttendance.employee))
    if date_from:
        stmt = stmt.where(PayrollAttendance.date >= date_from)
    if date_to:
        stmt = stmt.where(PayrollAttendance.date <= date_to)
    if employee_id:
        stmt = stmt.where(PayrollAttendance.employee_id == employee_id)
    if status:
        stmt = stmt.where(PayrollAttendance.status == status)
    rows = db.execute(
        stmt.order_by(PayrollAttendance.date.desc(), PayrollAttendance.id.desc()).limit(limit)
    ).scalars().all()
    return [_out(r) for r in rows]


@router.post("/manual", response_model=AttendanceOut, dependencies=[Depends(require_admin)])
def manual_attendance(payload: ManualAttendance, db: Session = Depends(get_db)):
    """Admin: mark a day's attendance manually (absent/leave/corrections)."""
    emp = db.get(PayrollEmployee, payload.employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    rec = db.execute(
        select(PayrollAttendance).where(
            PayrollAttendance.employee_id == emp.id, PayrollAttendance.date == payload.date,
        )
    ).scalar_one_or_none()
    if rec:
        rec.status = payload.status
        rec.check_in = payload.check_in or rec.check_in
        rec.check_out = payload.check_out or rec.check_out
        rec.notes = payload.notes
    else:
        rec = PayrollAttendance(
            employee_id=emp.id, date=payload.date, status=payload.status,
            check_in=payload.check_in, check_out=payload.check_out, notes=payload.notes,
        )
        db.add(rec)
    audit(db, "MARK", "attendance", None, f"{emp.employee_code} {payload.date} → {payload.status}")
    db.commit()
    db.refresh(rec)
    return _out(rec)


@router.delete("/{attendance_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_attendance(attendance_id: int, db: Session = Depends(get_db)):
    rec = db.get(PayrollAttendance, attendance_id)
    if not rec:
        raise HTTPException(404, "Record not found")
    audit(db, "DELETE", "attendance", rec.id, f"Removed attendance {rec.date} for employee #{rec.employee_id}")
    db.delete(rec)
    db.commit()


@router.get("/summary", response_model=AttendanceSummary, dependencies=[Depends(require_admin)])
def attendance_summary(
    employee_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
):
    """Per-employee attendance counts over a period."""
    rows = db.execute(
        select(PayrollAttendance.status, func.count())
        .where(
            PayrollAttendance.employee_id == employee_id,
            PayrollAttendance.date >= date_from, PayrollAttendance.date <= date_to,
        )
        .group_by(PayrollAttendance.status)
    ).all()
    s = AttendanceSummary(employee_id=employee_id)
    for st, n in rows:
        key = {"PRESENT": "present", "LATE": "late", "ABSENT": "absent", "LEAVE": "leave", "HALF_DAY": "half_day"}.get(st)
        if key:
            setattr(s, key, n)
    return s


def _report(db: Session, date_from: date, date_to: date) -> list[AttendanceReportRow]:
    settings_row = get_settings(db)
    std = Decimal(str(settings_row.standard_hours_per_day or 8))
    emps = {e.id: e for e in db.execute(select(PayrollEmployee)).scalars()}
    rows: dict[int, AttendanceReportRow] = {}
    for a in db.execute(
        select(PayrollAttendance).where(
            PayrollAttendance.date >= date_from, PayrollAttendance.date <= date_to
        )
    ).scalars():
        e = emps.get(a.employee_id)
        if not e:
            continue
        r = rows.setdefault(a.employee_id, AttendanceReportRow(
            employee_id=e.id, employee_code=e.employee_code,
            employee_name=e.full_name, department=e.department,
        ))
        key = {"PRESENT": "present", "LATE": "late", "ABSENT": "absent", "LEAVE": "leave", "HALF_DAY": "half_day"}.get(a.status)
        if key:
            setattr(r, key, getattr(r, key) + 1)
        if a.check_in and a.check_out and a.check_out > a.check_in:
            h = Decimal(str((a.check_out - a.check_in).total_seconds() / 3600)).quantize(Decimal("0.01"))
            r.hours_worked += h
            r.overtime_hours += max(h - std, Decimal("0"))
    return sorted(rows.values(), key=lambda r: r.employee_name)


@router.get("/report", response_model=list[AttendanceReportRow], dependencies=[Depends(require_admin)])
def attendance_report(date_from: date = Query(...), date_to: date = Query(...), db: Session = Depends(get_db)):
    return _report(db, date_from, date_to)


@router.get("/report.csv", dependencies=[Depends(require_admin)])
def attendance_report_csv(date_from: date = Query(...), date_to: date = Query(...), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Code", "Employee", "Department", "Present", "Late", "Absent", "Leave", "Half day", "Hours worked", "Overtime hours"])
    for r in _report(db, date_from, date_to):
        w.writerow([r.employee_code, r.employee_name, r.department or "", r.present, r.late, r.absent, r.leave, r.half_day, r.hours_worked, r.overtime_hours])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="attendance_{date_from}_{date_to}.csv"'},
    )


@router.post("/import-csv", response_model=list[AttendanceOut], dependencies=[Depends(require_admin)])
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import employee_code,date,status,check_in,check_out,notes rows."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Upload a CSV file")
    raw = await file.read()
    if len(raw) > 2_000_000:
        raise HTTPException(413, "CSV is too large (max 2 MB)")
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    if len(rows) > 5000:
        raise HTTPException(413, "Too many rows (max 5000)")
    codes = {(r.get("employee_code") or "").strip().upper() for r in rows}
    emps = {
        e.employee_code: e for e in db.execute(
            select(PayrollEmployee).where(PayrollEmployee.employee_code.in_(codes))
        ).scalars()
    }
    valid = {"PRESENT", "LATE", "ABSENT", "LEAVE", "HALF_DAY"}
    imported: list[PayrollAttendance] = []
    for n, row in enumerate(rows, start=2):
        code = (row.get("employee_code") or "").strip().upper()
        emp = emps.get(code)
        if not emp:
            raise HTTPException(422, f"Row {n}: unknown employee code {code!r}")
        try:
            day = date.fromisoformat((row.get("date") or "").strip())
        except ValueError:
            raise HTTPException(422, f"Row {n}: date must use YYYY-MM-DD")
        st = (row.get("status") or "PRESENT").strip().upper()
        if st not in valid:
            raise HTTPException(422, f"Row {n}: invalid status {st!r}")
        existing = db.execute(select(PayrollAttendance).where(
            PayrollAttendance.employee_id == emp.id, PayrollAttendance.date == day
        )).scalar_one_or_none()
        record = existing or PayrollAttendance(employee_id=emp.id, date=day)
        record.status = st
        record.notes = (row.get("notes") or "").strip() or None
        if not existing:
            db.add(record)
        imported.append(record)
    audit(db, "IMPORT", "attendance", None, f"Imported {len(imported)} attendance rows")
    db.commit()
    for record in imported:
        db.refresh(record)
    by_id = {e.id: e for e in emps.values()}
    out = []
    for r in imported:
        o = _out(r)
        e = by_id.get(r.employee_id)
        o.employee_name, o.employee_code = (e.full_name, e.employee_code) if e else (None, None)
        out.append(o)
    return out
