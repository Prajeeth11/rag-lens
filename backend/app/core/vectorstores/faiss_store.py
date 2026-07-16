import json

import numpy as np

from app.core.vectorstores.base import StoredChunk, VectorStore
from app.db.database import FAISS_DIR


class FaissStore(VectorStore):
    """Inner-product FAISS index over L2-normalized vectors (= cosine similarity),
    with a JSON sidecar mapping int id -> chunk text/metadata. Persisted to disk
    so pipelines survive backend restarts."""

    kind = "faiss"

    def __init__(self, pipeline_id: str):
        import faiss

        self._faiss = faiss
        self.index_path = FAISS_DIR / f"{pipeline_id}.faiss"
        self.sidecar_path = FAISS_DIR / f"{pipeline_id}.json"
        if self.index_path.exists() and self.sidecar_path.exists():
            self._index = faiss.read_index(str(self.index_path))
            self._sidecar: list[dict] = json.loads(self.sidecar_path.read_text())
        else:
            self._index = None
            self._sidecar = []

    @staticmethod
    def _normalize(vectors) -> np.ndarray:
        arr = np.asarray(vectors, dtype=np.float32)
        arr /= np.linalg.norm(arr, axis=1, keepdims=True) + 1e-10
        return arr

    def add(self, ids, texts, vectors, metadatas):
        arr = self._normalize(vectors)
        if self._index is None:
            self._index = self._faiss.IndexFlatIP(arr.shape[1])
        self._index.add(arr)
        for cid, text, vec, meta in zip(ids, texts, arr.tolist(), metadatas):
            self._sidecar.append({"id": cid, "text": text, "metadata": meta, "vector": vec})
        self._persist()

    def _persist(self):
        self._faiss.write_index(self._index, str(self.index_path))
        self.sidecar_path.write_text(json.dumps(self._sidecar))

    def search(self, query_vec, k):
        if self._index is None or self._index.ntotal == 0:
            return []
        q = self._normalize([query_vec])
        scores, idxs = self._index.search(q, min(k, self._index.ntotal))
        chunks = []
        for score, idx in zip(scores[0], idxs[0]):
            if idx < 0:
                continue
            entry = self._sidecar[int(idx)]
            chunks.append(StoredChunk(id=entry["id"], text=entry["text"], metadata=entry["metadata"], score=float(score)))
        return chunks

    def get_all(self, include_vectors=False):
        return [
            StoredChunk(
                id=e["id"], text=e["text"], metadata=e["metadata"], vector=e["vector"] if include_vectors else None
            )
            for e in self._sidecar
        ]

    def count(self):
        return len(self._sidecar)

    def delete(self):
        self.index_path.unlink(missing_ok=True)
        self.sidecar_path.unlink(missing_ok=True)
        self._index = None
        self._sidecar = []
