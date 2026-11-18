import json

from pydantic import BaseModel, ValidationError

from app.llm.client import Completion, LLMClient, Message
from app.llm.errors import LLMInvalidResponse


def json_schema_format(model: type[BaseModel], name: str) -> dict:
    """A strict JSON Schema response format built from a Pydantic model."""
    return {
        "type": "json_schema",
        "json_schema": {"name": name, "schema": model.model_json_schema(), "strict": True},
    }


async def complete_structured[T: BaseModel](
    llm: LLMClient,
    model: type[T],
    messages: list[Message],
    *,
    operation: str,
    request_id: str,
    temperature: float | None = 0,
) -> tuple[T, Completion]:
    """One LLM call whose answer must match `model`. One retry when the answer is not valid.

    The retry tells the model what was wrong. A second failure raises LLMInvalidResponse; the cost of both
    attempts is still recorded by LiteLLM, which is why the retry is limited to one.
    """
    fmt = json_schema_format(model, operation.replace(".", "_"))
    attempt_messages = list(messages)
    last_error = ""
    for attempt in (1, 2):
        completion = await llm.complete(
            attempt_messages,
            operation=operation,
            request_id=request_id,
            temperature=temperature,
            response_format=fmt,
        )
        try:
            return model.model_validate(json.loads(completion.text)), completion
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = type(e).__name__
            attempt_messages = [
                *messages,
                Message("assistant", completion.text),
                Message(
                    "user",
                    "That answer did not match the required JSON schema. "
                    "Answer again with valid JSON only, following the schema exactly.",
                ),
            ]
    raise LLMInvalidResponse(f"The model's answer did not match the schema ({last_error})")
