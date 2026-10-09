"""Quota headers, scope registry, and version headers on the public API boundary."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.api_access import QuotaSnapshot, require_scope


def test_quota_snapshot_reports_bounded_headers() -> None:
    snapshot = QuotaSnapshot(
        hourly_limit=100,
        hourly_remaining=-3,
        hourly_reset_at=datetime(2026, 9, 21, 12, 0, tzinfo=UTC),
        monthly_quota=10_000,
        monthly_remaining=9_999,
    )

    headers = snapshot.headers()

    assert headers["X-RateLimit-Limit"] == "100"
    assert headers["X-RateLimit-Remaining"] == "0", "remaining must never be negative"
    assert headers["X-RateLimit-Reset"] == str(int(snapshot.hourly_reset_at.timestamp()))
    assert headers["X-Quota-Remaining"] == "9999"


def test_unknown_scopes_cannot_be_required() -> None:
    with pytest.raises(ValueError, match="Unknown API scope"):
        require_scope("tracks:write")


def test_missing_key_is_rejected_and_versioned() -> None:
    response = TestClient(app).get("/v1/species")

    assert response.status_code == 401
    assert response.headers["x-api-version"] == "v1"
    assert len(response.headers["x-request-id"]) >= 8
