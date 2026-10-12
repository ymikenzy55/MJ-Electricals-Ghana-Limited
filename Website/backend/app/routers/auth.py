"""Authentication router for website users (customers)."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token, decode_token, hash_password, login_guard, password_problem, verify_password,
)
from app.models import WebsiteUser
from app.schemas import (
    PasswordChange, PasswordResetConfirm, PasswordResetRequest, ProfileUpdate, TokenOut,
    WebsiteUserCreate, WebsiteUserLogin, WebsiteUserOut,
)
from app.services.email import send_password_reset_email

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


def _reset_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _token_for(user: WebsiteUser) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(str(user.id), user.pwd_version or 0),
        user=WebsiteUserOut.model_validate(user),
    )


def user_from_header(authorization: str | None, db: Session) -> WebsiteUser | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = decode_token(authorization.split(" ", 1)[1])
    if not payload:
        return None
    try:
        user = db.get(WebsiteUser, int(payload.get("sub", 0)))
    except (TypeError, ValueError):
        return None
    if not user or not user.is_active or (user.pwd_version or 0) != payload.get("pv", 0):
        return None
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> WebsiteUser:
    """Require a valid website-user JWT."""
    user = user_from_header(authorization, db)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


def get_optional_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> WebsiteUser | None:
    return user_from_header(authorization, db)


@router.get("/me", response_model=WebsiteUserOut)
def me(user: WebsiteUser = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=WebsiteUserOut)
def update_profile(payload: ProfileUpdate, user: WebsiteUser = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=TokenOut)
@limiter.limit("10 per hour")
def change_password(request: Request, payload: PasswordChange, user: WebsiteUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is incorrect")
    problem = password_problem(payload.new_password)
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
    user.password_hash = hash_password(payload.new_password)
    user.pwd_version = (user.pwd_version or 0) + 1  # signs out every other device
    db.commit()
    return _token_for(user)


@router.post("/register", response_model=TokenOut, status_code=201)
@limiter.limit("10 per hour")
def register(request: Request, payload: WebsiteUserCreate, db: Session = Depends(get_db)):
    problem = password_problem(payload.password)
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
    email = payload.email.lower()
    if db.execute(select(WebsiteUser).where(func.lower(WebsiteUser.email) == email)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Try signing in.")
    user = WebsiteUser(
        full_name=payload.full_name, email=email, phone=payload.phone,
        password_hash=hash_password(payload.password), address=payload.address,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_for(user)


@router.post("/login", response_model=TokenOut)
@limiter.limit("30 per minute")
def login(request: Request, payload: WebsiteUserLogin, db: Session = Depends(get_db)):
    email = payload.email.lower()
    key = f"{get_remote_address(request)}|{email}"
    if login_guard.blocked(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed attempts. Please wait a few minutes and try again.")
    user = db.execute(select(WebsiteUser).where(func.lower(WebsiteUser.email) == email)).scalar_one_or_none()
    if not verify_password(payload.password, user.password_hash if user else None):
        login_guard.fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled. Contact us for help.")
    login_guard.clear(key)
    return _token_for(user)


@router.post("/password-reset/request")
@limiter.limit("5 per hour")
def request_password_reset(request: Request, payload: PasswordResetRequest, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Create a short-lived single-use token and e-mail the reset link. The
    response is identical for unknown addresses."""
    user = db.execute(select(WebsiteUser).where(func.lower(WebsiteUser.email) == payload.email.lower())).scalar_one_or_none()
    if user and user.is_active:
        token = secrets.token_urlsafe(48)
        user.reset_token_hash = _reset_hash(token)
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        background.add_task(send_password_reset_email, user.email, token)
    return {"message": "If an account exists for that email, reset instructions have been sent."}


@router.post("/password-reset/confirm")
@limiter.limit("10 per hour")
def confirm_password_reset(request: Request, payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.execute(select(WebsiteUser).where(WebsiteUser.reset_token_hash == _reset_hash(payload.token))).scalar_one_or_none()
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired.")
    problem = password_problem(payload.password)
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
    user.password_hash = hash_password(payload.password)
    user.pwd_version = (user.pwd_version or 0) + 1
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    db.commit()
    return {"message": "Password reset successfully"}
