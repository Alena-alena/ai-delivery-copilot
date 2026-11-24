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


# ---- gaps: POST /v1/analysis/gaps ----

GapType = Literal["missing_information", "missing_requirement", "unclear_wording"]
Severity = Literal["high", "medium", "low"]


class GapDraft(BaseModel):
    """What the model must return for one gap (strict: every field, no extras)."""

    model_config = ConfigDict(extra="forbid")

    type: GapType
    severity: Severity
    text: str
    # refs ("R1", "R2") of the requirements this gap is about; empty when the topic is absent from the documents
    requirement_refs: list[str]
    question: str


class GapsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gaps: list[GapDraft]


class RequirementRef(BaseModel):
    ref: str = Field(min_length=1, max_length=16)
    title: str = Field(max_length=300)
    description: str = Field(default="", max_length=4000)


class GapsIn(BaseModel):
    documents: list[DocumentIn] = Field(min_length=1, max_length=100)
    requirements: list[RequirementRef] = Field(max_length=500)


class GapOut(BaseModel):
    type: GapType
    severity: Severity
    text: str
    requirement_refs: list[str]
    question: str


class GapsOut(BaseModel):
    gaps: list[GapOut]
    usage: RunUsage
    prompt_version: str
