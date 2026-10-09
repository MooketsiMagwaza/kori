"""Turning sighting rows into the three views the API serves: own, reviewer, and public.

The public view is the only one other people ever get. It never carries the exact point, the
observer or notes, and its time is rounded down to the quarter hour.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Sighting, Species
from app.schemas import AreaRead, OwnSightingRead, PublicSightingRead, ReviewItemRead
from app.services.publication import cell_for, round_down, rule_for, sensitivity_of, visible_from


def species_sensitivity(session: Session, species_id: str) -> str | None:
    return session.scalar(select(Species.sensitivity).where(Species.id == species_id))


def new_sighting(
    session: Session,
    *,
    species_id: str,
    count: int,
    seen_at: datetime,
    lon: float,
    lat: float,
    accuracy_m: float | None,
    den_or_nest: bool,
    notes: str | None,
    area_id: str | None,
    observer_id: int,
) -> Sighting:
    """Build a pending sighting with its cell and publication time fixed from today's rules."""

    tier = species_sensitivity(session, species_id)
    cell = cell_for(lon, lat, rule_for(tier, den_or_nest).cell_meters)
    return Sighting(
        species_id=species_id,
        count=count,
        seen_at=seen_at,
        lon=lon,
        lat=lat,
        accuracy_m=accuracy_m,
        cell_id=cell.id,
        cell_size_m=cell.size_m,
        cell_lon=cell.lon,
        cell_lat=cell.lat,
        den_or_nest=den_or_nest,
        notes=notes,
        status="pending",
        visible_from=visible_from(seen_at, tier, den_or_nest),
        observer_id=observer_id,
        area_id=area_id,
    )


def _area(item: Sighting) -> AreaRead:
    return AreaRead(
        cell=item.cell_id,
        centre={"lon": item.cell_lon, "lat": item.cell_lat},
        size_m=item.cell_size_m,
    )


def own_view(item: Sighting) -> OwnSightingRead:
    return OwnSightingRead(
        id=str(item.public_id),
        species_id=item.species_id,
        count=item.count,
        seen_at=item.seen_at,
        point={"lon": item.lon, "lat": item.lat, "accuracyM": item.accuracy_m},
        area=_area(item),
        status=item.status,
        visible_from=item.visible_from,
    )


def review_view(item: Sighting, tier: str | None) -> ReviewItemRead:
    return ReviewItemRead(
        id=str(item.public_id),
        species_id=item.species_id,
        count=item.count,
        seen_at=item.seen_at,
        point={"lon": item.lon, "lat": item.lat, "accuracyM": item.accuracy_m},
        area=_area(item),
        den_or_nest=item.den_or_nest,
        sensitivity=sensitivity_of(tier, item.den_or_nest),
        notes=item.notes,
        status=item.status,
        visible_from=item.visible_from,
    )


def public_view(item: Sighting, tier: str | None) -> PublicSightingRead:
    return PublicSightingRead(
        id=str(item.public_id),
        species=item.species_id,
        count=item.count,
        seen_at=round_down(item.seen_at, 15),
        area=_area(item),
        sensitive=sensitivity_of(tier, item.den_or_nest) == "sensitive",
    )
