import re
import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.router import router as v1_router
from app.config import get_settings
from app.llm.client import LLMClient
from app.llm.errors import LLMError
from app.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level, json=settings.environment != "development")
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One client (one connection pool) for the whole process, closed on shutdown.
    app.state.llm = LLMClient(settings)
    yield
    await app.state.llm.aclose()


app = FastAPI(title="AI Delivery Copilot — AI service", lifespan=lifespan)

# Accept a caller-supplied request id only if it is short and plain; otherwise generate one.
_REQUEST_ID_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")


def _resolve_request_id(header: str | None) -> str:
    if header and _REQUEST_ID_RE.fullmatch(header):
        return header
    return str(uuid.uuid4())


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = _resolve_request_id(request.headers.get("x-request-id"))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    request.state.request_id = request_id
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # Keep the unified error shape (and a log line) even for unexpected failures.
        log.exception("unhandled exception", method=request.method, path=request.url.path)
        response = _error(request, 500, "INTERNAL_ERROR", "Internal server error")
    response.headers["x-request-id"] = request_id
    log.info(
        "request completed",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round((time.perf_counter() - start) * 1000, 1),
    )
    return response


def _error(request: Request, status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"code": code, "message": message, "requestId": request.state.request_id},
    )


_CODES = {401: "UNAUTHORIZED", 404: "NOT_FOUND", 422: "VALIDATION_ERROR"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return _error(request, exc.status_code, _CODES.get(exc.status_code, "ERROR"), str(exc.detail))


@app.exception_handler(LLMError)
async def llm_error_handler(request: Request, exc: LLMError):
    log.warning("llm call failed", code=exc.code, error=str(exc))
    return _error(request, exc.http_status, exc.code, str(exc))


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return _error(request, 422, "VALIDATION_ERROR", "Invalid request")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(v1_router)
