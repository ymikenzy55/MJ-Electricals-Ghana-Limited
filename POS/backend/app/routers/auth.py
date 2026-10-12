from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies.auth import get_current_user, user_permissions
from app.models import Branch, User
from app.schemas.auth import LoginResponse, UserOut
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


def _user_out(db: Session, user: User) -> UserOut:
    branch_name = None
    if user.branch_id is not None:
        branch = db.get(Branch, user.branch_id)
        branch_name = branch.name if branch else None
    return UserOut(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role_name=user.role.name,
        permissions=sorted(user_permissions(user)),
        branch_id=user.branch_id,
        branch_name=branch_name,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10 per minute")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(or_(User.username == form.username, User.email == form.username))
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if user is None:
        # Constant-ish response for unknown users; do not reveal which part failed.
        hash_password("dummy-timing-equalizer")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")

    if user.locked_until is not None and user.locked_until > now:
        # Return same message as unknown user to prevent account enumeration.
        hash_password("dummy-timing-equalizer")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")

    if not verify_password(form.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_FAILED_LOGINS:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_attempts = 0
        log_action(db, user_id=user.id, action="auth.login_failed", branch_id=user.branch_id)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    log_action(db, user_id=user.id, action="auth.login", branch_id=user.branch_id)
    db.commit()

    token = create_access_token(str(user.id), {"role": user.role.name, "branch_id": user.branch_id})
    return LoginResponse(access_token=token, user=_user_out(db, user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_out(db, user)
