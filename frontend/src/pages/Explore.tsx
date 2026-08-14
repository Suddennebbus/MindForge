import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Exploration } from '@/types'
import {
  Compass,
  Target,
  BookOpen,
  AlertTriangle,
  Sparkles,
  Clock,
  X,
  Loader2,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataList } from '@/components/DataList'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { useTaskStore } from '@/stores/taskStore'
import { useInterviewStore } from '@/stores/interviewStore'

interface ExploreResult {
  knowledge_areas?: Array<{
    name: string
    coverage: string
    depth: string
  }>
  gaps?: Array<{
    priority: string
    area: string
    description: string
  }>
  recommendations?: Array<{
    action: string
    rationale: string
    resources?: string[]
  }>
}

function parseResult(json: string): ExploreResult | null {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function Explore() {
  const location = useLocation()
  const navigate = useNavigate()
  const passed = location.state?.exploration as Exploration | undefined
  const currentUser = useAuthStore((s) => s.user)
  const isViewer = currentUser?.role === 'viewer'
  const interviewActive = useInterviewStore((s) => s.active)
  const interviewDirection = useInterviewStore((s) => s.direction)

  const [direction, setDirection] = useState(passed?.direction || '')
  const [activeId, setActiveId] = useState<string | null>(passed?.id || null)
  const [result, setResult] = useState<ExploreResult | null>(() =>
    passed ? parseResult(passed.result_json) : null,
  )
  const exploreTask = useTaskStore((s) => s.tasks['explore'])
  const isLoading = exploreTask?.status === 'running'

  const [explorations, setExplorations] = useState<Exploration[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Exploration | null>(null)

  useEffect(() => {
    if (passed) {
      window.history.replaceState({}, document.title)
    } else {
      // 从其他页面切回时，恢复上次已完成的探索结果
      const t = useTaskStore.getState().tasks['explore']
      if (t?.status === 'success' && t.data) {
        setResult(t.data)
      }
    }
  }, [passed])

  const loadHistory = () => {
    setHistoryLoading(true)
    api.get('/ai/explorations')
      .then((resp) => setExplorations(resp.data as Exploration[]))
      .catch(() => toast({ title: '加载探索历史失败', variant: 'error' }))
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const handleExplore = async () => {
    const newResult = await useTaskStore.getState().runTask('explore', async () => {
      const resp = await api.post('/ai/explore', { direction: direction || undefined })
      const data = resp.data as ExploreResult
      try {
        await api.post('/ai/explorations', {
          direction: direction || undefined,
          result_json: JSON.stringify(data),
        })
      } catch (saveErr: any) {
        toast({
          title: '探索结果保存失败',
          description: saveErr.response?.data?.detail || String(saveErr),
          variant: 'warning',
        })
      }
      return data
    })
    if (newResult) {
      setResult(newResult)
      setActiveId(null)
      loadHistory()
    } else {
      const err = useTaskStore.getState().tasks['explore']?.error
      if (err) {
        toast({ title: '探索失败', description: err, variant: 'error' })
      }
    }
  }

  const handleReset = () => {
    setDirection('')
    setResult(null)
    setActiveId(null)
    useTaskStore.getState().clearTask('explore')
  }

  // 研究建议 → 研究计划：把建议标题作为研究方向，启动 AI 辅助生成访谈
  const handleCreatePlan = (recAction: string) => {
    useInterviewStore.getState().start(recAction)
    navigate('/plans', { state: { autoOpenInterview: true } })
  }

  // 从「采访进行中」记录恢复：跳转计划页并自动打开访谈弹窗
  const handleResumeInterview = () => {
    navigate('/plans', { state: { autoOpenInterview: true } })
  }

  const handleSelectHistory = (exploration: Exploration) => {
    const parsed = parseResult(exploration.result_json)
    if (!parsed) {
      toast({ title: '无法解析该探索结果', variant: 'warning' })
      return
    }
    setDirection(exploration.direction || '')
    setResult(parsed)
    setActiveId(exploration.id)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/ai/explorations/${deleteTarget.id}`)
      setExplorations((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      if (activeId === deleteTarget.id) {
        setResult(null)
        setActiveId(null)
      }
      toast({ title: '已删除探索记录', variant: 'success' })
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

  const columns = [
    {
      key: 'direction',
      header: '方向',
      render: (e: Exploration) => (
        <div className="min-w-0">
          <div className={`text-sm font-medium truncate ${activeId === e.id ? 'text-accent-cyan' : 'text-text-primary'}`}>
            {e.direction || '全局探索'}
          </div>
        </div>
      ),
    },
    {
      key: 'summary',
      header: '摘要',
      width: '200px',
      render: (e: Exploration) => {
        const parsed = parseResult(e.result_json)
        const areas = parsed?.knowledge_areas?.length || 0
        const gaps = parsed?.gaps?.length || 0
        const recs = parsed?.recommendations?.length || 0
        return (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {areas > 0 && <span>{areas} 个领域</span>}
            {gaps > 0 && <span>{gaps} 个缺口</span>}
            {recs > 0 && <span>{recs} 条建议</span>}
            {areas === 0 && gaps === 0 && recs === 0 && <span>—</span>}
          </div>
        )
      },
    },
    {
      key: 'time',
      header: '时间',
      width: '120px',
      render: (e: Exploration) => (
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          <Clock size={12} strokeWidth={1.5} />
          {e.created_at.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      align: 'right' as const,
      render: (e: Exploration) =>
        isViewer ? null : (
          <button
            onClick={(ev) => {
              ev.stopPropagation()
              setDeleteTarget(e)
            }}
            className="p-1.5 rounded hover:bg-accent-red/10 text-text-tertiary hover:text-accent-red transition-colors"
            aria-label="删除"
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="探索"
        description="发现知识缺口与研究机会"
        icon={Compass}
        actions={
          result && (
            <button onClick={handleReset} className="btn-ghost">
              <X size={14} strokeWidth={1.5} className="mr-1.5" />
              重置
            </button>
          )
        }
      />

      {interviewActive && (
        <div className="flex items-center gap-3 px-4 py-3 rounded border border-accent-cyan/30 bg-accent-cyan/10">
          <Sparkles size={16} className="text-accent-cyan shrink-0" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-text-tertiary">采访进行中</span>
            <span className="block text-sm font-medium text-text-primary truncate">{interviewDirection || '未命名方向'}</span>
          </div>
          <button onClick={handleResumeInterview} className="btn-secondary h-7 px-2.5 text-xs shrink-0">
            继续采访
          </button>
          <button
            onClick={() => useInterviewStore.getState().dismiss()}
            className="btn-ghost h-7 px-2.5 text-xs shrink-0"
          >
            放弃
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isLoading && !isViewer) {
              handleExplore()
            }
          }}
          placeholder={isViewer ? '游客仅可查看探索历史' : '输入研究方向（可选，留空则全局探索）'}
          className="input flex-1"
          disabled={isViewer}
        />
        {!isViewer && (
          <button onClick={handleExplore} disabled={isLoading} className="btn-primary">
            {isLoading ? (
              <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={14} strokeWidth={1.5} className="mr-1.5" />
            )}
            {isLoading ? '分析中...' : '探索'}
          </button>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          {result.knowledge_areas && result.knowledge_areas.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={15} className="text-wiki-concept" strokeWidth={1.5} />
                <h3 className="text-subtitle">知识覆盖</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {result.knowledge_areas.map((area) => (
                  <div key={area.name} className="card-dense">
                    <p className="text-body font-medium text-text-primary">{area.name}</p>
                    <p className="text-xs font-mono text-text-tertiary mt-1">
                      {area.coverage} · {area.depth}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.gaps && result.gaps.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-accent-amber" strokeWidth={1.5} />
                <h3 className="text-subtitle">知识缺口</h3>
              </div>
              <div className="space-y-2">
                {result.gaps.map((gap, i) => (
                  <div key={i} className="border-l-2 border-accent-amber pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono uppercase text-accent-amber">{gap.priority}</span>
                      <p className="text-body font-medium text-text-primary">{gap.area}</p>
                    </div>
                    <p className="text-small text-text-tertiary mt-1">{gap.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendations && result.recommendations.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Target size={15} className="text-accent-cyan" strokeWidth={1.5} />
                <h3 className="text-subtitle">研究建议</h3>
              </div>
              <div className="space-y-2">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="border-l-2 border-accent-cyan pl-3 py-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-text-primary">{rec.action}</p>
                      <p className="text-small text-text-tertiary mt-1">{rec.rationale}</p>
                      {rec.resources && rec.resources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {rec.resources.map((r, j) => (
                            <span
                              key={j}
                              className="text-xs font-mono text-text-muted bg-inset px-1.5 py-0.5 rounded-sm"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!isViewer && (
                      <button
                        onClick={() => handleCreatePlan(rec.action)}
                        className="btn-secondary h-7 px-2.5 text-xs flex items-center gap-1 shrink-0"
                      >
                        <Sparkles size={12} strokeWidth={1.5} />
                        生成研究计划
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="panel-header mb-2 rounded">探索历史</div>
        {historyLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-surface border border-subtle animate-pulse" />
            ))}
          </div>
        ) : explorations.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="暂无探索记录"
            description="输入研究方向或留空进行全局探索，AI 将分析知识覆盖、缺口并给出研究建议。"
          />
        ) : (
          <DataList
            columns={columns}
            data={explorations}
            keyExtractor={(e) => e.id}
            onRowClick={handleSelectHistory}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除探索记录"
        description={deleteTarget ? `确定删除「${deleteTarget.direction || '全局探索'}」？` : ''}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
