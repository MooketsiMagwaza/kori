"""The keyed public API: approved sightings as areas, species, and the aggregated track map.

Every operation needs an API key with the matching scope; usage is charged against the key's hourly
limit and monthly quota (services/api_access.py, from the base code). A sighting that is waiting for
review or for its delay answers 404, exactly like one that does not exist, so the API never confirms
that something was seen. The scope check and error catalogue follow the base code's public router.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiKey, Sighting, Species, TrackEdge
from app.schemas import PublicSightingRead, SpeciesRead
from app.services.api_access import (
    SCOPE_SIGHTINGS_READ,
    SCOPE_SPECIES_READ,
    SCOPE_TRACKS_READ,
    require_scope,
)
from app.services.publication import RULES
from app.services.sightings import public_view

router = APIRouter(prefix="/v1", tags=["Public API v1"])

COMMON_ERRORS = {
    401: {"description": "Missing, invalid, expired, or revoked API key."},
    403: {"description": "The API key lacks the required scope."},
    429: {"description": "Hourly limit, monthly quota, or invalid-credential limit exceeded."},
}
# Only tracks confirmed by at least this many separate trips are published (or reviewed ones).
MIN_TRIPS_TO_PUBLISH = 3


def _public_rows(session: Session, now: datetime):
    return (
        select(Sighting, Species.sensitivity)
        .join(Species, Species.id == Sighting.species_id)
        .where(Sighting.status == "approved", Sighting.visible_from <= now)
    )


@router.get(
    "/sightings",
    response_model=list[PublicSightingRead],
    operation_id="v1ListSightings",
    summary="List approved, public sightings as areas",
    responses=COMMON_ERRORS,
)
def v1_sightings(
    area: str = Query(max_length=60),
    species: str | None = Query(default=None, max_length=400),
    since: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: ApiKey = Depends(require_scope(SCOPE_SIGHTINGS_READ)),
    session: Session = Depends(get_db),
) -> list[PublicSightingRead]:
    query = _public_rows(session, datetime.now(UTC)).where(Sighting.area_id == area)
    if species:
        query = query.where(
            Sighting.species_id.in_([s.strip() for s in species.split(",") if s.strip()])
        )
    if since is not None:
        query = query.where(Sighting.seen_at >= since)
    rows = session.execute(query.order_by(Sighting.seen_at.desc()).limit(limit))
    return [public_view(item, tier) for item, tier in rows]


@router.get(
    "/sightings/{public_id}",
    response_model=PublicSightingRead,
    operation_id="v1GetSighting",
    summary="One public sighting",
    responses={**COMMON_ERRORS, 404: {"description": "No such public sighting."}},
)
def v1_sighting(
    public_id: uuid.UUID,
    _: ApiKey = Depends(require_scope(SCOPE_SIGHTINGS_READ)),
    session: Session = Depends(get_db),
) -> PublicSightingRead:
    row = session.execute(
        _public_rows(session, datetime.now(UTC)).where(Sighting.public_id == public_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return public_view(row[0], row[1])


@router.get(
    "/species",
    response_model=list[SpeciesRead],
    operation_id="v1ListSpecies",
    summary="Species and their publication rules",
    responses=COMMON_ERRORS,
)
def v1_species(
    _: ApiKey = Depends(require_scope(SCOPE_SPECIES_READ)),
    session: Session = Depends(get_db),
) -> list[SpeciesRead]:
    out = []
    for item in session.scalars(select(Species).order_by(Species.common_name)):
        rule = RULES.get(item.sensitivity, RULES["sensitive"])
        out.append(
            SpeciesRead(
                id=item.id,
                common_name=item.common_name,
                setswana_name=item.setswana_name,
                scientific_name=item.scientific_name,
                tier=item.sensitivity,
                area_m=rule.cell_meters,
                delay_minutes=int(rule.delay.total_seconds() // 60),
            )
        )
    return out


@router.get(
    "/tracks",
    operation_id="v1ListTracks",
    summary="The aggregated track map for an area (GeoJSON, ODbL)",
    responses=COMMON_ERRORS,
)
def v1_tracks(
    area: str = Query(max_length=60),
    _: ApiKey = Depends(require_scope(SCOPE_TRACKS_READ)),
    session: Session = Depends(get_db),
) -> dict:
    """Reviewed tracks, and GPS-confirmed ones with enough trips. Never predicted or closed."""

    edges = session.scalars(
        select(TrackEdge).where(
            TrackEdge.area_id == area,
            (TrackEdge.status == "verified")
            | ((TrackEdge.status == "gps") & (TrackEdge.trips >= MIN_TRIPS_TO_PUBLISH)),
        )
    )
    return {
        "type": "FeatureCollection",
        "license": "ODbL-1.0",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": str(edge.public_id),
                    "status": edge.status,
                    "trips": edge.trips,
                    "length_m": edge.length_m,
                },
                "geometry": edge.line,
            }
            for edge in edges
        ],
    }
