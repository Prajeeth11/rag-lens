import { useEffect, useState } from 'react'
import { Download, UploadCloud } from 'lucide-react'
import { api, type EvalResponse } from '../api/client'
import { useStore } from '../store/useStore'
import { MetricsPanel } from '../components/MetricsPanel'
import { Badge, Button, Card, ErrorNote, Select, Spinner } from '../components/ui'

interface QA {
  question: string
  expected_answer: string
}

function parseCsv(text: string): QA[] {
  // Simple CSV parser handling quoted fields; expects question,expected_answer
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (field || row.length) {
        row.push(field)
        rows.push(row)
        field = ''
        row = []
      }
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const start = rows[0]?.[0]?.toLowerCase().includes('question') ? 1 : 0
  return rows
    .slice(start)
    .filter((r) => r.length >= 2 && r[0].trim())
    .map((r) => ({ question: r[0].trim(), expected_answer: r[1].trim() }))
}

const METRICS = ['faithfulness', 'answer_relevancy', 'context_precision', 'context_recall'] as const

function scoreColor(v: number | null) {
  if (v === null) return 'text-slate-500'
  if (v >= 0.8) return 'text-emerald-400'
  if (v >= 0.5) return 'text-amber-400'
  return 'text-red-400'
}

export function EvalSuite() {
  const { pipelines, loadPipelines } = useStore()
  const ready = pipelines.filter((p) => p.status === 'ready')
  const [pipelineId, setPipelineId] = useState('')
  const [qaPairs, setQaPairs] = useState<QA[]>([])
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<EvalResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPipelines()
  }, [loadPipelines])

  useEffect(() => {
    if (!pipelineId && ready.length > 0) setPipelineId(ready[0].id)
  }, [ready, pipelineId])

  const onFile = async (file: File) => {
    const text = await file.text()
    setFileName(file.name)
    setError('')
    try {
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text)
        setQaPairs(
          parsed.map((r: any) => ({
            question: r.question ?? r.q,
            expected_answer: r.expected_answer ?? r.answer ?? r.a,
          })),
        )
      } else {
        setQaPairs(parseCsv(text))
      }
    } catch (e: any) {
      setError(`Could not parse file: ${e.message}`)
      setQaPairs([])
    }
  }

  const run = async () => {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await api.runEval(pipelineId, qaPairs))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setRunning(false)
    }
  }

  const exportCsv = () => {
    if (!result) return
    const header = ['question', 'answer', 'ground_truth', ...METRICS].join(',')
    const lines = result.per_question.map((r) =>
      [r.question, r.answer, r.ground_truth, ...METRICS.map((m) => r[m] ?? '')]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ragas-results.csv'
    a.click()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Eval Suite</h1>
      <Card className="flex gap-3 items-center flex-wrap">
        <Select className="w-64" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
          {ready.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm bg-surface-overlay hover:bg-line px-4 py-2 rounded-lg cursor-pointer">
          <UploadCloud size={16} />
          {fileName || 'Upload Q&A CSV / JSON'}
          <input
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {qaPairs.length > 0 && <Badge tone="accent">{qaPairs.length} questions</Badge>}
        <Button onClick={run} disabled={running || !pipelineId || qaPairs.length === 0}>
          {running ? <Spinner /> : 'Run RAGAS'}
        </Button>
        {result && (
          <Button variant="ghost" onClick={exportCsv}>
            <Download size={14} className="inline mr-1" /> Export CSV
          </Button>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        CSV format: <code className="bg-surface-overlay px-1 rounded">question,expected_answer</code> — one row per test
        case. Requires OPENAI_API_KEY on the backend (RAGAS uses an LLM judge). Runs take ~10–30 s per question.
      </p>
      {error && <ErrorNote message={error} />}
      {running && (
        <Card className="text-sm text-slate-400 flex items-center gap-3">
          <Spinner /> Running each question through the pipeline, then scoring with RAGAS…
        </Card>
      )}
      {result && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-line">
                  <th className="py-2 pr-3">Question</th>
                  {METRICS.map((m) => (
                    <th key={m} className="py-2 px-2 whitespace-nowrap">
                      {m.replaceAll('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.per_question.map((r, i) => (
                  <tr key={i} className="border-b border-line/50 align-top">
                    <td className="py-2 pr-3">
                      <div>{r.question}</div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{r.answer}</div>
                    </td>
                    {METRICS.map((m) => (
                      <td key={m} className={`py-2 px-2 font-mono ${scoreColor(r[m])}`}>
                        {r[m]?.toFixed(3) ?? '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <MetricsPanel aggregates={result.aggregates} />
        </div>
      )}
    </div>
  )
}
