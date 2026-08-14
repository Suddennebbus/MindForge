import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  X,
  Home,
  BookOpen,
  ClipboardList,
  FileText,
  FlaskConical,
  PenTool,
  MessageSquare,
  Stethoscope,
  Settings,
  ArrowUpRight,
  Clock,
} from 'lucide-react'
import { api } from '@/api/client'
import type { WikiPage, Plan, RawFile } from '@/types'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/stores/taskStore'

type CommandItem = {
  id: string
  type: 'page' | 'wiki' | 'plan' | 'raw' | 'pre-raw' | 'action'
  title: string
  subtitle?: string
  icon?: React.ReactNode
  to?: string
  action?: () => void
  keywords?: string
}

const staticPages: CommandItem[] = [
  { id: 'page-home', type: 'page', title: '首页 / 工作台', to: '/', icon: <Home size={16} strokeWidth={1.5} /> },
  { id: 'page-wiki', type: 'page', title: '知识库', to: '/wiki', icon: <BookOpen size={16} strokeWidth={1.5} /> },
  { id: 'page-plans', type: 'page', title: '研究计划', to: '/plans', icon: <ClipboardList size={16} strokeWidth={1.5} /> },
  { id: 'page-pre-raw', type: 'page', title: '待入库资料', to: '/pre-raw', icon: <FileText size={16} strokeWidth={1.5} /> },
  { id: 'page-raw', type: 'page', title: '已入库资料', to: '/raw', icon: <FlaskConical size={16} strokeWidth={1.5} /> },
  { id: 'page-human-outputs', type: 'page', title: '人类产出', to: '/human-outputs', icon: <PenTool size={16} strokeWidth={1.5} /> },
  { id: 'page-chat', type: 'page', title: '对话', to: '/chat', icon: <MessageSquare size={16} strokeWidth={1.5} /> },
  { id: 'page-lint', type: 'page', title: '体检', to: '/lint', icon: <Stethoscope size={16} strokeWidth={1.5} /> },
  { id: 'page-settings', type: 'page', title: '设置', to: '/settings', icon: <Settings size={16} strokeWidth={1.5} /> },
]

const RECENT_KEY = 'mindforge-command-recent'

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecent(id: string) {
  const list = loadRecent().filter((x) => x !== id)
  list.unshift(id)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)))
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [dynamic, setDynamic] = useState<CommandItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // 摄入确认弹窗（确认规划 + 标签审核）打开时屏蔽命令面板：需在弹窗内明确「确认」或「放弃」
        const kb = useTaskStore.getState().tasks['batch-ingest']
        if (kb?.status === 'running' && kb.data?.phase === 'confirming') return
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      api.get<WikiPage[]>('/wiki').then((r) => r.data),
      api.get<Plan[]>('/plans').then((r) => r.data),
      api.get<RawFile[]>('/raw').then((r) => r.data),
      api.get<RawFile[]>('/pre-raw').then((r) => r.data),
    ])
      .then(([wiki, plans, raw, preRaw]) => {
        const items: CommandItem[] = [
          ...wiki.map((p) => ({
            id: `wiki-${p.slug}`,
            type: 'wiki' as const,
            title: p.title,
            subtitle: p.slug,
            to: `/wiki/${p.slug}`,
            keywords: `${p.title} ${p.slug} ${p.tags.join(' ')} ${p.summary || ''}`,
          })),
          ...plans.map((p) => ({
            id: `plan-${p.id}`,
            type: 'plan' as const,
            title: p.title,
            subtitle: p.topic,
            to: `/plans/${p.id}`,
            keywords: `${p.title} ${p.topic} ${p.direction || ''}`,
          })),
          ...raw.map((f) => ({
            id: `raw-${f.id}`,
            type: 'raw' as const,
            title: f.original_name || f.filename,
            subtitle: '已入库',
            to: `/raw/${f.id}`,
            keywords: `${f.original_name} ${f.filename} ${f.category || ''}`,
          })),
          ...preRaw.map((f) => ({
            id: `pre-raw-${f.id}`,
            type: 'pre-raw' as const,
            title: f.original_name || f.filename,
            subtitle: '待入库',
            to: `/pre-raw/${f.id}`,
            keywords: `${f.original_name} ${f.filename} ${f.category || ''}`,
          })),
        ]
        setDynamic(items)
      })
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const recentIds = useMemo(() => loadRecent(), [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const scored = q
      ? dynamic.filter((item) => {
          const hay = `${item.title} ${item.subtitle || ''} ${item.keywords || ''}`.toLowerCase()
          return hay.includes(q)
        })
      : [...staticPages, ...dynamic]

    if (!q) {
      const recentMap = new Map<string, CommandItem>()
      recentIds.forEach((id) => {
        const item = dynamic.find((d) => d.id === id)
        if (item) recentMap.set(id, item)
      })
      const recent = Array.from(recentMap.values()).slice(0, 5)
      const withoutRecent = staticPages.filter((p) => !recentIds.includes(p.id))
      return recent.length > 0
        ? [
            { id: 'recent-header', type: 'action' as const, title: '最近访问' },
            ...recent.map((r) => ({ ...r, icon: <Clock size={16} strokeWidth={1.5} /> })),
            { id: 'pages-header', type: 'action' as const, title: '页面' },
            ...withoutRecent,
          ]
        : staticPages
    }

    return scored.slice(0, 12)
  }, [query, dynamic, recentIds])

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(filtered.length - 1, 0)))
  }, [filtered.length])

  function execute(item: CommandItem) {
    setOpen(false)
    saveRecent(item.id)
    if (item.to) {
      navigate(item.to)
    } else if (item.action) {
      item.action()
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (s + 1) % filtered.length)
      scrollIntoView(selected + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (s - 1 + filtered.length) % filtered.length)
      scrollIntoView(selected - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selected]
      if (item && item.type !== 'action') execute(item)
    }
  }

  function scrollIntoView(index: number) {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-2xl rounded-lg border border-subtle bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-subtle">
          <Search size={18} className="text-text-tertiary" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="搜索页面、Wiki、计划、文件…"
            className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          {loading && <div className="w-4 h-4 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />}
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-hover text-text-tertiary"
            aria-label="关闭"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">未找到结果</div>
          ) : (
            filtered.map((item, idx) => {
              if (item.type === 'action') {
                return (
                  <div
                    key={item.id}
                    className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-text-muted font-medium"
                  >
                    {item.title}
                  </div>
                )
              }
              return (
                <button
                  key={item.id}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setSelected(idx)}
                  className={cn(
                    'w-full px-4 py-2 flex items-center gap-3 text-left transition-colors',
                    idx === selected && 'bg-hover',
                  )}
                >
                  <div className="shrink-0 w-7 h-7 rounded bg-raised border border-subtle flex items-center justify-center text-text-secondary">
                    {item.icon || <ArrowUpRight size={16} strokeWidth={1.5} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-text-tertiary truncate">{item.subtitle}</div>
                    )}
                  </div>
                  {item.to && (
                    <ArrowUpRight size={14} className="text-text-muted" strokeWidth={1.5} />
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-subtle bg-raised/30 flex items-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-surface border border-subtle">↑↓</kbd> 选择</span>
          <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-surface border border-subtle">↵</kbd> 打开</span>
          <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-surface border border-subtle">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
