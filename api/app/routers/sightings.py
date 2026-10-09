"""Observers submit sightings from the field app and see their own. Nothing here is public."""

import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DeveloperAccount, IdempotencyRecord, Sighting, Species
from app.routers.developer import get_current_account
from app.schemas import OwnSightingRead, SightingCreate
from app.services import throttle
from app.services.audit import record_event
from app.services.service_area import require_inside_botswana
from app.services.sightings import new_sighting, own_view

router = APIRouter(prefix="/api/sightings", tags=["Sightings"])
IDEMPOTENCY_SCOPE = "sighting.create"


@router.post("", response_model=OwnSightingRead, status_code=status.HTTP_201_CREATED)
def submit_sighting(
    payload: SightingCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> OwnSightingRead:
    """Queue a sighting for review. A repeated Idempotency-Key returns the first result."""

    if idempotency_key is not None and not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", idempotency_key):
        raise HTTPException(
            status_code=422, detail="Idempotency-Key must be 8-64 letters or digits"
        )
    if idempotency_key:
        earlier = session.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.account_id == account.id,
                IdempotencyRecord.scope == IDEMPOTENCY_SCOPE,
                IdempotencyRecord.key == idempotency_key,
            )
        )
        if earlier is not None:
            existing = session.get(Sighting, earlier.result_id)
            if existing is not None:
                return own_view(existing)

    require_inside_botswana([payload.point])
    if session.get(Species, payload.species_id) is None:
        raise HTTPException(status_code=422, detail="Unknown species")
    throttle.enforce(session, "sighting.create", str(account.id), limit=120, window_seconds=3600)

    sighting = new_sighting(
        session,
        species_id=payload.species_id,
        count=payload.count,
        seen_at=payload.seen_at,
        lon=payload.point.lon,
        lat=payload.point.lat,
        accuracy_m=payload.point.accuracy_m,
        den_or_nest=payload.den_or_nest,
        notes=payload.notes,
        area_id=payload.area_id,
        observer_id=account.id,
    )
    session.add(sighting)
    session.flush()
    if idempotency_key:
        session.add(
            IdempotencyRecord(
                account_id=account.id,
                scope=IDEMPOTENCY_SCOPE,
                key=idempotency_key,
                result_id=sighting.id,
            )
        )
    record_event(
        session, account, "sighting.submit", "sighting", sighting.id, species=sighting.species_id
    )
    session.commit()
    return own_view(sighting)


@router.get("/mine", response_model=list[OwnSightingRead])
def my_sightings(
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> list[OwnSightingRead]:
    rows = session.scalars(
        select(Sighting)
        .where(Sighting.observer_id == account.id)
        .order_by(Sighting.seen_at.desc())
        .limit(500)
    )
    return [own_view(item) for item in rows]
