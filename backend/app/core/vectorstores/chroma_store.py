from app.core.vectorstores.base import StoredChunk, VectorStore
from app.db.database import CHROMA_DIR

_client = None


def _get_client():
    global _client
    if _client is None:
        import chromadb

        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


class ChromaStore(VectorStore):
    kind = "chroma"

    def __init__(self, pipeline_id: str):
        self.collection_name = f"pipeline_{pipeline_id}"
        self._collection = _get_client().get_or_create_collection(
            name=self.collection_name, metadata={"hnsw:space": "cosine"}
        )

    def add(self, ids, texts, vectors, metadatas):
        for i in range(0, len(ids), 512):
            self._collection.add(
                ids=ids[i : i + 512],
                documents=texts[i : i + 512],
                embeddings=vectors[i : i + 512],
                metadatas=metadatas[i : i + 512],
            )

    def search(self, query_vec, k):
        k = min(k, max(self.count(), 1))
        res = self._collection.query(query_embeddings=[query_vec], n_results=k)
        chunks = []
        for cid, text, meta, dist in zip(
            res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0]
        ):
            chunks.append(StoredChunk(id=cid, text=text, metadata=meta or {}, score=1.0 - dist))
        return chunks

    def get_all(self, include_vectors=False):
        include = ["documents", "metadatas"] + (["embeddings"] if include_vectors else [])
        res = self._collection.get(include=include)
        chunks = []
        for i, cid in enumerate(res["ids"]):
            vec = None
            if include_vectors and res.get("embeddings") is not None:
                vec = list(res["embeddings"][i])
            chunks.append(
                StoredChunk(id=cid, text=res["documents"][i], metadata=res["metadatas"][i] or {}, vector=vec)
            )
        return chunks

    def count(self):
        return self._collection.count()

    def delete(self):
        _get_client().delete_collection(self.collection_name)
