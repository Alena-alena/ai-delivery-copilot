import asyncio
import time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.extraction.extract import SUPPORTED_MIMES, extract_document

router = APIRouter(prefix="/documents")

# Nest limits uploads to 10 MB; this is a second, independent guard for the internal endpoint.
MAX_BYTES = 11 * 1024 * 1024

# Parsing is CPU-bound, so only a few files are worked on at once; the rest wait their turn.
_slots = asyncio.Semaphore(3)
# Stay below Nest's 60 s timeout so this side stops first, with a typed error instead of a dangling thread.
WORK_BUDGET_S = 45.0


async def read_limited(request: Request, limit: int) -> bytes:
    """Reads the body but gives up as soon as it is over `limit`, instead of buffering it all first."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(413, detail="File too large")
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise HTTPException(413, detail="File too large")
        chunks.append(chunk)
    return b"".join(chunks)


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
    data = await read_limited(request, MAX_BYTES)
    async with _slots:
        # Parsing is CPU-bound: keep it off the event loop so health checks stay responsive.
        deadline = time.monotonic() + WORK_BUDGET_S
        result = await run_in_threadpool(extract_document, data, mime, deadline)
    return ExtractOut(
        page_count=result.page_count,
        token_count=result.token_count,
        encoding=result.encoding,
        segments=[
            SegmentOut(index=s.index, page=s.page, text=s.text, token_count=s.token_count)
            for s in result.segments
        ],
    )
