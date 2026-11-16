import io
import time
import zipfile

from docx import Document
from docx.opc.exceptions import PackageNotFoundError
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.extraction.errors import ExtractionTimeout, FileCorrupted
from app.extraction.segmentation import Segment, segment_paragraphs


def extract_docx(data: bytes, deadline: float | None = None) -> list[Segment]:
    """Body paragraphs and tables in document order. DOCX has no fixed pages, so page is None."""
    try:
        doc = Document(io.BytesIO(data))
        paragraphs: list[str] = []
        for block in doc.iter_inner_content():
            if deadline is not None and time.monotonic() > deadline:
                raise ExtractionTimeout("The DOCX took too long to process")
            if isinstance(block, Paragraph):
                paragraphs.append(block.text)
            elif isinstance(block, Table):
                for row in block.rows:
                    cells = [c.text.strip() for c in row.cells]
                    paragraphs.append(" | ".join(c for c in cells if c))
    except (zipfile.BadZipFile, PackageNotFoundError, KeyError, ValueError, OSError) as e:
        raise FileCorrupted(f"The DOCX cannot be read: {type(e).__name__}") from e
    return segment_paragraphs(paragraphs, None, 0, deadline=deadline)
