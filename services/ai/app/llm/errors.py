class LLMError(Exception):
    """Base class: every failure of an LLM call maps to one of these types."""

    http_status = 502
    code = "LLM_ERROR"


class LLMTimeout(LLMError):
    http_status = 504
    code = "LLM_TIMEOUT"


class LLMRateLimited(LLMError):
    http_status = 429
    code = "LLM_RATE_LIMITED"


class LLMProviderError(LLMError):
    http_status = 502
    code = "LLM_PROVIDER_ERROR"


class LLMInvalidResponse(LLMError):
    http_status = 502
    code = "LLM_INVALID_RESPONSE"
