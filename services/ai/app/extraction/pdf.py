import io
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError, PyPdfError

from app.extraction.errors import FileCorrupted, PdfEncrypted, PdfNoTextLayer
from app.extraction.segmentation import Segment, segment_paragraphs

# Fewer visible characters than this in the whole file means the pages are images (a scan).
MIN_TEXT_CHARS = 20

_BLANK_LINE = re.compile(r"\n\s*\n")


def extract_pdf(data: bytes) -> tuple[list[Segment], int]:
    """Returns (segments with page numbers, page count)."""
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfEncrypted("The PDF is password-protected")
        pages = list(reader.pages)
    except PdfEncrypted:
        raise
    except (PdfReadError, PyPdfError, ValueError, KeyError, OSError, RecursionError) as e:
        raise FileCorrupted(f"The PDF cannot be read: {type(e).__name__}") from e

    segments: list[Segment] = []
    visible = 0
    for number, page in enumerate(pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:  # noqa: BLE001 - one unreadable page must not fail the whole file
            text = ""
        visible += len("".join(text.split()))
        segments.extend(segment_paragraphs(_BLANK_LINE.split(text), number, len(segments)))

    if visible < MIN_TEXT_CHARS:
        raise PdfNoTextLayer("The PDF has no text layer (it looks like a scan)")
    return segments, len(pages)
