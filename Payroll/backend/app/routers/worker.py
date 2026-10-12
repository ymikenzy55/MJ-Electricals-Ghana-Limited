"""Worker self-service portal.

Workers register themselves, the administrator approves them, and from then on
they sign in on their phone to record attendance by scanning the office QR
code *inside* the portal (camera + location required), see their own history
and payslips, request leave and manage their password.
"""
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    AttemptGuard, constant_time_equals, create_access_token, decode_token, hash_secret,
    needs_rehash, verify_secret,
)
from app.models import (
    PayrollAttendance, PayrollEmployee, PayrollLeaveRequest, PayrollPayment, PayrollPayslip,
    PayrollRun, PayrollScanAttempt,
)
from app.routers.payroll import slip_out
from app.schemas import (
    ChangePinRequest, LeaveBalance, LeaveCreate, LeaveOut, PayslipOut,
    WorkerLoginRequest, WorkerProfile, WorkerTokenOut,
)
from app.services import attendance_calc as calc
from app.services import leave as leave_svc
from app.services.common import audit, get_settings, holiday_dates, is_late, working_weekdays
from app.services.geo import friendly_distance, haversine_m

router = APIRouter(prefix="/api/v1/worker", tags=["worker"])

QR_PREFIX = "MJATT1."
_login_guard = AttemptGuard(20, 15 * 60)     # per IP, on top of the per-account lockout
_register_guard = AttemptGuard(8, 60 * 60)   # sign-ups per IP per hour
_scan_guard = AttemptGuard(30, 60)           # scans per worker per minute
_PASSWORD_RE_LETTER = re.compile(r"[A-Za-z]")
_PASSWORD_RE_DIGIT = re.compile(r"\d")


def _digits(v: str) -> str:
    return "".join(ch for ch in v if ch.isdigit())


def _profile(emp: PayrollEmployee) -> WorkerProfile:
    return WorkerProfile(
        id=emp.id, employee_code=emp.employee_code, full_name=emp.full_name,
        department=emp.department, position=emp.position,
    )


