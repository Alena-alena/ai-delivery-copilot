import time
from dataclasses import dataclass
from typing import Literal

import openai
from openai import AsyncOpenAI

from app.config import Settings
from app.llm.errors import LLMInvalidResponse, LLMProviderError, LLMRateLimited, LLMTimeout

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class Message:
    role: Role
    content: str


@dataclass(frozen=True)
class Usage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass(frozen=True)
class Completion:
    text: str
    model: str
    usage: Usage
    cost_usd: float | None
    latency_ms: float


class LLMClient:
    """The only place that talks to an LLM. Always goes through LiteLLM, by model alias."""

    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None) -> None:
        self._alias = settings.llm_model_alias
        self._client = client or AsyncOpenAI(
            base_url=f"{settings.litellm_url.rstrip('/')}/v1",
            api_key=settings.litellm_virtual_key.get_secret_value(),
            timeout=settings.llm_timeout_s,
            max_retries=0,  # retries are LiteLLM's job (config.yaml num_retries)
        )

    async def aclose(self) -> None:
        await self._client.close()

    async def complete(
        self,
        messages: list[Message],
        *,
        operation: str,
        request_id: str,
        temperature: float | None = None,
    ) -> Completion:
        params: dict = {
            "model": self._alias,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            # shows up in LiteLLM spend logs, so a cost can be traced to a request
            "extra_body": {
                "metadata": {
                    "spend_logs_metadata": {"request_id": request_id, "operation": operation},
                    "tags": [operation],
                }
            },
        }
        if temperature is not None:
            params["temperature"] = temperature

        started = time.perf_counter()
        try:
            raw = await self._client.chat.completions.with_raw_response.create(**params)
        except openai.APITimeoutError as e:
            raise LLMTimeout("LLM call timed out") from e
        except openai.RateLimitError as e:
            raise LLMRateLimited("LLM provider rate limit reached") from e
        except (openai.APIConnectionError, openai.APIStatusError) as e:
            raise LLMProviderError(f"LLM provider error: {type(e).__name__}") from e
        latency_ms = (time.perf_counter() - started) * 1000

        response = raw.parse()
        if (
            not response.choices
            or response.choices[0].message.content is None
            or not response.usage
        ):
            raise LLMInvalidResponse("LLM returned an empty or malformed response")

        cost_header = raw.headers.get("x-litellm-response-cost")
        try:
            cost = float(cost_header) if cost_header is not None else None
        except ValueError:
            cost = None

        return Completion(
            text=response.choices[0].message.content,
            model=response.model,
            usage=Usage(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
            ),
            cost_usd=cost,
            latency_ms=round(latency_ms, 1),
        )
