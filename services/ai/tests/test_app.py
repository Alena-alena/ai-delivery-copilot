from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.llm.client import Completion, Usage
from app.llm.errors import (
    LLMInvalidResponse,
    LLMProviderError,
    LLMRateLimited,
    LLMTimeout,
)
from app.main import app

AUTH = {"X-Internal-Token": "test-token-0123456789"}
BODY = {"prompt": "hi"}


class FakeLLM:
    def __init__(self, *, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    async def complete(self, messages, **kwargs):
        self.calls.append((messages, kwargs))
        if self.error:
            raise self.error
        return self.result


def make_client(llm) -> TestClient:
    app.state.llm = llm
    return TestClient(app, raise_server_exceptions=False)


def test_debug_complete_returns_usage_cost_and_passes_metadata():
    llm = FakeLLM(
        result=Completion("pong", "default-llm", Usage(12, 4, 16), 0.0000072, 5.0),
    )
    r = make_client(llm).post(
        "/v1/debug/complete", json=BODY, headers={**AUTH, "x-request-id": "rid-9"}
    )
    assert r.status_code == 200
    assert r.json() | {"latency_ms": 0} == {
        "text": "pong",
        "model": "default-llm",
        "prompt_tokens": 12,
        "completion_tokens": 4,
        "total_tokens": 16,
        "cost_usd": 0.0000072,
        "latency_ms": 0,
    }
    _, kwargs = llm.calls[0]
    assert kwargs["request_id"] == "rid-9"
    assert kwargs["operation"] == "debug.complete"


def test_debug_complete_requires_token():
    assert make_client(FakeLLM()).post("/v1/debug/complete", json=BODY).status_code == 401


def test_debug_complete_validates_body():
    r = make_client(FakeLLM()).post("/v1/debug/complete", json={"prompt": ""}, headers=AUTH)
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (LLMTimeout("t"), 504, "LLM_TIMEOUT"),
        (LLMRateLimited("r"), 429, "LLM_RATE_LIMITED"),
        (LLMProviderError("p"), 502, "LLM_PROVIDER_ERROR"),
        (LLMInvalidResponse("i"), 502, "LLM_INVALID_RESPONSE"),
    ],
)
def test_llm_errors_map_to_http(error, status, code):
    r = make_client(FakeLLM(error=error)).post("/v1/debug/complete", json=BODY, headers=AUTH)
    assert r.status_code == status
    body = r.json()
    assert body["code"] == code
    assert body["requestId"]


def test_unexpected_error_keeps_unified_shape():
    r = make_client(FakeLLM(error=RuntimeError("boom"))).post(
        "/v1/debug/complete", json=BODY, headers=AUTH
    )
    assert r.status_code == 500
    body = r.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert "boom" not in body["message"]  # internals are not leaked
    assert body["requestId"]


@pytest.mark.parametrize("bad", ["x" * 65, "a b", "id;drop", "../etc"])
def test_unsafe_request_id_is_replaced(bad):
    r = make_client(FakeLLM()).get("/health", headers={"x-request-id": bad})
    assert r.headers["x-request-id"] != bad
    assert len(r.headers["x-request-id"]) == 36  # generated uuid


def test_safe_request_id_is_kept():
    r = make_client(FakeLLM()).get("/health", headers={"x-request-id": "abc-123_X.y"})
    assert r.headers["x-request-id"] == "abc-123_X.y"


def test_lifespan_creates_and_closes_one_client():
    closed = []

    class Closable(SimpleNamespace):
        async def aclose(self):
            closed.append(True)

    from app import main

    original = main.LLMClient
    main.LLMClient = lambda settings: Closable()
    try:
        with TestClient(app):
            assert isinstance(app.state.llm, Closable)
        assert closed == [True]
    finally:
        main.LLMClient = original
