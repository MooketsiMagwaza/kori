"""Validated API contracts; every field people write is bounded plain text."""

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


def normalize_plain_text(value: str) -> str:
    """Trim text and remove control bytes without attempting unsafe HTML rendering."""

    return "".join(
        character for character in value.strip() if character >= " " or character in "\n\t"
    )


class AdminAccountRead(ApiModel):
    id: int
    email: str
    display_name: str = Field(serialization_alias="displayName")
    created_at: datetime = Field(serialization_alias="createdAt")
    api_key_count: int = Field(serialization_alias="apiKeyCount")
    active_api_key_count: int = Field(serialization_alias="activeApiKeyCount")
    request_count: int = Field(serialization_alias="requestCount")
    last_request_at: datetime | None = Field(serialization_alias="lastRequestAt")


class AdminUsagePathRead(ApiModel):
    path: str
    requests: int


class GrafanaNotificationRead(ApiModel):
    id: int
    state: str
    severity: str
    title: str
    message: str | None
    dashboard_url: str | None = Field(serialization_alias="dashboardUrl")
    created_at: datetime = Field(serialization_alias="createdAt")


class AdminOverviewResponse(ApiModel):
    accounts: int
    active_api_keys: int = Field(serialization_alias="activeApiKeys")
    requests_24h: int = Field(serialization_alias="requests24h")
    firing_alerts: int = Field(serialization_alias="firingAlerts")
    usage_paths: list[AdminUsagePathRead] = Field(serialization_alias="usagePaths")
    grafana_url: str = Field(serialization_alias="grafanaUrl")
    prometheus_url: str = Field(serialization_alias="prometheusUrl")


class AdminSystemMetrics(ApiModel):
    api_up: bool | None = Field(serialization_alias="apiUp")
    api_memory_bytes: float | None = Field(serialization_alias="apiMemoryBytes")
    api_cpu_cores: float | None = Field(serialization_alias="apiCpuCores")
    api_open_fds: float | None = Field(serialization_alias="apiOpenFds")
    request_p95_seconds: float | None = Field(serialization_alias="requestP95Seconds")
    error_rate_percent: float | None = Field(serialization_alias="errorRatePercent")
    database_up: bool | None = Field(serialization_alias="databaseUp")
    database_memory_bytes: float | None = Field(serialization_alias="databaseMemoryBytes")
    database_size_bytes: float | None = Field(serialization_alias="databaseSizeBytes")
    database_connections: float | None = Field(serialization_alias="databaseConnections")
    database_cache_hit_percent: float | None = Field(serialization_alias="databaseCacheHitPercent")
    prometheus_reachable: bool = Field(serialization_alias="prometheusReachable")
    collected_at: datetime = Field(serialization_alias="collectedAt")


