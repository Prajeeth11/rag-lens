import { useEffect, useRef, useState } from 'react'
import { Code2, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import { useStore } from '../store/useStore'
import { Button, Card, ErrorNote, Input, Select, Slider, StatusBadge, Tabs, cn } from '../components/ui'

function pythonSnippet(p: { name: string; config: any }): string {
  const c = p.config
  return `# Reproduce pipeline "${p.name}" outside RAG-Lens
from sentence_transformers import SentenceTransformer
import chromadb

model = SentenceTransformer("${c.embedder.model}")
client = chromadb.PersistentClient(path="./chroma")
collection = client.get_or_create_collection("my_index", metadata={"hnsw:space": "cosine"})

# chunking: ${c.chunker.strategy} ${JSON.stringify(c.chunker.params)}
# index your chunks:
# collection.add(ids=..., documents=..., embeddings=model.encode(chunks).tolist())

def query(text: str, k: int = ${c.retriever.k}):
    vec = model.encode([text]).tolist()
    return collection.query(query_embeddings=vec, n_results=k)  # retriever: ${c.retriever.type}
`
}

export function PipelineBuilder() {
  const { documents, pipelines, loadDocuments, loadPipelines, refreshPipeline } = useStore()
  const [name, setName] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [strategy, setStrategy] = useState('recursive')
  const [chunkSize, setChunkSize] = useState(500)
  const [overlap, setOverlap] = useState(50)
  const [maxTokens, setMaxTokens] = useState(128)
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
            ? { breakpoint_percentile: 90 }
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
            <label className="text-xs text-slate-400 block mb-1">1 · Documents to index</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {documents.map((d) => (
                <label
                  key={d.id}
                  className={cn(
                    'flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer',
                    selectedDocs.includes(d.id) ? 'bg-accent/15' : 'bg-surface-overlay hover:bg-line',
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
              {documents.length === 0 && <p className="text-xs text-slate-500">Upload documents first.</p>}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">2 · Chunking</label>
            <Tabs
              options={[
                { value: 'fixed_size', label: 'Fixed' },
                { value: 'sentence', label: 'Sentence' },
                { value: 'recursive', label: 'Recursive' },
                { value: 'semantic', label: 'Semantic' },
              ]}
              value={strategy}
              onChange={setStrategy}
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
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">3 · Embedding model</label>
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (fast)</option>
                <option value="all-mpnet-base-v2">all-mpnet-base-v2 (better)</option>
                <option value="multi-qa-MiniLM-L6-cos-v1">multi-qa-MiniLM-L6 (QA-tuned)</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">4 · Vector store</label>
              <Select value={vectorstore} onChange={(e) => setVectorstore(e.target.value)}>
                <option value="chroma">ChromaDB</option>
                <option value="faiss">FAISS</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">5 · Retriever</label>
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
          <h2 className="text-sm font-medium text-slate-400">Saved pipelines</h2>
          {pipelines.map((p) => (
            <Card key={p.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {p.config.chunker.strategy} · {p.config.embedder.model} · {p.config.vectorstore} ·{' '}
                  {p.config.retriever.type} k={p.config.retriever.k}
                  {p.config.reranker?.enabled && ' · rerank'}
                  {p.chunk_count > 0 && ` · ${p.chunk_count} chunks`}
                </div>
                {p.status === 'failed' && <div className="text-xs text-red-400 mt-1">{p.status_detail}</div>}
              </div>
              <StatusBadge status={p.status} />
              <button
                title="Python snippet"
                className="text-slate-500 hover:text-accent-soft"
                onClick={() => setSnippet(pythonSnippet(p))}
              >
                <Code2 size={16} />
              </button>
              <button
                title="Delete"
                className="text-slate-500 hover:text-red-400"
                onClick={async () => {
                  await api.deletePipeline(p.id)
                  await loadPipelines()
                }}
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
          {pipelines.length === 0 && <p className="text-sm text-slate-500">No pipelines yet.</p>}
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
            <pre className="text-xs bg-surface rounded-lg p-4 overflow-x-auto whitespace-pre">{snippet}</pre>
          </Card>
        </div>
      )}
    </div>
  )
}
