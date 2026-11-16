import os
from types import SimpleNamespace

os.environ["AI_INTERNAL_TOKEN"] = "test-token-0123456789"

import httpx
import openai
import pytest

from app.config import Settings
from app.llm.client import LLMClient, Message
from app.llm.errors import LLMInvalidResponse, LLMProviderError, LLMRateLimited, LLMTimeout

settings = Settings()  # type: ignore[call-arg]
REQ = httpx.Request("POST", "http://litellm.test")


def fake_client(*, result=None, error=None):
    async def create(**kwargs):
        create.kwargs = kwargs
        if error:
            raise error
        return result

    raw = SimpleNamespace(create=create)
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(with_raw_response=raw))
    ), create


def raw_ok(content="pong", cost="0.0001"):
    response = SimpleNamespace(
        model="default-llm",
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(prompt_tokens=13, completion_tokens=4, total_tokens=17),
    )
    return SimpleNamespace(parse=lambda: response, headers={"x-litellm-response-cost": cost})


async def test_returns_text_usage_cost_and_sends_metadata():
    client, create = fake_client(result=raw_ok())
    out = await LLMClient(settings, client).complete(
        [Message("user", "hi")], operation="op", request_id="rid-1"
    )
    assert (out.text, out.usage.total_tokens, out.cost_usd) == ("pong", 17, 0.0001)
    assert create.kwargs["model"] == "default-llm"
    meta = create.kwargs["extra_body"]["metadata"]
    assert meta["spend_logs_metadata"] == {"request_id": "rid-1", "operation": "op"}
    assert meta["tags"] == ["op"]


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (openai.APITimeoutError(request=REQ), LLMTimeout),
        (
            openai.RateLimitError("429", response=httpx.Response(429, request=REQ), body=None),
            LLMRateLimited,
        ),
        (openai.APIConnectionError(request=REQ), LLMProviderError),
        (
            openai.InternalServerError("500", response=httpx.Response(500, request=REQ), body=None),
            LLMProviderError,
        ),
    ],
)
async def test_maps_provider_errors(error, expected):
    client, _ = fake_client(error=error)
    with pytest.raises(expected):
        await LLMClient(settings, client).complete(
            [Message("user", "x")], operation="o", request_id="r"
        )


async def test_empty_content_is_invalid_response():
    client, _ = fake_client(result=raw_ok(content=None))
    with pytest.raises(LLMInvalidResponse):
        await LLMClient(settings, client).complete(
            [Message("user", "x")], operation="o", request_id="r"
        )
