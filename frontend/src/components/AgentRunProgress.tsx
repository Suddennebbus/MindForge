import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { AgentRun, AgentRunStep } from '@/types'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Pause, Play, RotateCcw, Square } from 'lucide-react'

interface AgentRunProgressProps {
  runId: string
  onComplete?: (planId: string) => void
  onCancel?: () => void
}

const STEP_LABELS: Record<string, string> = {
  query_expansion: '查询扩展',
  web_search: '网络检索',
  arxiv_search: '论文检索',
  analysis: '深度分析',
  plan_draft: '计划初稿',
  critique: '批判评审',
  revision: '修订完善',
  reading_selection: '文献筛选',
  save_plan: '保存计划',
}

const STEP_RUNNING_HINT: Record<string, string> = {
  query_expansion: 'AI 正在生成检索词...',
  web_search: '正在搜索网络资料...',
  arxiv_search: '正在检索 arXiv 论文...',
  analysis: 'AI 正在进行深度分析...',
  plan_draft: 'AI 正在撰写计划初稿...',
  critique: 'AI 正在评审计划质量...',
  revision: 'AI 正在根据评审意见修订...',
  reading_selection: 'AI 正在筛选高价值文献...',
  save_plan: '正在保存研究计划...',
}

function getStepDetail(step: AgentRunStep): string | null {
  if (step.status === 'running') {
    return STEP_RUNNING_HINT[step.name] || '正在执行...'
  }
  if (step.status === 'paused') {
    return '已暂停'
  }
  if (step.status !== 'completed' || !step.output_json) {
    return null
  }
  try {
    const output = JSON.parse(step.output_json)
    if (step.name === 'query_expansion' && Array.isArray(output.search_queries)) {
      return `生成 ${output.search_queries.length} 个检索词`
    }
    if (step.name === 'web_search' && Array.isArray(output.web_results)) {
      return `找到 ${output.web_results.length} 条结果`
    }
    if (step.name === 'arxiv_search' && Array.isArray(output.arxiv_results)) {
      return `找到 ${output.arxiv_results.length} 篇论文`
    }
    if (step.name === 'reading_selection' && Array.isArray(output.suggested_readings)) {
      return `选定 ${output.suggested_readings.length} 篇文献`
    }
    if (step.name === 'save_plan' && output.plan_id) {
      return '计划已保存'
    }
    return '已完成'
  } catch {
    return '已完成'
  }
}

export function AgentRunProgress({ runId, onComplete, onCancel }: AgentRunProgressProps) {
  const navigate = useNavigate()
  const [run, setRun] = useState<AgentRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRun = useCallback(async () => {
    try {
      const resp = await api.get(`/ai/runs/${runId}`)
      setRun(resp.data)
      if (resp.data.status === 'completed' && resp.data.plan_id && onComplete) {
        onComplete(resp.data.plan_id)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    }
  }, [runId, onComplete])

  useEffect(() => {
    fetchRun()
    const interval = setInterval(fetchRun, 1500)
    return () => clearInterval(interval)
  }, [fetchRun])

  const handleAction = async (action: string) => {
    setLoading(true)
    setError(null)
    try {
      await api.post(`/ai/runs/${runId}/${action}`)
      await fetchRun()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  const renderStepIcon = (step: AgentRunStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 size={16} className="text-accent-green" />
      case 'running':
        return <Loader2 size={16} className="animate-spin text-accent-cyan" />
      case 'paused':
        return <Pause size={16} className="text-accent-amber" />
      case 'failed':
        return <XCircle size={16} className="text-accent-red" />
      default:
        return <div className="w-4 h-4 rounded-full border border-default" />
    }
  }

  if (!run) {
    return (
      <div className="py-12 text-center">
        <Loader2 size={28} strokeWidth={1.5} className="animate-spin text-accent-cyan mx-auto mb-3" />
        <p className="text-sm text-text-secondary">正在启动 Agent Runtime...</p>
      </div>
    )
  }

  const isRunning = run.status === 'running'
  const isPausing = run.status === 'pausing'
  const isPaused = run.status === 'paused' || run.status === 'interrupted'
  const isFailed = run.status === 'failed'
  const isCompleted = run.status === 'completed'
  const isCancelled = run.status === 'cancelled'

  const statusLabel = isCompleted
    ? '已完成'
    : isCancelled
      ? '已停止'
      : isFailed
        ? '失败'
        : isPausing
          ? '正在暂停...'
          : isPaused
            ? '已暂停'
            : '执行中'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary">
            研究方向：<span className="text-text-primary font-medium">{run.direction || '研究计划'}</span>
          </p>
          <p className="text-xs text-text-muted mt-1">
            状态：<span className="font-medium text-text-primary">{statusLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <>
              <button
                onClick={() => handleAction('pause')}
                disabled={loading}
                className="btn-ghost text-xs flex items-center gap-1"
              >
                <Pause size={13} />
                暂停
              </button>
              <button
                onClick={() => handleAction('cancel')}
                disabled={loading}
                className="btn-ghost text-xs flex items-center gap-1 text-accent-red hover:text-accent-red"
              >
                <Square size={13} />
                停止
              </button>
            </>
          )}
          {isPausing && (
            <button
              disabled
              className="btn-ghost text-xs flex items-center gap-1 opacity-60 cursor-not-allowed"
            >
              <Loader2 size={13} className="animate-spin" />
              正在暂停
            </button>
          )}
          {(isPaused || isFailed) && (
            <>
              <button
                onClick={() => handleAction('resume')}
                disabled={loading}
                className="btn-primary text-xs flex items-center gap-1"
              >
                <Play size={13} />
                继续
              </button>
              <button
                onClick={() => handleAction('cancel')}
                disabled={loading}
                className="btn-ghost text-xs flex items-center gap-1 text-accent-red hover:text-accent-red"
              >
                <Square size={13} />
                停止
              </button>
            </>
          )}
          {isFailed && (
            <button
              onClick={() => handleAction('retry')}
              disabled={loading}
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <RotateCcw size={13} />
              重试
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {run.steps.map((step) => {
          const detail = getStepDetail(step)
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-2.5 rounded-md border ${
                step.status === 'running' ? 'border-accent-cyan/30 bg-accent-cyan/5' : 'border-default'
              }`}
            >
              {renderStepIcon(step)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">
                  {STEP_LABELS[step.name] || step.name}
                </p>
                {detail && (
                  <p className={`text-xs mt-0.5 ${step.status === 'running' ? 'text-accent-cyan' : 'text-text-muted'}`}>
                    {detail}
                  </p>
                )}
                {step.error_message && (
                  <p className="text-xs text-accent-red mt-0.5">{step.error_message}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-accent-red/30 bg-accent-red/10">
          <AlertCircle size={16} className="text-accent-red shrink-0 mt-0.5" />
          <p className="text-sm text-accent-red">{error}</p>
        </div>
      )}

      {run.error_message && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-accent-amber/30 bg-accent-amber/10">
          <AlertCircle size={16} className="text-accent-amber shrink-0 mt-0.5" />
          <p className="text-sm text-accent-amber">{run.error_message}</p>
        </div>
      )}

      {isCompleted && run.plan_id && (
        <div className="flex justify-end">
          <button
            onClick={() => navigate(`/plans/${run.plan_id}`)}
            className="btn-primary text-sm"
          >
            查看研究计划
          </button>
        </div>
      )}

      {(isCancelled || isFailed) && onCancel && (
        <div className="flex justify-end">
          <button onClick={onCancel} className="btn-ghost text-sm">
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
