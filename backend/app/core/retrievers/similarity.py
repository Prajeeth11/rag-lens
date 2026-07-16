from app.core.vectorstores.base import StoredChunk, VectorStore


def retrieve_similarity(query_vec: list[float], k: int, store: VectorStore, **_) -> list[StoredChunk]:
    return store.search(query_vec, k)
