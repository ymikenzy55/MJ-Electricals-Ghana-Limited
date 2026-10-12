"""Database-backed business settings with env-var defaults.

Values saved from the Settings page override the .env defaults and sync to
every terminal, so receipts and tax are identical online and offline.
"""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cache import cache_get, cache_invalidate, cache_set
from app.core.config import settings as env
from app.core.database import SessionLocal

_CACHE_KEY = "app_settings"
_TTL = 30

# key -> (type, default factory)
DEFAULTS = {
    "company_name": ("str", lambda: env.COMPANY_NAME),
    "company_tin": ("str", lambda: env.COMPANY_TIN),
    "company_address": ("str", lambda: ""),
    "company_phone": ("str", lambda: ""),
    "company_email": ("str", lambda: ""),
    "receipt_footer": ("str", lambda: "Thank you for shopping with us!"),
    "tax_rate": ("float", lambda: env.TAX_RATE),
    "tax_inclusive": ("bool", lambda: env.TAX_INCLUSIVE),
    "return_window_days": ("int", lambda: 7),
}


def _coerce(kind: str, raw: str | None, default):
    if raw is None:
        return default
    try:
        if kind == "float":
            return float(raw)
        if kind == "int":
            return int(raw)
        if kind == "bool":
            return raw.lower() in ("1", "true", "yes")
    except ValueError:
        return default
    return raw


def load_settings(db: Session | None = None) -> dict:
    hit = cache_get(_CACHE_KEY)
    if hit is not None:
        return hit
    own = db is None
    db = db or SessionLocal()
    try:
        from app.models import AppSetting

        stored = {r.key: r.value for r in db.execute(select(AppSetting)).scalars()}
    except Exception:  # table missing on an un-migrated database
        stored = {}
    finally:
        if own:
            db.close()
    out = {k: _coerce(kind, stored.get(k), default()) for k, (kind, default) in DEFAULTS.items()}
    cache_set(_CACHE_KEY, out, _TTL)
    return out


def save_settings(db: Session, values: dict) -> dict:
    from app.models import AppSetting

    existing = {r.key: r for r in db.execute(select(AppSetting)).scalars()}
    for key, value in values.items():
        if key not in DEFAULTS:
            continue
        text = "true" if value is True else "false" if value is False else str(value)
        row = existing.get(key)
        if row is None:
            db.add(AppSetting(key=key, value=text))
        else:
            row.value = text
    db.commit()
    cache_invalidate(_CACHE_KEY)
    cache_invalidate("public_config")
    return load_settings(db)


def tax_settings() -> tuple[Decimal, bool]:
    s = load_settings()
    return Decimal(str(s["tax_rate"])), bool(s["tax_inclusive"])
