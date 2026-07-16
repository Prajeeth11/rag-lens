from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass

from app.utils.metrics import count_tokens


@dataclass
class Chunk:
    text: str
    start_char: int
    end_char: int
    token_count: int
    index: int

    def to_dict(self) -> dict:
        return asdict(self)


class Chunker(ABC):
    name: str = "base"

    @abstractmethod
    def chunk(self, text: str, params: dict) -> list[Chunk]: ...

    @staticmethod
    def _make_chunks(spans: list[tuple[int, int]], text: str) -> list[Chunk]:
        chunks = []
        for i, (start, end) in enumerate(spans):
            piece = text[start:end]
            if not piece.strip():
                continue
            chunks.append(
                Chunk(text=piece, start_char=start, end_char=end, token_count=count_tokens(piece), index=len(chunks))
            )
        return chunks


def get_chunker(strategy: str) -> Chunker:
    from app.core.chunkers.fixed_size import FixedSizeChunker
    from app.core.chunkers.recursive import RecursiveChunker
    from app.core.chunkers.semantic import SemanticChunker
    from app.core.chunkers.sentence import SentenceChunker

    registry: dict[str, type[Chunker]] = {
        "fixed_size": FixedSizeChunker,
        "sentence": SentenceChunker,
        "recursive": RecursiveChunker,
        "semantic": SemanticChunker,
    }
    if strategy not in registry:
        raise ValueError(f"Unknown chunking strategy: {strategy}. Options: {list(registry)}")
    return registry[strategy]()
