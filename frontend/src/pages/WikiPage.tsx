import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/api/client'
import { WikiPage as WikiPageType } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { FileText, Lightbulb, Layers, ArrowLeft, Save, Pencil, Trash2, Share2 } from 'lucide-react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSetPageWidth } from '@/components/PageWidth'
import { toast } from '@/stores/toastStore'
import { useT } from '@/i18n'

const typeConfig: Record<string, { label: string; variant: 'default' | 'active' | 'success'; icon: typeof FileText }> = {
  entity: { label: '实体', variant: 'active', icon: FileText },
  concept: { label: '概念', variant: 'default', icon: Lightbulb },
  synthesis: { label: '综合', variant: 'success', icon: Layers },
}

export function WikiPage() {
  const t = useT()
  const { slug } = useParams()
  const navigate = useNavigate()
  const setReader = useSetPageWidth('reader')
  const [page, setPage] = useState<WikiPageType | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    setReader()
  }, [setReader])

  useEffect(() => {
    if (!slug) return
    api.get(`/wiki/${slug}`).then((resp) => {
      setPage(resp.data)
      setEditContent(resp.data.content)
    })
  }, [slug])

  const handleSave = async () => {
    if (!slug) return
    setSaving(true)
    try {
      await api.put(`/wiki/${slug}`, { content: editContent })
      setIsEditing(false)
      const resp = await api.get(`/wiki/${slug}`)
      setPage(resp.data)
      toast({ title: t('保存成功'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('保存失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!slug) return
    try {
      await api.delete(`/wiki/${slug}`)
      navigate('/wiki')
      toast({ title: t('页面已删除'), variant: 'success' })
    } catch (err: any) {
      toast({
        title: t('删除失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setShowDelete(false)
    }
  }

  if (!page) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-text-tertiary text-sm">{t('加载中…')}</div>
      </div>
    )
  }

  const tc = typeConfig[page.type] || typeConfig.entity
  const Icon = tc.icon
  const canEdit = user?.role === 'admin' || user?.role === 'editor'

  return (
    <div className="space-y-4">
      <PageHeader
        title={page.title}
        meta={
          <>
            <StatusBadge variant={tc.variant}>
              <Icon size={12} strokeWidth={1.5} className="mr-1" />
              {t(tc.label)}
            </StatusBadge>
            {page.tags.length > 0 && (
              <span className="flex items-center gap-1">
                {page.tags.map((tag) => (
                  <span key={tag} className="text-[11px] font-mono text-text-tertiary">
                    #{tag}
                  </span>
                ))}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Link
              to="/wiki"
              className="btn-ghost h-8 w-8 !px-0 flex items-center justify-center"
              aria-label={t('返回')}
            >
              <ArrowLeft size={15} strokeWidth={1.5} />
            </Link>
            {canEdit && (
              <>
                <button
                  onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                  disabled={saving}
                  className={`h-8 px-3 text-xs font-medium rounded flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                    isEditing
                      ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20'
                      : 'border border-subtle text-text-secondary hover:text-text-primary hover:bg-hover'
                  }`}
                >
                  {isEditing ? (
                    <>
                      <Save size={14} strokeWidth={1.5} />
                      {saving ? t('保存中…') : t('保存')}
                    </>
                  ) : (
                    <>
                      <Pencil size={14} strokeWidth={1.5} />
                      {t('编辑')}
                    </>
                  )}
                </button>
                <button
                  onClick={() => navigate(`/wiki?focus=${page.slug}`)}
                  title={t('以知识图谱形式查看本页关联')}
                  className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5"
                >
                  <Share2 size={14} strokeWidth={1.5} />
                  {t('图谱视角')}
                </button>
                <button
                  onClick={() => setShowDelete(true)}
                  className="h-8 px-3 text-xs font-medium rounded border border-accent-red/20 text-accent-red hover:bg-accent-red/10 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                  {t('删除')}
                </button>
              </>
            )}
            {!canEdit && (
              <button
                onClick={() => navigate(`/wiki?focus=${page.slug}`)}
                title={t('以知识图谱形式查看本页关联')}
                className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <Share2 size={14} strokeWidth={1.5} />
                {t('图谱视角')}
              </button>
            )}
          </>
        }
      />

      {isEditing ? (
        <div className="border border-subtle rounded overflow-hidden bg-surface">
          <div className="px-3 h-9 flex items-center border-b border-subtle bg-raised text-xs uppercase tracking-wider text-text-tertiary">
            {t('Markdown 源码')}
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-[60vh] p-4 bg-inset text-text-primary font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="border border-subtle rounded bg-surface p-6">
          <MarkdownRenderer
            content={page.content}
            onWikiLinkClick={(linkSlug) => navigate(`/wiki/${linkSlug}`)}
          />
        </div>
      )}

      {((page.raw_files && page.raw_files.length > 0) ||
        (page.source_paths && page.source_paths.length > 0)) && (
        <div className="border border-subtle rounded bg-surface p-4">
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary">{t('来源资料')}</span>
          {page.raw_files && page.raw_files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {page.raw_files.map((f) => (
                <Link
                  key={f.id}
                  to={`/raw/${f.id}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-subtle bg-raised text-xs text-text-secondary hover:border-accent-cyan/30 hover:text-accent-cyan transition-colors"
                >
                  <FileText size={12} strokeWidth={1.5} />
                  {f.original_name}
                </Link>
              ))}
            </div>
          )}
          {page.source_paths && page.source_paths.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {page.source_paths.map((p) => (
                <span
                  key={p}
                  className="text-xs font-mono text-text-muted bg-inset px-1.5 py-0.5 rounded-sm"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showDelete}
        title={t('删除 Wiki 页面')}
        description={t('确定删除「{title}」？此操作不可撤销。', { title: page.title })}
        variant="danger"
        confirmLabel={t('删除')}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  )
}
