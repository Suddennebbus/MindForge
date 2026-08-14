import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { Plan, PlanAnnotation } from '@/types'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  Pencil,
  Save,
  X,
  Send,
  User,
  Trash2,
  MessageCircle,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardList,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { useAuthStore } from '@/stores/authStore'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSetPageWidth } from '@/components/PageWidth'
import { toast } from '@/stores/toastStore'
import { useTaskStore } from '@/stores/taskStore'

interface Comment {
  id: string
  plan_id: string
  user_id: string
  username: string
  content: string
  parent_id?: string | null
  created_at: string
}

interface SelectionInfo {
  start: number
  end: number
  text: string
  rect: DOMRect
}

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

const statusConfig: Record<string, { label: string; variant: 'default' | 'active' | 'success' | 'warning' | 'muted' }> = {
  draft: { label: '草稿', variant: 'default' },
  active: { label: '进行中', variant: 'success' },
  paused: { label: '已暂停', variant: 'warning' },
  completed: { label: '已完成', variant: 'active' },
  archived: { label: '已归档', variant: 'muted' },
}

export function PlanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const setReader = useSetPageWidth('reader')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [annotations, setAnnotations] = useState<PlanAnnotation[]>([])
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [annotationText, setAnnotationText] = useState('')
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role === 'admin' || user?.role === 'editor'
  const readingsTaskKey = `generate-readings-${id}`
  const downloadTaskKey = `download-papers-${id}`
  const readingsTask = useTaskStore((s) => s.tasks[readingsTaskKey])
  const downloadTask = useTaskStore((s) => s.tasks[downloadTaskKey])
  const runTask = useTaskStore((s) => s.runTask)
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null)

  const refreshPlan = useCallback(() => {
    if (!id) return
    return api.get(`/plans/${id}`).then((resp) => setPlan(resp.data))
  }, [id])

  const handleGenerateReadings = () => {
    runTask(readingsTaskKey, async () => {
      const resp = await api.post(`/plans/${id}/generate-readings`)
      await refreshPlan()
      toast({ title: `已生成 ${resp.data.count} 篇文献`, variant: 'success' })
      return resp.data
    })
  }

  const handleDownloadAll = () => {
    runTask(downloadTaskKey, async () => {
      const resp = await api.post(`/ai/plan/${id}/download-papers`)
      await refreshPlan()
      const { downloaded, errors } = resp.data
      toast({
        title: `下载完成：成功 ${downloaded.length} 篇，失败 ${errors.length} 篇`,
        variant: errors.length ? 'warning' : 'success',
      })
      return resp.data
    })
  }

  const handleDownloadOne = async (index: number) => {
    setDownloadingIndex(index)
    try {
      const resp = await api.post(`/ai/plan/${id}/readings/${index}/download`)
      await refreshPlan()
      if (resp.data.status === 'failed') {
        toast({ title: `下载失败：${resp.data.error || '未知错误'}`, variant: 'error' })
      } else {
        toast({ title: '已下载到待审资料库', variant: 'success' })
      }
    } catch {
      toast({ title: '下载失败', variant: 'error' })
    } finally {
      setDownloadingIndex(null)
    }
  }

  useEffect(() => {
    setReader()
  }, [setReader])

  const loadData = useCallback(() => {
    if (!id) return
    setLoading(true)
    api.get(`/plans/${id}`)
      .then((resp) => setPlan(resp.data))
      .catch(() => toast({ title: '加载计划失败', variant: 'error' }))
      .finally(() => setLoading(false))
    api.get(`/plans/${id}/comments`).then((resp) => {
      setComments(resp.data)
    })
    api.get(`/plans/${id}/annotations`).then((resp) => {
      setAnnotations(resp.data)
    })
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!contentRef.current || isEditingDesc) return
    const timer = setTimeout(() => {
      if (contentRef.current) {
        applyHighlights(contentRef.current, annotations)
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [annotations, isEditingDesc])

  useEffect(() => {
    const el = contentRef.current
    if (!el || isEditingDesc) return

    const handleMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          setSelection(null)
        }
        return
      }

      const range = sel.getRangeAt(0)
      const info = getSelectionOffsets(range, el)
      if (!info || info.end - info.start < 2) {
        setSelection(null)
        return
      }

      const rect = range.getBoundingClientRect()
      setSelection({ ...info, rect })
      setAnnotationText('')
    }

    el.addEventListener('mouseup', handleMouseUp)
    return () => el.removeEventListener('mouseup', handleMouseUp)
  }, [annotations, isEditingDesc])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        setSelection(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateAnnotation = async () => {
    if (!selection || !annotationText.trim() || !id) return
    try {
      await api.post(`/plans/${id}/annotations`, {
        start_offset: selection.start,
        end_offset: selection.end,
        selected_text: selection.text,
        content: annotationText.trim(),
      })
      setSelection(null)
      setAnnotationText('')
      window.getSelection()?.removeAllRanges()
      loadData()
      toast({ title: '批注已添加', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '添加批注失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleDeleteAnnotation = async (annotationId: string) => {
    if (!id) return
    try {
      await api.delete(`/plans/${id}/annotations/${annotationId}`)
      loadData()
      toast({ title: '批注已删除', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '删除批注失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleHighlightClick = (annotationId: string) => {
    setActiveAnnotationId(annotationId)
    const panelEl = document.getElementById(`annotation-item-${annotationId}`)
    if (panelEl) {
      panelEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleAnnotationItemClick = (annotationId: string) => {
    setActiveAnnotationId(annotationId)
    const highlightEls = contentRef.current?.querySelectorAll(`[data-annotation-id="${annotationId}"]`)
    if (highlightEls && highlightEls.length > 0) {
      const first = highlightEls[0] as HTMLElement
      first.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleDeletePlan = async () => {
    if (!plan) return
    try {
      await api.delete(`/plans/${plan.id}`)
      navigate('/plans')
      toast({ title: '计划已删除', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '删除失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setShowDelete(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!plan) return
    setSaving(true)
    try {
      await api.put(`/plans/${plan.id}`, { status: newStatus })
      setPlan({ ...plan, status: newStatus as Plan['status'] })
      toast({ title: '状态已更新', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '更新失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setSaving(false)
  }

  const handleSaveDescription = async () => {
    if (!plan) return
    setSaving(true)
    try {
      await api.put(`/plans/${plan.id}`, { description: editDesc })
      setPlan({ ...plan, description: editDesc })
      setIsEditingDesc(false)
      toast({ title: '描述已保存', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '保存失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setSaving(false)
  }

  const toggleGoal = async (index: number) => {
    if (!plan) return
    const newGoals = [...plan.goals]
    const goal = newGoals[index]
    if (goal.startsWith('[x] ')) {
      newGoals[index] = goal.replace('[x] ', '[ ] ')
    } else {
      newGoals[index] = goal.replace('[ ] ', '[x] ')
    }
    setSaving(true)
    try {
      await api.put(`/plans/${plan.id}`, { goals: newGoals })
      setPlan({ ...plan, goals: newGoals })
    } catch (err: any) {
      toast({
        title: '更新失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setSaving(false)
  }

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !id) return
    try {
      await api.post(`/plans/${id}/comments`, { content: commentText.trim() })
      setCommentText('')
      loadData()
    } catch (err: any) {
      toast({
        title: '评论失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleSubmitReply = async (parentId: string) => {
    if (!replyText.trim() || !id) return
    try {
      await api.post(`/plans/${id}/comments`, { content: replyText.trim(), parent_id: parentId })
      setReplyText('')
      setReplyingTo(null)
      loadData()
    } catch (err: any) {
      toast({
        title: '回复失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!id) return
    try {
      await api.delete(`/plans/${id}/comments/${commentId}`)
      loadData()
      toast({ title: '评论已删除', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '删除失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="h-8 w-32 animate-pulse bg-surface rounded mx-auto" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="py-12 text-center text-text-tertiary">
        <p>计划不存在</p>
        <button onClick={() => navigate('/plans')} className="btn-secondary mt-4 h-8 px-3 text-xs">
          <ArrowLeft size={14} className="mr-1.5" />
          返回列表
        </button>
      </div>
    )
  }

  const cfg = statusConfig[plan.status] || statusConfig.draft

  return (
    <div className="space-y-4">
      <PageHeader
        title={plan.title}
        icon={ClipboardList}
        meta={
          <>
            <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>
            {plan.direction && <span className="text-xs text-text-tertiary">{plan.direction}</span>}
          </>
        }
        actions={
          <>
            <Link
              to="/plans"
              className="btn-ghost h-8 w-8 !px-0 flex items-center justify-center"
              aria-label="返回"
            >
              <ArrowLeft size={15} strokeWidth={1.5} />
            </Link>
            {!isEditingDesc && canEdit && (
              <button
                onClick={() => {
                  setEditDesc(plan.description)
                  setIsEditingDesc(true)
                }}
                className="h-8 px-3 text-xs font-medium rounded border border-subtle text-text-secondary hover:text-text-primary hover:bg-hover flex items-center gap-1.5 transition-colors"
              >
                <Pencil size={13} strokeWidth={1.5} className="mr-1" />
                编辑描述
              </button>
            )}
            <select
              value={plan.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={saving}
              className="input h-8 text-xs"
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {canEdit && (
              <button
                onClick={() => setShowDelete(true)}
                className="h-8 w-8 flex items-center justify-center rounded border border-accent-red/20 text-accent-red hover:bg-accent-red/10 transition-colors"
                aria-label="删除计划"
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            )}
          </>
        }
      />

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-5">
          <div className="border border-subtle rounded bg-surface p-5">
            {(plan.description || isEditingDesc) && (
              <div className="mb-6 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-text-tertiary">描述</span>
                  {isEditingDesc && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setIsEditingDesc(false)}
                        className="btn-ghost h-7 px-2 text-xs"
                      >
                        <X size={12} strokeWidth={1.5} className="mr-1" />
                        取消
                      </button>
                      <button
                        onClick={handleSaveDescription}
                        disabled={saving}
                        className="btn-primary h-7 px-2 text-xs"
                      >
                        <Save size={12} strokeWidth={1.5} className="mr-1" />
                        {saving ? '保存中…' : '保存'}
                      </button>
                    </div>
                  )}
                </div>
                {isEditingDesc ? (
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="input w-full h-[60vh] resize-y py-2 font-mono text-sm"
                    placeholder="输入计划描述，支持 Markdown..."
                  />
                ) : (
                  <div className="relative">
                    <div
                      ref={contentRef}
                      className="text-base text-text-secondary leading-relaxed"
                      onClick={(e) => {
                        const target = e.target as HTMLElement
                        const mark = target.closest('.annotation-highlight') as HTMLElement | null
                        if (mark?.dataset.annotationId) {
                          handleHighlightClick(mark.dataset.annotationId)
                        }
                      }}
                    >
                      <MarkdownRenderer content={plan.description} />
                    </div>

                    {selection && (
                      <div
                        ref={popoverRef}
                        className="absolute z-50 bg-surface border border-subtle rounded p-3 shadow-lg min-w-[240px]"
                        style={(() => {
                          const container = contentRef.current
                          if (!container) {
                            return { top: selection.rect.bottom + 8, left: Math.max(16, selection.rect.left) }
                          }
                          const containerRect = container.getBoundingClientRect()
                          const top = selection.rect.bottom - containerRect.top + container.scrollTop + 8
                          const left = selection.rect.left - containerRect.left + container.scrollLeft
                          return {
                            top: Math.min(top, container.scrollHeight - 120),
                            left: Math.max(16, Math.min(left, container.clientWidth - 260)),
                          }
                        })()}
                      >
                        <p className="text-xs text-text-muted mb-2 truncate max-w-[220px]">
                          选中: {selection.text.slice(0, 40)}{selection.text.length > 40 ? '...' : ''}
                        </p>
                        <textarea
                          value={annotationText}
                          onChange={(e) => setAnnotationText(e.target.value)}
                          placeholder="输入批注..."
                          className="input w-full h-20 resize-none text-sm mb-2"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.metaKey) {
                              handleCreateAnnotation()
                            }
                          }}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelection(null)
                              window.getSelection()?.removeAllRanges()
                            }}
                            className="btn-ghost text-xs h-7 px-2"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleCreateAnnotation}
                            disabled={!annotationText.trim()}
                            className="btn-primary text-xs h-7 px-2 disabled:opacity-50"
                          >
                            <Send size={12} className="mr-1" />
                            添加批注
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {plan.research_questions?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">核心研究问题</span>
                <div className="mt-2 space-y-2">
                  {plan.research_questions.map((q, i) => (
                    <div key={i} className="border-l-2 border-accent-cyan pl-3 py-1">
                      <p className="text-sm text-text-secondary">{q}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.methodology && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">研究方法</span>
                <div className="mt-2 text-sm text-text-secondary leading-relaxed bg-inset rounded p-3 border border-subtle">
                  {plan.methodology}
                </div>
              </div>
            )}

            {plan.goals?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">研究目标</span>
                <div className="mt-2 space-y-1">
                  {plan.goals.map((goal, i) => {
                    const done = goal.startsWith('[x] ')
                    const text = goal.replace(/^\[[x ]\] /, '')
                    return (
                      <button
                        key={i}
                        onClick={() => toggleGoal(i)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-hover transition-colors"
                      >
                        {done ? (
                          <CheckCircle2 size={15} className="text-accent-green shrink-0" />
                        ) : (
                          <Circle size={15} className="text-text-muted shrink-0" />
                        )}
                        <span className={`text-sm ${done ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                          {text}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {plan.milestones?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">里程碑</span>
                <div className="mt-2 space-y-2">
                  {plan.milestones.map((m, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs font-mono text-accent-cyan shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                      <p className="text-sm text-text-secondary">{m}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.key_challenges?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">关键挑战</span>
                <div className="mt-2 space-y-2">
                  {plan.key_challenges.map((c, i) => (
                    <div key={i} className="border-l-2 border-accent-amber pl-3 py-1">
                      <p className="text-sm text-text-secondary">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.expected_contributions?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">预期贡献</span>
                <div className="mt-2 space-y-2">
                  {plan.expected_contributions.map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs text-accent-green shrink-0 mt-0.5">+</span>
                      <p className="text-sm text-text-secondary">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.knowledge_gaps?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">知识缺口</span>
                <div className="mt-2 space-y-2">
                  {plan.knowledge_gaps.map((gap, i) => (
                    <div key={i} className="border-l-2 border-accent-red pl-3 py-1">
                      <p className="text-sm text-text-secondary">{gap}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(plan.suggested_readings?.length > 0 || canEdit) && (
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-text-tertiary">推荐阅读</span>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      {plan.suggested_readings?.some((r) => r.url && r.status !== 'downloaded') && (
                        <button
                          onClick={handleDownloadAll}
                          disabled={downloadTask?.status === 'running'}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-subtle bg-raised text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors disabled:opacity-50"
                        >
                          {downloadTask?.status === 'running'
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Download size={12} />}
                          一键下载全部
                        </button>
                      )}
                      <button
                        onClick={handleGenerateReadings}
                        disabled={readingsTask?.status === 'running'}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-subtle bg-raised text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors disabled:opacity-50"
                      >
                        {readingsTask?.status === 'running'
                          ? <Loader2 size={12} className="animate-spin" />
                          : <RefreshCw size={12} />}
                        {plan.suggested_readings?.length ? '重新生成清单' : '生成文献清单'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  {plan.suggested_readings?.length > 0 ? (
                    plan.suggested_readings.map((r, i) => (
                      <div key={i} className="border border-subtle rounded px-3 py-2 bg-raised">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-accent-cyan hover:underline"
                              >
                                {r.title || r.url}
                              </a>
                            ) : (
                              <span className="text-sm text-text-secondary">{r.title}</span>
                            )}
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
                              {r.source && (
                                <span className="px-1.5 py-0.5 rounded border border-subtle">
                                  {r.source === 'arxiv' ? 'arXiv' : 'Web'}
                                </span>
                              )}
                              {r.authors && <span className="truncate">{r.authors}</span>}
                            </div>
                            {r.reason && (
                              <p className="mt-1 text-xs text-text-tertiary">{r.reason}</p>
                            )}
                            {r.status === 'failed' && r.error && (
                              <p className="mt-1 text-xs text-accent-red">{r.error}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {r.status === 'downloaded' && r.raw_file_id ? (
                              <Link
                                to={`/pre-raw/${r.raw_file_id}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-subtle text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors"
                              >
                                <FileText size={12} />
                                查看资料
                              </Link>
                            ) : canEdit && r.url ? (
                              <button
                                onClick={() => handleDownloadOne(i)}
                                disabled={downloadingIndex === i}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-subtle text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors disabled:opacity-50"
                              >
                                {downloadingIndex === i
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <Download size={12} />}
                                {r.status === 'failed' ? '重试' : '下载'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-text-tertiary">
                      {readingsTask?.status === 'running' ? '正在检索并筛选文献...' : '暂无文献清单，点击右上角「生成文献清单」按钮生成。'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {plan.related_slugs?.length > 0 && (
              <div className="mb-6">
                <span className="text-[11px] uppercase tracking-wider text-text-tertiary">关联页面</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {plan.related_slugs.map((slug) => (
                    <Link
                      key={slug}
                      to={`/wiki/${slug}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-subtle bg-raised text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors"
                    >
                      <FileText size={12} />
                      {slug}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-subtle">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-text-primary">讨论 ({comments.length})</span>
              </div>

              <div className="space-y-3 mb-4">
                {comments.filter((c) => !c.parent_id).map((c) => {
                  const replies = comments.filter((r) => r.parent_id === c.id)
                  const canDelete = user && (c.user_id === user.id || isAdmin)
                  return (
                    <div key={c.id}>
                      <div className="flex gap-2.5">
                        <div className="w-6 h-6 rounded bg-raised border border-subtle flex items-center justify-center shrink-0">
                          <User size={13} className="text-text-muted" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-text-primary">{c.username}</span>
                            <span className="text-xs text-text-muted">{c.created_at.slice(0, 10)}</span>
                          </div>
                          <p className="text-sm text-text-secondary">{c.content}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <button
                              onClick={() => {
                                setReplyingTo(c.id)
                                setReplyText('')
                              }}
                              className="text-xs text-text-muted hover:text-accent-cyan flex items-center gap-1 transition-colors"
                            >
                              <MessageCircle size={11} />
                              回复
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteComment(c.id)}
                                className="text-xs text-text-muted hover:text-accent-red flex items-center gap-1 transition-colors"
                              >
                                <Trash2 size={11} />
                                删除
                              </button>
                            )}
                          </div>
                          {replyingTo === c.id && (
                            <div className="flex gap-2 mt-2">
                              <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmitReply(c.id)}
                                placeholder={`回复 ${c.username}...`}
                                className="input flex-1"
                                autoFocus
                              />
                              <button onClick={() => handleSubmitReply(c.id)} className="btn-primary h-8 px-2">
                                <Send size={14} strokeWidth={1.5} />
                              </button>
                              <button onClick={() => setReplyingTo(null)} className="btn-ghost h-8 px-2 text-xs">
                                取消
                              </button>
                            </div>
                          )}
                          {replies.length > 0 && (
                            <div className="mt-2 pl-3 border-l border-subtle space-y-2">
                              {replies.map((r) => {
                                const canDeleteReply = user && (r.user_id === user.id || isAdmin)
                                return (
                                  <div key={r.id} className="flex gap-2">
                                    <div className="w-5 h-5 rounded bg-raised border border-subtle flex items-center justify-center shrink-0">
                                      <User size={11} className="text-text-muted" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-medium text-text-primary">{r.username}</span>
                                        <span className="text-xs text-text-muted">{r.created_at.slice(0, 10)}</span>
                                      </div>
                                      <p className="text-xs text-text-secondary">{r.content}</p>
                                      {canDeleteReply && (
                                        <button
                                          onClick={() => handleDeleteComment(r.id)}
                                          className="text-xs text-text-muted hover:text-accent-red flex items-center gap-1 mt-0.5 transition-colors"
                                        >
                                          <Trash2 size={10} />
                                          删除
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {comments.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-4">暂无评论，发表第一条评论吧</p>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-subtle">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                  placeholder="输入评论..."
                  className="input flex-1"
                />
                <button onClick={handleSubmitComment} className="btn-primary h-8 px-3">
                  <Send size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-subtle text-xs text-text-muted">
              创建于 {plan.created_at.slice(0, 10)} · 更新于 {plan.updated_at.slice(0, 10)}
            </div>
          </div>
        </div>

        {panelCollapsed ? (
          <div className="shrink-0 sticky top-6 self-start">
            <button
              onClick={() => setPanelCollapsed(false)}
              className="btn-ghost !px-2 h-8"
              title="展开批注面板"
            >
              <PanelLeftOpen size={16} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div className="w-72 shrink-0 sticky top-6 self-start">
            <div className="border border-subtle rounded bg-surface overflow-hidden">
              <div className="px-3 h-9 flex items-center justify-between border-b border-subtle bg-raised/30">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus size={14} strokeWidth={1.5} className="text-accent-cyan" />
                  <span className="text-xs font-medium text-text-primary">批注 ({annotations.length})</span>
                </div>
                <button
                  onClick={() => setPanelCollapsed(true)}
                  className="p-1 rounded hover:bg-hover text-text-tertiary"
                  title="收起批注面板"
                >
                  <PanelLeftClose size={14} strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-auto">
                {annotations.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-4">
                    暂无批注，在描述中选中文本后添加
                  </p>
                )}
                {annotations.map((ann) => {
                  const canDelete = user && (ann.user_id === user.id || isAdmin)
                  const isActive = activeAnnotationId === ann.id
                  return (
                    <div
                      key={ann.id}
                      id={`annotation-item-${ann.id}`}
                      onClick={() => handleAnnotationItemClick(ann.id)}
                      className={`rounded p-2.5 cursor-pointer transition-colors border ${
                        isActive
                          ? 'bg-accent-cyan/10 border-accent-cyan/20'
                          : 'bg-raised border-transparent hover:border-subtle'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-5 h-5 rounded bg-surface border border-subtle flex items-center justify-center shrink-0">
                          <User size={11} className="text-text-muted" />
                        </div>
                        <span className="text-xs font-medium text-text-primary">{ann.username}</span>
                        <span className="text-xs text-text-muted">{ann.created_at.slice(0, 10)}</span>
                      </div>
                      <p className="text-xs text-text-tertiary mb-1.5 truncate">
                        "{ann.selected_text.slice(0, 60)}{ann.selected_text.length > 60 ? '...' : ''}"
                      </p>
                      <p className="text-xs text-text-secondary">{ann.content}</p>
                      {canDelete && (
                        <div className="flex justify-end mt-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteAnnotation(ann.id)
                            }}
                            className="p-1 rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                            title="删除批注"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDelete}
        title="删除研究计划"
        description={`确定删除「${plan.title}」？此操作不可恢复。`}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDeletePlan}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  )
}

function getSelectionOffsets(range: Range, root: HTMLElement): { start: number; end: number; text: string } | null {
  const startOffset = getTextOffset(range.startContainer, range.startOffset, root)
  const endOffset = getTextOffset(range.endContainer, range.endOffset, root)
  const text = range.toString()
  if (startOffset === null || endOffset === null || startOffset >= endOffset) return null
  return { start: startOffset, end: endOffset, text }
}

function getTextOffset(container: Node, offset: number, root: HTMLElement): number | null {
  if (container === root) {
    let count = 0
    for (let i = 0; i < offset && i < container.childNodes.length; i++) {
      count += getNodeTextLength(container.childNodes[i])
    }
    return count
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === container || isDescendant(container, node)) {
      return total + offset
    }
    total += node.textContent?.length || 0
  }
  return null
}

function isDescendant(ancestor: Node, descendant: Node): boolean {
  let parent = descendant.parentNode
  while (parent) {
    if (parent === ancestor) return true
    parent = parent.parentNode
  }
  return false
}

function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length || 0
  }
  let len = 0
  node.childNodes.forEach((child) => {
    len += getNodeTextLength(child)
  })
  return len
}

function applyHighlights(root: HTMLElement, annotations: PlanAnnotation[]) {
  const existingMarks = root.querySelectorAll('.annotation-highlight')
  existingMarks.forEach((mark) => {
    const parent = mark.parentNode
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
      parent.normalize()
    }
  })

  if (annotations.length === 0) return

  const sorted = [...annotations].sort((a, b) => a.start_offset - b.start_offset)

  const textNodes: { node: Text; start: number; end: number }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let pos = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length || 0
    textNodes.push({ node: node as Text, start: pos, end: pos + len })
    pos += len
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const ann = sorted[i]
    const annStart = ann.start_offset
    const annEnd = ann.end_offset

    for (const tn of textNodes) {
      if (tn.end <= annStart || tn.start >= annEnd) continue

      const nodeStart = Math.max(tn.start, annStart)
      const nodeEnd = Math.min(tn.end, annEnd)
      const relStart = nodeStart - tn.start
      const relEnd = nodeEnd - tn.start

      if (relStart === 0 && relEnd === tn.end - tn.start) {
        const mark = document.createElement('mark')
        mark.className = 'annotation-highlight'
        mark.dataset.annotationId = ann.id
        mark.textContent = tn.node.textContent || ''
        tn.node.parentNode?.replaceChild(mark, tn.node)
      } else {
        const text = tn.node.textContent || ''
        const before = document.createTextNode(text.slice(0, relStart))
        const mark = document.createElement('mark')
        mark.className = 'annotation-highlight'
        mark.dataset.annotationId = ann.id
        mark.textContent = text.slice(relStart, relEnd)
        const after = document.createTextNode(text.slice(relEnd))

        const parent = tn.node.parentNode
        if (!parent) continue
        parent.insertBefore(before, tn.node)
        parent.insertBefore(mark, tn.node)
        parent.insertBefore(after, tn.node)
        parent.removeChild(tn.node)
      }
    }

    textNodes.length = 0
    pos = 0
    const walker2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
    while ((node = walker2.nextNode())) {
      const len = node.textContent?.length || 0
      textNodes.push({ node: node as Text, start: pos, end: pos + len })
      pos += len
    }
  }
}
