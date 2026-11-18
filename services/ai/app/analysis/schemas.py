from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RequirementType = Literal["functional", "non_functional", "constraint"]
Priority = Literal["urgent", "high", "medium", "low"]
Confidence = Literal["high", "medium", "low"]


class RequirementDraft(BaseModel):
    """What the model must return for one requirement (strict: every field, no extras)."""

    model_config = ConfigDict(extra="forbid")

    title: str
    description: str
    type: RequirementType
    priority: Priority
    source_segment_ids: list[str]
    source_quote: str
    ai_comment: str
    confidence: Confidence


class RequirementsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requirements: list[RequirementDraft]


# ---- request and response of POST /v1/analysis/requirements ----


class SegmentIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    page: int | None = None
    text: str


class DocumentIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(max_length=255)
    segments: list[SegmentIn] = Field(min_length=1)


class RequirementsIn(BaseModel):
    documents: list[DocumentIn] = Field(min_length=1, max_length=100)


class SourceOut(BaseModel):
    document_id: str
    segment_id: str
    quote: str


class RequirementOut(BaseModel):
    title: str
    description: str
    type: RequirementType
    priority: Priority
    confidence: Confidence
    ai_comment: str
    # True when the quote could not be found in the cited text: a person must check the source.
    source_unverified: bool
    sources: list[SourceOut]


class RunUsage(BaseModel):
    calls: int
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    model: str


class RequirementsOut(BaseModel):
    requirements: list[RequirementOut]
    usage: RunUsage
    prompt_version: str
