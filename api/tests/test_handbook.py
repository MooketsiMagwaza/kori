"""The internal handbook must be reachable only by administrators, checked server-side."""

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import handbook
from app.main import app
from app.routers.developer import get_current_account

DOCS_DIR = Path(__file__).resolve().parents[2] / "docs"
UNLISTED_ALLOWED = {"README.md"}


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _sign_in_as(role: str) -> None:
    app.dependency_overrides[get_current_account] = lambda: SimpleNamespace(
        id=1, role=role, email=f"{role}@example.test"
    )


def test_anonymous_requests_cannot_read_the_handbook(client: TestClient) -> None:
    assert client.get("/api/admin/handbook").status_code == 401
    assert client.get("/api/admin/handbook/work-orders").status_code == 401


@pytest.mark.parametrize("role", ["developer", "sandbox", "observer", ""])
def test_non_administrators_are_rejected_by_the_api(client: TestClient, role: str) -> None:
    _sign_in_as(role)

    assert client.get("/api/admin/handbook").status_code == 403
    assert client.get("/api/admin/handbook/work-orders").status_code == 403


def test_administrators_can_list_and_read_pages(client: TestClient) -> None:
    _sign_in_as("admin")

    index = client.get("/api/admin/handbook")
    assert index.status_code == 200
    slugs = {page["slug"] for page in index.json()}
    assert {"work-orders", "safety-and-privacy", "operations"} <= slugs
    assert all("file" not in page for page in index.json()), "server paths must not leak"

    page = client.get("/api/admin/handbook/work-orders")
    assert page.status_code == 200
    body = page.json()
    assert body["title"] == "Work orders"
    assert body["markdown"].startswith("#")
    assert "updatedAt" in body


def test_unknown_and_traversal_slugs_are_not_found(client: TestClient) -> None:
    _sign_in_as("admin")

    assert client.get("/api/admin/handbook/not-a-page").status_code == 404
    assert client.get("/api/admin/handbook/..%2F..%2FREADME").status_code == 404
    assert handbook.read_page("../README") is None
    assert handbook.read_page("../../api/app/config") is None


def test_manifest_matches_the_docs_directory() -> None:
    slugs = [page.slug for page in handbook.PAGES]
    assert len(slugs) == len(set(slugs))
    missing = [page.file for page in handbook.PAGES if not (DOCS_DIR / page.file).is_file()]
    assert missing == [], "handbook manifest names files that do not exist"
    listed = {page.file for page in handbook.PAGES}
    unclassified = {p.name for p in DOCS_DIR.glob("*.md")} - listed - UNLISTED_ALLOWED
    assert unclassified == set(), (
        f"docs not assigned to the handbook or public guide: {unclassified}"
    )


def test_public_documentation_never_mentions_the_handbook() -> None:
    """The public developer portal must not link to or index internal material."""

    site = DOCS_DIR.parent / "apps" / "api-docs"
    if not site.is_dir():
        pytest.skip("apps/api-docs is not present")
    offenders = [
        str(path.relative_to(site))
        for path in list(site.glob("app/**/*.ts*"))
        + list(site.glob("lib/**/*.ts*"))
        + list(site.glob("content/**/*"))
        if path.is_file() and "/api/admin/handbook" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []
