# RAG-Lens User Guide

This guide explains every feature of RAG-Lens in detail — what it does, how to use it, and what is happening under the hood. If you just want to get running, start with [Getting started](#getting-started) and the [5-minute walkthrough](#a-5-minute-walkthrough), then come back to the feature deep-dives when you need them.

## Table of contents

1. [What RAG-Lens is](#what-rag-lens-is)
2. [Getting started](#getting-started)
3. [A 5-minute walkthrough](#a-5-minute-walkthrough)
4. [Feature deep-dives](#feature-deep-dives)
   - [Documents](#1-documents)
   - [Chunking Lab](#2-chunking-lab)
   - [Pipeline Builder](#3-pipeline-builder)
   - [Query Inspector](#4-query-inspector)
   - [Compare Arena](#5-compare-arena)
   - [Embedding Space](#6-embedding-space)
   - [Eval Suite](#7-eval-suite)
   - [History](#8-history)
5. [Concepts & score interpretation](#concepts--score-interpretation)
6. [API reference](#api-reference)
7. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## What RAG-Lens is

A **RAG (Retrieval-Augmented Generation) pipeline** answers questions over your own documents in five stages: documents are split into **chunks**, each chunk is turned into a vector by an **embedding model**, the vectors are stored in a **vector index**, a **retriever** finds the chunks most similar to a query, and (optionally) an **LLM generates an answer** grounded in those chunks.

Every one of those stages has knobs — chunk size, overlap, embedding model, retrieval algorithm, reranking — and each knob changes what the system retrieves. In most RAG frameworks you only see the final answer, so when retrieval fails you're guessing. RAG-Lens makes every stage observable: you see the exact chunks that were indexed, the exact scores the retriever assigned, how a reranker reordered them, how long each step took, and how two differently-configured pipelines behave on the same question.

## Getting started

**Prerequisites:** Python 3.12 and Node 18+.

```bash
git clone https://github.com/Prajeeth11/rag-lens
cd rag-lens
make install   # creates backend/.venv and installs Python + npm dependencies
make dev       # starts backend on http://localhost:8000 and frontend on http://localhost:5173
```

Open **http://localhost:5173**. Press `Ctrl-C` in the terminal to stop both servers.

**What runs locally vs. what needs an API key:**

| Capability | Requirement |
|---|---|
| Upload, chunking, indexing, embeddings, retrieval, reranking, UMAP, compare, history | Fully local — no API key, no internet after first model download |
| "LLM answer" step in a pipeline | `OPENAI_API_KEY` exported before `make dev` |
| Eval Suite (RAGAS) | `OPENAI_API_KEY` exported before `make dev` |

**First-use downloads** (each happens once, then is cached):

- The default embedding model `all-MiniLM-L6-v2` (~90 MB) downloads the first time you build a pipeline.
- The cross-encoder reranker (~80 MB) downloads on the first query against a pipeline with reranking enabled — expect that first query to take several extra seconds.
- The NLTK sentence tokenizer downloads the first time you use sentence or semantic chunking.

All persistent data (uploads, SQLite database, Chroma/FAISS indexes) lives in `backend/data/`. `make clean` deletes it for a fresh start.

## A 5-minute walkthrough

1. **Upload** — go to **Documents**, drag in any PDF, DOCX, TXT, or Markdown file. You'll see its page count and character count once parsed.
2. **Preview chunks** — go to **Chunking Lab**, select the document, keep the *Recursive* strategy, set chunk size to 400, and click **Chunk it**. Click any tile to read that chunk's exact text. Switch to *Sentence* and notice the chunk count and histogram change.
3. **Build a pipeline** — go to **Pipeline Builder**. Name it `baseline`, tick your document, keep the defaults (recursive chunking, `all-MiniLM-L6-v2`, ChromaDB, cosine similarity, k=5), and click **Build & Index**. Watch the status go `pending → building → ready`.
4. **Query it** — go to **Query Inspector**, type a question your document can answer, press Enter. Watch the steps stream in with latencies, then read the retrieved chunks and their scores.
5. **Compare** — build a second pipeline that differs in exactly one way (e.g. *Hybrid BM25 + semantic* retrieval, or a chunk size of 1200). In **Compare Arena**, run the same question against both and look at which chunks are marked `unique`.

---

## Feature deep-dives

### 1. Documents

**What it's for:** getting source material into RAG-Lens and managing it.

**How to use it:** drag files onto the dashed drop zone (or click it to browse). Supported formats: **PDF** (parsed page-by-page with PyMuPDF), **DOCX** (paragraphs via python-docx), **TXT** and **MD** (read as plain text). Multiple files can be dropped at once. The trash icon deletes a document and its stored file.

**How to read the output:** each row shows the file type, size, upload time, page count, and total character count. If a file can't be parsed (e.g. a corrupt PDF), the upload is rejected with an error message and nothing is stored.

**Under the hood:** `POST /documents/upload` stores the raw file in `backend/data/uploads/`, parses it immediately to validate it, and records metadata in SQLite. The full text is re-parsed on demand when you chunk or index — the source file is always the ground truth.

> **Note:** deleting a document does not delete pipelines already built from it — their indexes keep the chunks that were extracted at build time.

### 2. Chunking Lab

**What it's for:** experimenting with chunking strategies *before* committing to one. Chunking is the highest-leverage, least-visible decision in a RAG system: chunks that are too small lose context, chunks that are too large dilute the embedding. This page shows exactly what each strategy produces — nothing here is indexed or saved.

**How to use it:** pick a document, pick a strategy tab, adjust the sliders, click **Chunk it**.

**The four strategies:**

| Strategy | How it splits | Parameters | Use when |
|---|---|---|---|
| **Fixed** | A sliding character window; each chunk starts `chunk size − overlap` characters after the previous one | chunk size (100–2000 chars, default 500) · overlap (0–400, default 50) | You want perfectly predictable chunk sizes; fine for homogeneous text |
| **Sentence** | Splits into sentences (NLTK), then packs whole sentences into a chunk until the token budget is hit | max tokens per chunk (32–512, default 128) | You never want a sentence cut in half; good for prose |
| **Recursive** | Tries to split on paragraph breaks first, then newlines, then sentence ends, then words — only recursing to a finer separator when a piece is still too big; merges small pieces back up with overlap | chunk size (default 500) · overlap (default 50) | The best general-purpose default; respects document structure |
| **Semantic** | Embeds every sentence, measures cosine distance between adjacent sentences, and starts a new chunk wherever the distance spikes above a percentile threshold | breakpoint percentile (50–99, default 90) | You want chunks that follow topic shifts, not character counts; slower (embeds every sentence) |

A **higher breakpoint percentile** means fewer, larger chunks (only the sharpest topic changes cause a split); a lower percentile splits aggressively.

**How to read the output:**

- **Stats row** — chunk count, average / min / max tokens.
- **Chunk map** — one tile per chunk, in document order. Tile *width* scales with token count and *color* steps through a single clay ramp from light (small chunks) to dark (large chunks). Click a tile to see that chunk's full text, token count, and exact character range in the source document. Click again to close.
- **Token size distribution** — a histogram of chunk sizes. A tight histogram means uniform chunks; a long tail means some chunks are much bigger than others (common with fixed-size on documents with tables or headings).

**Under the hood:** `POST /documents/{id}/chunk` runs the chosen chunker on the parsed text and returns chunks with `start_char`/`end_char` offsets — the same chunker code the Pipeline Builder uses at index time, so what you preview is exactly what would be indexed.

### 3. Pipeline Builder

**What it's for:** composing a complete, named RAG configuration and building its search index. A *pipeline* in RAG-Lens is the unit you query, compare, project, and evaluate.

**The seven configuration sections:**

1. **Documents to index** — tick one or more uploaded documents.
2. **Chunking** — same four strategies and parameters as the Chunking Lab.
3. **Embedding model** — `all-MiniLM-L6-v2` (384-dim, fastest), `all-mpnet-base-v2` (768-dim, higher quality, ~3× slower), or `multi-qa-MiniLM-L6-cos-v1` (tuned specifically for question-answering retrieval). All run locally.
4. **Vector store** — **ChromaDB** (persistent collection per pipeline) or **FAISS** (flat inner-product index with a JSON metadata sidecar, persisted to disk). Functionally equivalent here; having both lets you compare ergonomics and latency.
5. **Retriever** — *Cosine similarity* (plain top-k), *MMR* (diverse top-k), or *Hybrid BM25 + semantic* (keyword + vector fused). See [Concepts](#concepts--score-interpretation) for how each works. **Top-k** (1–20, default 5) is the number of chunks returned.
6. **Cross-encoder reranker** — if enabled, the retriever's candidates are re-scored by `cross-encoder/ms-marco-MiniLM-L-6-v2`, which reads the query and chunk *together* and is much more accurate than embedding distance. Adds ~50–300 ms per query after warm-up.
7. **LLM answer** — if enabled (and `OPENAI_API_KEY` is set), `gpt-4o-mini` writes an answer using only the retrieved chunks as context.

**Build & Index:** clicking the button saves the config and starts indexing in the background: every selected document is parsed → chunked → embedded → written to the vector store. The card in *Saved pipelines* shows the live status:

- `pending` → queued
- `building` → indexing in progress (the page polls every 2.5 s)
- `ready` → queryable; the card shows the final chunk count
- `failed` → the error message is displayed on the card

**Other controls:** the `</>` icon opens a modal with a **runnable Python snippet** reproducing the pipeline's configuration outside RAG-Lens (model name, Chroma collection setup, retrieval call) — useful for graduating an experiment into your own codebase. The trash icon deletes the pipeline, its index, and its query history.

**Under the hood:** `POST /pipelines` stores the config as JSON and runs the index build as an async background task; each chunk is stored with its source document, page number, character range, and token count as metadata.

### 4. Query Inspector

**What it's for:** running a single query and seeing *everything* the pipeline did with it.

**How to use it:** pick a `ready` pipeline, type a question, press Enter or click **Run**.

**The step stream (right panel):** the frontend opens a WebSocket, and each pipeline stage appears the moment it finishes, with its latency:

- **Embed query** — the query is embedded with the pipeline's model (shows dimension).
- **Retrieve** — the retriever fetches top-k chunks (shows retriever type and count).
- **Rerank** — only if enabled; cross-encoder re-scores and reorders.
- **Generate** — only if an LLM is configured and a key is set.

Slow first query? That's model loading — see [Troubleshooting](#troubleshooting--faq). Subsequent queries show true latencies, so this panel is where you learn e.g. that reranking costs 80 ms while retrieval costs 10 ms.

**The chunk cards (left panel):** one card per retrieved chunk, in final rank order. Badges on each card:

| Badge | Meaning |
|---|---|
| `rank N` | Final position in the results |
| `score …` / `rrf …` / `rerank …` | The score from the *last* scoring stage, labeled by type: `score` = cosine similarity (green ≥ 0.6, amber ≥ 0.3, red below), `rerank` = cross-encoder logit (green ≥ 2, amber −2 to 2, red below), `rrf` = fusion score shown in a neutral color because only its relative order is meaningful (see [Concepts](#concepts--score-interpretation)) |
| `reranked 4 → 1` | The reranker moved this chunk from retrieval rank 4 to final rank 1 (green = promoted, red = demoted). This is the fastest way to see whether reranking is earning its latency |
| `bm25 #2` / `semantic #5` | Hybrid retrieval only: the chunk's rank in the keyword list and the vector list before fusion. A chunk with `bm25 #1` but `semantic #14` was found by exact keywords, not meaning |
| footer | Source document, page, exact character range, token count |

**Token budget (right panel):** a donut chart of query vs. context vs. answer tokens — a proxy for what a real LLM call would cost with this configuration. Total wall-clock time is shown above it.

**Under the hood:** the page uses `WS /ws/query/{pipeline_id}` for streaming; every run is also saved as an experiment (visible in [History](#8-history)).

### 5. Compare Arena

**What it's for:** answering "which configuration is better?" empirically. Retrieval quality differences are invisible until you look at the same query side by side.

**How to use it:** pick two different `ready` pipelines, type one query, click **Run both**. The same question runs through both pipelines concurrently.

**How to read the output:** two columns, one per pipeline, each showing its retrieved chunks exactly like the Query Inspector. Additionally:

- A chunk outlined and badged **`unique`** was retrieved by *this* pipeline but not the other (matched by source position, so the comparison works even when the two pipelines chunked the document differently).
- The header shows each pipeline's total latency and unique-chunk count.

**Designing a fair comparison:** change **one variable at a time** — same documents, same k. Good experiments:

- recursive 400-char chunks vs. recursive 1200-char chunks → how does granularity change what's found?
- cosine vs. hybrid on a query containing a rare exact term (a product code, a name) → watch BM25 rescue it
- reranker on vs. off → is the reordering worth the latency?
- MiniLM vs. mpnet embeddings → does the better model actually retrieve differently on *your* data?

**Under the hood:** `POST /compare` runs both pipelines with `asyncio.gather` and annotates chunk uniqueness by `(document, start_char, end_char)`.

### 6. Embedding Space

**What it's for:** seeing the geometry your retriever operates in. Retrieval is nearest-neighbor search in embedding space; this page projects that space to 2-D so you can inspect it.

**How to use it:** pick a pipeline (it needs at least 3 indexed chunks). The scatter renders automatically. Type a query and click **Project** to drop it into the same space.

**How to read the output:**

- Each **point is one indexed chunk**, colored by source document. Hover to read the chunk's first 100 characters.
- The **red star** is your query, projected into the same space. The chunks nearest the star are (approximately) what similarity retrieval returns.
- **UMAP vs. PCA:** UMAP preserves local neighborhoods — clusters are meaningful, but distances *between* clusters are not. PCA is a plain linear projection — globally faithful but usually less separated. If a structure only exists in one of them, trust it less.

**What to look for:**

- **Tight clusters per document** → your documents are topically distinct; retrieval across them should be clean.
- **Your query's star sitting far from every cluster** → vocabulary mismatch: the way you ask differs from the way the documents say it. Consider a QA-tuned embedding model or hybrid retrieval.
- **One giant undifferentiated blob** → chunks may be too small (not enough signal per chunk) or the document is genuinely homogeneous.

**Under the hood:** `GET /pipelines/{id}/embeddings?method=umap|pca` pulls every stored vector, fits the reducer, and (if a query is given) transforms the query vector with the *same fitted* reducer so its position is comparable.

### 7. Eval Suite

**What it's for:** systematic quality measurement. Eyeballing single queries doesn't tell you whether a pipeline is good — running a test set through RAGAS does.

> Requires `OPENAI_API_KEY` on the backend: RAGAS uses an LLM as the judge, and the pipeline must generate answers to be judged. Expect roughly **10–30 seconds and a few cents per question**.

**Test-set format:** a CSV with a header row, or a JSON array:

```csv
question,expected_answer
"Which planet has the strongest winds?","Neptune, with winds reaching 2100 km/h"
"What is the Great Red Spot?","A giant storm on Jupiter larger than Earth"
```

```json
[{ "question": "…", "expected_answer": "…" }]
```

**How to use it:** pick a pipeline, upload the file (the badge shows how many questions parsed), click **Run RAGAS**. Each question is run through the full pipeline — retrieval plus answer generation (generation is forced on for the eval even if the pipeline config has it off) — and RAGAS scores the results.

**The four metrics** (all 0–1, higher is better):

| Metric | Question it answers | A low score means | Fix by |
|---|---|---|---|
| **Faithfulness** | Is the answer supported by the retrieved context? | The LLM is hallucinating beyond its context | Retrieve better context; tighten the generation prompt |
| **Answer relevancy** | Does the answer address the question? | Evasive or off-topic answers | Usually a context problem in disguise — check retrieval first |
| **Context precision** | Are the retrieved chunks actually relevant? | Retrieval returns noise | Lower k, enable reranking, or improve chunking |
| **Context recall** | Was everything needed to answer actually retrieved? | Retrieval *misses* necessary information | Raise k, larger chunks/overlap, better embedding model, hybrid retrieval |

**How to read the output:** the table shows each question with its generated answer and four scores (color-coded); the right panel shows the aggregate averages as stat tiles and a radar chart. **Export CSV** downloads the per-question results. Runs are stored, so you can re-run after a config change and compare.

### 8. History

**What it's for:** every query you run (Inspector, Arena, or REST API) is recorded per pipeline — the latest 50 are shown. Use it to revisit what a pipeline returned before you changed something, or to demo without re-running.

**How to use it:** pick a pipeline; each row shows the query, total latency, chunk count, and timestamp. Click a row to expand the full stored result — generated answer (if any) and every chunk card with its scores, exactly as originally returned.

---

## Concepts & score interpretation

**Cosine similarity (score on `similarity` and the semantic side of hybrid):** the angle between the query vector and the chunk vector, in [-1, 1]. On sentence-transformer embeddings, **> 0.6** is usually a strong match, **0.3–0.6** is topical, **< 0.3** is the retriever guessing. Absolute values are model-dependent — compare within a pipeline, not across embedding models.

**MMR (Maximal Marginal Relevance):** plain top-k often returns five near-duplicates. MMR fetches a candidate pool (4×k) and greedily picks chunks by `λ · relevance − (1−λ) · similarity-to-already-picked`. At λ = 1 it's plain similarity; at λ = 0 it maximizes diversity. RAG-Lens uses λ = 0.5. The displayed score is still each chunk's query similarity.

**Hybrid retrieval + RRF:** two independent rankings are produced — **BM25** (keyword/lexical matching, great for names, codes, rare terms) and **vector similarity** (meaning, great for paraphrases) — then fused with **Reciprocal Rank Fusion**: each chunk scores `Σ 1/(60 + rank)` across the lists it appears in. RRF scores are tiny (~0.01–0.03) by construction; **only the relative order matters**. The `bm25 #` / `semantic #` badges show each list's contribution.

**Cross-encoder reranking:** embeddings compress a chunk to one vector *before* seeing your query (a bi-encoder). A cross-encoder reads the query and the chunk *together* through one transformer, which is far more accurate but too slow to run over a whole corpus — so it re-scores only the retriever's top-k. Scores are **unbounded logits**: positive ≈ relevant, negative ≈ not, magnitude = confidence. They are not comparable to cosine scores.

**Token counts** shown throughout are word-level approximations (roughly GPT-scale), meant for comparing configurations rather than exact billing math.

## API reference

Everything the UI does is a plain HTTP/WebSocket API — interactive OpenAPI docs are at **http://localhost:8000/docs**.

| Method | Path | Body / params | Returns |
|---|---|---|---|
| GET | `/health` | — | `{status: "ok"}` |
| POST | `/documents/upload` | multipart `file` | document metadata |
| GET | `/documents` | — | all documents |
| GET | `/documents/{id}` | — | one document |
| DELETE | `/documents/{id}` | — | `{deleted: id}` |
| POST | `/documents/{id}/chunk` | `{strategy, params}` | chunks + stats (preview only) |
| POST | `/pipelines` | name, document_ids, chunker, embedder, vectorstore, retriever, reranker, llm | pipeline (indexing starts in background) |
| GET | `/pipelines` | — | all pipelines with status |
| GET | `/pipelines/{id}` | — | one pipeline |
| DELETE | `/pipelines/{id}` | — | deletes pipeline + index + history |
| POST | `/pipelines/{id}/query` | `{query}` | full result: chunks, scores, steps, timings, token budget |
| WS | `/ws/query/{pipeline_id}` | send `{query}` | streams `{type:"step"}` events, then `{type:"result"}` |
| POST | `/compare` | `{pipeline_ids: [a, b], query}` | both results, chunks flagged `unique` |
| GET | `/pipelines/{id}/embeddings` | `?method=umap\|pca&query=…` | 2-D points + optional projected query point |
| POST | `/eval` | `{pipeline_id, qa_pairs}` | per-question + aggregate RAGAS scores |
| GET | `/eval/runs` | — | past eval runs |
| GET | `/pipelines/{id}/experiments` | — | last 50 queries for the pipeline |

Example — query a pipeline from the command line:

```bash
curl -X POST localhost:8000/pipelines/<id>/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "Which planet has the strongest winds?"}'
```

## Troubleshooting & FAQ

**The first pipeline build (or first reranked query) is very slow.**
Models download on first use — ~90 MB for the embedder, ~80 MB for the cross-encoder. Every use afterwards is fast and offline.

**A pipeline is stuck on `failed`.**
The error is shown on the pipeline card (e.g. an unparseable document or an empty selection). Fix the cause, delete the pipeline, and rebuild.

**Eval Suite returns "RAGAS evaluation needs OPENAI_API_KEY".**
Export the key in the same shell *before* starting the backend: `export OPENAI_API_KEY=sk-… && make dev`.

**"WebSocket connection failed" in the Query Inspector.**
The backend isn't running (or isn't on port 8000). Start it with `make dev` or `make backend`.

**Port 8000 or 5173 is already in use.**
Stop the conflicting process, or edit the port in `Makefile` / `backend/run.sh` (the frontend expects the backend on 8000 — it's set in `frontend/src/api/client.ts`).

**Where is my data? How do I reset?**
Everything lives in `backend/data/` (uploads, SQLite DB, Chroma + FAISS indexes). `make clean` wipes it all.

**Do my documents ever leave my machine?**
No — parsing, embedding, indexing, and retrieval are all local. Only the optional LLM-answer step and RAGAS evaluation send text (query + retrieved chunks) to OpenAI.
