import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const variants = {
    primary: 'bg-accent hover:bg-accent-soft text-white',
    ghost: 'bg-surface-overlay hover:bg-line text-slate-200',
    danger: 'bg-red-600/80 hover:bg-red-600 text-white',
  }
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-surface-raised border border-line rounded-xl p-4', className)} {...props} />
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'bg-surface-overlay border border-line rounded-lg px-3 py-2 text-sm w-full',
        'focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-slate-500',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'bg-surface-overlay border border-line rounded-lg px-3 py-2 text-sm w-full',
        'focus:outline-none focus:ring-1 focus:ring-accent',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({
  className,
  tone = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'green' | 'yellow' | 'red' | 'accent' }) {
  const tones = {
    default: 'bg-surface-overlay text-slate-300',
    green: 'bg-emerald-500/15 text-emerald-400',
    yellow: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
    accent: 'bg-accent/15 text-accent-soft',
  }
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', tones[tone], className)}
      {...props}
    />
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span className="text-slate-200 font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </label>
  )
}

export function Tabs({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex bg-surface-overlay rounded-lg p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm transition-colors',
            value === opt.value ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-spin h-4 w-4 border-2 border-slate-500 border-t-slate-100 rounded-full inline-block',
        className,
      )}
    />
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'ready' ? 'green' : status === 'failed' ? 'red' : 'yellow'
  return <Badge tone={tone}>{status}</Badge>
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-3 py-2">{message}</div>
  )
}
