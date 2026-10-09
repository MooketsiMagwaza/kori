"""Private S3-compatible object storage: SigV4 presigned URLs and server-side object checks.

Presigning is implemented directly (about forty lines of HMAC) so the API needs no cloud SDK and
works with any S3-compatible store: MinIO locally, Garage or a managed bucket in production.
Browsers upload straight to the store with a short-lived signed URL; the API never proxies bytes.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlsplit

import httpx

from app.config import Settings

ALGORITHM = "AWS4-HMAC-SHA256"
SERVICE = "s3"
MAX_URL_SECONDS = 600


class ObjectStoreDisabled(Exception):
    """Uploads are not configured on this deployment."""


@dataclass(frozen=True)
class SignedRequest:
    url: str
    method: str
    headers: dict[str, str]
    expires_at: datetime


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def _signing_key(secret: str, day: str, region: str) -> bytes:
    return _sign(
        _sign(_sign(_sign(("AWS4" + secret).encode(), day), region), SERVICE), "aws4_request"
    )


def _encode(value: str) -> str:
    return quote(value, safe="-_.~")


def presign(
    settings: Settings,
    method: str,
    object_key: str,
    *,
    expires_seconds: int = MAX_URL_SECONDS,
    signed_headers: dict[str, str] | None = None,
    now: datetime | None = None,
) -> SignedRequest:
    """Return a presigned URL for ``method`` on ``object_key`` (path-style addressing)."""

    if not settings.object_store_public_endpoint or not settings.object_store_access_key:
        raise ObjectStoreDisabled("Uploads are not enabled on this deployment")
    if not 1 <= expires_seconds <= MAX_URL_SECONDS:
        raise ValueError(f"URLs may live for at most {MAX_URL_SECONDS} seconds")
    moment = (now or datetime.now(UTC)).astimezone(UTC)
    amz_date = moment.strftime("%Y%m%dT%H%M%SZ")
    day = amz_date[:8]
    scope = f"{day}/{settings.object_store_region}/{SERVICE}/aws4_request"
    endpoint = urlsplit(settings.object_store_public_endpoint)
    path = "/" + "/".join(
        _encode(part) for part in (settings.object_store_bucket, *object_key.split("/"))
    )
    headers = {
        "host": endpoint.netloc,
        **{k.lower(): v.strip() for k, v in (signed_headers or {}).items()},
    }
    header_names = ";".join(sorted(headers))
    query = {
        "X-Amz-Algorithm": ALGORITHM,
        "X-Amz-Credential": f"{settings.object_store_access_key}/{scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expires_seconds),
        "X-Amz-SignedHeaders": header_names,
    }
    canonical_query = "&".join(f"{_encode(k)}={_encode(v)}" for k, v in sorted(query.items()))
    canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in sorted(headers))
    canonical_request = "\n".join(
        [method, path, canonical_query, canonical_headers, header_names, "UNSIGNED-PAYLOAD"]
    )
    string_to_sign = "\n".join(
        [ALGORITHM, amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()]
    )
    signature = hmac.new(
        _signing_key(settings.object_store_secret_key, day, settings.object_store_region),
        string_to_sign.encode(),
        hashlib.sha256,
    ).hexdigest()
    url = (
        f"{endpoint.scheme}://{endpoint.netloc}{path}?{canonical_query}&X-Amz-Signature={signature}"
    )
    return SignedRequest(
        url=url,
        method=method,
        headers={k: v for k, v in headers.items() if k != "host"},
        expires_at=moment.replace(microsecond=0) + timedelta(seconds=expires_seconds),
    )


def _internal(
    settings: Settings, method: str, object_key: str, extra: dict[str, str] | None = None
):
    """Presign against the internal endpoint for server-to-store calls."""

    internal = settings.model_copy(
        update={"object_store_public_endpoint": settings.object_store_endpoint}
    )
    return presign(internal, method, object_key, expires_seconds=60, signed_headers=extra)


def object_head(settings: Settings, object_key: str) -> tuple[int, str] | None:
    """Return ``(size, content_type)`` for an existing object, else ``None``."""

    signed = _internal(settings, "HEAD", object_key)
    response = httpx.head(signed.url, timeout=5)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return int(response.headers.get("content-length", "0")), response.headers.get(
        "content-type", ""
    )


def object_prefix(settings: Settings, object_key: str, length: int = 16) -> bytes | None:
    """Read the first bytes of an object to sniff its real type."""

    signed = _internal(settings, "GET", object_key)
    response = httpx.get(signed.url, headers={"Range": f"bytes=0-{length - 1}"}, timeout=5)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.content


def object_delete(settings: Settings, object_key: str) -> None:
    signed = _internal(settings, "DELETE", object_key)
    response = httpx.delete(signed.url, timeout=5)
    if response.status_code not in (200, 204, 404):
        response.raise_for_status()


MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


def matches_declared_type(content_type: str, prefix: bytes) -> bool:
    """True when the leading bytes agree with the declared MIME type (magic-number check)."""

    signatures = MAGIC.get(content_type)
    if not signatures or not prefix:
        return False
    if content_type == "image/webp":
        return prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP"
    return any(prefix.startswith(signature) for signature in signatures)
