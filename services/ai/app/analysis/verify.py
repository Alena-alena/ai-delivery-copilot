import re
from difflib import SequenceMatcher

_WS = re.compile(r"\s+")
_QUOTES = str.maketrans({c: '"' for c in "“”„«»‟"} | {c: "'" for c in "‘’‚‛"})


def normalize(text: str) -> str:
    """Case, quote style and whitespace differences are not mismatches."""
    return _WS.sub(" ", text.translate(_QUOTES)).strip().casefold()


def quote_in_text(quote: str, text: str) -> bool:
    """True if the quote is in the text. Tolerates small differences (a model may drop a comma or
    a hyphenation), but not a different sentence: a quote that is mostly absent stays unverified."""
    q, t = normalize(quote), normalize(text)
    if len(q) < 8:  # too short to prove anything
        return False
    if q in t:
        return True
    match = SequenceMatcher(None, q, t, autojunk=False).find_longest_match(0, len(q), 0, len(t))
    if match.size >= 0.9 * len(q):
        return True
    # a quote split by an omitted middle ("start ... end"): both ends must be present
    parts = [p.strip() for p in re.split(r"\.{3}|…", q) if len(p.strip()) >= 8]
    return len(parts) >= 2 and all(p in t for p in parts)
