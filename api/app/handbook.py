"""Internal engineering and operations handbook, served only to administrators.

The Markdown lives in the repository ``docs`` directory and is the single source of truth.
Only files named in :data:`PAGES` can be read; a caller-supplied slug is looked up in that
allowlist and never joined to a path, so traversal is impossible by construction.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.config import get_settings

MAX_PAGE_BYTES = 512_000


@dataclass(frozen=True)
class HandbookPage:
    slug: str
    file: str
    title: str
    group: str
    summary: str


PAGES: tuple[HandbookPage, ...] = (
    HandbookPage(
        "work-orders",
        "WORK_ORDERS.md",
        "Work orders",
        "Delivery",
        "Every piece of work, its state and its evidence; every instruction from the owner.",
    ),
    HandbookPage(
        "safety-and-privacy",
        "SAFETY_AND_PRIVACY.md",
        "Wildlife safety and privacy rules",
        "Rules",
        "No live locations, sensitive species, guidance on tracks, GPS traces as personal data.",
    ),
    HandbookPage(
        "design-principles",
        "DESIGN_PRINCIPLES.md",
        "Design principles",
        "Design",
        "Field use in sun and with no signal, the identity, and the review checklist.",
    ),
    HandbookPage(
        "real-map",
        "REAL_MAP.md",
        "A real map",
        "Design",
        "The plan for a real OpenStreetMap and satellite map, offline: options, sources, safety, demo.",
    ),
    HandbookPage(
        "deploy",
        "DEPLOY.md",
        "Deploying the web apps",
        "Operations",
        "Vercel projects per app, environment variables, and who can see what.",
    ),
    HandbookPage(
        "observability",
        "OBSERVABILITY.md",
        "Observability",
        "Operations",
        "Metrics, traces, dashboards and alerts: what is wired and what is not.",
    ),
    HandbookPage(
        "operations",
        "OPERATIONS.md",
        "Operations and recovery",
        "Operations",
        "Running the stack, scheduled jobs, backups and restore drills.",
    ),
)

_BY_SLUG = {page.slug: page for page in PAGES}


def handbook_root() -> Path | None:
    """Resolve the handbook directory: ``HANDBOOK_DIR`` first, then the repository docs."""

    configured = get_settings().handbook_dir.strip()
    candidate = Path(configured) if configured else Path(__file__).resolve().parents[2] / "docs"
    return candidate if candidate.is_dir() else None


def list_pages() -> list[HandbookPage]:
    """Return manifest pages whose source file exists, in reading order."""

    root = handbook_root()
    if root is None:
        return []
    return [page for page in PAGES if (root / page.file).is_file()]


def read_page(slug: str) -> tuple[HandbookPage, str, datetime] | None:
    """Return ``(page, markdown, modified)`` for an allowlisted slug, else ``None``."""

    page = _BY_SLUG.get(slug)
    root = handbook_root()
    if page is None or root is None:
        return None
    path = (root / page.file).resolve()
    if path.parent != root.resolve() or not path.is_file():
        return None
    if path.stat().st_size > MAX_PAGE_BYTES:
        return None
    modified = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
    return page, path.read_text(encoding="utf-8"), modified
