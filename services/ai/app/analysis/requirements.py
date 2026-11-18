import re
from html import escape, unescape

from app.analysis.prompts import REQUIREMENTS_VERSION, load_prompt
from app.analysis.schemas import (
    DocumentIn,
    RequirementDraft,
    RequirementOut,
    RequirementsOut,
    RequirementsOutput,
    RunUsage,
    SegmentIn,
    SourceOut,
)
from app.analysis.verify import normalize, quote_in_text
from app.extraction.tokens import count_tokens
from app.llm.client import LLMClient, Message
from app.llm.structured import complete_structured

# Documents are sent in groups of at most this many tokens, so one call never nears the model's limit.
CHUNK_TOKEN_BUDGET = 60_000


_DELIMITER = re.compile(r"<(/?)(segment|document)\b", re.IGNORECASE)


def neutralize(text: str) -> str:
    """Document text must not be able to close its own tag or open a fake one. Only the delimiters'
    opening brackets are escaped (`</segment` becomes `&lt;/segment`); all other text stays as written, so
    quotes still match. `unescape` restores them when a quote is checked against the real text."""
    return _DELIMITER.sub(r"&lt;\1\2", text)


def render_documents(documents: list[DocumentIn]) -> str:
    """Documents as tagged data. Attribute values are escaped so a file name cannot close the tag, and
    delimiter-like text inside a segment is neutralised."""
    parts = []
    for d in documents:
        segs = "\n".join(
            f'<segment id="{escape(s.id)}" page="{s.page or ""}">\n{neutralize(s.text)}\n</segment>'
            for s in d.segments
        )
        parts.append(f'<document id="{escape(d.id)}" name="{escape(d.name)}">\n{segs}\n</document>')
    return "\n\n".join(parts)


def chunk_documents(
    documents: list[DocumentIn], budget: int = CHUNK_TOKEN_BUDGET
) -> list[list[DocumentIn]]:
    """Groups of documents within the token budget. A document larger than the budget is split by
    segments (a segment is the citable unit, so it is never cut)."""
    chunks: list[list[DocumentIn]] = []
    current: list[DocumentIn] = []
    used = 0

    def flush() -> None:
        nonlocal current, used
        if current:
            chunks.append(current)
        current, used = [], 0

    for doc in documents:
        piece: list[SegmentIn] = []
        piece_tokens = 0
        for seg in doc.segments:
            t = count_tokens(seg.text) + 20
            if piece and used + piece_tokens + t > budget:
                current.append(DocumentIn(id=doc.id, name=doc.name, segments=piece))
                flush()
                piece, piece_tokens = [], 0
            piece.append(seg)
            piece_tokens += t
        if piece:
            if used + piece_tokens > budget:
                flush()
            current.append(DocumentIn(id=doc.id, name=doc.name, segments=piece))
            used += piece_tokens
    flush()
    return chunks


def _locate(quote: str, documents: list[DocumentIn], cited: list[str]) -> SourceOut | None:
    """Finds the segment that holds the quote: the cited segments first, then everything."""
    quote = unescape(quote)  # the model saw `&lt;segment` where the document says `<segment`
    by_id = {s.id: (d, s) for d in documents for s in d.segments}
    for seg_id in [*cited, *by_id]:
        if seg_id in by_id and quote_in_text(quote, by_id[seg_id][1].text):
            doc, seg = by_id[seg_id]
            return SourceOut(document_id=doc.id, segment_id=seg.id, quote=quote.strip())
    return None


def to_output(draft: RequirementDraft, documents: list[DocumentIn]) -> RequirementOut:
    """Checks the model's citation against the real text. Never trusts a segment id or a quote."""
    source = _locate(draft.source_quote, documents, draft.source_segment_ids)
    if source is not None:
        sources, unverified = [source], False
    else:
        # cite the first real segment the model named, but flag it: the quote could not be found there
        valid = [s for d in documents for s in d.segments if s.id in draft.source_segment_ids]
        owner = {s.id: d.id for d in documents for s in d.segments}
        sources = (
            [
                SourceOut(
                    document_id=owner[valid[0].id],
                    segment_id=valid[0].id,
                    quote=draft.source_quote.strip(),
                )
            ]
            if valid
            else []
        )
        unverified = True
    return RequirementOut(
        title=draft.title.strip()[:200],
        description=draft.description.strip(),
        type=draft.type,
        priority=draft.priority,
        confidence=draft.confidence,
        ai_comment=draft.ai_comment.strip(),
        source_unverified=unverified,
        sources=sources,
    )


def _merge(items: list[RequirementOut]) -> list[RequirementOut]:
    """The same requirement found in two groups of documents is kept once (same normalized title)."""
    seen: dict[str, RequirementOut] = {}
    for r in items:
        key = re.sub(r"[^\w]+", " ", normalize(r.title)).strip()
        if key not in seen:
            seen[key] = r
    return list(seen.values())


async def extract_requirements(
    llm: LLMClient, documents: list[DocumentIn], *, request_id: str
) -> RequirementsOut:
    system = load_prompt(REQUIREMENTS_VERSION)
    found: list[RequirementOut] = []
    calls = prompt_tokens = completion_tokens = 0
    cost = 0.0
    model = ""
    for group in chunk_documents(documents):
        result, completion = await complete_structured(
            llm,
            RequirementsOutput,
            # static instructions first, the documents last (cacheable prefix)
            [Message("system", system), Message("user", render_documents(group))],
            operation="analysis.requirements",
            request_id=request_id,
        )
        calls += 1
        prompt_tokens += completion.usage.prompt_tokens
        completion_tokens += completion.usage.completion_tokens
        cost += completion.cost_usd or 0.0
        model = completion.model
        found.extend(to_output(d, group) for d in result.requirements)
    return RequirementsOut(
        requirements=_merge(found),
        usage=RunUsage(
            calls=calls,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=round(cost, 6),
            model=model,
        ),
        prompt_version=REQUIREMENTS_VERSION,
    )
