import { useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type ChunkPreview } from '../api/client'
import { useStore } from '../store/useStore'
import { ChunkGrid } from '../components/ChunkGrid'
import { Button, Card, ErrorNote, Select, Slider, Spinner, Tabs } from '../components/ui'

const STRATEGIES = [
  { value: 'fixed_size', label: 'Fixed' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'recursive', label: 'Recursive' },
  { value: 'semantic', label: 'Semantic' },
]

export function ChunkingLab() {
  const { documents, loadDocuments } = useStore()
  const [docId, setDocId] = useState('')
  const [strategy, setStrategy] = useState('recursive')
  const [chunkSize, setChunkSize] = useState(500)
  const [overlap, setOverlap] = useState(50)
  const [maxTokens, setMaxTokens] = useState(128)
  const [percentile, setPercentile] = useState(90)
  const [preview, setPreview] = useState<ChunkPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    if (!docId && documents.length > 0) setDocId(documents[0].id)
  }, [documents, docId])

  const run = async () => {
    if (!docId) return
    setLoading(true)
    setError('')
    try {
      const params: Record<string, number> =
        strategy === 'sentence'
          ? { max_tokens: maxTokens }
          : strategy === 'semantic'
            ? { breakpoint_percentile: percentile }
            : { chunk_size: chunkSize, overlap }
      setPreview(await api.previewChunks(docId, strategy, params))
    } catch (e: any) {
      setError(e.message ?? String(e))
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Chunking Lab</h1>
      <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        <Card className="space-y-4">
          <div>
            <label className="text-xs text-ink-soft block mb-1">Document</label>
            <Select value={docId} onChange={(e) => setDocId(e.target.value)}>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <Tabs options={STRATEGIES} value={strategy} onChange={setStrategy} className="grid grid-cols-2 w-full" />
          {(strategy === 'fixed_size' || strategy === 'recursive') && (
            <>
              <Slider label="Chunk size (chars)" value={chunkSize} min={100} max={2000} step={50} onChange={setChunkSize} />
              <Slider label="Overlap (chars)" value={overlap} min={0} max={400} step={10} onChange={setOverlap} />
            </>
          )}
          {strategy === 'sentence' && (
            <Slider label="Max tokens per chunk" value={maxTokens} min={32} max={512} step={16} onChange={setMaxTokens} />
          )}
          {strategy === 'semantic' && (
            <Slider label="Breakpoint percentile" value={percentile} min={50} max={99} onChange={setPercentile} />
          )}
          <Button onClick={run} disabled={!docId || loading} className="w-full">
            {loading ? <Spinner /> : 'Chunk it'}
          </Button>
          {strategy === 'semantic' && (
            <p className="text-xs text-ink-faint">Semantic chunking embeds every sentence — slower on large docs.</p>
          )}
        </Card>
        <div className="space-y-4">
          {error && <ErrorNote message={error} />}
          {preview && (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['Chunks', preview.stats.count],
                  ['Avg tokens', preview.stats.avg_tokens],
                  ['Min', preview.stats.min_tokens],
                  ['Max', preview.stats.max_tokens],
                ].map(([label, value]) => (
                  <Card key={label} className="text-center py-3">
                    <div className="text-xs text-ink-faint">{label}</div>
                    <div className="text-xl font-mono">{value}</div>
                  </Card>
                ))}
              </div>
              <Card>
                <h3 className="text-sm font-medium text-ink-soft mb-2">Chunk map — click a tile to inspect</h3>
                <ChunkGrid chunks={preview.chunks} />
              </Card>
              <Card>
                <h3 className="text-sm font-medium text-ink-soft mb-2">Token size distribution</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={preview.stats.histogram}>
                    <XAxis dataKey="range" tick={{ fill: '#857463', fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#857463', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #e4d6c3', borderRadius: 8 }}
                      labelStyle={{ color: '#3d3327' }}
                    />
                    <Bar dataKey="count" fill="#C05A2E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}
          {!preview && !error && (
            <p className="text-sm text-ink-faint py-12 text-center">
              Pick a document and strategy, then hit “Chunk it”.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
