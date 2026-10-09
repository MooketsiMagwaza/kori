import asyncio

from app.main import app
from app.routers import admin as admin_router


def test_openapi_contains_the_platform_and_kori_surface() -> None:
    paths = app.openapi()["paths"]

    # Platform, carried over from the base code.
    assert "get" in paths["/api/health"]
    assert "get" in paths["/api/admin/overview"]
    assert "get" in paths["/api/admin/system"]
    assert "get" in paths["/api/admin/accounts"]
    assert "post" in paths["/api/admin/observability/grafana-webhook"]
    assert "post" in paths["/api/developer/register"]
    assert "post" in paths["/api/developer/login"]
    assert "post" in paths["/api/developer/keys"]
    assert "post" in paths["/api/developer/keys/{key_id}/rotate"]
    assert "get" in paths["/api/developer/usage"]
    # Kori.
    assert "post" in paths["/api/sightings"]
    assert "get" in paths["/api/sightings/mine"]
    assert "get" in paths["/api/review/queue"]
    assert "post" in paths["/api/review/sightings/{public_id}/decision"]
    assert "get" in paths["/api/review/audit"]
    assert "post" in paths["/api/trips"]
    assert "delete" in paths["/api/trips/{public_id}"]
    assert "get" in paths["/api/packs"]
    for path in ("/v1/sightings", "/v1/sightings/{public_id}", "/v1/species", "/v1/tracks"):
        assert "get" in paths[path]


def test_no_transit_surface_remains() -> None:
    paths = app.openapi()["paths"]
    assert not [
        path for path in paths if "route" in path or "pathfind" in path or "community" in path
    ]


def test_public_api_explorer_is_disabled_by_default() -> None:
    mounted_paths = {route.path for route in app.routes if hasattr(route, "path")}

    assert "/api/docs" not in mounted_paths
    assert "/api/redoc" not in mounted_paths
    assert "/api/openapi" not in mounted_paths


def test_admin_system_metrics_serialize_for_the_web_client(monkeypatch) -> None:
    async def fake_prometheus_value(*_args, **_kwargs) -> float:
        return 1.0

    monkeypatch.setattr(admin_router, "_prometheus_value", fake_prometheus_value)
    metrics = asyncio.run(admin_router.admin_system_metrics())
    payload = metrics.model_dump(by_alias=True, mode="json")

    assert payload["apiUp"] is True
    assert payload["databaseUp"] is True
    assert payload["databaseMemoryBytes"] == 1.0
    assert payload["prometheusReachable"] is True
