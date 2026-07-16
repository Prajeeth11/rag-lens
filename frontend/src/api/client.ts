const BASE = 'http://localhost:8000'

export interface Doc {
  id: string
  name: string
  file_type: string
  size_bytes: number
  num_pages: number
  char_count: number
  created_at: string
}

export interface Chunk {
  text: string
  start_char: number
  end_char: number
  token_count: number
  index: number
}

export interface ChunkStats {
  count: number
  avg_tokens: number
  min_tokens: number
  max_tokens: number
  total_chars: number
  histogram: { range: string; count: number }[]
}

export interface ChunkPreview {
  document_id: string
  strategy: string
  chunks: Chunk[]
  stats: ChunkStats
}

export interface Pipeline {
  id: string
  name: string
  config: {
    document_ids: string[]
    chunker: { strategy: string; params: Record<string, number> }
    embedder: { provider: string; model: string }
    vectorstore: string
    retriever: { type: string; k: number; lambda_mult?: number }
    reranker: { enabled: boolean; top_n?: number }
    llm: { enabled: boolean; model?: string }
  }
  status: 'pending' | 'building' | 'ready' | 'failed'
  status_detail: string
  chunk_count: number
  created_at: string
}

export interface RetrievedChunk {
  id: string
  text: string
  score: number | null
  metadata: Record<string, any>
  unique?: boolean
}

export interface StepEvent {
  step: string
  latency_ms: number
  detail?: Record<string, any>
}

export interface QueryResult {
  query: string
  chunks: RetrievedChunk[]
  answer: string | null
  steps: StepEvent[]
  total_ms: number
  token_budget: { query_tokens: number; context_tokens: number; answer_tokens: number }
}

export interface CompareResponse {
  query: string
  results: { pipeline_id: string; pipeline_name: string; result: QueryResult }[]
}

export interface EmbeddingPoint {
  id: string
  x: number
  y: number
  document_id: string
  document_name: string
  preview: string
  token_count: number | null
}

export interface EmbeddingsResponse {
  method: string
  points: EmbeddingPoint[]
  query_point: { x: number; y: number; label: string } | null
}

export interface EvalResponse {
  pipeline_id: string
  per_question: {
    question: string
    answer: string
    ground_truth: string
    faithfulness: number | null
    answer_relevancy: number | null
    context_precision: number | null
    context_recall: number | null
  }[]
  aggregates: Record<string, number | null>
}

export interface Experiment {
  id: string
  pipeline_id: string
  query: string
  result: QueryResult
  latency_ms: number
  created_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail ?? detail
    } catch {
      /* not json */
    }
    throw new Error(detail)
  }
  return res.json()
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const api = {
  listDocuments: () => request<Doc[]>('/documents'),
  uploadDocument: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Doc>('/documents/upload', { method: 'POST', body: form })
  },
  deleteDocument: (id: string) => request<{ deleted: string }>(`/documents/${id}`, { method: 'DELETE' }),
  previewChunks: (docId: string, strategy: string, params: Record<string, number>) =>
    post<ChunkPreview>(`/documents/${docId}/chunk`, { strategy, params }),
  listPipelines: () => request<Pipeline[]>('/pipelines'),
  getPipeline: (id: string) => request<Pipeline>(`/pipelines/${id}`),
  createPipeline: (body: unknown) => post<Pipeline>('/pipelines', body),
  deletePipeline: (id: string) => request<{ deleted: string }>(`/pipelines/${id}`, { method: 'DELETE' }),
  queryPipeline: (id: string, query: string) => post<QueryResult>(`/pipelines/${id}/query`, { query }),
  compare: (pipelineIds: [string, string], query: string) =>
    post<CompareResponse>('/compare', { pipeline_ids: pipelineIds, query }),
  embeddings: (id: string, method: string, query?: string) => {
    const params = new URLSearchParams({ method })
    if (query) params.set('query', query)
    return request<EmbeddingsResponse>(`/pipelines/${id}/embeddings?${params}`)
  },
  runEval: (pipelineId: string, qaPairs: { question: string; expected_answer: string }[]) =>
    post<EvalResponse>('/eval', { pipeline_id: pipelineId, qa_pairs: qaPairs }),
  listExperiments: (pipelineId: string) => request<Experiment[]>(`/pipelines/${pipelineId}/experiments`),
}

export type QueryWsEvent =
  | ({ type: 'step' } & StepEvent)
  | { type: 'result'; result: QueryResult }
  | { type: 'error'; message: string }

export function openQuerySocket(pipelineId: string, onEvent: (e: QueryWsEvent) => void): WebSocket {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/query/${pipelineId}`)
  ws.onmessage = (msg) => onEvent(JSON.parse(msg.data))
  return ws
}
