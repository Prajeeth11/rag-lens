import { FileText } from 'lucide-react'
import type { RetrievedChunk } from '../api/client'
import { Badge, Card } from './ui'

type Tone = 'green' | 'yellow' | 'red' | 'accent'

// The score's meaning depends on which stage produced it, so the badge
// label and color thresholds must too.
function scoreBadge(chunk: RetrievedChunk): { label: string; tone: Tone } {
  const score = chunk.score
  const meta = chunk.metadata
  if (score == null) return { label: 'score –', tone: 'yellow' }
  if (meta.original_score !== undefined) {
    // cross-encoder logit: unbounded, positive = relevant
    const tone: Tone = score >= 2 ? 'green' : score >= -2 ? 'yellow' : 'red'
    return { label: `rerank ${score.toFixed(2)}`, tone }
  }
  if (meta.bm25_rank !== undefined || meta.semantic_rank !== undefined) {
    // RRF fusion score: only relative order is meaningful, so no strength color
    return { label: `rrf ${score.toFixed(4)}`, tone: 'accent' }
  }
  // cosine similarity
  const tone: Tone = score >= 0.6 ? 'green' : score >= 0.3 ? 'yellow' : 'red'
  return { label: `score ${score.toFixed(4)}`, tone }
}

export function RetrievalResult({ chunk, rank }: { chunk: RetrievedChunk; rank: number }) {
  const meta = chunk.metadata
  const originalRank = meta.original_rank as number | undefined
  const moved = originalRank !== undefined && originalRank !== rank
  const score = scoreBadge(chunk)

  return (
    <Card className={chunk.unique ? 'border-accent/60' : undefined}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge tone="accent">rank {rank + 1}</Badge>
        <Badge tone={score.tone}>{score.label}</Badge>
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
