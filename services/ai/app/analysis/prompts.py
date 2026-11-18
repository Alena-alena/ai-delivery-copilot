from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
REQUIREMENTS_VERSION = "requirements/v1"


@cache
def load_prompt(version: str) -> str:
    """The prompt text for e.g. "requirements/v1". The version is stored with every run."""
    return (PROMPTS_DIR / f"{version}.md").read_text(encoding="utf-8")
