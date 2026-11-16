import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def require_internal_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.ai_internal_token.get_secret_value().encode()
    provided = (x_internal_token or "").encode()
    # constant-time comparison: do not leak token prefix via response timing
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")
