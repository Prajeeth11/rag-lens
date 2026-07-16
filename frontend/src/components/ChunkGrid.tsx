import { useState } from 'react'
import type { Chunk } from '../api/client'
import { ChunkCard } from './ChunkCard'
import { cn } from './ui'

const BUCKETS = [
  { max: 32, className: 'bg-sky-500/60 hover:bg-sky-400', label: '< 32' },
  { max: 64, className: 'bg-teal-500/60 hover:bg-teal-400', label: '32–64' },
  { max: 128, className: 'bg-amber-500/60 hover:bg-amber-400', label: '64–128' },
  { max: 256, className: 'bg-orange-500/60 hover:bg-orange-400', label: '128–256' },
  { max: Infinity, className: 'bg-rose-500/60 hover:bg-rose-400', label: '256+' },
]

function bucketOf(tokens: number) {
  return BUCKETS.find((b) => tokens < b.max) ?? BUCKETS[BUCKETS.length - 1]
}

export function ChunkGrid({ chunks }: { chunks: Chunk[] }) {
  const [selected, setSelected] = useState<Chunk | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {chunks.map((chunk) => (
          <button
            key={chunk.index}
            title={`#${chunk.index} · ${chunk.token_count} tokens`}
            onClick={() => setSelected(selected?.index === chunk.index ? null : chunk)}
            className={cn(
              'rounded transition-colors',
              bucketOf(chunk.token_count).className,
              selected?.index === chunk.index && 'ring-2 ring-white',
            )}
            style={{
              width: Math.max(18, Math.min(64, chunk.token_count / 3)),
              height: 24,
            }}
          />
        ))}
      </div>
      <div className="flex gap-3 text-xs text-slate-400">
        {BUCKETS.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5">
            <span className={cn('inline-block w-3 h-3 rounded', b.className.split(' ')[0])} />
            {b.label} tok
          </span>
        ))}
      </div>
      {selected && <ChunkCard chunk={selected} />}
    </div>
  )
}
