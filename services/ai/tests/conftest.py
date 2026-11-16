import os

# Must be set before app modules import (Settings is read at import time).
os.environ.setdefault("AI_INTERNAL_TOKEN", "test-token-0123456789")
os.environ.setdefault("LITELLM_VIRTUAL_KEY", "sk-test")
os.environ["ENABLE_DEV_ENDPOINTS"] = "true"
