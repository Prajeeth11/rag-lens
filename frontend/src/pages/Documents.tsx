import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Trash2, UploadCloud } from 'lucide-react'
import { api } from '../api/client'
import { useStore } from '../store/useStore'
import { Badge, Card, ErrorNote, Spinner, cn } from '../components/ui'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function Documents() {
  const { documents, loadDocuments } = useStore()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDocuments().catch((e) => setError(String(e.message ?? e)))
  }, [loadDocuments])

  const onDrop = useCallback(
    async (files: File[]) => {
      setUploading(true)
      setError('')
      try {
        for (const file of files) await api.uploadDocument(file)
        await loadDocuments()
      } catch (e: any) {
        setError(e.message ?? String(e))
      } finally {
        setUploading(false)
      }
    },
    [loadDocuments],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Documents</h1>
      {error && <ErrorNote message={error} />}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed border-line rounded-xl p-10 text-center cursor-pointer transition-colors',
          isDragActive && 'border-accent bg-accent/5',
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto mb-2 text-slate-500" />
        <p className="text-sm text-slate-400">
          {uploading ? <Spinner /> : isDragActive ? 'Drop files here' : 'Drag & drop PDF, DOCX, TXT or MD — or click to browse'}
        </p>
      </div>
      <div className="grid gap-3">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex items-center gap-4">
            <FileText className="text-accent-soft shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{doc.name}</div>
              <div className="text-xs text-slate-500">
                {new Date(doc.created_at).toLocaleString()} · {doc.num_pages} page{doc.num_pages !== 1 && 's'} ·{' '}
                {doc.char_count.toLocaleString()} chars
              </div>
            </div>
            <Badge>{doc.file_type.toUpperCase()}</Badge>
            <Badge>{formatBytes(doc.size_bytes)}</Badge>
            <button
              onClick={async () => {
                await api.deleteDocument(doc.id)
                await loadDocuments()
              }}
              className="text-slate-500 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </Card>
        ))}
        {documents.length === 0 && !uploading && (
          <p className="text-sm text-slate-500 text-center py-8">No documents yet — upload one to get started.</p>
        )}
      </div>
    </div>
  )
}
