"""Password / PIN hashing, JWT helpers and the in-memory brute-force guard."""
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

_PBKDF2_ROUNDS = 200_000


def hash_secret(value: str) -> str:
    """Salted PBKDF2-SHA256 hash: ``pbkdf2$rounds$salt$hexdigest``."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode(), salt.encode(), _PBKDF2_ROUNDS).hex()
    return f"pbkdf2${_PBKDF2_ROUNDS}${salt}${digest}"


def legacy_pin_hash(pin: str) -> str:
    """The original unsalted scheme, kept only to migrate old PINs."""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{pin}".encode()).hexdigest()


def verify_secret(value: str, stored: str | None) -> bool:
    if not stored:
        return False
    if stored.startswith("pbkdf2$"):
        try:
            _, rounds, salt, digest = stored.split("$")
            calc = hashlib.pbkdf2_hmac("sha256", value.encode(), salt.encode(), int(rounds)).hex()
        except ValueError:
            return False
        return hmac.compare_digest(calc, digest)
    return hmac.compare_digest(legacy_pin_hash(value), stored)


def constant_time_equals(a: str | None, b: str | None) -> bool:
    return a is not None and b is not None and hmac.compare_digest(a.encode(), b.encode())


def needs_rehash(stored: str | None) -> bool:
    return bool(stored) and not stored.startswith("pbkdf2$")


def create_access_token(subject: str, minutes: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": subject, "exp": expire, "iat": now},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None


def workplace_token(day: str | None = None) -> str:
    """Daily-rotating token shown as a QR at the workplace kiosk."""
    day = day or datetime.now().date().isoformat()
    return hmac.new(settings.SECRET_KEY.encode(), f"wp:{day}".encode(), hashlib.sha256).hexdigest()[:20]


class AttemptGuard:
    """Tiny in-memory sliding-window limiter / lockout keyed by any string."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
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

    def retry_after(self, key: str) -> int:
        recent = self._recent(key)
        if not recent:
            return 0
        return max(1, int(self.window - (time.monotonic() - recent[0])))
