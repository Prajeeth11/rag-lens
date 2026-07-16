import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.core.chunkers.base import get_chunker
from app.core.embedders.base import get_embedder
from app.core.retrievers.hybrid import get_retriever
from app.core.vectorstores.base import StoredChunk, get_vectorstore
from app.utils.file_parsers import parse_file
from app.utils.metrics import count_tokens

EmitFn = Callable[[dict], Awaitable[None]]


@dataclass
class PipelineResult:
    query: str
    chunks: list[dict] = field(default_factory=list)
    answer: str | None = None
    steps: list[dict] = field(default_factory=list)
    total_ms: float = 0.0
    token_budget: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "query": self.query,
            "chunks": self.chunks,
            "answer": self.answer,
            "steps": self.steps,
            "total_ms": self.total_ms,
            "token_budget": self.token_budget,
        }


def build_index(pipeline_id: str, config: dict) -> int:
    """Parses, chunks, embeds and indexes the configured documents.
    Returns the number of chunks indexed. Blocking — run in a worker thread."""
    from app.db.database import SessionLocal
    from app.db.models import Document

    chunker = get_chunker(config["chunker"]["strategy"])
    chunk_params = dict(config["chunker"].get("params", {}))
    emb_cfg = config["embedder"]
    if config["chunker"]["strategy"] == "semantic":
        chunk_params.setdefault("embedder_provider", emb_cfg["provider"])
        chunk_params.setdefault("embedder_model", emb_cfg["model"])
    embedder = get_embedder(emb_cfg["provider"], emb_cfg["model"])
    store = get_vectorstore(config["vectorstore"], pipeline_id)

    db = SessionLocal()
    try:
        docs = db.query(Document).filter(Document.id.in_(config["document_ids"])).all()
    finally:
        db.close()
    if not docs:
        raise ValueError("No documents found for the configured document_ids")

    total = 0
    for doc in docs:
        parsed = parse_file(doc.path)
        # Track page boundaries so each chunk can report its source page.
        page_offsets = []
        offset = 0
        for page_text in parsed.pages:
            page_offsets.append(offset)
            offset += len(page_text) + 2  # pages were joined with "\n\n"

        chunks = chunker.chunk(parsed.text, chunk_params)
        if not chunks:
            continue
        vectors = embedder.embed([c.text for c in chunks])
        ids = [f"{doc.id}_{c.index}" for c in chunks]
        metadatas = []
        for c in chunks:
            page = 1
            for p, page_start in enumerate(page_offsets):
                if c.start_char >= page_start:
                    page = p + 1
            metadatas.append(
                {
                    "document_id": doc.id,
                    "document_name": doc.name,
                    "page": page,
                    "start_char": c.start_char,
                    "end_char": c.end_char,
                    "token_count": c.token_count,
                    "chunk_index": c.index,
                }
            )
        store.add(ids, [c.text for c in chunks], vectors, metadatas)
        total += len(chunks)
    return total


async def run_pipeline(pipeline_id: str, config: dict, query: str, emit: EmitFn | None = None) -> PipelineResult:
    """Runs embed -> retrieve -> (rerank) -> (generate), emitting a timed event
    after each step when a WebSocket emit function is provided."""
    result = PipelineResult(query=query)
    start_total = time.perf_counter()

    async def step(name: str, fn, detail_fn=None):
        start = time.perf_counter()
        out = await asyncio.to_thread(fn)
        ms = (time.perf_counter() - start) * 1000.0
        event = {"step": name, "latency_ms": round(ms, 2)}
        if detail_fn:
            event["detail"] = detail_fn(out)
        result.steps.append(event)
        if emit:
            await emit({"type": "step", **event})
        return out

    emb_cfg = config["embedder"]
    embedder = get_embedder(emb_cfg["provider"], emb_cfg["model"])
    query_vec = await step(
        "embed_query",
        lambda: embedder.embed_one(query),
        lambda v: {"model": emb_cfg["model"], "dimension": len(v)},
    )

    store = get_vectorstore(config["vectorstore"], pipeline_id)
    ret_cfg = config.get("retriever", {"type": "similarity", "k": 5})
    retriever = get_retriever(ret_cfg.get("type", "similarity"))
    k = int(ret_cfg.get("k", 5))
    kwargs = {"query_text": query, "lambda_mult": float(ret_cfg.get("lambda_mult", 0.5))}
    chunks: list[StoredChunk] = await step(
        "retrieve",
        lambda: retriever(query_vec, k, store, **kwargs),
        lambda cs: {"type": ret_cfg.get("type", "similarity"), "k": k, "returned": len(cs)},
    )

    rerank_cfg = config.get("reranker", {})
    if rerank_cfg.get("enabled"):
        from app.core.rerankers.cross_encoder import DEFAULT_MODEL, rerank

        model_name = rerank_cfg.get("model", DEFAULT_MODEL)
        top_n = rerank_cfg.get("top_n")
        chunks = await step(
            "rerank",
            lambda: rerank(query, chunks, model_name, top_n),
            lambda cs: {"model": model_name, "returned": len(cs)},
        )

    result.chunks = [c.to_dict() for c in chunks]

    llm_cfg = config.get("llm", {})
    if llm_cfg.get("enabled") and os.environ.get("OPENAI_API_KEY"):
        model = llm_cfg.get("model", "gpt-4o-mini")

        def generate() -> str:
            from openai import OpenAI

            context = "\n\n---\n\n".join(c.text for c in chunks)
            resp = OpenAI().chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "Answer using only the provided context. If the context is insufficient, say so.",
                    },
                    {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"},
                ],
            )
            return resp.choices[0].message.content or ""

        result.answer = await step("generate", generate, lambda a: {"model": model, "answer_tokens": count_tokens(a)})

    context_tokens = sum(c.metadata.get("token_count") or count_tokens(c.text) for c in chunks)
    result.token_budget = {
        "query_tokens": count_tokens(query),
        "context_tokens": context_tokens,
        "answer_tokens": count_tokens(result.answer) if result.answer else 0,
    }
    result.total_ms = round((time.perf_counter() - start_total) * 1000.0, 2)
    if emit:
        await emit({"type": "result", "result": result.to_dict()})
    return result
