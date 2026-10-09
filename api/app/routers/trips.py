"""Shared trips (opt-in GPS traces) and the list of downloadable park packs.

A trip arrives only after it has ended and only if the person chose to share it. The server trims
it again (services/traces.py), holds it back before use, and deletes it at its expiry. The API never
returns anyone's trace except to its owner.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import DeveloperAccount, ParkPack, Trip
from app.routers.developer import get_current_account
from app.schemas import PackRead, TripCreate, TripRead
from app.services import throttle
from app.services.audit import record_event
from app.services.service_area import require_inside_botswana
from app.services.traces import TracePoint, length_m, trim

router = APIRouter(prefix="/api", tags=["Trips and packs"])


def _trip_view(trip: Trip) -> TripRead:
    return TripRead(
        id=str(trip.public_id),
        started_at=trip.started_at,
        ended_at=trip.ended_at,
        point_count=trip.point_count,
        length_m=round(trip.length_m, 1),
        usable_from=trip.usable_from,
        expires_at=trip.expires_at,
    )


@router.post("/trips", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def share_trip(
    payload: TripCreate,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TripRead:
    now = datetime.now(UTC)
    if payload.ended_at > now or payload.started_at >= payload.ended_at:
        raise HTTPException(status_code=422, detail="Share a trip only after it has ended")
    if payload.consent_at > payload.started_at + timedelta(minutes=5):
        raise HTTPException(
            status_code=422, detail="Recording must be agreed before the trip starts"
        )
    require_inside_botswana(payload.points)
    throttle.enforce(session, "trip.share", str(account.id), limit=20, window_seconds=86_400)

    kept = trim([TracePoint(t=p.t, lon=p.lon, lat=p.lat) for p in payload.points])
    if len(kept) < 2:
        raise HTTPException(status_code=422, detail="The trip is too short to share once trimmed")
    trip = Trip(
        account_id=account.id,
        area_id=payload.area_id,
        started_at=payload.started_at.replace(second=0, microsecond=0),
        ended_at=payload.ended_at.replace(second=0, microsecond=0),
        consent_at=payload.consent_at,
        trace={"type": "LineString", "coordinates": [[p.lon, p.lat] for p in kept]},
        point_count=len(kept),
        length_m=length_m(kept),
        usable_from=now + timedelta(hours=settings.trip_hold_hours),
        expires_at=now + timedelta(days=settings.trip_retention_days),
    )
    session.add(trip)
    session.flush()
    record_event(session, account, "trip.share", "trip", trip.id, points=len(kept))
    session.commit()
    return _trip_view(trip)


@router.get("/trips/mine", response_model=list[TripRead])
def my_trips(
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> list[TripRead]:
    rows = session.scalars(
        select(Trip).where(Trip.account_id == account.id).order_by(Trip.started_at.desc())
    )
    return [_trip_view(trip) for trip in rows]


@router.delete("/trips/{public_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    public_id: uuid.UUID,
    account: DeveloperAccount = Depends(get_current_account),
    session: Session = Depends(get_db),
) -> None:
    """Delete one of your trips now. Someone else's trip answers 404, never 403."""

    trip = session.scalar(
        select(Trip).where(Trip.public_id == public_id, Trip.account_id == account.id)
    )
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    session.delete(trip)
    record_event(session, account, "trip.delete", "trip", trip.id)
    session.commit()


@router.get("/packs", response_model=list[PackRead])
def packs(session: Session = Depends(get_db)) -> list[ParkPack]:
    """Published park packs. Real parks are published only after the park authority is asked."""

    return list(session.scalars(select(ParkPack).where(ParkPack.published.is_(True))))
