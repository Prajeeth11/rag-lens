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
      <h3 className="text-sm font-medium text-slate-400 mb-2">Aggregate RAGAS scores</h3>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {data.map((d) => (
          <div key={d.metric} className="bg-surface-overlay rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500">{d.metric}</div>
            <div className="text-lg font-mono">{aggregates[Object.keys(METRIC_LABELS).find((k) => METRIC_LABELS[k] === d.metric)!]?.toFixed(3) ?? '–'}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="#2a3140" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 10 }} />
          <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  )
}
