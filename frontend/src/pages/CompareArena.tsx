import { useEffect, useState } from 'react'
import { api, type CompareResponse } from '../api/client'
import { useStore } from '../store/useStore'
import { RetrievalResult } from '../components/RetrievalResult'
import { Badge, Button, Card, ErrorNote, Input, Select, Spinner } from '../components/ui'

export function CompareArena() {
  const { pipelines, loadPipelines } = useStore()
  const ready = pipelines.filter((p) => p.status === 'ready')
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPipelines()
  }, [loadPipelines])

  useEffect(() => {
    if (!idA && ready.length > 0) setIdA(ready[0].id)
    if (!idB && ready.length > 1) setIdB(ready[1].id)
  }, [ready, idA, idB])

  const run = async () => {
    if (!idA || !idB || !query.trim()) return
    setLoading(true)
    setError('')
    try {
      setData(await api.compare([idA, idB], query))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Compare Arena</h1>
      <Card className="flex gap-3 items-center flex-wrap">
        <Select className="w-56" value={idA} onChange={(e) => setIdA(e.target.value)}>
          {ready.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <span className="text-ink-faint text-sm">vs</span>
        <Select className="w-56" value={idB} onChange={(e) => setIdB(e.target.value)}>
          {ready.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          className="flex-1 min-w-64"
          placeholder="Shared query…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button onClick={run} disabled={loading || !idA || !idB || idA === idB || !query.trim()}>
          {loading ? <Spinner /> : 'Run both'}
        </Button>
      </Card>
      {idA === idB && idA && <p className="text-xs text-amber-700">Pick two different pipelines.</p>}
      {ready.length < 2 && <p className="text-sm text-ink-faint">You need at least two ready pipelines to compare.</p>}
      {error && <ErrorNote message={error} />}
      {data && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          {data.results.map((side) => (
            <div key={side.pipeline_id} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{side.pipeline_name}</h2>
                <Badge>{side.result.total_ms.toFixed(0)} ms</Badge>
                <Badge tone="accent">{side.result.chunks.filter((c) => c.unique).length} unique</Badge>
              </div>
              {side.result.chunks.map((chunk, i) => (
                <RetrievalResult key={chunk.id + i} chunk={chunk} rank={i} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
