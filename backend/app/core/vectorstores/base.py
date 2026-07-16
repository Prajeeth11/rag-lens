from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class StoredChunk:
    id: str
    text: str
    metadata: dict = field(default_factory=dict)
    score: float | None = None
    vector: list[float] | None = None

    def to_dict(self) -> dict:
        return {"id": self.id, "text": self.text, "metadata": self.metadata, "score": self.score}


class VectorStore(ABC):
    kind: str = "base"

    @abstractmethod
    def add(self, ids: list[str], texts: list[str], vectors: list[list[float]], metadatas: list[dict]) -> None: ...

    @abstractmethod
    def search(self, query_vec: list[float], k: int) -> list[StoredChunk]:
        """Top-k by cosine similarity; score is similarity in [-1, 1]."""

    @abstractmethod
    def get_all(self, include_vectors: bool = False) -> list[StoredChunk]: ...

    @abstractmethod
    def count(self) -> int: ...

    @abstractmethod
    def delete(self) -> None:
        """Removes all persisted data for this store."""


def get_vectorstore(kind: str, pipeline_id: str) -> VectorStore:
    if kind == "chroma":
        from app.core.vectorstores.chroma_store import ChromaStore

        return ChromaStore(pipeline_id)
    if kind == "faiss":
        from app.core.vectorstores.faiss_store import FaissStore

        return FaissStore(pipeline_id)
    raise ValueError(f"Unknown vector store: {kind}")
