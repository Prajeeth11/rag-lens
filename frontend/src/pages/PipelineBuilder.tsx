import { useEffect, useRef, useState } from 'react'
import { Code2, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useStore } from '../store/useStore'
import { Button, Card, ErrorNote, Input, Select, Slider, StatusBadge, Tabs, cn } from '../components/ui'

function pythonSnippet(p: { name: string; config: any }): string {
  const c = p.config
  const retriever = c.retriever?.type ?? 'similarity'
  const k = c.retriever?.k ?? 5
  const fetchK = Math.max(k * 4, 20)
  const lambdaMult = c.retriever?.lambda_mult ?? 0.5
  const isFaiss = c.vectorstore === 'faiss'
  // MMR and hybrid work over the in-memory vectors, so both stores share that path.
  const needsVectors = isFaiss || retriever !== 'similarity'
  const rerankEnabled = Boolean(c.reranker?.enabled)

  const imports = [
    `from sentence_transformers import SentenceTransformer${rerankEnabled ? ', CrossEncoder' : ''}`,
    ...(isFaiss ? ['import faiss'] : ['import chromadb']),
    ...(needsVectors ? ['import numpy as np'] : []),
    ...(retriever === 'hybrid' ? ['import re', 'from rank_bm25 import BM25Okapi'] : []),
  ]

  const chunking = [
    `# chunking: ${c.chunker.strategy} ${JSON.stringify(c.chunker.params)}`,
    `# produce \`chunks: list[str]\` from your documents with your chunker of choice`,
    `chunks: list[str] = [...]`,
  ]

  const store = isFaiss
    ? [
        `vectors = model.encode(chunks).astype(np.float32)`,
        `vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)`,
        `index = faiss.IndexFlatIP(vectors.shape[1])  # inner product on unit vectors = cosine`,
        `index.add(vectors)`,
      ]
    : [
        `client = chromadb.PersistentClient(path="./chroma")`,
        `collection = client.get_or_create_collection("rag_index", metadata={"hnsw:space": "cosine"})`,
        `collection.add(ids=[str(i) for i in range(len(chunks))], documents=chunks,`,
        `               embeddings=model.encode(chunks).tolist())`,
        ...(needsVectors
          ? [
              `vectors = model.encode(chunks).astype(np.float32)  # kept in memory for ${retriever}`,
              `vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)`,
            ]
          : []),
      ]

  let query: string[]
  if (retriever === 'mmr') {
    query = [
      `def query(text: str, k: int = ${k}, fetch_k: int = ${fetchK}, lambda_mult: float = ${lambdaMult}):`,
      `    """Maximal Marginal Relevance: relevance vs. redundancy trade-off."""`,
      `    q = model.encode([text])[0]`,
      `    q /= np.linalg.norm(q)`,
      `    sims = vectors @ q`,
      `    candidates = [int(i) for i in np.argsort(-sims)[:fetch_k]]`,
      `    selected: list[int] = []`,
      `    while candidates and len(selected) < k:`,
      `        if not selected:`,
      `            chosen = max(candidates, key=lambda i: sims[i])`,
      `        else:`,
      `            chosen = max(candidates, key=lambda i: lambda_mult * sims[i]`,
      `                         - (1 - lambda_mult) * max(float(vectors[i] @ vectors[j]) for j in selected))`,
      `        selected.append(chosen)`,
      `        candidates.remove(chosen)`,
      `    return [(chunks[i], float(sims[i])) for i in selected]`,
    ]
  } else if (retriever === 'hybrid') {
    query = [
      `def query(text: str, k: int = ${k}, fetch_k: int = ${fetchK}):`,
      `    """BM25 + semantic ranked lists fused with Reciprocal Rank Fusion."""`,
      `    tokenize = lambda s: re.findall(r"\\w+", s.lower())`,
      `    bm25 = BM25Okapi([tokenize(chunk) for chunk in chunks])`,
      `    bm25_rank = {int(i): r for r, i in enumerate(np.argsort(-bm25.get_scores(tokenize(text)))[:fetch_k])}`,
      `    q = model.encode([text])[0]`,
      `    q /= np.linalg.norm(q)`,
      `    sem_rank = {int(i): r for r, i in enumerate(np.argsort(-(vectors @ q))[:fetch_k])}`,
      `    rrf = lambda i: sum(1 / (60 + d[i] + 1) for d in (bm25_rank, sem_rank) if i in d)`,
      `    fused = sorted(set(bm25_rank) | set(sem_rank), key=rrf, reverse=True)`,
      `    return [(chunks[i], rrf(i)) for i in fused[:k]]`,
    ]
  } else if (isFaiss) {
    query = [
      `def query(text: str, k: int = ${k}):`,
      `    q = model.encode([text]).astype(np.float32)`,
      `    q /= np.linalg.norm(q, axis=1, keepdims=True)`,
      `    scores, idxs = index.search(q, k)`,
      `    return [(chunks[i], float(s)) for i, s in zip(idxs[0], scores[0])]`,
    ]
  } else {
    query = [
      `def query(text: str, k: int = ${k}):`,
      `    res = collection.query(query_embeddings=model.encode([text]).tolist(), n_results=k)`,
      `    return [(doc, 1 - dist) for doc, dist in zip(res["documents"][0], res["distances"][0])]`,
    ]
  }

  const rerank = rerankEnabled
    ? [
        ``,
        `reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")`,
        ``,
        `def rerank(text: str, results, top_n: int = ${c.reranker?.top_n ?? k}):`,
        `    scores = reranker.predict([(text, chunk) for chunk, _ in results])`,
        `    ranked = sorted(zip(results, scores), key=lambda pair: -pair[1])`,
        `    return [(chunk, float(s)) for (chunk, _), s in ranked[:top_n]]`,
        ``,
        `# usage: rerank(question, query(question))`,
      ]
    : []

  const llm = c.llm?.enabled
    ? [
        ``,
        `# answer generation (${c.llm.model ?? 'gpt-4o-mini'}) — requires OPENAI_API_KEY`,
        `from openai import OpenAI`,
        ``,
        `def answer(text: str) -> str:`,
        `    hits = ${rerankEnabled ? 'rerank(text, query(text))' : 'query(text)'}`,
        `    context = "\\n\\n---\\n\\n".join(chunk for chunk, _ in hits)`,
        `    resp = OpenAI().chat.completions.create(model="${c.llm.model ?? 'gpt-4o-mini'}", messages=[`,
        `        {"role": "system", "content": "Answer using only the provided context."},`,
        `        {"role": "user", "content": f"Context:\\n{context}\\n\\nQuestion: {text}"}])`,
        `    return resp.choices[0].message.content`,
      ]
    : []

  return [
    `# Reproduce pipeline "${p.name}" outside RAG-Lens`,
    ...imports,
    ``,
    `model = SentenceTransformer("${c.embedder.model}")`,
    ``,
    ...chunking,
    ...store,
    ``,
    ...query,
    ...rerank,
    ...llm,
    ``,
  ].join('\n')
}

