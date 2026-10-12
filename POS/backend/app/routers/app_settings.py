"""Business settings (company details on receipts, tax, return window)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_permission
from app.models import User
from app.services.app_settings import load_settings, save_settings
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class SettingsIn(BaseModel):
    company_name: str | None = Field(default=None, min_length=2, max_length=128)
    company_tin: str | None = Field(default=None, max_length=64)
    company_address: str | None = Field(default=None, max_length=255)
    company_phone: str | None = Field(default=None, max_length=64)
    company_email: str | None = Field(default=None, max_length=128)
    receipt_footer: str | None = Field(default=None, max_length=200)
    tax_rate: float | None = Field(default=None, ge=0, le=1)
    tax_inclusive: bool | None = None
    return_window_days: int | None = Field(default=None, ge=0, le=365)


@router.get("")
def read_settings(db: Session = Depends(get_db), _: User = Depends(require_permission("settings.manage"))):
    return load_settings(db)


@router.put("")
def update_settings(
    payload: SettingsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("settings.manage")),
):
    values = payload.model_dump(exclude_none=True)
    old = load_settings(db)
    out = save_settings(db, values)
    log_action(
        db, user_id=user.id, action="settings.updated", entity_type="settings",
        old_value={k: old[k] for k in values if k in old}, new_value=values,
    )
    db.commit()
    return out
