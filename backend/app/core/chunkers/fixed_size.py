from app.core.chunkers.base import Chunk, Chunker


class FixedSizeChunker(Chunker):
    """Sliding character window with overlap."""

    name = "fixed_size"

    def chunk(self, text: str, params: dict) -> list[Chunk]:
        size = int(params.get("chunk_size", 500))
        overlap = int(params.get("overlap", 50))
        if size <= 0:
            raise ValueError("chunk_size must be > 0")
        overlap = min(overlap, size - 1) if size > 1 else 0

        spans: list[tuple[int, int]] = []
        start = 0
        step = size - overlap
        while start < len(text):
            end = min(start + size, len(text))
            spans.append((start, end))
            if end == len(text):
                break
            start += step
        return self._make_chunks(spans, text)
