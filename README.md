# RAG-Lens 🔍

**A debugging and visualization tool for RAG (Retrieval-Augmented Generation) pipelines.**

RAG is everywhere, but debugging it is a black box: why did the retriever pull *that* chunk? Would a different chunking strategy have found the right passage? Is the reranker actually helping? RAG-Lens makes the entire retrieval stack transparent — every chunk, every score, every step, side by side.

## Features

| Page | What it shows |
|---|---|
| **Documents** | Drag-and-drop PDF / DOCX / TXT / MD ingestion with parse stats |
| **Chunking Lab** | Paste a doc through 4 strategies (fixed, sentence, recursive, semantic) and see exactly which chunks get indexed — tile map, token histogram, per-chunk inspection |
| **Pipeline Builder** | Compose chunker + embedding model + vector store (Chroma / FAISS) + retriever (cosine / MMR / hybrid BM25+RRF) + optional cross-encoder reranker + optional LLM answer step |
| **Query Inspector** | Live WebSocket step stream (embed → retrieve → rerank → generate) with per-step latency, scored chunk cards with source attribution, token budget breakdown |
| **Compare Arena** | Same query on two pipelines side by side, unique chunks highlighted, score deltas |
| **Embedding Space** | UMAP / PCA projection of the indexed corpus, colored by source document; project a query into the space as a red star |
| **Eval Suite** | Upload a Q&A test set, score with RAGAS (faithfulness, answer relevancy, context precision / recall), radar chart + CSV export |
| **History** | Every past query with its full result trace |

## Architecture

```
┌───────────────┐   REST + WebSocket   ┌──────────────────────────────┐
│  React + Vite │ ◄──────────────────► │  FastAPI                     │
│  Zustand      │                      │  ┌────────────────────────┐  │
│  Recharts     │                      │  │ Orchestrator           │  │
│  Plotly       │                      │  │ embed→retrieve→rerank  │  │
└───────────────┘                      │  │      →generate         │  │
                                       │  └───┬────────────────────┘  │
                                       │      │                       │
                    ┌──────────────────┼──────┼──────────────────┐    │
                    │ chunkers         │ embedders │ retrievers  │    │
                    │ fixed/sentence/  │ MiniLM /  │ cosine/MMR/ │    │
                    │ recursive/       │ mpnet /   │ hybrid RRF  │    │
                    │ semantic         │ OpenAI    │ + reranker  │    │
                    └──────────────────┴───────────┴─────────────┘    │
                                       │  ChromaDB / FAISS + SQLite   │
                                       └──────────────────────────────┘
```

Everything runs locally — embeddings use `sentence-transformers` (no API key needed). An `OPENAI_API_KEY` is only required for the optional LLM answer step and RAGAS evaluation.

## Quick start

Requires Python 3.12 and Node 18+.

```bash
make install   # backend venv + pip install, frontend npm install
make dev       # backend on :8000, frontend on :5173
```

Open http://localhost:5173, upload a document, build a pipeline, query it.

## How to interpret the scores

- **Similarity score** (cosine, 0–1): how close the chunk's embedding is to the query's. Above ~0.6 is usually a strong match; below ~0.3 the retriever is guessing.
- **Hybrid (RRF) score**: reciprocal-rank fusion of the BM25 and semantic rankings — magnitudes are small (~0.03) and only relative order matters. The badges show each chunk's rank in both source lists.
- **Rerank score** (cross-encoder logit, unbounded): produced by a model that reads the query *and* chunk together, so it is far more accurate than embedding distance. Watch the `reranked 4 → 1` badges to see it correct the retriever.
- **RAGAS metrics** (0–1):
  - *Faithfulness* — is the generated answer supported by the retrieved context? Low = hallucination.
  - *Answer relevancy* — does the answer actually address the question?
  - *Context precision* — are the retrieved chunks relevant (little noise)?
  - *Context recall* — did retrieval find everything needed to answer? Low = chunking/embedding misses.

## Repo layout

```
backend/app/core/     chunkers, embedders, vectorstores, retrievers, rerankers, orchestrator
backend/app/api/      REST + WebSocket endpoints
frontend/src/pages/   one page per debugging view
frontend/src/api/     typed client + WS manager
```

## License

MIT
