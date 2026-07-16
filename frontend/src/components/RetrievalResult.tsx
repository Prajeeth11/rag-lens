import { FileText } from 'lucide-react'
import type { RetrievedChunk } from '../api/client'
import { Badge, Card } from './ui'

function scoreTone(score: number | null): 'green' | 'yellow' | 'red' {
  if (score === null) return 'yellow'
  if (score >= 0.6) return 'green'
  if (score >= 0.3) return 'yellow'
  return 'red'
}

export function RetrievalResult({ chunk, rank }: { chunk: RetrievedChunk; rank: number }) {
  const meta = chunk.metadata
  const originalRank = meta.original_rank as number | undefined
  const moved = originalRank !== undefined && originalRank !== rank

  return (
    <Card className={chunk.unique ? 'border-accent/60' : undefined}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge tone="accent">rank {rank + 1}</Badge>
        <Badge tone={scoreTone(chunk.score)}>score {chunk.score?.toFixed(4) ?? '–'}</Badge>
        {moved && (
          <Badge tone={originalRank! > rank ? 'green' : 'red'}>
            reranked {originalRank! + 1} → {rank + 1}
          </Badge>
        )}
        {meta.bm25_rank != null && <Badge>bm25 #{(meta.bm25_rank as number) + 1}</Badge>}
        {meta.semantic_rank != null && <Badge>semantic #{(meta.semantic_rank as number) + 1}</Badge>}
        {chunk.unique && <Badge tone="accent">unique</Badge>}
      </div>
      <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed mb-2">{chunk.text}</p>
      <div className="flex items-center gap-1.5 text-xs text-ink-faint">
        <FileText size={12} />
        {meta.document_name} · page {meta.page} · chars {meta.start_char}–{meta.end_char} · {meta.token_count} tokens
      </div>
    </Card>
  )
}
