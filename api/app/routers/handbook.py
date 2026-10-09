"""Administrator-only internal handbook; authorization is rechecked on every request."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from app.handbook import list_pages, read_page
from app.models import DeveloperAccount
from app.routers.admin import require_admin
from app.schemas import ApiModel

router = APIRouter(prefix="/api/admin/handbook", tags=["Internal handbook"])


class HandbookPageSummary(ApiModel):
    slug: str
    title: str
    group: str
    summary: str
    source: str  # basename inside docs/, used to resolve links between pages


class HandbookPageRead(HandbookPageSummary):
    markdown: str
    updated_at: datetime = Field(serialization_alias="updatedAt")


@router.get("", response_model=list[HandbookPageSummary])
def handbook_index(_: DeveloperAccount = Depends(require_admin)) -> list[HandbookPageSummary]:
    return [
        HandbookPageSummary(
            slug=page.slug,
            title=page.title,
            group=page.group,
            summary=page.summary,
            source=page.file,
        )
        for page in list_pages()
    ]


@router.get("/{slug}", response_model=HandbookPageRead)
def handbook_page(slug: str, _: DeveloperAccount = Depends(require_admin)) -> HandbookPageRead:
    found = read_page(slug)
    if found is None:
        raise HTTPException(status_code=404, detail="Handbook page not found")
    page, markdown, modified = found
    return HandbookPageRead(
        slug=page.slug,
        title=page.title,
        group=page.group,
        summary=page.summary,
        source=page.file,
        markdown=markdown,
        updated_at=modified,
    )
