"""Review: the sighting queue, approve or reject, content reports, and the audit log.

Reviewers (role ``reviewer``) and administrators decide. Every decision is stored as a
ReviewDecision and an AuditEvent in the same transaction. Approving never publishes early: a
sighting becomes public only once ``visibleFrom`` has passed. The report and audit endpoints follow
the base code's moderation router; the sighting review is new.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import (
    AuditEvent,
    ContentReport,
    DeveloperAccount,
    ReviewDecision,
    Sighting,
    Species,
)
from app.routers.admin import require_admin
from app.routers.developer import get_current_account
from app.schemas import ApiModel, ReviewDecisionIn, ReviewItemRead
from app.services.audit import record_event
from app.services.sightings import review_view

router = APIRouter(prefix="/api/review", tags=["Review"])
REVIEW_ROLES = {"reviewer", "admin"}


def require_reviewer(
    request: Request,
    account: DeveloperAccount = Depends(get_current_account),
    settings: Settings = Depends(get_settings),
) -> DeveloperAccount:
    """Reviewers and administrators only; administrators also need MFA (see require_admin)."""

    if account.role == "admin":
        return require_admin(request, account, settings)
    if account.role not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="Reviewer access is required")
    return account


class ResolveReport(ApiModel):
    action: str = Field(pattern="^(hide_content|dismiss)$")
    note: str | None = Field(default=None, max_length=500)


class ReviewSummary(ApiModel):
    waiting: int
    open_reports: int = Field(serialization_alias="openReports")


class AuditRead(ApiModel):
    id: int
    occurred_at: datetime = Field(serialization_alias="occurredAt")
    actor_id: int | None = Field(serialization_alias="actorId")
    actor_role: str | None = Field(serialization_alias="actorRole")
    action: str
    target_type: str = Field(serialization_alias="targetType")
    target_id: int | None = Field(serialization_alias="targetId")
    detail: dict
    request_id: str | None = Field(serialization_alias="requestId")


@router.get("/summary", response_model=ReviewSummary)
def summary(
    _: DeveloperAccount = Depends(require_reviewer), session: Session = Depends(get_db)
) -> ReviewSummary:
    waiting = session.scalar(select(func.count(Sighting.id)).where(Sighting.status == "pending"))
    reports = session.scalar(
        select(func.count(ContentReport.id)).where(ContentReport.status == "open")
    )
    return ReviewSummary(waiting=waiting or 0, open_reports=reports or 0)


@router.get("/queue", response_model=list[ReviewItemRead])
def queue(
    state: str = Query(default="pending", pattern="^(pending|approved|rejected)$"),
    limit: int = Query(default=50, ge=1, le=200),
    _: DeveloperAccount = Depends(require_reviewer),
    session: Session = Depends(get_db),
) -> list[ReviewItemRead]:
    order = Sighting.seen_at.asc() if state == "pending" else Sighting.seen_at.desc()
    rows = session.execute(
        select(Sighting, Species.sensitivity)
        .join(Species, Species.id == Sighting.species_id)
        .where(Sighting.status == state)
        .order_by(order)
        .limit(limit)
    )
    return [review_view(item, tier) for item, tier in rows]


@router.post("/sightings/{public_id}/decision", response_model=ReviewItemRead)
def decide(
    public_id: uuid.UUID,
    payload: ReviewDecisionIn,
    reviewer: DeveloperAccount = Depends(require_reviewer),
    session: Session = Depends(get_db),
) -> ReviewItemRead:
    """Approve or reject a waiting sighting. A rejection needs a reason the observer will see."""

    row = session.execute(
        select(Sighting, Species.sensitivity)
        .join(Species, Species.id == Sighting.species_id)
        .where(Sighting.public_id == public_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Sighting not found")
    sighting, tier = row
    if sighting.status != "pending":
        raise HTTPException(status_code=409, detail="This sighting has already been decided")
    if payload.decision == "rejected" and not payload.reason:
        raise HTTPException(status_code=422, detail="A rejection needs a reason")
    sighting.status = payload.decision
    session.add(
        ReviewDecision(
            sighting_id=sighting.id,
            reviewer_id=reviewer.id,
            decision=payload.decision,
            reason=payload.reason,
        )
    )
    record_event(
        session,
        reviewer,
        f"sighting.{payload.decision}",
        "sighting",
        sighting.id,
        reason=payload.reason,
    )
    session.commit()
    return review_view(sighting, tier)


@router.post("/reports/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
def resolve_report(
    report_id: int,
    payload: ResolveReport,
    reviewer: DeveloperAccount = Depends(require_reviewer),
    session: Session = Depends(get_db),
) -> None:
    """Close every open report on the same target; hiding a sighting rejects and soft-deletes it."""

    report = session.get(ContentReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    now = datetime.now(UTC)
    for item in session.scalars(
        select(ContentReport).where(
            ContentReport.target_type == report.target_type,
            ContentReport.target_id == report.target_id,
            ContentReport.status == "open",
        )
    ):
        item.status = "actioned" if payload.action == "hide_content" else "dismissed"
        item.resolved_at = now
        item.resolved_by_id = reviewer.id
    if payload.action == "hide_content" and report.target_type == "sighting":
        sighting = session.get(Sighting, report.target_id)
        if sighting is not None:
            sighting.status = "rejected"
            sighting.deleted_at = now
    record_event(
        session,
        reviewer,
        f"report.{payload.action}",
        report.target_type,
        report.target_id,
        note=payload.note,
    )
    session.commit()


@router.get("/audit", response_model=list[AuditRead])
def audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    _: DeveloperAccount = Depends(require_admin),
    session: Session = Depends(get_db),
) -> list[AuditEvent]:
    return list(
        session.scalars(select(AuditEvent).order_by(AuditEvent.occurred_at.desc()).limit(limit))
    )
