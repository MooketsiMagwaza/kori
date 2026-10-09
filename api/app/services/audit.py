"""Append-only audit trail for moderation and administrative decisions."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AuditEvent, DeveloperAccount
from app.request_context import REQUEST_ID

MAX_DETAIL_TEXT = 500


def _bounded(detail: dict) -> dict:
    """Keep audit rows small and free of large or secret-looking payloads."""

    bounded: dict = {}
    for key, value in detail.items():
        if isinstance(value, str):
            bounded[key] = value[:MAX_DETAIL_TEXT]
        elif isinstance(value, (int, float, bool)) or value is None:
            bounded[key] = value
        else:
            bounded[key] = str(value)[:MAX_DETAIL_TEXT]
    return bounded


def record_event(
    session: Session,
    actor: DeveloperAccount | None,
    action: str,
    target_type: str,
    target_id: int | None,
    **detail: object,
) -> AuditEvent:
    """Stage an audit event in the caller's transaction so it commits with the decision."""

    event = AuditEvent(
        actor_id=actor.id if actor else None,
        actor_role=actor.role if actor else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=_bounded(detail),
        request_id=REQUEST_ID.get() or None,
    )
    session.add(event)
    return event
