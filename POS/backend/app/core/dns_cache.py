"""Remember the last good DNS answer for every host.

On some networks Windows name lookups fail now and then ("getaddrinfo failed")
even though the internet is fine. That made the cloud sync report errors and
stall. If a lookup fails we reuse the last address that worked, so a passing
DNS hiccup no longer interrupts the connection to the cloud database.
"""
import socket
import threading
import time

_real = socket.getaddrinfo
_cache: dict[tuple, list] = {}
_lock = threading.Lock()


def _cached_getaddrinfo(host, port, *args, **kwargs):
    key = (host, port, args, tuple(sorted(kwargs.items())))
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            res = _real(host, port, *args, **kwargs)
            if isinstance(host, str) and host and not host.replace(".", "").isdigit():
                with _lock:
                    _cache[key] = res
            return res
        except socket.gaierror as exc:
            last_error = exc
            with _lock:
                hit = _cache.get(key)
            if hit:
                return hit
            time.sleep(0.4 * (attempt + 1))
    assert last_error is not None
    raise last_error


def install() -> None:
    if socket.getaddrinfo is not _cached_getaddrinfo:
        socket.getaddrinfo = _cached_getaddrinfo
