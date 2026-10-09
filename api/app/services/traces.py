"""Server-side privacy treatment of a shared trip, repeated even though the phone already did it.

The phone trims before sharing (apps/field/lib/trips.ts). The server repeats it, so a modified or
buggy client still cannot store the first or last kilometre of someone's trip, or times finer than
a minute.
"""

import math
from dataclasses import dataclass
from datetime import UTC, datetime

TRIM_METERS = 1_000.0
EARTH_RADIUS_METERS = 6_371_000.0


@dataclass(frozen=True)
class TracePoint:
    t: datetime
    lon: float
    lat: float


def distance_m(a: TracePoint, b: TracePoint) -> float:
    """Great-circle distance in metres."""

    d_lat = math.radians(b.lat - a.lat)
    d_lon = math.radians(b.lon - a.lon)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a.lat)) * math.cos(math.radians(b.lat)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(h))


def length_m(points: list[TracePoint]) -> float:
    return sum(distance_m(points[i - 1], points[i]) for i in range(1, len(points)))


def trim(points: list[TracePoint]) -> list[TracePoint]:
    """Drop the first and last kilometre and round times down to the minute.

    A trip of two kilometres or less leaves nothing to share, and returns an empty list.
    """

    total = length_m(points)
    if total <= TRIM_METERS * 2:
        return []
    kept: list[TracePoint] = []
    travelled = 0.0
    for index, point in enumerate(points):
        if index:
            travelled += distance_m(points[index - 1], point)
        if TRIM_METERS <= travelled <= total - TRIM_METERS:
            minute = point.t.astimezone(UTC).replace(second=0, microsecond=0)
            kept.append(TracePoint(t=minute, lon=round(point.lon, 6), lat=round(point.lat, 6)))
    return kept
