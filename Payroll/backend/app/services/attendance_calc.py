"""Attendance maths shared by the admin reports and the worker portal."""
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PayrollAttendance, PayrollEmployee, PayrollPayment, PayrollSetting
from app.services.common import daterange, holiday_dates, work_start, working_weekdays

ZERO = Decimal("0")


def parse_month(month: str | None) -> tuple[date, date, str]:
    today = date.today()
    if month:
        y, m = (int(p) for p in month.split("-"))
    else:
        y, m = today.year, today.month
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])
    return start, end, f"{y:04d}-{m:02d}"


def hours_between(rec: PayrollAttendance) -> Decimal:
    if rec.check_in and rec.check_out and rec.check_out > rec.check_in:
        return Decimal(str(round((rec.check_out - rec.check_in).total_seconds() / 3600, 2)))
    return ZERO


def late_minutes(rec: PayrollAttendance, s: PayrollSetting) -> int:
    if not rec.check_in:
        return 0
    local = rec.check_in.astimezone()
    limit = datetime.combine(local.date(), work_start(s), tzinfo=local.tzinfo)
    return max(0, int((local - limit).total_seconds() // 60))


def day_status(
    d: date, rec: PayrollAttendance | None, weekdays: set[int], holidays: dict[date, str], today: date,
) -> str:
    """Status shown for a day: the record's own status, or a computed one."""
    if rec is not None:
        return rec.status
    if d in holidays:
        return "HOLIDAY"
    if d.weekday() not in weekdays:
        return "REST_DAY"
    if d > today:
        return "UPCOMING"
    return "ABSENT"


def month_summary(
    emp: PayrollEmployee, start: date, end: date, records: dict[date, PayrollAttendance],
    s: PayrollSetting, weekdays: set[int], holidays: dict[date, str], today: date,
) -> dict:
    """Days attended out of the working days in the period, plus lateness and hours."""
    eff_start = max(start, emp.hire_date) if emp.hire_date else start
    eff_end = min(end, emp.termination_date) if emp.termination_date else end
    working = [d for d in daterange(eff_start, eff_end) if d.weekday() in weekdays and d not in holidays]
    elapsed = [d for d in working if d <= today]
    attended = late = leave = 0
    half = 0
    hours = ZERO
    late_min = 0
    for d in working:
        r = records.get(d)
        if not r:
            continue
        if r.status == "PRESENT":
            attended += 1
        elif r.status == "LATE":
            attended += 1
            late += 1
            late_min += late_minutes(r, s)
        elif r.status == "HALF_DAY":
            half += 1
        elif r.status == "LEAVE":
            leave += 1
        hours += hours_between(r)
    # Work done on rest days / holidays still counts as attendance, but not toward "total".
    days_attended = Decimal(attended) + Decimal(half) * Decimal("0.5")
    absent = max(len(elapsed) - attended - half - leave, 0)
    total = len(working)
    return {
        "days_attended": days_attended, "days_total": total, "elapsed_days": len(elapsed),
        "late": late, "late_minutes": late_min, "absent": absent, "leave": leave,
        "hours": hours, "pct": float(days_attended / total * 100) if total else 0.0,
    }


def suggested_amount(emp: PayrollEmployee, days_attended: Decimal, days_total: int) -> Decimal:
    """What the employee has earned for the days attended. Daily-rate staff are
    paid rate x days; monthly staff are paid their salary pro rata."""
    base = Decimal(str(emp.base_salary))
    if emp.salary_type == "DAILY":
        return (base * days_attended).quantize(Decimal("0.01"))
    if days_total <= 0:
        return ZERO
    return (base * days_attended / Decimal(days_total)).quantize(Decimal("0.01"))


def load_records(db: Session, emp_ids: list[int], start: date, end: date) -> dict[int, dict[date, PayrollAttendance]]:
    out: dict[int, dict[date, PayrollAttendance]] = defaultdict(dict)
    if not emp_ids:
        return out
    for r in db.execute(
        select(PayrollAttendance).where(
            PayrollAttendance.employee_id.in_(emp_ids),
            PayrollAttendance.date >= start, PayrollAttendance.date <= end,
        )
    ).scalars():
        out[r.employee_id][r.date] = r
    return out


def paid_by_employee(db: Session, period: str) -> dict[int, Decimal]:
    out: dict[int, Decimal] = defaultdict(lambda: ZERO)
    for p in db.execute(select(PayrollPayment).where(PayrollPayment.period == period)).scalars():
        out[p.employee_id] += p.amount
    return out


def context(db: Session, s: PayrollSetting, start: date, end: date):
    return working_weekdays(s), holidays_for(db, start, end)


def holidays_for(db: Session, start: date, end: date) -> dict[date, str]:
    return holiday_dates(db, start, end)
