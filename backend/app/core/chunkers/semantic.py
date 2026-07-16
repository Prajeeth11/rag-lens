import numpy as np

from app.core.chunkers.base import Chunk, Chunker
from app.core.chunkers.sentence import split_sentences


class SemanticChunker(Chunker):
    """Embeds each sentence and starts a new chunk wherever cosine distance
    between adjacent sentences exceeds a percentile-based breakpoint."""

    name = "semantic"

    def chunk(self, text: str, params: dict) -> list[Chunk]:
        from app.core.embedders.base import get_embedder

        breakpoint_percentile = float(params.get("breakpoint_percentile", 90))
        min_sentences = int(params.get("min_sentences", 1))
        embedder = get_embedder(
            params.get("embedder_provider", "sentence_transformers"),
            params.get("embedder_model", "all-MiniLM-L6-v2"),
        )

        sentence_spans = split_sentences(text)
        if len(sentence_spans) <= 1:
            spans = [(0, len(text))] if text.strip() else []
            return self._make_chunks(spans, text)

        sentences = [text[s:e] for s, e in sentence_spans]
        vecs = np.asarray(embedder.embed(sentences), dtype=np.float32)
        vecs /= np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-10
        distances = 1.0 - np.sum(vecs[:-1] * vecs[1:], axis=1)
        threshold = float(np.percentile(distances, breakpoint_percentile))

        spans: list[tuple[int, int]] = []
        cur_start = sentence_spans[0][0]
        count = 1
        for i, dist in enumerate(distances):
            if dist > threshold and count >= min_sentences:
                spans.append((cur_start, sentence_spans[i][1]))
                cur_start = sentence_spans[i + 1][0]
                count = 1
            else:
                count += 1
        spans.append((cur_start, sentence_spans[-1][1]))
        return self._make_chunks(spans, text)
