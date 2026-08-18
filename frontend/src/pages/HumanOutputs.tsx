import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { HumanOutput, RawFile } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import {
  Upload,
  FilePlus,
  ArrowRight,
  Loader2,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  X,
  Tag,
  FileText,
  Eye,
  XCircle,
  CheckCircle2,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useT } from '@/i18n'

const statusLabel: Record<string, { label: string; variant: 'default' | 'active' | 'success' | 'warning' | 'muted' | 'danger' }> = {
  pending: { label: '待入库', variant: 'warning' },
  watching: { label: '观望', variant: 'active' },
  discarded: { label: '弃用', variant: 'muted' },
  ingested: { label: '已入库', variant: 'success' },
  draft: { label: '草稿', variant: 'default' },
  review: { label: '审核中', variant: 'warning' },
  final: { label: '终稿', variant: 'success' },
}

export function HumanOutputs() {
  const t = useT()
  const [files, setFiles] = useState<HumanOutput[]>([])
  const [preRawFiles, setPreRawFiles] = useState<RawFile[]>([])
  const [ingestingId, setIngestingId] = useState<string | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [category, setCategory] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['__uncategorized__']))
  const [deleteTarget, setDeleteTarget] = useState<HumanOutput | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'editor'

  useEffect(() => {
    loadFiles()
    loadPreRawFiles()
  }, [])

  const loadFiles = () => {
    api.get('/raw/human-outputs').then((resp) => setFiles(resp.data))
  }

  const loadPreRawFiles = () => {
    api.get('/raw/pre-raw').then((resp) => setPreRawFiles(resp.data))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadModalOpen(true)
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', selectedFile)
    if (category.trim()) {
      formData.append('category', category.trim())
    }
    try {
      await api.post('/raw/human-outputs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUploadModalOpen(false)
      setSelectedFile(null)
      setCategory('')
      loadFiles()
      toast({ title: t('上传成功'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('上传失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setUploading(false)
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/raw/human-outputs/${id}/status`, { status })
      loadFiles()
      toast({ title: t('状态已更新'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('状态更新失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/raw/human-outputs/${deleteTarget.id}`)
      loadFiles()
      toast({ title: t('已删除'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('删除失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleIngest = async (id: string) => {
    if (ingestingId) return
    setIngestingId(id)
    try {
      await api.post(`/raw/human-outputs/${id}/ingest`)
      loadFiles()
      toast({ title: t('已入库'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('入库失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setIngestingId(null)
  }

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

  const grouped = files.reduce<Record<string, HumanOutput[]>>((acc, f) => {
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

  const humanCategories = Array.from(new Set(files.map((f) => f.category).filter((c): c is string => !!c))).sort()
  const preRawCategories = Array.from(new Set(preRawFiles.map((f) => f.category).filter((c): c is string => !!c))).sort()

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('人类产出')}
        description={t('管理人类撰写的文档与最终产出。')}
        icon={FileText}
        actions={
          user && (
            <>
              <button
                onClick={() => fileInput.current?.click()}
                className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <Upload size={14} strokeWidth={1.5} />
                {t('上传文档')}
              </button>
              <input ref={fileInput} type="file" className="hidden" onChange={handleFileSelect} />
            </>
          )
        }
      />

      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => {
            setUploadModalOpen(false)
            setSelectedFile(null)
            setCategory('')
          }} />
          <div className="relative w-full max-w-md rounded-lg border border-subtle bg-surface shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-text-primary">{t('上传文档')}</h3>
              <button
                onClick={() => {
                  setUploadModalOpen(false)
                  setSelectedFile(null)
                  setCategory('')
                }}
                className="p-1 rounded hover:bg-hover text-text-tertiary"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex items-center gap-2 p-3 bg-raised rounded border border-subtle mb-4">
              <FileText size={16} className="text-accent-cyan shrink-0" strokeWidth={1.5} />
              <span className="text-sm text-text-primary truncate">{selectedFile?.name}</span>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1.5">{t('所属领域（文件夹）')}</label>
              <div className="relative">
                <Tag size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t('输入文件夹名称（可选），留空存入根目录')}
                  className="input w-full pl-8"
                />
              </div>
              {(humanCategories.length > 0 || preRawCategories.length > 0) && (
                <div className="mt-2 space-y-2">
                  {preRawCategories.length > 0 && (
                    <div>
                      <p className="text-xs text-text-muted mb-1.5">{t('待入库文件夹：')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {preRawCategories.map((c) => (
                          <button
                            key={c}
                            onClick={() => setCategory(c)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              category === c
                                ? 'bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan'
                                : 'bg-raised border-subtle text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {humanCategories.length > 0 && (
                    <div>
                      <p className="text-xs text-text-muted mb-1.5">{t('人类产出已有文件夹：')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {humanCategories.map((c) => (
                          <button
                            key={c}
                            onClick={() => setCategory(c)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              category === c
                                ? 'bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan'
                                : 'bg-raised border-subtle text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {category.trim()
                  ? t('将存入文件夹：human_outputs/{cat}/', { cat: category.trim() })
                  : t('将存入根目录：human_outputs/')}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setUploadModalOpen(false)
                  setSelectedFile(null)
                  setCategory('')
                }}
                className="btn-ghost h-8 px-3 text-xs"
              >
                {t('取消')}
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
                    {t('上传中…')}
                  </>
                ) : (
                  <>
                    <Upload size={14} strokeWidth={1.5} className="mr-1.5" />
                    {t('确认上传')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState
          title={t('暂无人类产出文档')}
          description={t('上传文档开始管理人类产出')}
          icon={FilePlus}
          action={
            user ? (
              <button
                onClick={() => fileInput.current?.click()}
                className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <Upload size={14} strokeWidth={1.5} />
                {t('上传文档')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isUncategorized = cat === '__uncategorized__'
            const displayName = isUncategorized ? t('根目录') : cat
            const isExpanded = expandedCategories.has(cat)
            const catFiles = grouped[cat]
            return (
              <div key={cat} className="border border-subtle rounded bg-surface overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
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
                        onClick={() => navigate(`/human-outputs/${f.id}`)}
                        className="flex items-center justify-between px-4 py-3 hover:bg-hover transition-colors cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-text-primary truncate">{f.original_name}</p>
                            <StatusBadge variant={statusLabel[f.status]?.variant || 'default'}>
                              {t(statusLabel[f.status]?.label || f.status)}
                            </StatusBadge>
                          </div>
                          <p className="text-xs font-mono text-text-tertiary mt-0.5">
                            {f.file_size ? (f.file_size / 1024).toFixed(1) : '0'} KB
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && f.status !== 'ingested' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStatusChange(f.id, 'watching')
                                }}
                                className={`h-8 w-8 flex items-center justify-center rounded transition-colors ${
                                  f.status === 'watching'
                                    ? 'text-accent-cyan'
                                    : 'text-text-tertiary hover:text-accent-cyan hover:bg-hover'
                                }`}
                                title={t('观望')}
                              >
                                <Eye size={14} strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStatusChange(f.id, 'discarded')
                                }}
                                className={`h-8 w-8 flex items-center justify-center rounded transition-colors ${
                                  f.status === 'discarded'
                                    ? 'text-accent-red'
                                    : 'text-text-tertiary hover:text-accent-red hover:bg-accent-red/10'
                                }`}
                                title={t('弃用')}
                              >
                                <XCircle size={14} strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleIngest(f.id)
                                }}
                                disabled={ingestingId === f.id}
                                className="h-8 w-8 flex items-center justify-center rounded text-accent-green hover:bg-accent-green/10 disabled:opacity-50 transition-colors"
                                title={t('入库')}
                              >
                                {ingestingId === f.id ? (
                                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={14} strokeWidth={1.5} />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteTarget(f)
                                }}
                                className="h-8 w-8 flex items-center justify-center rounded text-text-tertiary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                                title={t('删除')}
                              >
                                <Trash2 size={14} strokeWidth={1.5} />
                              </button>
                            </>
                          )}
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

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('删除文档')}
        description={deleteTarget ? t('确定删除「{name}」？此操作不可恢复。', { name: deleteTarget.original_name }) : ''}
        variant="danger"
        confirmLabel={t('删除')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
