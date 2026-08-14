import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { RawFile } from '@/types'
import { Download, FileArchive, ArrowRight, FolderOpen, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'

const statusLabel: Record<string, { label: string; variant: 'default' | 'active' | 'success' | 'warning' | 'muted' | 'danger' }> = {
  pending: { label: '待处理', variant: 'warning' },
  ingested: { label: '已入库', variant: 'success' },
  skipped: { label: '已跳过', variant: 'muted' },
  failed: { label: '失败', variant: 'danger' },
}

export function RawFiles() {
  const [files, setFiles] = useState<RawFile[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['__uncategorized__']))
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    api.get('/raw')
      .then((resp) => setFiles(resp.data))
      .finally(() => setLoading(false))
  }, [])

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  const grouped = files.reduce<Record<string, RawFile[]>>((acc, f) => {
    const key = f.category || '__uncategorized__'
    if (!acc[key]) acc[key] = []
    acc[key].push(f)
    return acc
  }, {})

  const categories = Object.keys(grouped).sort((a, b) => {
    if (a === '__uncategorized__') return -1
    if (b === '__uncategorized__') return 1
    return a.localeCompare(b)
  })

  const handleDownload = async (e: React.MouseEvent, f: RawFile) => {
    e.stopPropagation()
    const resp = await api.get(`/raw/download/${f.id}`, { responseType: 'blob' })
    const blob = new Blob([resp.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = f.original_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="已入库资料"
        description="已审批并移动到 raw 目录的资料文件。"
        icon={FileArchive}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64 text-text-tertiary">
          <Loader2 size={24} className="animate-spin mr-2" strokeWidth={1.5} />
          加载中…
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          title="暂无已入库资料"
          description="先在待入库中审批资料"
          icon={FileArchive}
        />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isUncategorized = cat === '__uncategorized__'
            const displayName = isUncategorized ? '根目录' : cat
            const isExpanded = expandedCategories.has(cat)
            const catFiles = grouped[cat]
            return (
              <div key={cat} className="border border-subtle rounded bg-surface overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  aria-expanded={isExpanded}
                  className="flex items-center gap-2 w-full px-4 h-10 hover:bg-hover transition-colors text-left border-b border-subtle"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-text-muted shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-text-muted shrink-0" />
                  )}
                  <FolderOpen size={14} className="text-accent-cyan shrink-0" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-text-primary">{displayName}</span>
                  <span className="text-xs text-text-muted ml-1">({catFiles.length})</span>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-subtle">
                    {catFiles.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => navigate(`/raw/${f.id}`)}
                        className="flex items-center justify-between px-4 py-3 hover:bg-hover transition-colors cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-text-primary truncate">{f.original_name}</p>
                            <StatusBadge variant={statusLabel[f.status]?.variant || 'default'}>
                              {statusLabel[f.status]?.label || f.status}
                            </StatusBadge>
                          </div>
                          <p className="text-xs font-mono text-text-tertiary mt-0.5">
                            {(f.file_size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleDownload(e, f)}
                            className="h-8 w-8 flex items-center justify-center rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
                            title="下载"
                            aria-label="下载"
                          >
                            <Download size={14} strokeWidth={1.5} />
                          </button>
                          <ArrowRight size={14} className="text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