def require_worker(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> PayrollEmployee:
    """Dependency: a valid worker JWT (sub = "emp:<id>") for an active employee."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(authorization.split(" ", 1)[1])
    sub = payload.get("sub") if payload else None
    if not sub or not str(sub).startswith("emp:"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    try:
        emp = db.get(PayrollEmployee, int(str(sub)[4:]))
    except ValueError:
        emp = None
    if not emp or emp.status != "ACTIVE":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid worker account")
    return emp


# ------------------------------- sign up / in -------------------------------

class WorkerRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=128)
    phone: str = Field(min_length=9, max_length=20)
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=128)
    position: str | None = Field(default=None, max_length=64)

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if len(_digits(v)) < 9:
            raise ValueError("Enter a valid phone number")
        return v.strip()


@router.post("/register", status_code=201)
def register(payload: WorkerRegister, request: Request, db: Session = Depends(get_db)):
    """Create a worker account. It stays pending until the administrator approves it."""
    ip = request.client.host if request.client else "unknown"
    if _register_guard.blocked(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many sign ups from this connection. Try again later.")
    _register_guard.fail(ip)
    if not (_PASSWORD_RE_LETTER.search(payload.password) and _PASSWORD_RE_DIGIT.search(payload.password)):
        raise HTTPException(422, "Password needs both letters and numbers.")
    phone_tail = _digits(payload.phone)[-9:]
    conds = [PayrollEmployee.phone.like(f"%{phone_tail}")]
    if payload.email:
        conds.append(func.lower(PayrollEmployee.email) == str(payload.email).lower())
    clash = db.execute(select(PayrollEmployee.id).where(or_(*conds)).limit(1)).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this phone number or email already exists. Try signing in.")
    n = (db.scalar(select(func.coalesce(func.max(PayrollEmployee.id), 0))) or 0) + 1
    code = f"MJ{n:03d}"
    while db.execute(select(PayrollEmployee.id).where(PayrollEmployee.employee_code == code)).first():
        n += 1
        code = f"MJ{n:03d}"
    emp = PayrollEmployee(
        employee_code=code, full_name=payload.full_name.strip(), phone=payload.phone,
        email=str(payload.email).lower() if payload.email else None,
        position=(payload.position or "").strip() or None,
        status="PENDING", registered_via="SELF", base_salary=0, salary_type="MONTHLY",
        pin_hash=hash_secret(payload.password),
    )
    db.add(emp)
    db.flush()
    audit(db, "SELF_REGISTER", "employee", emp.id, f"{emp.full_name} ({emp.phone}) signed up and is waiting for approval", actor="worker")
    db.commit()
    return {"message": "Account created. The administrator will approve it, then you can sign in.", "employee_code": code}


@router.post("/login", response_model=WorkerTokenOut)
def worker_login(payload: WorkerLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Sign in with employee code, phone number or email, plus your password / PIN."""
    ip = request.client.host if request.client else "unknown"
    if _login_guard.blocked(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again later.")
    ident = payload.employee_code.strip()
    emp = None
    if ident:
        conds = [PayrollEmployee.employee_code == ident.upper()]
        if "@" in ident:
            conds.append(func.lower(PayrollEmployee.email) == ident.lower())
        elif len(_digits(ident)) >= 9:
            conds.append(PayrollEmployee.phone.like(f"%{_digits(ident)[-9:]}"))
        emp = db.execute(select(PayrollEmployee).where(or_(*conds)).limit(1)).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid sign in details")

    if emp and emp.pin_locked_until and emp.pin_locked_until > now:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Account temporarily locked after too many wrong attempts. Try again in a few minutes.")
    ok = verify_secret(payload.pin, emp.pin_hash if emp and emp.pin_hash else hash_secret("x"))
    if not emp or not emp.pin_hash or not ok:
        _login_guard.fail(ip)
        if emp:
            emp.failed_pins = (emp.failed_pins or 0) + 1
            if emp.failed_pins >= settings.MAX_FAILED_LOGINS:
                emp.pin_locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
                emp.failed_pins = 0
                audit(db, "LOGIN_LOCKOUT", "employee", emp.id, f"{emp.employee_code} locked after repeated wrong passwords", actor="anonymous")
            db.commit()
        raise invalid
    if emp.status == "PENDING":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is waiting for the administrator's approval.")
    if emp.status != "ACTIVE":
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Account is {emp.status.lower()}. Please contact the administrator.")
    emp.failed_pins = 0
    emp.pin_locked_until = None
    if needs_rehash(emp.pin_hash):
        emp.pin_hash = hash_secret(payload.pin)
    db.commit()
    return WorkerTokenOut(
        access_token=create_access_token(f"emp:{emp.id}", minutes=72 * 60),
        employee=_profile(emp),
    )


@router.post("/change-pin")
def change_pin(payload: ChangePinRequest, emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    if not verify_secret(payload.current_pin, emp.pin_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is incorrect")
    emp.pin_hash = hash_secret(payload.new_pin)
    audit(db, "PASSWORD_CHANGED", "employee", emp.id, f"{emp.employee_code} changed their password", actor=emp.employee_code)
    db.commit()
    return {"message": "Password updated"}


# ---------------------------------- scanning ----------------------------------

class ScanIn(BaseModel):
    code: str = Field(min_length=8, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0, le=100000)
    device_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]*$")
    # Set when the phone had no signal at the office: the moment it was scanned.
    client_time: datetime | None = None


OFFLINE_MAX_AGE = timedelta(hours=72)


def _log_attempt(db: Session, emp: PayrollEmployee, body: ScanIn, request: Request, *, kind: str, result: str,
                 message: str, distance: float | None, flagged: bool = False) -> None:
    db.add(PayrollScanAttempt(
        employee_id=emp.id, kind=kind, result=result, lat=body.lat, lng=body.lng,
        accuracy_m=int(body.accuracy) if body.accuracy is not None else None,
        distance_m=int(distance) if distance is not None else None,
        device_id=body.device_id, ip=request.client.host if request.client else None,
        message=message[:200], flagged=flagged,
    ))


def _refuse(db: Session, code: int, message: str, **log) -> None:
    db.commit()  # keep the attempt in the scan log
    raise HTTPException(code, message)


@router.post("/scan")
def scan(body: ScanIn, request: Request, emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    """Check in (first scan of the day) or out (a later scan) by scanning the office QR.

    Only reachable with a signed in worker token, so scanning with a normal
    camera app does nothing. The phone's location must be at the office."""
    if _scan_guard.blocked(f"{emp.id}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many scans. Wait a moment and try again.")
    _scan_guard.fail(f"{emp.id}")
    s = get_settings(db)

    raw = body.code.strip()
    given = raw[len(QR_PREFIX):] if raw.startswith(QR_PREFIX) else None
    if not s.workplace_code or given is None or not constant_time_equals(given, s.workplace_code):
        _log_attempt(db, emp, body, request, kind="REJECTED", result="BAD_CODE",
                     message="Unrecognised QR code", distance=None, flagged=True)
        _refuse(db, 400, "That isn't the company QR code. Scan the code on the office wall.")

    distance = haversine_m(body.lat, body.lng, float(s.office_lat), float(s.office_lng))
    if body.accuracy is not None and body.accuracy > 200:
        _log_attempt(db, emp, body, request, kind="REJECTED", result="NO_LOCATION",
                     message=f"Location too imprecise (±{int(body.accuracy)} m)", distance=distance)
        _refuse(db, 422, "Your location isn't precise enough. Turn on high accuracy location and try again.")
    tolerance = min(body.accuracy or 0, 50)  # GPS wobble indoors
    if distance > s.geofence_radius_m + tolerance:
        _log_attempt(db, emp, body, request, kind="REJECTED", result="TOO_FAR",
                     message=f"Scanned {friendly_distance(distance)} from the office", distance=distance, flagged=True)
        _refuse(db, 403, f"You're about {friendly_distance(distance)} away from the company. Please go to the company and scan again.")

    now = datetime.now(timezone.utc)
    offline = False
    if body.client_time is not None:
        ct = body.client_time if body.client_time.tzinfo else body.client_time.replace(tzinfo=timezone.utc)
        ct = ct.astimezone(timezone.utc)
        if ct > now + timedelta(minutes=2) or now - ct > OFFLINE_MAX_AGE:
            _log_attempt(db, emp, body, request, kind="REJECTED", result="BAD_CODE",
                         message="Offline scan time out of range", distance=distance, flagged=True)
            _refuse(db, 422, "This offline scan is too old to be accepted. Please tell the administrator.")
        if now - ct > timedelta(minutes=2):
            offline, now = True, ct
    today = now.astimezone().date()
    rec = db.execute(
        select(PayrollAttendance).where(PayrollAttendance.employee_id == emp.id, PayrollAttendance.date == today)
    ).scalar_one_or_none()

    acc = int(body.accuracy) if body.accuracy is not None else None
    if rec is None:
        # Same phone used by someone else today? Likely one person scanning for two.
        flagged, reason = (True, "Scanned offline, synced later") if offline else (False, None)
        if body.device_id:
            other = db.execute(
                select(PayrollAttendance.id).where(
                    PayrollAttendance.date == today, PayrollAttendance.device_id == body.device_id,
                    PayrollAttendance.employee_id != emp.id,
                ).limit(1)
            ).first()
            if other:
                flagged, reason = True, "Same phone as another worker today"
        rec = PayrollAttendance(
            employee_id=emp.id, date=today, check_in=now,
            status="LATE" if is_late(now.astimezone(), s) else "PRESENT",
            source="QR", check_in_lat=body.lat, check_in_lng=body.lng,
            check_in_distance_m=int(distance), check_in_accuracy_m=acc,
            device_id=body.device_id, flagged=flagged, flag_reason=reason,
        )
        db.add(rec)
        _log_attempt(db, emp, body, request, kind="CHECK_IN", result="OK", message="Checked in (scanned offline)" if offline else "Checked in", distance=distance, flagged=flagged)
        try:
            db.commit()
        except IntegrityError:  # double tap raced with itself
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Your check in was already recorded.")
        kind, msg = "CHECK_IN", "You're checked in."
        if rec.status == "LATE":
            msg = f"You're checked in, {calc.late_minutes(rec, s)} min after start time."
    else:
        if rec.check_in is None:
            _log_attempt(db, emp, body, request, kind="REJECTED", result="DUPLICATE",
                         message=f"Today is marked {rec.status} by the administrator", distance=distance)
            _refuse(db, 409, f"Today is already marked as {rec.status.replace('_', ' ').lower()} by the administrator.")
        if rec.check_out is not None:
            _log_attempt(db, emp, body, request, kind="REJECTED", result="DUPLICATE",
                         message="Already checked in and out", distance=distance)
            _refuse(db, 409, "You've already checked in and out today.")
        if now < rec.check_in:
            _log_attempt(db, emp, body, request, kind="REJECTED", result="DUPLICATE",
                         message="Offline scan is older than the recorded check in", distance=distance)
            _refuse(db, 409, "This scan is older than your recorded check in, so it was skipped.")
        wait = timedelta(minutes=s.min_checkout_minutes or 0) - (now - rec.check_in)
        if wait > timedelta(0):
            mins = int(wait.total_seconds() // 60) + 1
            _log_attempt(db, emp, body, request, kind="REJECTED", result="TOO_SOON",
                         message="Scanned again too soon after checking in", distance=distance)
            _refuse(db, 409, f"You checked in at {rec.check_in.astimezone():%H:%M}. You can check out in {mins} min.")
        rec.check_out = now
        rec.check_out_lat, rec.check_out_lng = body.lat, body.lng
        rec.check_out_distance_m = int(distance)
        _log_attempt(db, emp, body, request, kind="CHECK_OUT", result="OK",
                     message="Checked out (scanned offline)" if offline else "Checked out", distance=distance, flagged=offline)
        if offline:
            rec.flagged, rec.flag_reason = True, rec.flag_reason or "Scanned offline, synced later"
        db.commit()
        kind, msg = "CHECK_OUT", "You're checked out. Have a good evening."

    return {
        "kind": kind, "message": msg, "status": rec.status, "at": now,
        "check_in": rec.check_in, "check_out": rec.check_out, "distance_m": int(distance),
    }


@router.post("/punch", status_code=410)
def punch_disabled():
    """The old tap-to-punch button is gone: it worked from anywhere."""
    raise HTTPException(status.HTTP_410_GONE, "Attendance is recorded by scanning the office QR code in the portal.")


# ----------------------------------- reading -----------------------------------

def _record_out(r: PayrollAttendance, s) -> dict:
    return {
        "id": r.id, "date": r.date, "status": r.status, "check_in": r.check_in, "check_out": r.check_out,
        "hours": calc.hours_between(r), "late_minutes": calc.late_minutes(r, s) if r.status == "LATE" else 0,
        "distance_m": r.check_in_distance_m, "source": r.source, "notes": r.notes,
    }


def _month_view(db: Session, emp: PayrollEmployee, month: str | None) -> dict:
    try:
        start, end, label = calc.parse_month(month)
    except ValueError:
        raise HTTPException(422, "Use a month like 2026-09")
    s = get_settings(db)
    weekdays = working_weekdays(s)
    holidays = holiday_dates(db, start, end)
    today = date.today()
    recs = calc.load_records(db, [emp.id], start, end).get(emp.id, {})
    summary = calc.month_summary(emp, start, end, recs, s, weekdays, holidays, today)
    days = []
    d = min(end, today)
    while d >= start:
        r = recs.get(d)
        st = calc.day_status(d, r, weekdays, holidays, today)
        row = _record_out(r, s) if r else {
            "id": None, "date": d, "status": st, "check_in": None, "check_out": None, "hours": Decimal("0"),
            "late_minutes": 0, "distance_m": None, "source": None, "notes": holidays.get(d),
        }
        row["status"] = st
        days.append(row)
        d -= timedelta(days=1)
    return {"month": label, "summary": summary, "days": days}


@router.get("/me")
def worker_me(emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    """Profile, today's attendance and this month's numbers, all in one call."""
    s = get_settings(db)
    today = date.today()
    rec = db.execute(
        select(PayrollAttendance).where(PayrollAttendance.employee_id == emp.id, PayrollAttendance.date == today)
    ).scalar_one_or_none()
    month = _month_view(db, emp, None)
    recent = db.execute(
        select(PayrollScanAttempt).where(PayrollScanAttempt.employee_id == emp.id)
        .order_by(PayrollScanAttempt.at.desc()).limit(6)
    ).scalars().all()
    return {
        "employee": _profile(emp).model_dump(),
        "today": _record_out(rec, s) if rec else None,
        "office": {"name": s.office_name, "radius_m": s.geofence_radius_m, "start_time": s.work_start_time, "lat": float(s.office_lat), "lng": float(s.office_lng)},
        "month": month["month"], "summary": month["summary"],
        "recent_scans": [{"at": a.at, "kind": a.kind, "result": a.result, "message": a.message, "distance_m": a.distance_m} for a in recent],
    }


@router.get("/history")
def worker_history(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db),
):
    """Every day of the month up to today: status, scan times, hours, lateness."""
    return _month_view(db, emp, month)


@router.get("/scans")
def worker_scans(emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    """The worker's own scan history (including refused scans)."""
    rows = db.execute(
        select(PayrollScanAttempt).where(PayrollScanAttempt.employee_id == emp.id)
        .order_by(PayrollScanAttempt.at.desc()).limit(60)
    ).scalars().all()
    return [{"at": a.at, "kind": a.kind, "result": a.result, "message": a.message, "distance_m": a.distance_m} for a in rows]


@router.get("/payments")
def worker_payments(emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    """Payments the administrator has recorded for this worker."""
    rows = db.execute(
        select(PayrollPayment).where(PayrollPayment.employee_id == emp.id)
        .order_by(PayrollPayment.paid_at.desc()).limit(60)
    ).scalars().all()
    return [{
        "id": p.id, "period": p.period, "amount": p.amount, "method": p.method, "reference": p.reference,
        "days_attended": p.days_attended, "days_total": p.days_total, "paid_at": p.paid_at, "note": p.note,
    } for p in rows]


# ------------------------------------ payslips ------------------------------------

@router.get("/payslips", response_model=list[PayslipOut])
def worker_payslips(emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    """Only approved or paid payslips belonging to the worker."""
    slips = db.execute(
        select(PayrollPayslip).options(joinedload(PayrollPayslip.run)).where(
            PayrollPayslip.employee_id == emp.id,
            PayrollPayslip.run.has(PayrollRun.status.in_(["APPROVED", "PAID"])),
        ).order_by(PayrollPayslip.created_at.desc())
    ).scalars().all()
    for sl in slips:
        sl.employee = emp
    return [slip_out(sl) for sl in slips]


@router.get("/payslips/{slip_id}", response_model=PayslipOut)
def worker_payslip(slip_id: int, emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    slip = db.execute(
        select(PayrollPayslip).options(joinedload(PayrollPayslip.run)).where(
            PayrollPayslip.id == slip_id, PayrollPayslip.employee_id == emp.id,
        )
    ).scalar_one_or_none()
    if not slip or slip.run.status not in ("APPROVED", "PAID"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
    slip.employee = emp
    return slip_out(slip, company=get_settings(db))


# -------------------------------------- leave --------------------------------------

@router.get("/leave", response_model=list[LeaveOut])
def my_leave(emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    rows = db.execute(
        select(PayrollLeaveRequest).where(PayrollLeaveRequest.employee_id == emp.id)
        .order_by(PayrollLeaveRequest.created_at.desc()).limit(100)
    ).scalars().all()
    for r in rows:
        r.employee = emp
    return [leave_svc.leave_out(r) for r in rows]


@router.get("/leave/balance", response_model=LeaveBalance)
def my_leave_balance(emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    return leave_svc.balance_for(db, emp, date.today().year)


@router.post("/leave", response_model=LeaveOut, status_code=201)
def request_leave(payload: LeaveCreate, emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    if payload.start_date < date.today() - timedelta(days=7):
        raise HTTPException(422, "Leave cannot start more than a week in the past")
    req = leave_svc.create_request(
        db, emp, payload.leave_type, payload.start_date, payload.end_date, payload.reason, emp.employee_code,
    )
    db.commit()
    req.employee = emp
    return leave_svc.leave_out(req)


@router.post("/leave/{req_id}/cancel", response_model=LeaveOut)
def cancel_leave(req_id: int, emp: PayrollEmployee = Depends(require_worker), db: Session = Depends(get_db)):
    req = db.get(PayrollLeaveRequest, req_id)
    if not req or req.employee_id != emp.id:
        raise HTTPException(404, "Leave request not found")
    if req.status != "PENDING":
        raise HTTPException(409, "Only pending requests can be cancelled. Contact your administrator.")
    leave_svc.cancel(db, req, emp.employee_code)
    db.commit()
    req.employee = emp
    return leave_svc.leave_out(req)
