import time
import uuid

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.router import router as v1_router
from app.config import get_settings
from app.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level, json=settings.environment != "development")
log = structlog.get_logger()

app = FastAPI(title="AI Delivery Copilot — AI service")


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    request.state.request_id = request_id
    start = time.perf_counter()
    response = await call_next(request)
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


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return _error(request, 422, "VALIDATION_ERROR", "Invalid request")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(v1_router)
