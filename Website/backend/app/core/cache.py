"""Tiny thread-safe TTL cache for public, read-mostly responses.

The database is a remote Postgres, so every avoided query saves a network
round trip. Entries expire on their own and admin writes clear them early.
"""
import threading
import time
from typing import Any, Callable

_lock = threading.Lock()
_store: dict[str, tuple[float, Any]] = {}
_MAX_ENTRIES = 500


def cached(key: str, ttl: float, build: Callable[[], Any]) -> Any:
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = build()
    with _lock:
        if len(_store) >= _MAX_ENTRIES:
            for k in [k for k, (exp, _) in _store.items() if exp <= now] or list(_store)[: _MAX_ENTRIES // 4]:
                _store.pop(k, None)
        _store[key] = (now + ttl, value)
    return value


def invalidate(prefix: str = "") -> None:
    with _lock:
        for k in [k for k in _store if k.startswith(prefix)]:
            _store.pop(k, None)
