"""Private uploads: signed URLs, declared-type verification, and input limits."""

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.routers.uploads import UploadIntentCreate
from app.services.object_store import (
    MAX_URL_SECONDS,
    ObjectStoreDisabled,
    matches_declared_type,
    presign,
)

MOMENT = datetime(2026, 9, 21, 10, 0, 0, tzinfo=UTC)


def _settings(**overrides) -> Settings:
    values = {
        "object_store_public_endpoint": "http://localhost:9000",
        "object_store_access_key": "kori-uploads-app",
        "object_store_secret_key": "local-uploads-secret-key",
    }
    return Settings(_env_file=None, **{**values, **overrides})


def test_presigned_urls_are_short_lived_scoped_and_never_contain_the_secret() -> None:
    signed = presign(
        _settings(),
        "PUT",
        "route_evidence/7/abc.jpg",
        now=MOMENT,
        signed_headers={"Content-Type": "image/jpeg"},
    )
    parts = urlsplit(signed.url)
    query = parse_qs(parts.query)

    assert parts.path == "/kori-uploads/route_evidence/7/abc.jpg"
    assert query["X-Amz-Expires"] == [str(MAX_URL_SECONDS)]
    assert query["X-Amz-SignedHeaders"] == ["content-type;host"]
    assert query["X-Amz-Credential"][0].startswith("kori-uploads-app/20260921/us-east-1/s3/")
    assert len(query["X-Amz-Signature"][0]) == 64
    assert "local-uploads-secret-key" not in signed.url
    assert signed.headers == {"content-type": "image/jpeg"}
    assert signed.expires_at == datetime(2026, 9, 21, 10, 10, 0, tzinfo=UTC)


def test_signatures_change_with_method_key_and_time() -> None:
    base = presign(_settings(), "PUT", "a/b.png", now=MOMENT).url
    assert presign(_settings(), "GET", "a/b.png", now=MOMENT).url != base
    assert presign(_settings(), "PUT", "a/c.png", now=MOMENT).url != base
    later = datetime(2026, 9, 21, 10, 0, 1, tzinfo=UTC)
    assert presign(_settings(), "PUT", "a/b.png", now=later).url != base
    assert presign(_settings(), "PUT", "a/b.png", now=MOMENT).url == base


def test_urls_cannot_outlive_the_cap_and_uploads_can_be_disabled() -> None:
    with pytest.raises(ValueError):
        presign(_settings(), "GET", "a.png", expires_seconds=MAX_URL_SECONDS + 1)
    with pytest.raises(ObjectStoreDisabled):
        presign(Settings(_env_file=None), "PUT", "a.png")


@pytest.mark.parametrize(
    ("content_type", "prefix", "expected"),
    [
        ("image/jpeg", b"\xff\xd8\xff\xe0" + b"\x00" * 12, True),
        ("image/png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 8, True),
        ("image/webp", b"RIFF\x00\x00\x00\x00WEBP\x00\x00\x00\x00", True),
        ("image/png", b"<svg xmlns='http://www.w3.org/2000/svg'>", False),
        ("image/jpeg", b"GIF89a" + b"\x00" * 10, False),
        ("image/webp", b"RIFF\x00\x00\x00\x00WAVE\x00\x00\x00\x00", False),
        ("text/html", b"<html>", False),
        ("image/png", b"", False),
    ],
)
def test_the_real_bytes_must_match_the_declared_type(content_type, prefix, expected) -> None:
    assert matches_declared_type(content_type, prefix) is expected


def test_intent_requests_are_validated_before_anything_is_signed() -> None:
    good = {
        "purpose": "route_evidence",
        "contentType": "image/png",
        "sizeBytes": 1000,
        "sha256": "a" * 64,
    }
    assert UploadIntentCreate.model_validate(good).content_type == "image/png"
    for field, value in (
        ("purpose", "avatar-of-anyone"),
        ("contentType", "image/svg+xml"),
        ("contentType", "application/pdf"),
        ("sizeBytes", 0),
        ("sha256", "not-hex"),
        ("sha256", "a" * 63),
    ):
        with pytest.raises(ValidationError):
            UploadIntentCreate.model_validate({**good, field: value})
