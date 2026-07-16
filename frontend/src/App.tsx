import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import {
  FileText,
  FlaskConical,
  GitCompareArrows,
  History as HistoryIcon,
  ScanSearch,
  ScatterChart,
  SlidersHorizontal,
  Target,
} from 'lucide-react'
import { Documents } from './pages/Documents'
import { ChunkingLab } from './pages/ChunkingLab'
import { PipelineBuilder } from './pages/PipelineBuilder'
import { QueryInspector } from './pages/QueryInspector'
import { CompareArena } from './pages/CompareArena'
import { EmbeddingSpace } from './pages/EmbeddingSpace'
import { EvalSuite } from './pages/EvalSuite'
import { History } from './pages/History'
import { cn } from './components/ui'

const NAV = [
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/chunking', label: 'Chunking Lab', icon: FlaskConical },
  { to: '/pipelines', label: 'Pipeline Builder', icon: SlidersHorizontal },
  { to: '/query', label: 'Query Inspector', icon: ScanSearch },
  { to: '/compare', label: 'Compare Arena', icon: GitCompareArrows },
  { to: '/embeddings', label: 'Embedding Space', icon: ScatterChart },
  { to: '/eval', label: 'Eval Suite', icon: Target },
  { to: '/history', label: 'History', icon: HistoryIcon },
]

export default function App() {
  return (
    <HashRouter>
      <div className="flex min-h-screen">
        <aside className="w-56 shrink-0 border-r border-line p-4 flex flex-col gap-1 sticky top-0 h-screen">
          <div className="flex items-center gap-2 px-2 py-3 mb-2">
            <ScanSearch className="text-accent-soft" />
            <span className="font-semibold tracking-tight">RAG-Lens</span>
          </div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-accent/15 text-accent-soft' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-overlay',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
          <div className="mt-auto px-3 text-xs text-slate-600">RAG pipeline debugger</div>
        </aside>
        <main className="flex-1 p-6 max-w-6xl">
          <Routes>
            <Route path="/" element={<Navigate to="/documents" replace />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/chunking" element={<ChunkingLab />} />
            <Route path="/pipelines" element={<PipelineBuilder />} />
            <Route path="/query" element={<QueryInspector />} />
            <Route path="/compare" element={<CompareArena />} />
            <Route path="/embeddings" element={<EmbeddingSpace />} />
            <Route path="/eval" element={<EvalSuite />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
