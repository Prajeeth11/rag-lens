import { create } from 'zustand'
import { api, type Doc, type Pipeline } from '../api/client'

interface AppState {
  documents: Doc[]
  pipelines: Pipeline[]
  loadDocuments: () => Promise<void>
  loadPipelines: () => Promise<void>
  refreshPipeline: (id: string) => Promise<void>
}

export const useStore = create<AppState>((set) => ({
  documents: [],
  pipelines: [],
  loadDocuments: async () => {
    set({ documents: await api.listDocuments() })
  },
  loadPipelines: async () => {
    set({ pipelines: await api.listPipelines() })
  },
  refreshPipeline: async (id: string) => {
    const updated = await api.getPipeline(id)
    set((state) => ({ pipelines: state.pipelines.map((p) => (p.id === id ? updated : p)) }))
  },
}))
