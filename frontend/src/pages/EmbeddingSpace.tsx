import { useEffect, useState } from 'react'
import { api, type EmbeddingsResponse } from '../api/client'
import { useStore } from '../store/useStore'
import { EmbeddingPlot } from '../components/EmbeddingPlot'
import { Button, Card, ErrorNote, Input, Select, Spinner, Tabs } from '../components/ui'

export function EmbeddingSpace() {
  const { pipelines, loadPipelines } = useStore()
  const ready = pipelines.filter((p) => p.status === 'ready')
  const [pipelineId, setPipelineId] = useState('')
  const [method, setMethod] = useState('umap')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<EmbeddingsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPipelines()
  }, [loadPipelines])

  useEffect(() => {
    if (!pipelineId && ready.length > 0) setPipelineId(ready[0].id)
  }, [ready, pipelineId])

  const load = async (withQuery?: string) => {
    if (!pipelineId) return
    setLoading(true)
    setError('')
    try {
      setData(await api.embeddings(pipelineId, method, withQuery))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (pipelineId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, method])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Embedding Space</h1>
      <Card className="flex gap-3 items-center flex-wrap">
        <Select className="w-64" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
          {ready.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Tabs
          options={[
            { value: 'umap', label: 'UMAP' },
            { value: 'pca', label: 'PCA' },
          ]}
          value={method}
          onChange={setMethod}
        />
        <Input
          className="flex-1 min-w-64"
          placeholder="Project a query into the space (red star)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(query)}
        />
        <Button onClick={() => load(query)} disabled={loading || !pipelineId}>
          {loading ? <Spinner /> : 'Project'}
        </Button>
      </Card>
      {error && <ErrorNote message={error} />}
      {ready.length === 0 && <p className="text-sm text-slate-500">Build a pipeline first.</p>}
      {data && (
        <Card>
          <EmbeddingPlot data={data} />
          <p className="text-xs text-slate-500 mt-1">
            {data.points.length} chunks · colored by source document · hover for a preview
          </p>
        </Card>
      )}
    </div>
  )
}
