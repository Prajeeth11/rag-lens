from abc import ABC, abstractmethod


class Embedder(ABC):
    provider: str = "base"
    model_name: str = ""
    dimension: int = 0

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]: ...

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]


_cache: dict[tuple[str, str], Embedder] = {}


def get_embedder(provider: str, model: str) -> Embedder:
    """Returns a cached embedder instance (models are expensive to load)."""
    key = (provider, model)
    if key not in _cache:
        if provider == "sentence_transformers":
            from app.core.embedders.st_embedder import STEmbedder

            _cache[key] = STEmbedder(model)
        elif provider == "openai":
            from app.core.embedders.openai_embedder import OpenAIEmbedder

            _cache[key] = OpenAIEmbedder(model)
        else:
            raise ValueError(f"Unknown embedder provider: {provider}")
    return _cache[key]
