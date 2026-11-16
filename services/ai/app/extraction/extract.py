from dataclasses import dataclass

from app.extraction.docx import extract_docx
from app.extraction.errors import EmptyDocument, UnsupportedType
from app.extraction.pdf import extract_pdf
from app.extraction.segmentation import Segment
from app.extraction.txt import extract_txt

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TXT = "text/plain"
SUPPORTED_MIMES = (PDF, DOCX, TXT)


@dataclass(frozen=True)
class ExtractionResult:
    segments: list[Segment]
    page_count: int | None
    token_count: int
    encoding: str | None


def extract_document(data: bytes, mime: str) -> ExtractionResult:
    """Turns a file into text segments. Raises an ExtractionError subclass for files we cannot read."""
    page_count: int | None = None
    encoding: str | None = None
    if mime == PDF:
        segments, page_count = extract_pdf(data)
    elif mime == DOCX:
        segments = extract_docx(data)
    elif mime == TXT:
        segments, encoding = extract_txt(data)
    else:
        raise UnsupportedType(f"Unsupported type: {mime}")

    if not segments:
        raise EmptyDocument("No text was found in the document")
    return ExtractionResult(
        segments=segments,
        page_count=page_count,
        token_count=sum(s.token_count for s in segments),
        encoding=encoding,
    )
