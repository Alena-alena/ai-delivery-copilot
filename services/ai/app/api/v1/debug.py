from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.llm.client import LLMClient, Message

router = APIRouter(prefix="/debug")


class CompleteIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    system: str | None = Field(default=None, max_length=2000)
    temperature: float | None = Field(default=None, ge=0, le=2)


class CompleteOut(BaseModel):
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float | None
    latency_ms: float


def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> LLMClient:
    return LLMClient(settings)


@router.post("/complete")
async def complete(
    body: CompleteIn, request: Request, llm: Annotated[LLMClient, Depends(get_llm)]
) -> CompleteOut:
    messages = [Message("system", body.system)] if body.system else []
    messages.append(Message("user", body.prompt))
    result = await llm.complete(
        messages,
        operation="debug.complete",
        request_id=request.state.request_id,
        temperature=body.temperature,
    )
    return CompleteOut(
        text=result.text,
        model=result.model,
        prompt_tokens=result.usage.prompt_tokens,
        completion_tokens=result.usage.completion_tokens,
        total_tokens=result.usage.total_tokens,
        cost_usd=result.cost_usd,
        latency_ms=result.latency_ms,
    )
