import re
from html import escape

from app.analysis.prompts import GAPS_VERSION, load_prompt
from app.analysis.requirements import CHUNK_TOKEN_BUDGET, chunk_documents, render_documents
from app.analysis.schemas import (
    DocumentIn,
    GapDraft,
    GapOut,
    GapsOut,
    GapsOutput,
    RequirementRef,
    RunUsage,
)
from app.analysis.verify import normalize
from app.llm.client import LLMClient, Message
from app.llm.errors import LLMError
from app.llm.structured import complete_structured


class GapsInputTooLarge(LLMError):
    """A gap is a claim about what the documents do NOT say, so the model must see all of them at once.
    Split into groups it would call something "absent" that another group states."""

    http_status = 413
    code = "ANALYSIS_TOO_LARGE"


def render_requirements(requirements: list[RequirementRef]) -> str:
    lines = [
        f'<requirement ref="{escape(r.ref)}">{escape(r.title)}: {escape(r.description)}</requirement>'
        for r in requirements
    ]
    return "<requirements>\n" + "\n".join(lines) + "\n</requirements>"


def _key(text: str) -> str:
    return re.sub(r"[^\w]+", " ", normalize(text)).strip()


def clean(drafts: list[GapDraft], valid_refs: set[str]) -> list[GapOut]:
    """Never trust the model's references: unknown refs are dropped, empty or repeated gaps are removed."""
    seen: set[str] = set()
    out: list[GapOut] = []
    for g in drafts:
        text, question = g.text.strip(), g.question.strip()
        key = _key(text)
        if not text or not question or key in seen:
            continue
        seen.add(key)
        refs = list(dict.fromkeys(r for r in g.requirement_refs if r in valid_refs))
        out.append(
            GapOut(
                type=g.type,
                severity=g.severity,
                text=text,
                requirement_refs=refs,
                question=question,
            )
        )
    return out


async def find_gaps(
    llm: LLMClient,
    documents: list[DocumentIn],
    requirements: list[RequirementRef],
    *,
    request_id: str,
) -> GapsOut:
    if len(chunk_documents(documents, CHUNK_TOKEN_BUDGET)) > 1:
        raise GapsInputTooLarge("documents are too large to be read together")
    result, completion = await complete_structured(
        llm,
        GapsOutput,
        # static instructions first, the documents last (cacheable prefix)
        [
            Message("system", load_prompt(GAPS_VERSION)),
            Message("user", render_documents(documents) + "\n\n" + render_requirements(requirements)),
        ],
        operation="analysis.gaps",
        request_id=request_id,
    )
    return GapsOut(
        gaps=clean(result.gaps, {r.ref for r in requirements}),
        usage=RunUsage(
            calls=1,
            prompt_tokens=completion.usage.prompt_tokens,
            completion_tokens=completion.usage.completion_tokens,
            cost_usd=round(completion.cost_usd or 0.0, 6),
            model=completion.model,
        ),
        prompt_version=GAPS_VERSION,
    )
