"""Shared helpers: settings row, audit trail, working-day calendar."""
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.statutory import DEFAULT_TAX_BANDS
from app.models import PayrollAuditLog, PayrollHoliday, PayrollSetting


def get_settings(db: Session) -> PayrollSetting:
    s = db.get(PayrollSetting, 1)
    if s is None:
        s = PayrollSetting(id=1, tax_bands=DEFAULT_TAX_BANDS)
        db.add(s)
        db.commit()
        db.refresh(s)
    if not s.tax_bands:
        s.tax_bands = DEFAULT_TAX_BANDS
    return s


def audit(db: Session, action: str, entity_type: str, entity_id: int | None, details: str, actor: str = "admin") -> None:
    db.add(PayrollAuditLog(
        action=action, entity_type=entity_type, entity_id=entity_id,
        actor=actor, details=details[:2000],
    ))


def work_start(s: PayrollSetting) -> time:
    try:
        hh, mm = s.work_start_time.split(":")
        return time(int(hh), int(mm))
    except Exception:
        return time(8, 0)


def is_late(now_local: datetime, s: PayrollSetting) -> bool:
    limit = datetime.combine(now_local.date(), work_start(s)) + timedelta(minutes=s.late_grace_minutes or 0)
    return now_local.replace(tzinfo=None) > limit


def working_weekdays(s: PayrollSetting) -> set[int]:
    try:
        days = {int(x) for x in s.working_days_of_week.split(",") if x.strip() != ""}
    except ValueError:
        days = set()
    return days or {0, 1, 2, 3, 4, 5}


def holiday_dates(db: Session, start: date, end: date) -> dict[date, str]:
    rows = db.execute(
        select(PayrollHoliday).where(PayrollHoliday.date >= start, PayrollHoliday.date <= end)
    ).scalars().all()
    return {h.date: h.name for h in rows}


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def working_days_between(start: date, end: date, weekdays: set[int], holidays: dict[date, str]) -> list[date]:
    """Working days in [start, end], public holidays excluded."""
    return [d for d in daterange(start, end) if d.weekday() in weekdays and d not in holidays]


def ghana_fixed_holidays(year: int) -> list[tuple[date, str]]:
    """Fixed-date Ghana public holidays. Moveable ones (Easter, Eid, Farmers'
    Day) change yearly, so administrators add those from the Holidays page."""
    days = [
        (date(year, 1, 1), "New Year's Day"),
        (date(year, 1, 7), "Constitution Day"),
        (date(year, 3, 6), "Independence Day"),
        (date(year, 5, 1), "May Day"),
        (date(year, 5, 25), "Africa Day"),
        (date(year, 7, 1), "Republic Day"),
        (date(year, 8, 4), "Founders' Day"),
        (date(year, 9, 21), "Kwame Nkrumah Memorial Day"),
        (date(year, 12, 25), "Christmas Day"),
        (date(year, 12, 26), "Boxing Day"),
    ]
    return days
