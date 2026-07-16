import { useEffect, useRef, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { openQuerySocket, type QueryResult, type StepEvent } from '../api/client'
import { useStore } from '../store/useStore'
import { PipelineStepStream } from '../components/PipelineStepStream'
import { RetrievalResult } from '../components/RetrievalResult'
import { Button, Card, ErrorNote, Input, Select } from '../components/ui'

const PIE_COLORS = ['#C05A2E', '#199E70', '#C98500']

export function QueryInspector() {
  const { pipelines, loadPipelines } = useStore()
  const ready = pipelines.filter((p) => p.status === 'ready')
  const [pipelineId, setPipelineId] = useState('')
  const [query, setQuery] = useState('')
  const [steps, setSteps] = useState<StepEvent[]>([])
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    loadPipelines()
    return () => wsRef.current?.close()
  }, [loadPipelines])

  useEffect(() => {
    if (!pipelineId && ready.length > 0) setPipelineId(ready[0].id)
  }, [ready, pipelineId])

  useEffect(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [pipelineId])

  const run = () => {
    if (!pipelineId || !query.trim()) return
    setSteps([])
    setResult(null)
    setError('')
    setRunning(true)
    const send = (ws: WebSocket) => ws.send(JSON.stringify({ query }))
    let ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ws = openQuerySocket(pipelineId, (event) => {
        if (event.type === 'step') setSteps((prev) => [...prev, event])
        else if (event.type === 'result') {
          setResult(event.result)
          setRunning(false)
        } else {
          setError(event.message)
          setRunning(false)
        }
      })
      ws.onopen = () => send(ws!)
      ws.onerror = () => {
        setError('WebSocket connection failed — is the backend running?')
        setRunning(false)
      }
      wsRef.current = ws
    } else {
      send(ws)
    }
  }

  const budget = result
    ? [
        { name: 'Query', value: result.token_budget.query_tokens },
        { name: 'Context', value: result.token_budget.context_tokens },
        { name: 'Answer', value: result.token_budget.answer_tokens },
      ].filter((d) => d.value > 0)
    : []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Query Inspector</h1>
      <Card className="flex gap-3 items-center flex-wrap">
        <Select className="w-64" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
          {ready.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          className="flex-1 min-w-64"
          placeholder="Ask something about your indexed documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <Button onClick={run} disabled={running || !pipelineId || !query.trim()}>
          Run
        </Button>
      </Card>
      {ready.length === 0 && <p className="text-sm text-ink-faint">Build a pipeline first — none are ready.</p>}
      {error && <ErrorNote message={error} />}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-3">
          {result?.answer && (
            <Card className="border-accent/40">
              <h3 className="text-sm font-medium text-ink-soft mb-1">Generated answer</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </Card>
          )}
          {result?.chunks.map((chunk, i) => <RetrievalResult key={chunk.id + i} chunk={chunk} rank={i} />)}
          {!result && !running && <p className="text-sm text-ink-faint py-8 text-center">Results appear here.</p>}
        </div>
        <div className="space-y-4">
          <PipelineStepStream steps={steps} running={running} />
          {result && (
            <Card>
              <h3 className="text-sm font-medium text-ink-soft mb-1">
                Token budget · total {result.total_ms.toFixed(0)} ms
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={budget} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} label>
                    {budget.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e4d6c3', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 text-xs text-ink-soft">
                {budget.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: PIE_COLORS[i] }} />
                    {d.name}: {d.value}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