class DeveloperRegisterRequest(ApiModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(
        validation_alias="displayName",
        serialization_alias="displayName",
        min_length=2,
        max_length=120,
    )

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Enter a valid email address")
        return value


class DeveloperLoginRequest(ApiModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class DeveloperAccountRead(ApiModel):
    id: int
    email: str
    display_name: str = Field(serialization_alias="displayName")
    created_at: datetime = Field(serialization_alias="createdAt")


class DeveloperAuthResponse(ApiModel):
    token: str
    account: DeveloperAccountRead


class ApiKeyCreate(ApiModel):
    name: str = Field(min_length=2, max_length=100)


class ApiKeyRead(ApiModel):
    id: int
    name: str
    prefix: str
    monthly_quota: int = Field(serialization_alias="monthlyQuota")
    hourly_limit: int = Field(serialization_alias="hourlyLimit")
    created_at: datetime = Field(serialization_alias="createdAt")
    revoked_at: datetime | None = Field(serialization_alias="revokedAt")
    expires_at: datetime = Field(serialization_alias="expiresAt")
    last_used_at: datetime | None = Field(serialization_alias="lastUsedAt")
    rotated_from_id: int | None = Field(serialization_alias="rotatedFromId")
    scopes: str = "sightings:read"


class ApiKeyCreated(ApiKeyRead):
    key: str


class UsageSummary(ApiModel):
    used: int
    quota: int
    remaining: int
    period_start: datetime = Field(serialization_alias="periodStart")
    recent_paths: dict[str, int] = Field(serialization_alias="recentPaths")
    estimated_cost_usd: float | None = Field(serialization_alias="estimatedCostUsd")


class PasswordRecoveryRequest(ApiModel):
    email: str = Field(min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        return value.strip().lower()


class PasswordRecoveryResponse(ApiModel):
    message: str
    debug_token: str | None = Field(default=None, serialization_alias="debugToken")


class PasswordResetRequest(ApiModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=200)


# --- Kori's domain --------------------------------------------------------------------------


class PointIn(ApiModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    accuracy_m: float | None = Field(
        default=None, ge=0, le=5000, validation_alias="accuracyM", serialization_alias="accuracyM"
    )


class AreaRead(ApiModel):
    cell: str
    centre: dict[str, float]
    size_m: int = Field(serialization_alias="sizeM")


class SightingCreate(ApiModel):
    species_id: str = Field(min_length=2, max_length=40, validation_alias="speciesId")
    count: int = Field(ge=1, le=500)
    seen_at: datetime = Field(validation_alias="seenAt")
    point: PointIn
    den_or_nest: bool = Field(default=False, validation_alias="denOrNest")
    notes: str | None = Field(default=None, max_length=600)
    area_id: str | None = Field(default=None, max_length=60, validation_alias="areaId")

    @field_validator("seen_at")
    @classmethod
    def must_be_aware_and_past(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("seenAt must include a time zone")
        if value > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("seenAt cannot be in the future")
        return value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return normalize_plain_text(value) or None if value is not None else None


class OwnSightingRead(ApiModel):
    """What the observer sees of their own sighting, including the exact point."""

    id: str
    species_id: str = Field(serialization_alias="speciesId")
    count: int
    seen_at: datetime = Field(serialization_alias="seenAt")
    point: dict[str, float | None]
    area: AreaRead
    status: str
    visible_from: datetime = Field(serialization_alias="visibleFrom")


class PublicSightingRead(ApiModel):
    """What anyone else may see: an area, a quarter-hour time, no point, no observer."""

    id: str
    species: str
    count: int
    seen_at: datetime
    area: AreaRead
    sensitive: bool


class SpeciesRead(ApiModel):
    id: str
    common_name: str
    setswana_name: str | None
    scientific_name: str
    tier: str
    area_m: int
    delay_minutes: int


class ReviewItemRead(ApiModel):
    id: str
    species_id: str = Field(serialization_alias="speciesId")
    count: int
    seen_at: datetime = Field(serialization_alias="seenAt")
    point: dict[str, float | None]
    area: AreaRead
    den_or_nest: bool = Field(serialization_alias="denOrNest")
    sensitivity: str
    notes: str | None
    status: str
    visible_from: datetime = Field(serialization_alias="visibleFrom")


class ReviewDecisionIn(ApiModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    reason: str | None = Field(default=None, min_length=3, max_length=300)


class TripPointIn(ApiModel):
    t: datetime
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class TripCreate(ApiModel):
    started_at: datetime = Field(validation_alias="startedAt")
    ended_at: datetime = Field(validation_alias="endedAt")
    consent_at: datetime = Field(validation_alias="consentAt")
    area_id: str | None = Field(default=None, max_length=60, validation_alias="areaId")
    points: list[TripPointIn] = Field(min_length=2, max_length=20_000)


class TripRead(ApiModel):
    id: str
    started_at: datetime = Field(serialization_alias="startedAt")
    ended_at: datetime = Field(serialization_alias="endedAt")
    point_count: int = Field(serialization_alias="pointCount")
    length_m: float = Field(serialization_alias="lengthM")
    usable_from: datetime = Field(serialization_alias="usableFrom")
    expires_at: datetime = Field(serialization_alias="expiresAt")


class PackRead(ApiModel):
    id: str
    name: str
    version: str
    kind: str
    bytes: int
    sha256: str
    url: str
