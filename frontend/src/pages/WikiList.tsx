import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { WikiPage } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { Search, FileText, Lightbulb, Layers, List, Share2, Trash2, RefreshCw, Loader2, ArrowUp, ArrowDown, X, ChevronDown } from 'lucide-react'
import { WikiGraph } from '@/components/WikiGraph'
import { PageHeader } from '@/components/PageHeader'
import { Toolbar, ToolbarGroup } from '@/components/Toolbar'
import { DataList } from '@/components/DataList'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useBatchIngest } from '@/components/BatchIngest'

const typeConfig: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  entity: { label: '实体', color: 'text-wiki-entity', icon: FileText },
  concept: { label: '概念', color: 'text-wiki-concept', icon: Lightbulb },
  synthesis: { label: '综合', color: 'text-wiki-synthesis', icon: Layers },
}

export function WikiList() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [pages, setPages] = useState<WikiPage[]>([])
  const [filter, setFilter] = useState(searchParams.get('search') || '')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const tagDropdownRef = useRef<HTMLDivElement>(null)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'graph'>(searchParams.get('focus') ? 'graph' : 'list')
  const [focusSlug, setFocusSlug] = useState<string | null>(searchParams.get('focus'))
  const kb = useBatchIngest(() => loadPages())
  const [deleteTarget, setDeleteTarget] = useState<WikiPage | null>(null)
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'editor'

  useEffect(() => {
    loadPages()
  }, [])

  const loadPages = () => {
    setLoading(true)
    api.get('/wiki')
      .then((resp) => setPages(resp.data))
      .catch(() => toast({ title: '加载 Wiki 失败', variant: 'error' }))
      .finally(() => setLoading(false))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/wiki/${deleteTarget.slug}`)
      setPages((prev) => prev.filter((p) => p.slug !== deleteTarget.slug))
      toast({ title: `已删除 ${deleteTarget.title}`, variant: 'success' })
    } catch (err: any) {
      toast({
        title: '删除失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  useEffect(() => {
    if (!tagDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tagDropdownOpen])

  const allTags = Array.from(new Set(pages.flatMap((p) => p.tags))).sort()

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const filtered = pages
    .filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(filter.toLowerCase()) ||
        p.slug.toLowerCase().includes(filter.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
      const matchesTags = selectedTags.every((t) => p.tags.includes(t))
      const matchesDate = !dateFrom || new Date(p.updated_at) >= new Date(dateFrom)
      return matchesSearch && matchesTags && matchesDate
    })
    .sort((a, b) => {
      const diff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      return sortOrder === 'desc' ? diff : -diff
    })

  const columns = [
    {
      key: 'type',
      header: '类型',
      width: '80px',
      render: (page: WikiPage) => {
        const tc = typeConfig[page.type] || typeConfig.entity
        return (
          <span className={`flex items-center gap-1.5 text-xs font-medium ${tc.color}`}>
            <tc.icon size={14} strokeWidth={1.5} />
            {tc.label}
          </span>
        )
      },
    },
    {
      key: 'title',
      header: '标题',
      render: (page: WikiPage) => (
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{page.title}</div>
          {page.summary && <div className="text-xs text-text-tertiary truncate">{page.summary}</div>}
        </div>
      ),
    },
    {
      key: 'tags',
      header: (
        <div className="relative" ref={tagDropdownRef}>
          <button
            onClick={() => setTagDropdownOpen((o) => !o)}
            title="按标签筛选（可多选）"
            className="flex items-center gap-1 uppercase tracking-wider hover:text-text-primary transition-colors"
          >
            标签
            {selectedTags.length > 0 && (
              <span className="text-accent-cyan">({selectedTags.length})</span>
            )}
            <ChevronDown
              size={12}
              className={`transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {tagDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 w-48 max-h-64 overflow-y-auto rounded border border-subtle bg-surface shadow-lg normal-case tracking-normal">
              {allTags.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-tertiary">暂无标签</div>
              ) : (
                allTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-hover cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="accent-accent-cyan"
                    />
                    <span className="font-mono text-text-primary">#{tag}</span>
                  </label>
                ))
              )}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="w-full px-3 py-1.5 text-xs text-left text-accent-cyan hover:bg-hover border-t border-subtle"
                >
                  清除全部（{selectedTags.length}）
                </button>
              )}
            </div>
          )}
        </div>
      ),
      width: '200px',
      render: (page: WikiPage) => (
        <div className="flex flex-wrap gap-1.5">
          {page.tags.map((tag) => (
            <span key={tag} className="text-[11px] font-mono text-text-tertiary bg-raised px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'updated',
      header: (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            title="点击切换升序/降序"
            className="flex items-center gap-1 uppercase tracking-wider hover:text-text-primary transition-colors"
          >
            更新
            {sortOrder === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          </button>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="筛选该日期及之后更新的页面"
            className="input h-6 px-1.5 text-[11px] w-[120px] normal-case tracking-normal"
          />
        </div>
      ),
      width: '150px',
      render: (page: WikiPage) => (
        <time className="text-xs text-text-tertiary">
          {new Date(page.updated_at).toLocaleDateString()}
        </time>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '72px',
      align: 'right' as const,
      render: (page: WikiPage) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setFocusSlug(page.slug)
              setView('graph')
            }}
            title="图谱视角"
            className="p-1.5 rounded hover:bg-accent-cyan/10 text-text-tertiary hover:text-accent-cyan transition-colors"
            aria-label="图谱视角"
          >
            <Share2 size={14} strokeWidth={1.5} />
          </button>
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget(page)
              }}
              className="p-1.5 rounded hover:bg-accent-red/10 text-text-tertiary hover:text-accent-red transition-colors"
              aria-label="删除"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      ),
    },
  ]

  if (view === 'graph') {
    const focusPage = focusSlug ? pages.find((p) => p.slug === focusSlug) : null
    return (
      <div className="space-y-4">
        <PageHeader
          title="知识库"
          description={focusPage ? `「${focusPage.title}」的关联页面网络。` : 'Wiki 页面网络与关联关系。'}
          icon={Share2}
          actions={
            <>
              {focusSlug && (
                <button
                  onClick={() => setFocusSlug(null)}
                  className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5"
                >
                  <X size={14} strokeWidth={1.5} />
                  清除聚焦
                </button>
              )}
              <button
                onClick={() => setView('list')}
                className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <List size={14} strokeWidth={1.5} />
                列表视图
              </button>
            </>
          }
        />
        <WikiGraph focusSlug={focusSlug} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="知识库"
        description="浏览、搜索与管理 Wiki 页面。"
        icon={FileText}
        actions={
          canEdit && (
            <button
              onClick={kb.start}
              disabled={kb.busy}
              className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 disabled:opacity-60"
            >
              {kb.busy ? (
                <Loader2 size={14} className="animate-spin" strokeWidth={1.5} />
              ) : (
                <RefreshCw size={14} strokeWidth={1.5} />
              )}
              更新知识库
            </button>
          )
        }
      />

      {kb.statusElement}
      {kb.dialog}

      <Toolbar>
        <ToolbarGroup className="flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="搜索页面、slug、标签…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input pl-8 w-full h-8 text-sm"
            />
          </div>
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-[11px] font-mono text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/30 px-1.5 py-0.5 rounded"
            >
              #{tag}
              <button onClick={() => toggleTag(tag)} aria-label={`移除标签筛选 ${tag}`}>
                <X size={10} />
              </button>
            </span>
          ))}
        </ToolbarGroup>
        <ToolbarGroup>
          <button
            onClick={() => setView('graph')}
            className="btn-ghost h-8 px-2.5 text-xs flex items-center gap-1.5"
          >
            <Share2 size={14} strokeWidth={1.5} />
            图谱
          </button>
        </ToolbarGroup>
      </Toolbar>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded bg-surface border border-subtle animate-pulse" />
          ))}
        </div>
      ) : (
        <DataList
          columns={columns}
          data={filtered}
          keyExtractor={(p) => p.slug}
          onRowClick={(p) => navigate(`/wiki/${p.slug}`)}
          empty={
            <EmptyState
              title={filter ? '未找到匹配页面' : '暂无 Wiki 页面'}
              description={filter ? '尝试更换搜索词' : '先入库资料并执行同步'}
              icon={FileText}
              action={
                filter ? (
                  <button onClick={() => setFilter('')} className="btn-secondary h-8 px-3 text-xs">清除搜索</button>
                ) : undefined
              }
            />
          }
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除 Wiki 页面"
        description={deleteTarget ? `确定删除「${deleteTarget.title}」？此操作不可撤销。` : ''}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
