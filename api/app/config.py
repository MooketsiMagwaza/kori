"""Environment-backed application settings and safe operational defaults."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_TOKEN_HASH_SECRET = "local-development-token-hash-secret-change-me"
LOCAL_SANDBOX_API_KEY = "kori_local_sandbox_key_not_for_production"


class Settings(BaseSettings):
    app_name: str = "Kori API"
    app_version: str = "1.0.0"
    developer_portal_url: str = "http://localhost:3400"
    api_docs_enabled: bool = False
    database_url: str = (
        "postgresql+psycopg://kori:kori@localhost:5432/kori?connect_timeout=3"
    )
    cors_origins: str = "http://localhost:3100,http://localhost:3300,http://localhost:3400"
    # Map matching for shared trips (an OSRM "match" service), used when fusing traces into the
    # track map (KO-10). Not called yet. Outbound calls go only to these hosts.
    map_match_url: str = "https://router.project-osrm.org"
    map_match_allowed_hosts: str = "router.project-osrm.org"
    map_match_timeout_seconds: float = 15
    map_match_max_response_bytes: int = 2_000_000
    developer_session_days: int = 30
    api_key_lifetime_days: int = 90
    api_key_rotation_warning_days: int = 14
    api_usage_retention_days: int = 400
    default_monthly_api_quota: int = 10000
    default_hourly_api_limit: int = 100
    invalid_key_attempts_per_hour: int = 20
    # Proxy hops to trust when reading X-Forwarded-For; 0 uses the socket address.
    trusted_proxy_hops: int = 0
    # Distinct reporters that automatically hide a post until a moderator reviews it.
    auto_hide_report_threshold: int = 3
    token_hash_secret: str = LOCAL_TOKEN_HASH_SECRET
    max_request_body_bytes: int = 1_000_000
    estimated_cost_per_1000_requests_usd: float | None = None
    password_reset_debug: bool = False
    # External identity provider (self-hosted Supabase Auth / GoTrue). Access tokens are verified
    # locally; roles and account ownership always come from Kori's own tables, never from claims.
    auth_issuer: str = ""
    auth_jwt_secret: str = ""
    auth_jwks_url: str = ""
    auth_audience: str = "authenticated"
    # Internal address of the provider admin API (defaults to the issuer) for user deletion.
    auth_admin_url: str = ""
    # Personal data is removed at once; the anonymised row is purged after this many days.
    deleted_account_grace_days: int = 30
    consent_retention_days: int = 1095
    # Shared GPS trips are personal data: held back before use, and deleted after this many days.
    trip_hold_hours: int = 24
    trip_retention_days: int = 90
    # Opaque local sessions (development). Must be off in production.
    local_auth_enabled: bool = True
    # Operators must present an MFA-verified (aal2) token. Defaults to on in production.
    operator_mfa_required: bool | None = None
    # Private S3-compatible object storage (MinIO locally). Empty public endpoint disables uploads.
    object_store_endpoint: str = "http://objects:9000"
    object_store_public_endpoint: str = ""
    object_store_region: str = "us-east-1"
    object_store_bucket: str = "kori-uploads"
    object_store_access_key: str = ""
    object_store_secret_key: str = ""
    uploads_max_bytes: int = 5_242_880
    uploads_daily_intents: int = 20
    # Directory holding the internal handbook Markdown; empty falls back to the repository docs.
    handbook_dir: str = ""
    # Optional fixed secret for the documentation sandbox key (local development only).
    sandbox_api_key: str | None = None
    sandbox_hourly_limit: int = 60
    grafana_webhook_secret: str = "local-grafana-webhook"
    grafana_public_url: str = "http://localhost:3004"
    prometheus_public_url: str = "http://localhost:9090"
    prometheus_internal_url: str = "http://prometheus:9090"
    deployment_environment: str = "development"
    otel_enabled: bool = False
    otel_service_name: str = "kori-api"
    otel_exporter_otlp_endpoint: str = "http://tempo:4317"
    otel_exporter_otlp_insecure: bool = True
    otel_trace_sample_ratio: float = 0.1

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def require_production_token_secret(self) -> "Settings":
        if (
            self.deployment_environment.lower() == "production"
            and self.token_hash_secret == LOCAL_TOKEN_HASH_SECRET
        ):
            raise ValueError("TOKEN_HASH_SECRET must be set to a production secret")
        if (
            self.deployment_environment.lower() == "production"
            and self.sandbox_api_key == LOCAL_SANDBOX_API_KEY
        ):
            raise ValueError("SANDBOX_API_KEY must not use the published local development key")
        if self.auth_jwt_secret and len(self.auth_jwt_secret) < 32:
            raise ValueError("AUTH_JWT_SECRET must be at least 32 characters")
        if self.deployment_environment.lower() == "production":
            if self.local_auth_enabled:
                raise ValueError("LOCAL_AUTH_ENABLED must be false in production")
            if not self.external_auth_enabled:
                raise ValueError(
                    "AUTH_ISSUER and AUTH_JWT_SECRET or AUTH_JWKS_URL are required in production"
                )
        return self

    @property
    def external_auth_enabled(self) -> bool:
        return bool(self.auth_issuer and (self.auth_jwt_secret or self.auth_jwks_url))

    @property
    def mfa_required_for_operators(self) -> bool:
        if self.operator_mfa_required is not None:
            return self.operator_mfa_required
        return self.deployment_environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def map_match_allowed_host_list(self) -> list[str]:
        return [
            host.strip().lower()
            for host in self.map_match_allowed_hosts.split(",")
            if host.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
