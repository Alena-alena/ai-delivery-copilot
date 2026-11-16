import re

from charset_normalizer import from_bytes

from app.extraction.errors import UnsupportedType
from app.extraction.segmentation import Segment, segment_paragraphs

_BLANK_LINE = re.compile(r"\n\s*\n")


def decode_text(data: bytes) -> tuple[str, str]:
    """Detects the encoding (UTF-8, cp1251, ...) and returns (text, encoding name)."""
    best = from_bytes(data).best()
    if best is None:
        raise UnsupportedType("The file is not readable text")
    return str(best), best.encoding


def extract_txt(data: bytes) -> tuple[list[Segment], str]:
    text, encoding = decode_text(data)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return segment_paragraphs(_BLANK_LINE.split(text), None, 0), encoding
