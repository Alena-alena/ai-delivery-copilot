from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.extraction.extract import SUPPORTED_MIMES, extract_document

router = APIRouter(prefix="/documents")

# Nest limits uploads to 10 MB; this is a second, independent guard for the internal endpoint.
MAX_BYTES = 11 * 1024 * 1024


class SegmentOut(BaseModel):
    index: int
    page: int | None
    text: str
    token_count: int


class ExtractOut(BaseModel):
    page_count: int | None
    token_count: int
    encoding: str | None
    segments: list[SegmentOut]


@router.post("/extract")
async def extract(request: Request, mime: Annotated[str, Query()]) -> ExtractOut:
    """Receives the raw file bytes from NestJS (the body) and returns its text as segments."""
    if mime not in SUPPORTED_MIMES:
        raise HTTPException(415, detail=f"Unsupported type: {mime}")
    data = await request.body()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, detail="File too large")
    # Parsing is CPU-bound: keep it off the event loop so health checks stay responsive.
    result = await run_in_threadpool(extract_document, data, mime)
    return ExtractOut(
        page_count=result.page_count,
        token_count=result.token_count,
        encoding=result.encoding,
        segments=[
            SegmentOut(index=s.index, page=s.page, text=s.text, token_count=s.token_count)
            for s in result.segments
        ],
    )
