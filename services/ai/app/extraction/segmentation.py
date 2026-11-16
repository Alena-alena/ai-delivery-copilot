import re
from dataclasses import dataclass

from app.extraction.tokens import count_tokens, split_by_tokens

# A segment is the unit an AI answer cites ("segment 12"), so it should be small enough to point at
# a specific place but large enough to carry meaning.
MAX_SEGMENT_TOKENS = 350

_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")
_WS = re.compile(r"[ \t ]+")


@dataclass(frozen=True)
class Segment:
    index: int
    page: int | None
    text: str
    token_count: int


def clean(text: str) -> str:
    """Removes NUL bytes and collapses runs of spaces, keeping line breaks as single spaces."""
    text = text.replace("\x00", "")
    return _WS.sub(" ", " ".join(line.strip() for line in text.splitlines())).strip()


def _pieces(paragraph: str, limit: int) -> list[str]:
    """A paragraph that fits the limit stays whole; a longer one is cut at sentences, then by tokens."""
    if count_tokens(paragraph) <= limit:
        return [paragraph]
    out: list[str] = []
    current = ""
    for sentence in _SENTENCE_END.split(paragraph):
        candidate = f"{current} {sentence}".strip()
        if count_tokens(candidate) <= limit:
            current = candidate
            continue
        if current:
            out.append(current)
        if count_tokens(sentence) > limit:
            out.extend(split_by_tokens(sentence, limit))
            current = ""
        else:
            current = sentence
    if current:
        out.append(current)
    return out


def segment_paragraphs(
    paragraphs: list[str], page: int | None, start_index: int, limit: int = MAX_SEGMENT_TOKENS
) -> list[Segment]:
    """Packs consecutive paragraphs into segments of at most `limit` tokens (never across pages)."""
    segments: list[Segment] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current:
            segments.append(
                Segment(start_index + len(segments), page, current, count_tokens(current))
            )
            current = ""

    for raw in paragraphs:
        paragraph = clean(raw)
        if not paragraph:
            continue
        for piece in _pieces(paragraph, limit):
            candidate = f"{current}\n\n{piece}" if current else piece
            if current and count_tokens(candidate) > limit:
                flush()
                current = piece
            else:
                current = candidate
    flush()
    return segments
