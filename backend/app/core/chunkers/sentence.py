from app.core.chunkers.base import Chunk, Chunker


def split_sentences(text: str) -> list[tuple[int, int]]:
    """Sentence spans (start, end) using NLTK punkt, downloaded on first use."""
    import nltk
    from nltk.tokenize import PunktTokenizer

    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt_tab", quiet=True)
    return list(PunktTokenizer("english").span_tokenize(text))


class SentenceChunker(Chunker):
    """Groups whole sentences until max_tokens is reached."""

    name = "sentence"

    def chunk(self, text: str, params: dict) -> list[Chunk]:
        max_tokens = int(params.get("max_tokens", 128))
        from app.utils.metrics import count_tokens

        sentence_spans = split_sentences(text)
        spans: list[tuple[int, int]] = []
        cur_start: int | None = None
        cur_tokens = 0
        cur_end = 0

        for s_start, s_end in sentence_spans:
            s_tokens = count_tokens(text[s_start:s_end])
            if cur_start is None:
                cur_start, cur_end, cur_tokens = s_start, s_end, s_tokens
            elif cur_tokens + s_tokens > max_tokens:
                spans.append((cur_start, cur_end))
                cur_start, cur_end, cur_tokens = s_start, s_end, s_tokens
            else:
                cur_end = s_end
                cur_tokens += s_tokens
        if cur_start is not None:
            spans.append((cur_start, cur_end))
        return self._make_chunks(spans, text)
