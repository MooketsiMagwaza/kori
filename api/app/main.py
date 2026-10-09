"""FastAPI composition root, middleware, and router registration."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from prometheus_client import make_asgi_app

from app.config import get_settings
from app.metrics import metrics_middleware
from app.request_context import request_boundary_middleware
from app.routers import (
    admin,
    developer,
    handbook,
    health,
    moderation,
    privacy,
    public_v1,
    sightings,
    trips,
    uploads,
)
from app.telemetry import configure_telemetry

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Reviewed wildlife sightings, offline park packs and the track map for Kori.",
    docs_url="/api/docs" if settings.api_docs_enabled else None,
    redoc_url="/api/redoc" if settings.api_docs_enabled else None,
    openapi_url="/api/openapi" if settings.api_docs_enabled else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(admin.router)
app.include_router(handbook.router)
app.include_router(moderation.router)
app.include_router(sightings.router)
app.include_router(trips.router)
app.include_router(developer.router)
app.include_router(public_v1.router)
app.include_router(uploads.router)
app.include_router(privacy.consent_router)
app.include_router(privacy.account_router)
app.middleware("http")(metrics_middleware)
app.middleware("http")(request_boundary_middleware)
app.mount("/metrics", make_asgi_app())
configure_telemetry(app, settings)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Apply conservative browser defenses to JSON and generated documentation responses."""

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=()"
    return response


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url=settings.developer_portal_url)
