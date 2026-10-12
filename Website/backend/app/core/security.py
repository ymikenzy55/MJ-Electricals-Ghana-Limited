"""Password hashing, JWT helpers and brute-force protection for the website."""
import hmac
import re
import time
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_DUMMY_HASH = pwd_context.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str | None) -> bool:
    """Always performs one bcrypt comparison so timing does not reveal
    whether the account exists."""
    try:
        ok = pwd_context.verify(plain, hashed or _DUMMY_HASH)
    except ValueError:
        return False
    return ok and hashed is not None


def password_problem(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain both letters and numbers."
    return None


def constant_time_equals(a: str | None, b: str) -> bool:
    return a is not None and hmac.compare_digest(a.encode(), b.encode())


def create_access_token(subject: str, pwd_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject, "iat": now, "pv": pwd_version,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None


class AttemptGuard:
    """Sliding-window failure counter keyed by e.g. ``ip|email``."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, list[float]] = {}

    def _recent(self, key: str) -> list[float]:
        now = time.monotonic()
        recent = [t for t in self._hits.get(key, []) if now - t < self.window]
        if recent:
            self._hits[key] = recent
        else:
            self._hits.pop(key, None)
        return recent

    def blocked(self, key: str) -> bool:
        return len(self._recent(key)) >= self.limit

    def fail(self, key: str) -> None:
        self._recent(key)
        self._hits.setdefault(key, []).append(time.monotonic())

    def clear(self, key: str) -> None:
        self._hits.pop(key, None)


login_guard = AttemptGuard(settings.MAX_LOGIN_ATTEMPTS, settings.LOGIN_LOCKOUT_MINUTES * 60)
