import os

from app.core.embedders.base import Embedder

_DIMENSIONS = {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072, "text-embedding-ada-002": 1536}


class OpenAIEmbedder(Embedder):
    provider = "openai"

    def __init__(self, model_name: str = "text-embedding-3-small"):
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is not set; use the sentence_transformers provider or export a key.")
        from openai import OpenAI

        self.model_name = model_name
        self._client = OpenAI()
        self.dimension = _DIMENSIONS.get(model_name, 1536)

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 256):
            batch = [t.replace("\n", " ") or " " for t in texts[i : i + 256]]
            resp = self._client.embeddings.create(model=self.model_name, input=batch)
            out.extend(item.embedding for item in resp.data)
        return out
