import { useEffect, useState } from 'react'
import { api, type Experiment } from '../api/client'
import { useStore } from '../store/useStore'
import { RetrievalResult } from '../components/RetrievalResult'
import { Badge, Card, Select } from '../components/ui'

export function History() {
  const { pipelines, loadPipelines } = useStore()
  const [pipelineId, setPipelineId] = useState('')
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    loadPipelines()
  }, [loadPipelines])

  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) setPipelineId(pipelines[0].id)
  }, [pipelines, pipelineId])

  useEffect(() => {
    if (pipelineId) api.listExperiments(pipelineId).then(setExperiments)
  }, [pipelineId])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Experiment History</h1>
      <Card className="flex items-center gap-3">
        <Select className="w-64" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <span className="text-sm text-slate-500">{experiments.length} past queries</span>
      </Card>
      <div className="space-y-2">
        {experiments.map((exp) => (
          <Card key={exp.id}>
            <button
              className="flex items-center gap-3 w-full text-left"
              onClick={() => setExpanded(expanded === exp.id ? null : exp.id)}
            >
              <span className="flex-1 text-sm truncate">{exp.query}</span>
              <Badge>{exp.latency_ms.toFixed(0)} ms</Badge>
              <Badge>{exp.result.chunks.length} chunks</Badge>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {new Date(exp.created_at).toLocaleString()}
              </span>
            </button>
            {expanded === exp.id && (
              <div className="mt-3 space-y-2">
                {exp.result.answer && <p className="text-sm bg-surface-overlay rounded-lg p-3">{exp.result.answer}</p>}
                {exp.result.chunks.map((chunk, i) => (
                  <RetrievalResult key={chunk.id + i} chunk={chunk} rank={i} />
                ))}
              </div>
            )}
          </Card>
        ))}
        {experiments.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">No queries recorded for this pipeline yet.</p>
        )}
      </div>
    </div>
  )
}
