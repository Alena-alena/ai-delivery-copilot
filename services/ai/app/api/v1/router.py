from fastapi import APIRouter, Depends

from app.api.v1.debug import router as debug_router
from app.config import get_settings
from app.security import require_internal_token

router = APIRouter(prefix="/v1", dependencies=[Depends(require_internal_token)])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "ok"}


if get_settings().enable_dev_endpoints:
    router.include_router(debug_router)
