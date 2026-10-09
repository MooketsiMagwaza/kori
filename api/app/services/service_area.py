"""Botswana envelope shared by every guard that accepts a position (sightings, trips, packs).

The pattern (a cheap bounding-box check before anything touches PostGIS) comes from the base code's
contribution envelope; the bounds are Botswana's, with a small margin, matching the field app's
share-code check.
"""

from collections.abc import Iterable
from typing import Protocol

from fastapi import HTTPException


class LocatedPoint(Protocol):
    lat: float
    lon: float


BOTSWANA_BOUNDS = {
    "west": 19.9,
    "south": -26.95,
    "east": 29.4,
    "north": -17.75,
}


def is_inside_botswana(point: LocatedPoint) -> bool:
    """Return whether a coordinate is inside Botswana's envelope (edges included)."""

    return (
        BOTSWANA_BOUNDS["west"] <= point.lon <= BOTSWANA_BOUNDS["east"]
        and BOTSWANA_BOUNDS["south"] <= point.lat <= BOTSWANA_BOUNDS["north"]
    )


def all_inside_botswana(points: Iterable[LocatedPoint]) -> bool:
    """Return false as soon as a point leaves the envelope."""

    return all(is_inside_botswana(point) for point in points)


def require_inside_botswana(points: Iterable[LocatedPoint]) -> None:
    """Reject a request before any database work when a point is outside Botswana."""

    if not all_inside_botswana(points):
        raise HTTPException(
            status_code=422,
            detail="Kori accepts positions inside Botswana only.",
        )
