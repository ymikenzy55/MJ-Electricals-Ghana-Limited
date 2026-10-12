"""Admin authentication for the payroll app.

The administrator account lives in ``payroll_admins`` (salted PBKDF2 hash).
It is seeded from PAYROLL_ADMIN_USERNAME / PAYROLL_ADMIN_PASSWORD the first
time the app starts and can then be changed from the app. All payroll
endpoints require the issued JWT via the ``require_admin`` dependency.
"""
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    AttemptGuard, create_access_token, decode_token, hash_secret, verify_secret,
)
from app.models import PayrollAdmin
from app.schemas import ChangePasswordRequest, LoginRequest, TokenOut
from app.services.common import audit

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_guard = AttemptGuard(settings.MAX_FAILED_LOGINS, settings.LOCKOUT_MINUTES * 60)


def require_admin(authorization: str | None = Header(default=None)) -> str:
    """Dependency: require a valid admin JWT on protected endpoints."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(authorization.split(" ", 1)[1])
    if not payload or payload.get("sub") != "admin":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return "admin"


def seed_admin(db: Session) -> None:
    exists = db.execute(select(PayrollAdmin).limit(1)).scalar_one_or_none()
    if exists is None:
        db.add(PayrollAdmin(
            username=settings.PAYROLL_ADMIN_USERNAME,
            password_hash=hash_secret(settings.PAYROLL_ADMIN_PASSWORD),
        ))
        db.commit()


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    key = f"{ip}|{payload.username.lower()}"
    if _guard.blocked(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts. Try again in {_guard.retry_after(key) // 60 + 1} minute(s).",
        )
    admin = db.execute(
        select(PayrollAdmin).where(PayrollAdmin.username == payload.username)
    ).scalar_one_or_none()
    # Always run one hash so timing does not reveal whether the user exists.
    ok = verify_secret(payload.password, admin.password_hash if admin else hash_secret("x"))
    if not admin or not ok:
        _guard.fail(key)
        audit(db, "LOGIN_FAILED", "admin", None, f"Failed admin login for '{payload.username[:32]}' from {ip}", actor="anonymous")
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    _guard.clear(key)
    return TokenOut(access_token=create_access_token("admin"))


@router.get("/me")
def me(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    admin = db.execute(select(PayrollAdmin).limit(1)).scalar_one_or_none()
    return {"username": admin.username if admin else settings.PAYROLL_ADMIN_USERNAME, "role": "admin"}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    admin = db.execute(select(PayrollAdmin).limit(1)).scalar_one_or_none()
    if not admin or not verify_secret(payload.current_password, admin.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is incorrect")
    admin.password_hash = hash_secret(payload.new_password)
    audit(db, "PASSWORD_CHANGED", "admin", admin.id, "Administrator password changed")
    db.commit()
    return {"message": "Password updated"}


class PosSsoRequest(BaseModel):
    pos_token: str


@router.post("/pos-sso", response_model=TokenOut)
def pos_sso(payload: PosSsoRequest):
    """Exchange a POS admin JWT for a payroll admin token.

    The POS module portal hands its session token to the payroll app so
    administrators don't have to sign in twice. We verify the token
    server-to-server against the POS /auth/me endpoint and only allow
    users with full (admin) access, i.e. no branch restriction.
    """
    try:
        r = httpx.get(
            f"{settings.POS_API_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {payload.pos_token}"},
            timeout=8,
        )
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the POS server")
    if r.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "POS session is invalid or expired")
    user = r.json()
    perms = set(user.get("permissions") or [])
    if not user.get("is_active") or user.get("branch_id") is not None or "users.manage" not in perms:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only POS administrators can open payroll")
    return TokenOut(access_token=create_access_token("admin", minutes=240))
