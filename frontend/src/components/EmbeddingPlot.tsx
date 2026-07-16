import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import type { EmbeddingsResponse } from '../api/client'

const Plot = createPlotlyComponent(Plotly)

const PALETTE = ['#C05A2E', '#199E70', '#C98500', '#2A78D6', '#C2588F', '#7A5FB5', '#4E8397', '#8A7A2E']

export function EmbeddingPlot({ data }: { data: EmbeddingsResponse }) {
  const byDoc = new Map<string, typeof data.points>()
  for (const p of data.points) {
    const list = byDoc.get(p.document_name) ?? []
    list.push(p)
    byDoc.set(p.document_name, list)
  }

  const traces: any[] = [...byDoc.entries()].map(([name, points], i) => ({
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
    text: points.map((p) => p.preview),
    hovertemplate: '%{text}<extra>' + name + '</extra>',
    mode: 'markers',
    type: 'scattergl',
    name,
    marker: { size: 8, color: PALETTE[i % PALETTE.length], opacity: 0.85 },
  }))

  if (data.query_point) {
    traces.push({
      x: [data.query_point.x],
      y: [data.query_point.y],
      text: [data.query_point.label],
      hovertemplate: 'query: %{text}<extra></extra>',
      mode: 'markers',
      type: 'scattergl',
      name: 'query',
      marker: { size: 16, color: '#dc2626', symbol: 'star' },
    })
  }

  return (
    <Plot
      data={traces}
      layout={{
        autosize: true,
        height: 520,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#6c5d4c', size: 11 },
        legend: { orientation: 'h', y: -0.12 },
        margin: { l: 40, r: 20, t: 20, b: 40 },
        xaxis: { gridcolor: '#e4d6c3', zerolinecolor: '#e4d6c3' },
        yaxis: { gridcolor: '#e4d6c3', zerolinecolor: '#e4d6c3' },
      }}
      config={{ displaylogo: false }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}
