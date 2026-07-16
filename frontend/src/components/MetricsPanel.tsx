import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { Card } from './ui'

const METRIC_LABELS: Record<string, string> = {
  faithfulness: 'Faithfulness',
  answer_relevancy: 'Answer relevancy',
  context_precision: 'Context precision',
  context_recall: 'Context recall',
}

export function MetricsPanel({ aggregates }: { aggregates: Record<string, number | null> }) {
  const data = Object.entries(METRIC_LABELS).map(([key, label]) => ({
    metric: label,
    value: aggregates[key] ?? 0,
  }))

  return (
    <Card>
      <h3 className="text-sm font-medium text-ink-soft mb-2">Aggregate RAGAS scores</h3>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {data.map((d) => (
          <div key={d.metric} className="bg-surface-overlay rounded-lg px-3 py-2">
            <div className="text-xs text-ink-faint">{d.metric}</div>
            <div className="text-lg font-mono">{aggregates[Object.keys(METRIC_LABELS).find((k) => METRIC_LABELS[k] === d.metric)!]?.toFixed(3) ?? '–'}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="#e4d6c3" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#6c5d4c', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 1]} tick={{ fill: '#857463', fontSize: 10 }} />
          <Radar dataKey="value" stroke="#C05A2E" fill="#C05A2E" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  )
}
