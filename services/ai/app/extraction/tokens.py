from functools import lru_cache

import tiktoken


@lru_cache(maxsize=1)
def _encoding() -> tiktoken.Encoding:
    # o200k_base is the tokenizer of the current OpenAI model families. Counts are used for
    # budgeting and limits only, so a small difference from the exact model is acceptable.
    return tiktoken.get_encoding("o200k_base")


def count_tokens(text: str) -> int:
    return len(_encoding().encode(text, disallowed_special=()))


def split_by_tokens(text: str, max_tokens: int) -> list[str]:
    """Hard split of text that has no sentence boundaries (e.g. a very long unbroken line)."""
    enc = _encoding()
    ids = enc.encode(text, disallowed_special=())
    return [enc.decode(ids[i : i + max_tokens]) for i in range(0, len(ids), max_tokens)]
