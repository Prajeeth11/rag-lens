from app.core.vectorstores.base import StoredChunk

_cache: dict[str, object] = {}

DEFAULT_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


def _get_model(model_name: str):
    if model_name not in _cache:
        from sentence_transformers import CrossEncoder

        _cache[model_name] = CrossEncoder(model_name)
    return _cache[model_name]


def rerank(query: str, chunks: list[StoredChunk], model_name: str = DEFAULT_MODEL, top_n: int | None = None) -> list[StoredChunk]:
    """Re-scores (query, chunk) pairs with a cross-encoder. Each chunk's metadata
    records its original rank and score so the UI can show before/after."""
    if not chunks:
        return []
    model = _get_model(model_name)
    scores = model.predict([(query, c.text) for c in chunks])
    for rank, (chunk, score) in enumerate(zip(chunks, scores)):
        chunk.metadata = {**chunk.metadata, "original_rank": rank, "original_score": chunk.score}
        chunk.score = float(score)
    reranked = sorted(chunks, key=lambda c: -(c.score or 0.0))
    return reranked[: top_n or len(reranked)]
