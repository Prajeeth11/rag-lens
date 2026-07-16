import type { Chunk } from '../api/client'
import { Badge, Card } from './ui'

export function ChunkCard({ chunk }: { chunk: Chunk }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge tone="accent">#{chunk.index}</Badge>
        <Badge>{chunk.token_count} tokens</Badge>
        <Badge>
          chars {chunk.start_char}–{chunk.end_char}
        </Badge>
      </div>
      <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{chunk.text}</p>
    </Card>
  )
}
