import re
import time
from contextlib import contextmanager

_WORD_RE = re.compile(r"\w+|[^\w\s]")


def count_tokens(text: str) -> int:
    """Approximate token count (word/punctuation split, ~GPT-style granularity)."""
    return len(_WORD_RE.findall(text))


@contextmanager
def timer():
    """Context manager yielding a dict that gets an 'ms' key on exit."""
    result: dict = {}
    start = time.perf_counter()
    try:
        yield result
    finally:
        result["ms"] = (time.perf_counter() - start) * 1000.0
