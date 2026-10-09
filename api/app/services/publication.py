"""Publication rules for sightings: how coarse, how late, and whether guidance is allowed.

This is the server's copy of ``shared/rules.ts`` in the web apps, and must give the same answers;
``tests/test_publication.py`` checks the grid against values computed by the TypeScript version.
The numbers are proposals, to be agreed with the Department of Wildlife and National Parks.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

EARTH_LAT_METERS_PER_DEGREE = 110_574.0
EARTH_LON_METERS_PER_DEGREE_AT_EQUATOR = 111_320.0
# The grid is fixed for the whole country from one reference latitude, so a point always lands in
# the same cell whichever app or service computes it.
GRID_REFERENCE_LATITUDE = -22.0


@dataclass(frozen=True)
class Rule:
    cell_meters: int
    delay: timedelta
    guidance: bool
    qr_share: bool


RULES: dict[str, Rule] = {
    "standard": Rule(cell_meters=1_000, delay=timedelta(hours=1), guidance=True, qr_share=True),
    "sensitive": Rule(cell_meters=10_000, delay=timedelta(days=7), guidance=False, qr_share=False),
}


@dataclass(frozen=True)
class Cell:
    id: str
    lon: float
    lat: float
    size_m: int


def sensitivity_of(species_sensitivity: str | None, den_or_nest: bool = False) -> str:
    """Dens and nests are sensitive whatever the species; unknown species fail safe."""

    if den_or_nest or species_sensitivity not in RULES:
        return "sensitive"
    return species_sensitivity


def rule_for(species_sensitivity: str | None, den_or_nest: bool = False) -> Rule:
    return RULES[sensitivity_of(species_sensitivity, den_or_nest)]


def _steps(size_m: int) -> tuple[float, float]:
    lon_per_meter = 1 / (
        EARTH_LON_METERS_PER_DEGREE_AT_EQUATOR * math.cos(math.radians(GRID_REFERENCE_LATITUDE))
    )
    return size_m * lon_per_meter, size_m / EARTH_LAT_METERS_PER_DEGREE


def cell_for(lon: float, lat: float, size_m: int) -> Cell:
    """Snap a point to the centre of its grid cell."""

    step_lon, step_lat = _steps(size_m)
    col = math.floor(lon / step_lon)
    row = math.floor(lat / step_lat)
    return Cell(
        id=f"c{size_m}:{col}:{row}",
        lon=round((col + 0.5) * step_lon, 5),
        lat=round((row + 0.5) * step_lat, 5),
        size_m=size_m,
    )


def visible_from(seen_at: datetime, species_sensitivity: str | None, den_or_nest: bool) -> datetime:
    """The earliest time anyone but the observer and reviewers may see the sighting."""

    return seen_at + rule_for(species_sensitivity, den_or_nest).delay


def is_public(status: str, visible_from_at: datetime, now: datetime) -> bool:
    return status == "approved" and now >= visible_from_at


def round_down(moment: datetime, minutes: int) -> datetime:
    """Round a time down, used to publish times to the quarter hour."""

    step = minutes * 60
    seconds = int(moment.timestamp()) // step * step
    return datetime.fromtimestamp(seconds, tz=moment.tzinfo)
