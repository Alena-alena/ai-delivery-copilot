import io
import re
import time

from pypdf import PdfReader
from pypdf.errors import PdfReadError, PyPdfError

from app.extraction.errors import (
    ExtractionTimeout,
    FileCorrupted,
    PdfEncrypted,
    PdfNoTextLayer,
    TooManyPages,
)
from app.extraction.segmentation import Segment, segment_paragraphs

# A 10 MB PDF can still hold thousands of pages; refuse the ones we would not finish in time.
MAX_PAGES = 300

# Fewer visible characters than this in the whole file means the pages are images (a scan).
MIN_TEXT_CHARS = 20

_BLANK_LINE = re.compile(r"\n\s*\n")


def extract_pdf(data: bytes, deadline: float | None = None) -> tuple[list[Segment], int]:
    """Returns (segments with page numbers, page count).

    `deadline` is a time.monotonic() value: when it passes, extraction stops with ExtractionTimeout
    (a worker thread cannot be cancelled from outside, so it must stop itself).
    """
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfEncrypted("The PDF is password-protected")
        page_count = len(reader.pages)
    except PdfEncrypted:
        raise
    except (PdfReadError, PyPdfError, ValueError, KeyError, OSError, RecursionError) as e:
        raise FileCorrupted(f"The PDF cannot be read: {type(e).__name__}") from e

    if page_count > MAX_PAGES:
        raise TooManyPages(f"The PDF has {page_count} pages; the limit is {MAX_PAGES}")

    segments: list[Segment] = []
    visible = 0
    for number, page in enumerate(reader.pages, start=1):
        if deadline is not None and time.monotonic() > deadline:
            raise ExtractionTimeout("The PDF took too long to process")
        try:
            text = page.extract_text() or ""
        except Exception:  # noqa: BLE001 - one unreadable page must not fail the whole file
            text = ""
        visible += len("".join(text.split()))
        segments.extend(
            segment_paragraphs(_BLANK_LINE.split(text), number, len(segments), deadline=deadline)
        )

    if visible < MIN_TEXT_CHARS:
        raise PdfNoTextLayer("The PDF has no text layer (it looks like a scan)")
    return segments, page_count
