import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { RawFile } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { ArrowLeft, Download, FileArchive, BookOpen, Send, User, Trash2, RefreshCw, Loader2, MessageCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { PropertyList } from '@/components/PropertyList'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { IngestPlanDialog, type IngestPlanGroup, type IngestPlanPage } from '@/components/IngestPlanDialog'
import { toast } from '@/stores/toastStore'
import { useTaskStore } from '@/stores/taskStore'

interface IngestPlan {
  session_id: string
  pages: IngestPlanPage[]
  all_new_tags: string[]
}

interface IngestProgress {
  total: number
  done: number
  current_title: string
  page_results: Array<{ title: string; slug?: string; action: string; status: string; error?: string }>
}

interface Comment {
  id: string
  raw_file_id: string
  user_id: string
  username: string
  content: string
  parent_id?: string | null
  created_at: string
}

const statusLabel: Record<string, { label: string; variant: 'default' | 'active' | 'success' | 'warning' | 'muted' | 'danger' }> = {
  pending: { label: '待处理', variant: 'warning' },
  ingested: { label: '已入库', variant: 'success' },
  skipped: { label: '已跳过', variant: 'muted' },
  failed: { label: '失败', variant: 'danger' },
}

export function RawDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [file, setFile] = useState<RawFile | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [planning, setPlanning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [plan, setPlan] = useState<IngestPlan | null>(null)
  const [progress, setProgress] = useState<IngestProgress | null>(null)
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const taskKey = `ingest-${id}`
  const ingestTask = useTaskStore((s) => s.tasks[taskKey])
  const generating = ingestTask?.status === 'running'

  // 轮询摄入会话进度（1.5s），页面切换后回来可继续观察
  useEffect(() => {
    const sessionId = ingestTask?.data?.sessionId
    const pages = ingestTask?.data?.pages
    if (ingestTask?.status !== 'running' || !sessionId) return
    // generate 触发丢失（如后端重启杀后台任务）时 session 会长期停在 planned：
    // 连续 8 轮（≈12s，正常应在 1s 内翻为 generating）仍是 planned 则自动补发，最多 2 次
    let plannedPolls = 0
    let refires = 0
    let refiring = false
    const timer = setInterval(async () => {
      try {
        const resp = await api.get(`/ai/ingest/sessions/${sessionId}`)
        const { status, progress: p, error } = resp.data
        setProgress(p)
        if (status === 'planned' && Array.isArray(pages)) {
          plannedPolls += 1
          if (plannedPolls >= 8 && !refiring) {
            if (refires >= 2) {
              clearInterval(timer)
              useTaskStore.getState().failTask(taskKey, '生成无法启动（触发请求多次丢失），请重新确认摄入')
              toast({ title: '生成无法启动', description: '触发请求多次丢失，请重新发起摄入', variant: 'error' })
              return
            }
            refiring = true
            refires += 1
            plannedPolls = 0
            try {
              await api.post(`/ai/ingest/sessions/${sessionId}/generate`, { pages }, { timeout: 15000 })
              toast({ title: '生成触发丢失，已自动重试', variant: 'warning' })
            } catch {
              // 补发失败（如任务实际已启动）静默，下轮继续观察
            } finally {
              refiring = false
            }
          }
        } else {
          plannedPolls = 0
        }
        if (status === 'completed') {
          clearInterval(timer)
          useTaskStore.getState().succeedTask(taskKey, { sessionId, progress: p })
          const ok = (p?.page_results || []).filter((r: any) => r.status === 'ok').length
          const failed = (p?.page_results || []).filter((r: any) => r.status === 'error').length
          toast({
            title: '摄入完成',
            description: `已生成/完善 ${ok} 个页面${failed > 0 ? `，${failed} 个失败` : ''}`,
            variant: failed > 0 ? 'warning' : 'success',
          })
          loadData()
        } else if (status === 'failed' || status === 'cancelled') {
          clearInterval(timer)
          useTaskStore.getState().failTask(taskKey, error || status)
          toast({
            title: status === 'cancelled' ? '摄入已取消' : '摄入失败',
            description: error || undefined,
            variant: status === 'cancelled' ? 'warning' : 'error',
          })
          loadData()
        }
      } catch {
        // 轮询偶发失败静默，下轮重试
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [ingestTask?.status, ingestTask?.data?.sessionId])

  useEffect(() => {
    if (!id) return
    loadData()
  }, [id])

  const loadData = () => {
    setLoading(true)
    api.get('/raw').then((resp) => {
      const f = resp.data.find((x: RawFile) => x.id === id)
      setFile(f || null)
      setLoading(false)
    })
    api.get(`/raw/${id}/comments`).then((resp) => {
      setComments(resp.data)
    })
  }

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !id) return
    try {
      await api.post(`/raw/${id}/comments`, { content: commentText.trim() })
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
      await api.post(`/raw/${id}/comments`, { content: replyText.trim(), parent_id: parentId })
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

  // 阶段一：让 AI 规划页面清单（1 次 LLM 调用），打开确认对话框
  const handleIngest = async () => {
    if (!file || !id) return
    setPlanning(true)
    try {
      const resp = await api.post('/ai/ingest/plan', { raw_file_id: id })
      const data = resp.data as IngestPlan
      if (!data.pages || data.pages.length === 0) {
        toast({ title: 'AI 未规划出任何页面', description: '资料内容可能为空或无法解析', variant: 'warning' })
        return
      }
      setPlan(data)
    } catch (err: any) {
      toast({
        title: '摄入规划失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setPlanning(false)
    }
  }

  // 阶段二：用户确认后提交生成，后台逐页执行并轮询进度
  const handleConfirmPlan = async (groups: IngestPlanGroup[]) => {
    if (!plan || groups.length === 0) return
    const pages = groups[0].pages
    setConfirming(true)
    try {
      // generate 应立即返回；加超时避免响应丢失（如后端重启）时永远卡在等待中
      await api.post(`/ai/ingest/sessions/${plan.session_id}/generate`, { pages }, { timeout: 15000 })
      setPlan(null)
      setProgress(null)
      // pages 一并持久化：generate 触发丢失时轮询可用它幂等补发
      useTaskStore.getState().startTask(taskKey, { sessionId: plan.session_id, pages })
    } catch (err: any) {
      toast({
        title: '启动生成失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setConfirming(false)
    }
  }

  const handleCancelPlan = () => {
    if (plan) {
      api.post(`/ai/ingest/sessions/${plan.session_id}/cancel`).catch(() => {})
    }
    setPlan(null)
  }

  const handleDeleteComment = async () => {
    if (!deleteCommentId || !id) return
    try {
      await api.delete(`/raw/${id}/comments/${deleteCommentId}`)
      loadData()
      toast({ title: '评论已删除', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '删除失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setDeleteCommentId(null)
    }
  }

  const handleDownload = async () => {
    if (!file) return
    const resp = await api.get(`/raw/download/${file.id}`, { responseType: 'blob' })
    const blob = new Blob([resp.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.original_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="h-8 w-32 animate-pulse bg-surface rounded mx-auto" />
      </div>
    )
  }

  if (!file) {
    return (
      <div className="py-12 text-center text-text-tertiary">
        <p>文件不存在</p>
        <button onClick={() => navigate('/raw')} className="btn-secondary mt-4 h-8 px-3 text-xs">
          <ArrowLeft size={14} className="mr-1.5" />
          返回列表
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={file.original_name}
        description={file.filename}
        icon={FileArchive}
        meta={
          <StatusBadge variant={statusLabel[file.status]?.variant || 'default'}>
            {statusLabel[file.status]?.label || file.status}
          </StatusBadge>
        }
        actions={
          <>
            <Link
              to="/raw"
              className="btn-ghost h-8 w-8 !px-0 flex items-center justify-center"
              aria-label="返回"
            >
              <ArrowLeft size={15} strokeWidth={1.5} />
            </Link>
            <button
              onClick={handleDownload}
              className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
            >
              <Download size={14} strokeWidth={1.5} />
              下载
            </button>
            <button
              onClick={() => navigate(`/reader/${file.id}?type=raw`)}
              className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5"
            >
              <BookOpen size={14} strokeWidth={1.5} />
              阅读
            </button>
            <button
              onClick={handleIngest}
              disabled={planning || generating}
              className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {planning || generating ? (
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <RefreshCw size={14} strokeWidth={1.5} />
              )}
              {planning
                ? '规划中…'
                : generating
                  ? '摄入中…'
                  : file.status === 'ingested'
                    ? '更新 Wiki'
                    : '摄入知识库'}
            </button>
          </>
        }
      />

      {(generating || (progress && ingestTask)) && (
        <div className="border border-subtle rounded bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-sm text-text-secondary">
              {generating ? (
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-accent-cyan" />
              ) : ingestTask?.status === 'success' ? (
                <CheckCircle2 size={14} strokeWidth={1.5} className="text-accent-green" />
              ) : (
                <AlertCircle size={14} strokeWidth={1.5} className="text-accent-red" />
              )}
              已生成 {progress?.done ?? 0}/{progress?.total ?? '…'} 页
              {generating && progress?.current_title && (
                <span className="text-text-tertiary">（当前：{progress.current_title}）</span>
              )}
            </span>
            {!generating && (
              <button
                onClick={() => {
                  useTaskStore.getState().clearTask(taskKey)
                  setProgress(null)
                }}
                className="text-xs underline text-text-tertiary hover:text-text-primary"
              >
                关闭
              </button>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-inset overflow-hidden">
            <div
              className="h-full bg-accent-cyan transition-all duration-500"
              style={{
                width: progress?.total ? `${(progress.done / progress.total) * 100}%` : '0%',
              }}
            />
          </div>
          {progress && progress.page_results.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {progress.page_results.map((r, i) =>
                r.status === 'ok' && r.slug ? (
                  <Link
                    key={i}
                    to={`/wiki/${r.slug}`}
                    className="text-[11px] px-1.5 py-0.5 rounded-sm border border-accent-green/20 bg-accent-green/10 text-accent-green hover:underline"
                  >
                    {r.action === 'enriched' ? '已完善' : '已建'} {r.title}
                  </Link>
                ) : r.status === 'error' ? (
                  <span
                    key={i}
                    title={r.error}
                    className="text-[11px] px-1.5 py-0.5 rounded-sm border border-accent-red/20 bg-accent-red/10 text-accent-red"
                  >
                    失败 {r.title}
                  </span>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      <PropertyList
        columns={2}
        properties={[
          { label: '大小', value: `${(file.file_size / 1024).toFixed(1)} KB` },
          { label: '类型', value: file.mime_type || '未知' },
          {
            label: '所在文件夹',
            value: file.category ? `raw/${file.category}/` : 'raw/（根目录）',
            fullWidth: true,
          },
          { label: '上传时间', value: file.created_at.slice(0, 10) },
          { label: '状态', value: statusLabel[file.status]?.label || file.status },
        ]}
      />

      {file.status === 'ingested' && file.wiki_pages.length > 0 && (
        <div className="border border-subtle rounded bg-surface p-4">
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary">关联 Wiki</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {file.wiki_pages.map((page) => (
              <Link
                key={page.id}
                to={`/wiki/${page.slug}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-subtle bg-raised text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors"
              >
                <BookOpen size={12} strokeWidth={1.5} />
                {page.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border border-subtle rounded bg-surface overflow-hidden">
        <div className="px-4 h-10 flex items-center border-b border-subtle bg-raised/30">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">讨论 ({comments.length})</span>
        </div>
        <div className="p-4 space-y-3">
          <CommentThread
            comments={comments}
            replyingTo={replyingTo}
            replyText={replyText}
            onReply={(parentId) => {
              setReplyingTo(parentId)
              setReplyText('')
            }}
            onReplyTextChange={setReplyText}
            onSubmitReply={handleSubmitReply}
            onCancelReply={() => setReplyingTo(null)}
            onDelete={setDeleteCommentId}
            user={user}
            isAdmin={isAdmin}
          />

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
      </div>

      <ConfirmDialog
        open={!!deleteCommentId}
        title="删除评论"
        description="确定删除这条评论？"
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDeleteComment}
        onCancel={() => setDeleteCommentId(null)}
      />

      <IngestPlanDialog
        key={plan?.session_id ?? 'ingest-plan-closed'}
        open={!!plan}
        groups={
          plan
            ? [{ key: plan.session_id, label: file.original_name, pages: plan.pages }]
            : []
        }
        confirming={confirming}
        onConfirm={handleConfirmPlan}
        onCancel={handleCancelPlan}
      />
    </div>
  )
}

function CommentThread({
  comments,
  replyingTo,
  replyText,
  onReply,
  onReplyTextChange,
  onSubmitReply,
  onCancelReply,
  onDelete,
  user,
  isAdmin,
}: {
  comments: Comment[]
  replyingTo: string | null
  replyText: string
  onReply: (id: string) => void
  onReplyTextChange: (text: string) => void
  onSubmitReply: (id: string) => void
  onCancelReply: () => void
  onDelete: (id: string) => void
  user: { id: string; role: string } | null
  isAdmin: boolean
}) {
  const topLevel = comments.filter((c) => !c.parent_id)
  if (topLevel.length === 0) {
    return <p className="text-sm text-text-muted text-center py-4">暂无评论，发表第一条评论吧</p>
  }

  return (
    <div className="space-y-3">
      {topLevel.map((c) => {
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
                    onClick={() => onReply(c.id)}
                    className="text-xs text-text-muted hover:text-accent-cyan flex items-center gap-1 transition-colors"
                  >
                    <MessageCircle size={11} strokeWidth={1.5} />
                    回复
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => onDelete(c.id)}
                      className="text-xs text-text-muted hover:text-accent-red flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={11} strokeWidth={1.5} />
                      删除
                    </button>
                  )}
                </div>
                {replyingTo === c.id && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => onReplyTextChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onSubmitReply(c.id)}
                      placeholder={`回复 ${c.username}...`}
                      className="input flex-1"
                      autoFocus
                    />
                    <button onClick={() => onSubmitReply(c.id)} className="btn-primary h-8 px-2">
                      <Send size={14} strokeWidth={1.5} />
                    </button>
                    <button onClick={onCancelReply} className="btn-ghost h-8 px-2 text-xs">
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
                                onClick={() => onDelete(r.id)}
                                className="text-xs text-text-muted hover:text-accent-red flex items-center gap-1 mt-0.5 transition-colors"
                              >
                                <Trash2 size={10} strokeWidth={1.5} />
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
    </div>
  )
}