export function PipelineBuilder() {
  const { documents, pipelines, loadDocuments, loadPipelines, refreshPipeline } = useStore()
  const [name, setName] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [strategy, setStrategy] = useState('recursive')
  const [chunkSize, setChunkSize] = useState(500)
  const [overlap, setOverlap] = useState(50)
  const [maxTokens, setMaxTokens] = useState(128)
  const [percentile, setPercentile] = useState(90)
  const [model, setModel] = useState('all-MiniLM-L6-v2')
  const [vectorstore, setVectorstore] = useState('chroma')
  const [retriever, setRetriever] = useState('similarity')
  const [k, setK] = useState(5)
  const [rerank, setRerank] = useState(false)
  const [llm, setLlm] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')
  const [snippet, setSnippet] = useState('')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    loadDocuments()
    loadPipelines()
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [loadDocuments, loadPipelines])

  useEffect(() => {
    const busy = pipelines.filter((p) => p.status === 'pending' || p.status === 'building')
    if (busy.length === 0) {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    if (!pollRef.current) {
      pollRef.current = window.setInterval(() => {
        busy.forEach((p) => refreshPipeline(p.id))
      }, 2500)
    }
  }, [pipelines, refreshPipeline])

  const create = async () => {
    setBuilding(true)
    setError('')
    try {
      const params =
        strategy === 'sentence'
          ? { max_tokens: maxTokens }
          : strategy === 'semantic'
            ? { breakpoint_percentile: percentile }
            : { chunk_size: chunkSize, overlap }
      await api.createPipeline({
        name: name || `pipeline-${pipelines.length + 1}`,
        document_ids: selectedDocs,
        chunker: { strategy, params },
        embedder: { provider: 'sentence_transformers', model },
        vectorstore,
        retriever: { type: retriever, k },
        reranker: { enabled: rerank, top_n: k },
        llm: { enabled: llm, model: 'gpt-4o-mini' },
      })
      setName('')
      await loadPipelines()
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pipeline Builder</h1>
      {error && <ErrorNote message={error} />}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card className="space-y-4">
          <Input placeholder="Pipeline name" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="text-xs text-ink-soft block mb-1">1 · Documents to index</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {documents.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    'flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer',
                    selectedDocs.includes(d.id) ? 'bg-accent/10' : 'bg-surface-overlay hover:bg-line',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(d.id)}
                    onChange={(e) =>
                      setSelectedDocs(
                        e.target.checked ? [...selectedDocs, d.id] : selectedDocs.filter((id) => id !== d.id),
                      )
                    }
                  />
                  {d.name}
                </label>
              ))}
              {documents.length === 0 && <p className="text-xs text-ink-faint">Upload documents first.</p>}
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-soft block mb-1">2 · Chunking</label>
            <Tabs
              options={[
                { value: 'fixed_size', label: 'Fixed' },
                { value: 'sentence', label: 'Sentence' },
                { value: 'recursive', label: 'Recursive' },
                { value: 'semantic', label: 'Semantic' },
              ]}
              value={strategy}
              onChange={setStrategy}
              className="grid grid-cols-2 sm:grid-cols-4 w-full"
            />
            <div className="mt-3 space-y-3">
              {(strategy === 'fixed_size' || strategy === 'recursive') && (
                <>
                  <Slider label="Chunk size" value={chunkSize} min={100} max={2000} step={50} onChange={setChunkSize} />
                  <Slider label="Overlap" value={overlap} min={0} max={400} step={10} onChange={setOverlap} />
                </>
              )}
              {strategy === 'sentence' && (
                <Slider label="Max tokens" value={maxTokens} min={32} max={512} step={16} onChange={setMaxTokens} />
              )}
              {strategy === 'semantic' && (
                <Slider label="Breakpoint percentile" value={percentile} min={50} max={99} onChange={setPercentile} />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-soft block mb-1">3 · Embedding model</label>
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (fast)</option>
                <option value="all-mpnet-base-v2">all-mpnet-base-v2 (better)</option>
                <option value="multi-qa-MiniLM-L6-cos-v1">multi-qa-MiniLM-L6 (QA-tuned)</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">4 · Vector store</label>
              <Select value={vectorstore} onChange={(e) => setVectorstore(e.target.value)}>
                <option value="chroma">ChromaDB</option>
                <option value="faiss">FAISS</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">5 · Retriever</label>
              <Select value={retriever} onChange={(e) => setRetriever(e.target.value)}>
                <option value="similarity">Cosine similarity</option>
                <option value="mmr">MMR (diverse)</option>
                <option value="hybrid">Hybrid BM25 + semantic</option>
              </Select>
            </div>
            <div className="pt-1">
              <Slider label="Top-k" value={k} min={1} max={20} onChange={setK} />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
              6 · Cross-encoder reranker
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={llm} onChange={(e) => setLlm(e.target.checked)} />
              7 · LLM answer (needs OPENAI_API_KEY)
            </label>
          </div>
          <Button onClick={create} disabled={selectedDocs.length === 0 || building} className="w-full">
            Build & Index
          </Button>
        </Card>
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-ink-soft">Saved pipelines</h2>
          {pipelines.map((p) => (
            <Card key={p.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-ink-faint">
                  {p.config.chunker.strategy} · {p.config.embedder.model} · {p.config.vectorstore} ·{' '}
                  {p.config.retriever.type} k={p.config.retriever.k}
                  {p.config.reranker?.enabled && ' · rerank'}
                  {p.chunk_count > 0 && ` · ${p.chunk_count} chunks`}
                </div>
                {p.status === 'failed' && <div className="text-xs text-red-600 mt-1">{p.status_detail}</div>}
              </div>
              <StatusBadge status={p.status} />
              <button
                title="Python snippet"
                className="text-ink-faint hover:text-accent-soft"
                onClick={() => setSnippet(pythonSnippet(p))}
              >
                <Code2 size={16} />
              </button>
              <button
                title="Delete"
                className="text-ink-faint hover:text-red-600"
                onClick={async () => {
                  await api.deletePipeline(p.id)
                  await loadPipelines()
                }}
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
          {pipelines.length === 0 && <p className="text-sm text-ink-faint">No pipelines yet.</p>}
        </div>
      </div>
      {snippet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSnippet('')}>
          <Card className="max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Runnable Python snippet</h3>
              <Button variant="ghost" onClick={() => setSnippet('')}>
                Close
              </Button>
            </div>
            <pre className="text-xs bg-surface-overlay rounded-lg p-4 overflow-auto whitespace-pre max-h-[70vh]">{snippet}</pre>
          </Card>
        </div>
      )}
    </div>
  )
}
