from app.core.chunkers.base import Chunk, Chunker

SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


class RecursiveChunker(Chunker):
    """LangChain-style recursive character splitter: tries coarse separators
    first, recursing into finer ones only for pieces that exceed chunk_size."""

    name = "recursive"

    def chunk(self, text: str, params: dict) -> list[Chunk]:
        size = int(params.get("chunk_size", 500))
        overlap = int(params.get("overlap", 50))
        if size <= 0:
            raise ValueError("chunk_size must be > 0")

        pieces = self._split(text, 0, SEPARATORS, size)
        spans = self._merge(pieces, size, overlap)
        return self._make_chunks(spans, text)

    def _split(self, text: str, offset: int, separators: list[str], size: int) -> list[tuple[int, int]]:
        """Returns spans (absolute offsets) each no longer than size where possible."""
        if len(text) <= size:
            return [(offset, offset + len(text))] if text else []
        sep = separators[0]
        rest = separators[1:]
        if sep == "":
            return [(offset + i, offset + min(i + size, len(text))) for i in range(0, len(text), size)]
        parts = text.split(sep)
        spans: list[tuple[int, int]] = []
        pos = 0
        for i, part in enumerate(parts):
            keep_sep = sep if i < len(parts) - 1 else ""
            segment = part + keep_sep
            if len(segment) <= size:
                if segment:
                    spans.append((offset + pos, offset + pos + len(segment)))
            elif rest:
                spans.extend(self._split(segment, offset + pos, rest, size))
            else:
                spans.append((offset + pos, offset + pos + len(segment)))
            pos += len(segment)
        return spans

    @staticmethod
    def _merge(spans: list[tuple[int, int]], size: int, overlap: int) -> list[tuple[int, int]]:
        """Greedily merges adjacent small spans up to size, with char overlap between chunks."""
        merged: list[tuple[int, int]] = []
        cur: tuple[int, int] | None = None
        for start, end in spans:
            if cur is None:
                cur = (start, end)
            elif end - cur[0] <= size:
                cur = (cur[0], end)
            else:
                merged.append(cur)
                cur = (max(start - overlap, cur[0]), end)
        if cur is not None:
            merged.append(cur)
        return merged
