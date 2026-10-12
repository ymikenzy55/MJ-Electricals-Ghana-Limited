"""Simple in-memory TTL cache for rarely-changing data.

Avoids hitting the (cloud) database for values that change almost never,
such as POS config and the branch list. Each entry stores its expiry time
and is served from memory until it expires, at which point the next request
re-fetches from the database and refreshes the cache.
"""

import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_store: dict[str, tuple[float, Any]] = {}


def cache_get(key: str) -> Any | None:
    """Return the cached value if it exists and has not expired, else None."""
    entry = _store.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() > expires_at:
        _store.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl: float) -> None:
    """Store *value* under *key* with a time-to-live of *ttl* seconds."""
    _store[key] = (time.monotonic() + ttl, value)


def cache_invalidate(key: str) -> None:
    """Remove *key* from the cache so the next access re-fetches from source."""
    _store.pop(key, None)


def cache_invalidate_prefix(prefix: str) -> None:
    """Remove all cache entries whose key starts with *prefix*."""
    keys = [k for k in _store if k.startswith(prefix)]
    for k in keys:
        _store.pop(k, None)


def cached(key: str, ttl: float, factory: Callable[[], T]) -> T:
    """Return the cached value for *key*, or call *factory* and cache the result."""
    hit = cache_get(key)
    if hit is not None:
        return hit  # type: ignore[return-value]
    value = factory()
    cache_set(key, value, ttl)
    return value
