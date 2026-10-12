"""Distance helpers for the office geofence."""
import math

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres between two GPS points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def friendly_distance(metres: float) -> str:
    if metres < 1000:
        return f"{int(round(metres, -1)) or 10} m"
    return f"{metres / 1000:.1f} km"


def maps_url(lat, lng) -> str | None:
    if lat is None or lng is None:
        return None
    return f"https://www.google.com/maps?q={float(lat):.6f},{float(lng):.6f}"
