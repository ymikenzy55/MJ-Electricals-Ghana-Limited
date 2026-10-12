from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.cache import cache_get, cache_set
from app.core.database import get_db
from app.core.security import decode_token
from app.models import Role, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

_PERM_TTL = 120  # seconds – short TTL so role changes propagate quickly


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    # Eager-load role + permissions in a single query to avoid extra round-trips
    # to the cloud database on every request.
    user = db.execute(
        select(User)
        .options(joinedload(User.role).joinedload(Role.permissions))
        .where(User.id == user_id)
    ).unique().scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def user_permissions(user: User) -> set[str]:
    # Cache the permission set per user to avoid loading from the DB on every
    # request.  The TTL is short so role changes still propagate quickly.
    cache_key = f"perms:{user.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    perms = {p.code for p in user.role.permissions}
    cache_set(cache_key, perms, _PERM_TTL)
    return perms


def require_permission(code: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if code not in user_permissions(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {code}")
        return user

    return checker


def enforce_branch_access(user: User, branch_id: int) -> int:
    """Users tied to a branch may only act on their own branch.

    Users without a branch assignment (e.g. Administrator, CEO) may act on any branch.
    """
    if user.branch_id is not None and user.branch_id != branch_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access to this branch is not allowed")
    return branch_id
