"""Settings, public holidays and the audit trail."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import PayrollAuditLog, PayrollHoliday
from app.routers.auth import require_admin
from app.schemas import AuditOut, HolidayIn, HolidayOut, SettingsOut, SettingsUpdate
from app.services.common import audit, get_settings

router = APIRouter(prefix="/api/v1", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/settings", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.patch("/settings", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    s = get_settings(db)
    data = payload.model_dump(exclude_unset=True)
    if "tax_bands" in data and data["tax_bands"] is not None:
        bands = data["tax_bands"]
        if not bands or bands[-1].get("width") is not None:
            raise HTTPException(422, "The last tax band must be open-ended (leave its width empty)")
        if any(b.get("width") is None for b in bands[:-1]):
            raise HTTPException(422, "Only the last tax band may be open-ended")
    for k, v in data.items():
        setattr(s, k, v)
    audit(db, "UPDATE", "settings", 1, "Updated payroll settings: " + ", ".join(sorted(data)))
    db.commit()
    db.refresh(s)
    return s


@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(year: int | None = Query(default=None, ge=2000, le=2100), db: Session = Depends(get_db)):
    year = year or date.today().year
    return db.execute(
        select(PayrollHoliday).where(
            PayrollHoliday.date >= date(year, 1, 1), PayrollHoliday.date <= date(year, 12, 31)
        ).order_by(PayrollHoliday.date)
    ).scalars().all()


@router.post("/holidays", response_model=HolidayOut, status_code=201)
def add_holiday(payload: HolidayIn, db: Session = Depends(get_db)):
    if db.execute(select(PayrollHoliday).where(PayrollHoliday.date == payload.date)).scalar_one_or_none():
        raise HTTPException(409, "A holiday already exists on that date")
    h = PayrollHoliday(date=payload.date, name=payload.name)
    db.add(h)
    audit(db, "CREATE", "holiday", None, f"Holiday {payload.date}: {payload.name}")
    db.commit()
    db.refresh(h)
    return h


@router.delete("/holidays/{holiday_id}", status_code=204)
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)):
    h = db.get(PayrollHoliday, holiday_id)
    if not h:
        raise HTTPException(404, "Holiday not found")
    audit(db, "DELETE", "holiday", h.id, f"Removed holiday {h.date}: {h.name}")
    db.delete(h)
    db.commit()


@router.get("/audit-logs", response_model=list[AuditOut])
def audit_logs(
    q: str | None = Query(default=None, max_length=100),
    entity_type: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    stmt = select(PayrollAuditLog)
    if entity_type:
        stmt = stmt.where(PayrollAuditLog.entity_type == entity_type)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(PayrollAuditLog.details.ilike(like) | PayrollAuditLog.action.ilike(like))
    return db.execute(stmt.order_by(PayrollAuditLog.created_at.desc()).limit(limit)).scalars().all()
