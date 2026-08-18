import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { HumanOutput } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import {
  ArrowLeft,
  Download,
  FileArchive,
  BookOpen,
  Send,
  User,
  Trash2,
  CheckCircle2,
  Eye,
  XCircle,
  Loader2,
  MessageCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { PropertyList } from '@/components/PropertyList'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useT } from '@/i18n'

interface Comment {
  id: string
  human_output_id: string
  user_id: string
  username: string
  content: string
  parent_id?: string | null
  created_at: string
}

const statusLabel: Record<string, { label: string; variant: 'default' | 'active' | 'success' | 'warning' | 'muted' | 'danger' }> = {
  pending: { label: '待入库', variant: 'warning' },
  watching: { label: '观望', variant: 'active' },
  discarded: { label: '弃用', variant: 'muted' },
  ingested: { label: '已入库', variant: 'success' },
}

export function HumanOutputDetail() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [file, setFile] = useState<HumanOutput | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [ingesting, setIngesting] = useState(false)
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null)
  const [showDeleteFile, setShowDeleteFile] = useState(false)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role === 'admin' || user?.role === 'editor'

  useEffect(() => {
    if (!id) return
    loadData()
  }, [id])

  const loadData = () => {
    setLoading(true)
    api.get(`/raw/human-outputs/${id}`).then((resp) => {
      setFile(resp.data)
      setLoading(false)
    })
    api.get(`/raw/human-outputs/${id}/comments`).then((resp) => {
      setComments(resp.data)
    })
  }

  const handleStatusChange = async (status: string) => {
    if (!id) return
    try {
      await api.patch(`/raw/human-outputs/${id}/status`, { status })
      loadData()
      toast({ title: t('状态已更新'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('状态更新失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleIngest = async () => {
    if (!id || ingesting) return
    setIngesting(true)
    try {
      await api.post(`/raw/human-outputs/${id}/ingest`)
      loadData()
      toast({ title: t('已入库'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('入库失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setIngesting(false)
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await api.delete(`/raw/human-outputs/${id}`)
      navigate('/human-outputs')
      toast({ title: t('文档已删除'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('删除失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setShowDeleteFile(false)
    }
  }

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !id) return
    try {
      await api.post(`/raw/human-outputs/${id}/comments`, { content: commentText.trim() })
      setCommentText('')
      loadData()
    } catch (err: any) {
      toast({
        title: t('评论失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleSubmitReply = async (parentId: string) => {
    if (!replyText.trim() || !id) return
    try {
      await api.post(`/raw/human-outputs/${id}/comments`, { content: replyText.trim(), parent_id: parentId })
      setReplyText('')
      setReplyingTo(null)
      loadData()
    } catch (err: any) {
      toast({
        title: t('回复失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleDeleteComment = async () => {
    if (!deleteCommentId || !id) return
    try {
      await api.delete(`/raw/human-outputs/${id}/comments/${deleteCommentId}`)
      loadData()
      toast({ title: t('评论已删除'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('删除失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setDeleteCommentId(null)
    }
  }

  const handleDownload = async () => {
    if (!file) return
    const resp = await api.get(`/raw/human-outputs/${file.id}/download`, { responseType: 'blob' })
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
        <p>{t('文件不存在')}</p>
        <button onClick={() => navigate('/human-outputs')} className="btn-secondary mt-4 h-8 px-3 text-xs">
          <ArrowLeft size={14} className="mr-1.5" />
          {t('返回人类产出')}
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
            {t(statusLabel[file.status]?.label || file.status)}
          </StatusBadge>
        }
        actions={
          <>
            <Link
              to="/human-outputs"
              className="btn-ghost h-8 w-8 !px-0 flex items-center justify-center"
              aria-label={t('返回')}
            >
              <ArrowLeft size={15} strokeWidth={1.5} />
            </Link>
            <button
              onClick={handleDownload}
              className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
            >
              <Download size={14} strokeWidth={1.5} />
              {t('下载')}
            </button>
            <button
              onClick={() => navigate(`/reader/${file.id}?type=human-output`)}
              className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5"
            >
              <BookOpen size={14} strokeWidth={1.5} />
              {t('阅读')}
            </button>
          </>
        }
      />

      <PropertyList
        columns={2}
        properties={[
          { label: t('大小'), value: `${file.file_size ? (file.file_size / 1024).toFixed(1) : '0'} KB` },
          { label: t('类型'), value: file.mime_type || t('未知') },
          { label: t('领域'), value: file.category || t('根目录') },
          { label: t('上传时间'), value: file.created_at.slice(0, 10) },
        ]}
      />

      {canEdit && file.status !== 'ingested' && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStatusChange('watching')}
            className={`h-8 px-3 text-xs font-medium rounded border flex items-center gap-1.5 transition-colors ${
              file.status === 'watching'
                ? 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan'
                : 'border-subtle text-text-secondary hover:text-accent-cyan hover:bg-hover'
            }`}
          >
            <Eye size={14} strokeWidth={1.5} />
            {t('观望')}
          </button>
          <button
            onClick={() => handleStatusChange('discarded')}
            className={`h-8 px-3 text-xs font-medium rounded border flex items-center gap-1.5 transition-colors ${
              file.status === 'discarded'
                ? 'border-accent-red/30 bg-accent-red/10 text-accent-red'
                : 'border-subtle text-text-secondary hover:text-accent-red hover:bg-accent-red/10'
            }`}
          >
            <XCircle size={14} strokeWidth={1.5} />
            {t('弃用')}
          </button>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="h-8 px-3 text-xs font-medium rounded border border-accent-green/20 bg-accent-green/10 text-accent-green hover:bg-accent-green/20 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            {ingesting ? (
              <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} strokeWidth={1.5} />
            )}
            {ingesting ? t('入库中…') : t('入库')}
          </button>
        </div>
      )}

      {canEdit && (
        <div className="flex">
          <button
            onClick={() => setShowDeleteFile(true)}
            className="h-8 px-3 text-xs font-medium rounded border border-accent-red/20 text-accent-red hover:bg-accent-red/10 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 size={14} strokeWidth={1.5} />
            {t('删除')}
          </button>
        </div>
      )}

      <div className="border border-subtle rounded bg-surface overflow-hidden">
        <div className="px-4 h-10 flex items-center border-b border-subtle bg-raised/30">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('讨论 ({n})', { n: comments.length })}</span>
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
              placeholder={t('输入评论...')}
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
        title={t('删除评论')}
        description={t('确定删除这条评论？')}
        variant="danger"
        confirmLabel={t('删除')}
        onConfirm={handleDeleteComment}
        onCancel={() => setDeleteCommentId(null)}
      />

      <ConfirmDialog
        open={showDeleteFile}
        title={t('删除文档')}
        description={t('确定删除「{name}」？此操作不可恢复。', { name: file.original_name })}
        variant="danger"
        confirmLabel={t('删除')}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteFile(false)}
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
  const t = useT()
  const topLevel = comments.filter((c) => !c.parent_id)
  if (topLevel.length === 0) {
    return <p className="text-sm text-text-muted text-center py-4">{t('暂无评论，发表第一条评论吧')}</p>
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
                    {t('回复')}
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => onDelete(c.id)}
                      className="text-xs text-text-muted hover:text-accent-red flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={11} strokeWidth={1.5} />
                      {t('删除')}
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
                      placeholder={t('回复 {name}...', { name: c.username })}
                      className="input flex-1"
                      autoFocus
                    />
                    <button onClick={() => onSubmitReply(c.id)} className="btn-primary h-8 px-2">
                      <Send size={14} strokeWidth={1.5} />
                    </button>
                    <button onClick={onCancelReply} className="btn-ghost h-8 px-2 text-xs">
                      {t('取消')}
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
                                {t('删除')}
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
