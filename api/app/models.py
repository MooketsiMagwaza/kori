"""SQLAlchemy models: the platform (accounts, keys, usage, uploads, audit) and Kori's domain."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    event,
    func,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship, with_loader_criteria

from app.database import Base


def _public_id() -> Mapped[uuid.UUID]:
    """Opaque, stable identifier safe to expose; internal integer keys stay internal."""

    return mapped_column("publicId", Uuid, nullable=False, unique=True, default=uuid.uuid4)


def _updated_at() -> Mapped[datetime]:
    return mapped_column(
        "updatedAt",
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def _deleted_at() -> Mapped[datetime | None]:
    return mapped_column("deletedAt", DateTime(timezone=True))


class DeveloperAccount(Base):
    __tablename__ = "DeveloperAccount"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column("displayName", String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column("passwordHash", String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="developer", index=True)
    # Immutable subject (JWT ``sub``) from the identity provider; email is profile data only.
    external_subject: Mapped[str | None] = mapped_column(
        "externalSubject", String(64), unique=True, index=True
    )
    auth_provider: Mapped[str] = mapped_column(
        "authProvider", String(24), nullable=False, default="local", server_default="local"
    )
    disabled_at: Mapped[datetime | None] = mapped_column("disabledAt", DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    public_id: Mapped[uuid.UUID] = _public_id()
    updated_at: Mapped[datetime] = _updated_at()
    deleted_at: Mapped[datetime | None] = _deleted_at()

    sessions: Mapped[list["DeveloperSession"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class DeveloperSession(Base):
    __tablename__ = "DeveloperSession"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        "accountId", ForeignKey("DeveloperAccount.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column("tokenHash", String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt", DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    account: Mapped[DeveloperAccount] = relationship(back_populates="sessions")


class RevokedAuthSession(Base):
    """Identity-provider sessions ended before their access token expires."""

    __tablename__ = "RevokedAuthSession"

    session_id: Mapped[str] = mapped_column("sessionId", String(64), primary_key=True)
    revoked_at: Mapped[datetime] = mapped_column(
        "revokedAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt", DateTime(timezone=True), nullable=False, index=True
    )


class ApiKey(Base):
    __tablename__ = "ApiKey"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        "accountId", ForeignKey("DeveloperAccount.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    prefix: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    secret_hash: Mapped[str] = mapped_column("secretHash", String(64), nullable=False, unique=True)
    monthly_quota: Mapped[int] = mapped_column(
        "monthlyQuota", Integer, nullable=False, default=10000
    )
    hourly_limit: Mapped[int] = mapped_column("hourlyLimit", Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column("revokedAt", DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt", DateTime(timezone=True), nullable=False
    )
    last_used_at: Mapped[datetime | None] = mapped_column("lastUsedAt", DateTime(timezone=True))
    rotated_from_id: Mapped[int | None] = mapped_column(
        "rotatedFromId", ForeignKey("ApiKey.id", ondelete="SET NULL"), index=True
    )
    scopes: Mapped[str] = mapped_column(
        String(200), nullable=False, default="sightings:read", server_default="sightings:read"
    )
    # Keys belong to a workspace (a research group or a lodge) when one is set; the account that
    # created the key stays responsible for it.
    workspace_id: Mapped[int | None] = mapped_column(
        "workspaceId", ForeignKey("Workspace.id", ondelete="CASCADE"), index=True
    )
    updated_at: Mapped[datetime] = _updated_at()

    account: Mapped[DeveloperAccount] = relationship(back_populates="api_keys")

    @property
    def scope_list(self) -> list[str]:
        """Space-separated scopes such as ``sightings:read``; empty means no access."""

        return self.scopes.split()

    usage_events: Mapped[list["ApiUsage"]] = relationship(
        back_populates="api_key", cascade="all, delete-orphan"
    )


class ApiUsage(Base):
    __tablename__ = "ApiUsage"
    __table_args__ = (
        Index("ix_api_usage_key_time", "apiKeyId", "occurredAt"),
        Index("ix_api_usage_occurred_at", "occurredAt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_key_id: Mapped[int] = mapped_column(
        "apiKeyId", ForeignKey("ApiKey.id", ondelete="CASCADE"), nullable=False
    )
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(300), nullable=False)
    # 0 marks a request that was admitted but has not been finalised (for example a crash).
    status_code: Mapped[int] = mapped_column("statusCode", Integer, nullable=False, default=0)
    latency_ms: Mapped[int | None] = mapped_column("latencyMs", Integer)
    request_id: Mapped[str | None] = mapped_column("requestId", String(64))
    occurred_at: Mapped[datetime] = mapped_column(
        "occurredAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    api_key: Mapped[ApiKey] = relationship(back_populates="usage_events")


class PasswordResetToken(Base):
    """One-use, hashed recovery token; the raw token is never persisted."""

    __tablename__ = "PasswordResetToken"
    __table_args__ = (Index("ix_password_reset_account_time", "accountId", "expiresAt"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        "accountId", ForeignKey("DeveloperAccount.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column("tokenHash", String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt", DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column("usedAt", DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class GrafanaNotification(Base):
    """Durable alert notification delivered by the provisioned Grafana webhook."""

    __tablename__ = "GrafanaNotification"
    __table_args__ = (Index("ix_grafana_notification_state_time", "state", "createdAt"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fingerprint: Mapped[str | None] = mapped_column(String(160), index=True)
    state: Mapped[str] = mapped_column(String(30), nullable=False, default="firing")
    severity: Mapped[str] = mapped_column(String(30), nullable=False, default="warning")
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    dashboard_url: Mapped[str | None] = mapped_column("dashboardUrl", String(500))
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MaintenanceRun(Base):
    """Idempotency and audit record for scheduled platform maintenance."""

    __tablename__ = "MaintenanceRun"
    __table_args__ = (Index("ix_maintenance_job_time", "jobName", "startedAt"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_name: Mapped[str] = mapped_column("jobName", String(80), nullable=False)
    run_id: Mapped[str] = mapped_column("runId", String(120), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="running")
    rows_affected: Mapped[int] = mapped_column("rowsAffected", Integer, nullable=False, default=0)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(
        "startedAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column("finishedAt", DateTime(timezone=True))


class UploadIntent(Base):
    """A signed, expiring permission to upload one private object, and its verification outcome."""

    __tablename__ = "UploadIntent"
    __table_args__ = (
        Index("ix_upload_intent_account_time", "accountId", "createdAt"),
        Index("ix_upload_intent_status_expiry", "status", "expiresAt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        "accountId", ForeignKey("DeveloperAccount.id", ondelete="CASCADE"), nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    object_key: Mapped[str] = mapped_column("objectKey", String(200), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column("contentType", String(60), nullable=False)
    size_bytes: Mapped[int] = mapped_column("sizeBytes", Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    # pending -> verified | rejected -> deleted
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt", DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column("verifiedAt", DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column("deletedAt", DateTime(timezone=True))


class ContentReport(Base):
    """A report about published content (for example a sighting), resolved by a moderator."""

    __tablename__ = "ContentReport"
    __table_args__ = (
        Index("ix_content_report_status_time", "status", "createdAt"),
        Index("ix_content_report_target", "targetType", "targetId"),
        Index("uq_content_report_once", "reporterId", "targetType", "targetId", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_id: Mapped[int] = mapped_column("reporterId", Integer, nullable=False)
    target_type: Mapped[str] = mapped_column("targetType", String(20), nullable=False)
    target_id: Mapped[int] = mapped_column("targetId", Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # open -> actioned | dismissed
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column("resolvedAt", DateTime(timezone=True))
    resolved_by_id: Mapped[int | None] = mapped_column("resolvedById", Integer)


class AuditEvent(Base):
    """Append-only record of moderation and administrative decisions.

    The actor is stored as a plain integer, not a foreign key, so deleting an account never
    updates this table. A database trigger rejects every UPDATE and DELETE.
    """

    __tablename__ = "AuditEvent"
    __table_args__ = (
        Index("ix_audit_event_time", "occurredAt"),
        Index("ix_audit_event_target", "targetType", "targetId"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(
        "occurredAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor_id: Mapped[int | None] = mapped_column("actorId", Integer)
    actor_role: Mapped[str | None] = mapped_column("actorRole", String(24))
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target_type: Mapped[str] = mapped_column("targetType", String(30), nullable=False)
    target_id: Mapped[int | None] = mapped_column("targetId", Integer)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    request_id: Mapped[str | None] = mapped_column("requestId", String(64))


class AuthAttempt(Base):
    """One counted sign-in, registration, or recovery attempt for shared rate limiting."""

    __tablename__ = "AuthAttempt"
    __table_args__ = (Index("ix_auth_attempt_lookup", "scope", "identityHash", "occurredAt"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope: Mapped[str] = mapped_column(String(24), nullable=False)
    identity_hash: Mapped[str] = mapped_column("identityHash", String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        "occurredAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class IdempotencyRecord(Base):
    """Remembers the result of a request so a replay returns it instead of repeating the action."""

    __tablename__ = "IdempotencyRecord"
    __table_args__ = (
        Index("uq_idempotency_key", "accountId", "scope", "key", unique=True),
        Index("ix_idempotency_created", "createdAt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column("accountId", Integer, nullable=False)
    scope: Mapped[str] = mapped_column(String(40), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    result_id: Mapped[int] = mapped_column("resultId", Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ConsentRecord(Base):
    """A visitor's privacy choice. Holds no address, agent string, or account link."""

    __tablename__ = "ConsentRecord"
    __table_args__ = (Index("ix_consent_record_created", "createdAt"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_id: Mapped[str] = mapped_column("visitorId", String(64), nullable=False, index=True)
    choice: Mapped[str] = mapped_column(String(12), nullable=False)
    policy_version: Mapped[str] = mapped_column("policyVersion", String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="marketing")
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# --- Kori's domain --------------------------------------------------------------------------
#
# Positions are stored as plain longitude and latitude columns, so the models also run on SQLite in
# tests. The migration (0013) adds PostGIS geometry as generated, GIST-indexed columns computed from
# them, so spatial queries in PostgreSQL never need the application to keep two copies in step.


class Workspace(Base):
    """An organisation that holds API keys together: a research group, a lodge, a club."""

    __tablename__ = "Workspace"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[uuid.UUID] = _public_id()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = _updated_at()


class WorkspaceMember(Base):
    __tablename__ = "WorkspaceMember"
    __table_args__ = (UniqueConstraint("workspaceId", "accountId", name="uq_workspace_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        "workspaceId", ForeignKey("Workspace.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        "accountId", ForeignKey("DeveloperAccount.id", ondelete="CASCADE"), nullable=False
    )
    # owner | member
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member")


class Species(Base):
    """A species Kori knows. ``sensitivity`` decides how its sightings are published."""

    __tablename__ = "Species"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    common_name: Mapped[str] = mapped_column("commonName", String(80), nullable=False)
    setswana_name: Mapped[str | None] = mapped_column("setswanaName", String(80))
    scientific_name: Mapped[str] = mapped_column("scientificName", String(120), nullable=False)
    group: Mapped[str] = mapped_column("speciesGroup", String(12), nullable=False)
    # standard | sensitive
    sensitivity: Mapped[str] = mapped_column(String(12), nullable=False, default="standard")


class Sighting(Base):
    """A wildlife sighting. The exact point is private; the cell is what may be published.

    ``visible_from`` is the earliest time anyone else may see it (seen_at plus the species' delay),
    fixed at submission so a later change of rules never exposes old sightings early.
    """

    __tablename__ = "Sighting"
    __table_args__ = (
        Index("ix_sighting_status_visible", "status", "visibleFrom"),
        Index("ix_sighting_cell", "cellId"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[uuid.UUID] = _public_id()
    species_id: Mapped[str] = mapped_column(
        "speciesId", ForeignKey("Species.id", ondelete="RESTRICT"), nullable=False
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    seen_at: Mapped[datetime] = mapped_column("seenAt", DateTime(timezone=True), nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column("accuracyM", Float)
    cell_id: Mapped[str] = mapped_column("cellId", String(48), nullable=False)
    cell_size_m: Mapped[int] = mapped_column("cellSizeM", Integer, nullable=False)
    cell_lon: Mapped[float] = mapped_column("cellLon", Float, nullable=False)
    cell_lat: Mapped[float] = mapped_column("cellLat", Float, nullable=False)
    den_or_nest: Mapped[bool] = mapped_column("denOrNest", Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(String(600))
    # pending -> approved | rejected
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    visible_from: Mapped[datetime] = mapped_column(
        "visibleFrom", DateTime(timezone=True), nullable=False
    )
    observer_id: Mapped[int | None] = mapped_column(
        "observerId", ForeignKey("DeveloperAccount.id", ondelete="SET NULL"), index=True
    )
    area_id: Mapped[str | None] = mapped_column("areaId", String(60), index=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = _updated_at()
    deleted_at: Mapped[datetime | None] = _deleted_at()


class SightingPhoto(Base):
    """A sighting photo, held as a private upload. Its metadata was stripped on the phone."""

    __tablename__ = "SightingPhoto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sighting_id: Mapped[int] = mapped_column(
        "sightingId", ForeignKey("Sighting.id", ondelete="CASCADE"), nullable=False, index=True
    )
    upload_id: Mapped[int] = mapped_column(
        "uploadId", ForeignKey("UploadIntent.id", ondelete="CASCADE"), nullable=False
    )
    licence: Mapped[str] = mapped_column(String(40), nullable=False, default="all-rights-reserved")


class ReviewDecision(Base):
    """One reviewer decision. Append-only, like the audit log; the latest one wins."""

    __tablename__ = "ReviewDecision"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sighting_id: Mapped[int] = mapped_column(
        "sightingId", ForeignKey("Sighting.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_id: Mapped[int | None] = mapped_column(
        "reviewerId", ForeignKey("DeveloperAccount.id", ondelete="SET NULL")
    )
    # approved | rejected
    decision: Mapped[str] = mapped_column(String(12), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Trip(Base):
    """A GPS trip a person chose to share, already trimmed. Raw traces never reach the server.

    ``trace`` is a GeoJSON LineString of [lon, lat] pairs after trimming (first and last kilometre
    removed, times rounded to the minute). It is personal data: deleted at ``expires_at`` by the
    maintenance job, or at once when the person deletes the trip.
    """

    __tablename__ = "Trip"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[uuid.UUID] = _public_id()
    account_id: Mapped[int] = mapped_column(
        "accountId",
        ForeignKey("DeveloperAccount.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    area_id: Mapped[str | None] = mapped_column("areaId", String(60))
    started_at: Mapped[datetime] = mapped_column(
        "startedAt", DateTime(timezone=True), nullable=False
    )
    ended_at: Mapped[datetime] = mapped_column("endedAt", DateTime(timezone=True), nullable=False)
    consent_at: Mapped[datetime] = mapped_column(
        "consentAt", DateTime(timezone=True), nullable=False
    )
    trace: Mapped[dict] = mapped_column(JSON, nullable=False)
    point_count: Mapped[int] = mapped_column("pointCount", Integer, nullable=False)
    length_m: Mapped[float] = mapped_column("lengthM", Float, nullable=False)
    # Held back before use, so a trace cannot reveal where someone is right now.
    usable_from: Mapped[datetime] = mapped_column(
        "usableFrom", DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        "expiresAt", DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TrackEdge(Base):
    """One segment of the track map for an area, with where it came from and how sure we are."""

    __tablename__ = "TrackEdge"
    __table_args__ = (Index("ix_track_edge_area_status", "areaId", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[uuid.UUID] = _public_id()
    area_id: Mapped[str] = mapped_column("areaId", String(60), nullable=False)
    # GeoJSON LineString of [lon, lat] pairs
    line: Mapped[dict] = mapped_column(JSON, nullable=False)
    # verified | gps | predicted | closed
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    # high | medium | low, for predicted edges only
    confidence: Mapped[str | None] = mapped_column(String(8))
    trips: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="review")
    imagery_month: Mapped[str | None] = mapped_column("imageryMonth", String(7))
    length_m: Mapped[float] = mapped_column("lengthM", Float, nullable=False)
    last_confirmed_at: Mapped[datetime | None] = mapped_column(
        "lastConfirmedAt", DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = _updated_at()


class ParkPack(Base):
    """A downloadable offline pack for one park: vector tracks, imagery, sightings snapshot."""

    __tablename__ = "ParkPack"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    # pmtiles | mbtiles | geojson
    kind: Mapped[str] = mapped_column(String(12), nullable=False)
    bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    # Real parks stay unpublished until the park authority has been asked.
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# Records that people delete (or that carry user content) are hidden, not destroyed, so a
# mistaken or malicious deletion is recoverable. Queries opt in with include_deleted=True.
SOFT_DELETE_MODELS = (DeveloperAccount, Sighting)


@event.listens_for(Session, "do_orm_execute")
def _hide_soft_deleted(state) -> None:
    if not state.is_select or state.execution_options.get("include_deleted", False):
        return
    for model in SOFT_DELETE_MODELS:
        state.statement = state.statement.options(
            with_loader_criteria(model, lambda cls: cls.deleted_at.is_(None), include_aliases=True)
        )
