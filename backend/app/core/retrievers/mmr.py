import numpy as np

from app.core.vectorstores.base import StoredChunk, VectorStore


def retrieve_mmr(
    query_vec: list[float], k: int, store: VectorStore, fetch_k: int | None = None, lambda_mult: float = 0.5, **_
) -> list[StoredChunk]:
    """Maximal Marginal Relevance: greedily picks chunks balancing query
    relevance against similarity to already-selected chunks."""
    fetch_k = fetch_k or max(k * 4, 20)
    candidates = store.search(query_vec, fetch_k)
    if len(candidates) <= k:
        return candidates

    all_chunks = {c.id: c for c in store.get_all(include_vectors=True)}
    vecs = []
    kept = []
    for c in candidates:
        full = all_chunks.get(c.id)
        if full is not None and full.vector is not None:
            vecs.append(full.vector)
            kept.append(c)
    candidates = kept
    mat = np.asarray(vecs, dtype=np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True) + 1e-10
    q = np.asarray(query_vec, dtype=np.float32)
    q /= np.linalg.norm(q) + 1e-10

    query_sim = mat @ q
    selected: list[int] = []
    remaining = list(range(len(candidates)))
    while remaining and len(selected) < k:
        if not selected:
            best = int(np.argmax(query_sim[remaining]))
            chosen = remaining[best]
        else:
            sel_mat = mat[selected]
            mmr_scores = []
            for idx in remaining:
                redundancy = float(np.max(sel_mat @ mat[idx]))
                mmr_scores.append(lambda_mult * float(query_sim[idx]) - (1 - lambda_mult) * redundancy)
            chosen = remaining[int(np.argmax(mmr_scores))]
        selected.append(chosen)
        remaining.remove(chosen)

    out = []
    for idx in selected:
        c = candidates[idx]
        c.score = float(query_sim[idx])
        out.append(c)
    return out
