import { CheckCircle2 } from 'lucide-react'
import type { StepEvent } from '../api/client'
import { Card, Spinner } from './ui'

const STEP_LABELS: Record<string, string> = {
  embed_query: 'Embed query',
  retrieve: 'Retrieve',
  rerank: 'Rerank',
  generate: 'Generate',
}

export function PipelineStepStream({ steps, running }: { steps: StepEvent[]; running: boolean }) {
  return (
    <Card>
      <h3 className="text-sm font-medium text-ink-soft mb-3">Pipeline steps</h3>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
            <span className="w-28">{STEP_LABELS[step.step] ?? step.step}</span>
            <span className="font-mono text-ink-soft">{step.latency_ms.toFixed(1)} ms</span>
            {step.detail && (
              <span className="text-xs text-ink-faint truncate">
                {Object.entries(step.detail)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')}
              </span>
            )}
          </li>
        ))}
        {running && (
          <li className="flex items-center gap-3 text-sm text-ink-soft">
            <Spinner /> running…
          </li>
        )}
        {!running && steps.length === 0 && <li className="text-sm text-ink-faint">Run a query to see steps.</li>}
      </ol>
    </Card>
  )
}
