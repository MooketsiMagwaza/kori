"""Request correlation, strict JSON input, size limits, and structured access logging."""

from __future__ import annotations

import json
import logging
import re
import secrets
import time
from contextvars import ContextVar

from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.metrics import SECURITY_REJECTIONS
from app.services.api_access import API_VERSION, finalize_usage

REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,128}$")
LOGGER = logging.getLogger("kori.access")
BODY_METHODS = {"POST", "PUT", "PATCH"}


def _is_json(content_type: str) -> bool:
    media_type = content_type.split(";", 1)[0].strip().lower()
    return media_type == "application/json" or media_type.endswith("+json")


async def request_boundary_middleware(request: Request, call_next):
    settings = get_settings()
    supplied = request.headers.get("x-request-id", "")
    request_id = supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else secrets.token_hex(16)
    token = REQUEST_ID.set(request_id)
    started = time.perf_counter()
    status_code = 500
    try:
        if request.method in BODY_METHODS:
            declared = request.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > settings.max_request_body_bytes:
                SECURITY_REJECTIONS.labels("body_too_large").inc()
                status_code = 413
                return JSONResponse(
                    {"detail": "Request body is too large"},
                    status_code=413,
                    headers={"X-Request-ID": request_id},
                )
            body = await request.body()
            if len(body) > settings.max_request_body_bytes:
                SECURITY_REJECTIONS.labels("body_too_large").inc()
                status_code = 413
                return JSONResponse(
                    {"detail": "Request body is too large"},
                    status_code=413,
                    headers={"X-Request-ID": request_id},
                )
            if body and not _is_json(request.headers.get("content-type", "")):
                SECURITY_REJECTIONS.labels("unsupported_media_type").inc()
                status_code = 415
                return JSONResponse(
                    {"detail": "Only application/json request bodies are accepted"},
                    status_code=415,
                    headers={"X-Request-ID": request_id},
                )
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        quota = getattr(request.state, "quota", None)
        if quota is not None:
            response.headers.update(quota.headers())
        if request.url.path.startswith(f"/{API_VERSION}/"):
            response.headers["X-API-Version"] = API_VERSION
        return response
    finally:
        route = request.scope.get("route")
        usage_id = getattr(request.state, "api_usage_id", None)
        if usage_id is not None:
            finalize_usage(
                usage_id,
                status_code,
                round((time.perf_counter() - started) * 1000),
                request_id,
            )
        LOGGER.info(
            json.dumps(
                {
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "route": getattr(route, "path", None) or "unmatched",
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
                separators=(",", ":"),
            )
        )
        REQUEST_ID.reset(token)
