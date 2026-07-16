import re

from app.core.vectorstores.base import StoredChunk, VectorStore

_RRF_K = 60


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def retrieve_hybrid(
    query_vec: list[float], k: int, store: VectorStore, query_text: str = "", **_
) -> list[StoredChunk]:
    """BM25 lexical + semantic ranked lists fused with Reciprocal Rank Fusion.
    Each result's metadata is annotated with its rank in both lists."""
    from rank_bm25 import BM25Okapi

    all_chunks = store.get_all()
    if not all_chunks:
        return []
    fetch_k = max(k * 4, 20)

    bm25 = BM25Okapi([_tokenize(c.text) for c in all_chunks])
    bm25_scores = bm25.get_scores(_tokenize(query_text))
    bm25_ranked = sorted(range(len(all_chunks)), key=lambda i: -bm25_scores[i])[:fetch_k]
    bm25_rank = {all_chunks[idx].id: rank for rank, idx in enumerate(bm25_ranked)}

    semantic = store.search(query_vec, fetch_k)
    semantic_rank = {c.id: rank for rank, c in enumerate(semantic)}
    semantic_score = {c.id: c.score for c in semantic}

    by_id = {c.id: c for c in all_chunks}
    fused: list[tuple[float, StoredChunk]] = []
    for cid in set(bm25_rank) | set(semantic_rank):
        score = 0.0
        if cid in bm25_rank:
            score += 1.0 / (_RRF_K + bm25_rank[cid] + 1)
        if cid in semantic_rank:
            score += 1.0 / (_RRF_K + semantic_rank[cid] + 1)
        chunk = by_id[cid]
        chunk.metadata = {
            **chunk.metadata,
            "bm25_rank": bm25_rank.get(cid),
            "semantic_rank": semantic_rank.get(cid),
            "semantic_score": semantic_score.get(cid),
        }
        chunk.score = score
        fused.append((score, chunk))

    fused.sort(key=lambda pair: -pair[0])
    return [chunk for _, chunk in fused[:k]]


def get_retriever(kind: str):
    from app.core.retrievers.mmr import retrieve_mmr
    from app.core.retrievers.similarity import retrieve_similarity

    registry = {"similarity": retrieve_similarity, "mmr": retrieve_mmr, "hybrid": retrieve_hybrid}
    if kind not in registry:
        raise ValueError(f"Unknown retriever: {kind}. Options: {list(registry)}")
    return registry[kind]
