from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    ai_internal_token: SecretStr = Field(min_length=16)
    litellm_url: str = "http://localhost:4000"
    litellm_virtual_key: SecretStr = Field(min_length=1)  # fail at startup, not at first call
    llm_model_alias: str = "default-llm"
    # Must exceed LiteLLM's total budget: (num_retries + 1) x per-attempt timeout (infra/litellm/config.yaml)
    llm_timeout_s: float = 70.0
    enable_dev_endpoints: bool = False
    log_level: str = "INFO"
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
