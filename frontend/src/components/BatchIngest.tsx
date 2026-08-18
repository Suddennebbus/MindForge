import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api } from '@/api/client'
import { IngestPlanDialog, type IngestPlanGroup, type IngestPlanPage } from '@/components/IngestPlanDialog'
import { toast } from '@/stores/toastStore'
import { useTaskStore } from '@/stores/taskStore'
import { t, useT } from '@/i18n'

interface BatchSession {
  session_id: string
  raw_file_id: string
  filename: string
  reason: 'pending' | 'orphan'
  pages: IngestPlanPage[]
  all_new_tags: string[]
}

export interface BatchProgress {
  fileIndex: number
  fileCount: number
  filename: string
  done: number
  total: number
  current: string
}

type KBPhase = 'planning' | 'confirming' | 'generating'

interface KBTaskData {
  phase: KBPhase
  groups?: IngestPlanGroup[]
  progress?: BatchProgress | null
  notified?: boolean
}

const KB_TASK_KEY = 'batch-ingest'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const updateKB = (partial: Partial<KBTaskData>) =>
  useTaskStore.getState().updateTaskData(KB_TASK_KEY, partial)

/**
 * 「更新知识库」两阶段批量摄入（taskStore 驱动，切换页面不中断、状态处处可见）：
 * plan-batch（含待摄入资料 + 被删页面的孤立资料，每份 1 次规划 LLM）→
 * IngestPlanDialog 确认 → 逐会话 generate + 1.5s 轮询（顺序执行，避免并发写库）→
 * update-knowledge-base 收尾（重建索引、固化快照基线）。
 * generate 触发丢失（如后端重启杀后台任务）时，轮询发现 session 长期 planned 会自动补发。
 */

async function runBatchPlan() {
  const store = useTaskStore.getState()
  if (store.tasks[KB_TASK_KEY]?.status === 'running') return
  store.startTask(KB_TASK_KEY, { phase: 'planning' } satisfies KBTaskData)
  try {
    const resp = await api.post('/ai/ingest/plan-batch', { include_orphans: true })
    const data = resp.data as { sessions: BatchSession[]; errors: Array<{ filename: string; error: string }> }
    if (data.errors?.length) {
      toast({
        title: t('{n} 份资料规划失败', { n: data.errors.length }),
        description: data.errors
          .map((e) => `${e.filename}${e.error === 'no_pages_planned' ? t('（未能规划出页面，可重试）') : ''}`)
          .join('、'),
        variant: 'error',
      })
    }
    if (!data.sessions?.length) {
      if (!data.errors?.length) {
        // 真正没有任何待摄入资料：执行快照检查/恢复
        await api.post('/wiki/update-knowledge-base').catch(() => null)
        toast({ title: t('知识库已检查'), description: t('没有待摄入的资料'), variant: 'success' })
        useTaskStore.getState().succeedTask(KB_TASK_KEY)
      } else {
        // 规划全部失败时不固化快照（同用户取消），下次仍会提醒恢复
        useTaskStore.getState().failTask(KB_TASK_KEY, t('全部资料规划失败'))
      }
      return
    }
    updateKB({
      phase: 'confirming',
      groups: data.sessions.map((s) => ({
        key: s.session_id,
        label: s.reason === 'orphan' ? `${s.filename}${t('（恢复已删页面）')}` : s.filename,
        pages: s.pages,
      })),
    })
  } catch (err: any) {
    const msg = err.response?.data?.detail || err.message
    toast({ title: t('摄入规划失败'), description: msg, variant: 'error' })
    useTaskStore.getState().failTask(KB_TASK_KEY, msg)
  }
}

async function runBatchGeneration(confirmed: IngestPlanGroup[]) {
  updateKB({ phase: 'generating', groups: undefined, progress: null })
  let ok = 0
  let failed = 0
  try {
    for (let i = 0; i < confirmed.length; i++) {
      const g = confirmed[i]
      // generate 应立即返回；加超时避免响应丢失（如后端重启）时永远卡在「摄入中」
      await api.post(`/ai/ingest/sessions/${g.key}/generate`, { pages: g.pages }, { timeout: 15000 })
      // generate 触发丢失（如后端重启杀后台任务）时 session 会长期停在 planned：
      // 连续 8 轮（≈12s，正常应在 1s 内翻为 generating）仍是 planned 则自动补发，最多 2 次
      let plannedPolls = 0
      let refires = 0
      // 顺序执行：当前文件生成完成后再处理下一份
      for (;;) {
        await sleep(1500)
        const resp = await api.get(`/ai/ingest/sessions/${g.key}`)
        const { status, progress: p, error } = resp.data
        if (status === 'planned') {
          plannedPolls += 1
          if (plannedPolls >= 8) {
            if (refires >= 2) throw new Error(t('「{label}」生成无法启动（触发请求多次丢失）', { label: g.label }))
            refires += 1
            plannedPolls = 0
            await api
              .post(`/ai/ingest/sessions/${g.key}/generate`, { pages: g.pages }, { timeout: 15000 })
              .catch(() => {})
            toast({ title: t('生成触发丢失，已自动重试'), description: g.label, variant: 'warning' })
          }
        } else {
          plannedPolls = 0
        }
        updateKB({
          progress: {
            fileIndex: i + 1,
            fileCount: confirmed.length,
            filename: g.label,
            done: p?.done ?? 0,
            total: p?.total ?? g.pages.length,
            current: p?.current_title || '',
          },
        })
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          const results = p?.page_results || []
          ok += results.filter((r: any) => r.status === 'ok').length
          failed += results.filter((r: any) => r.status === 'error').length
          if (status === 'failed') {
            toast({ title: t('「{label}」摄入失败', { label: g.label }), description: error || undefined, variant: 'error' })
          }
          break
        }
      }
    }
    // 摄入完成后做快照检查（恢复被删页面、更新 baseline）
    await api.post('/wiki/update-knowledge-base').catch(() => null)
    toast({
      title: t('知识库更新完成'),
      description: t('已生成/完善 {ok} 个页面', { ok }) + (failed ? t('，{n} 个失败', { n: failed }) : ''),
      variant: failed ? 'warning' : 'success',
    })
    useTaskStore.getState().succeedTask(KB_TASK_KEY)
  } catch (err: any) {
    const msg = err.response?.data?.detail || err.message
    toast({ title: t('摄入失败'), description: msg, variant: 'error' })
    useTaskStore.getState().failTask(KB_TASK_KEY, msg)
  }
}

function cancelBatch(groups: IngestPlanGroup[]) {
  groups.forEach((g) => api.post(`/ai/ingest/sessions/${g.key}/cancel`).catch(() => {}))
  useTaskStore.getState().clearTask(KB_TASK_KEY)
}

export function useBatchIngest(onDone?: () => void) {
  const t = useT()
  const task = useTaskStore((s) => s.tasks[KB_TASK_KEY])
  const [confirming, setConfirming] = useState(false)
  const busy = task?.status === 'running'
  const data = task?.data as KBTaskData | undefined
  const phase = busy ? data?.phase : undefined
  const groups = phase === 'confirming' ? (data?.groups ?? null) : null
  const progress = phase === 'generating' ? data?.progress : null

  // 确认弹窗（确认摄入规划 + 标签审核）打开时拦截导航：
  // 用户必须选择「确认」或「放弃」，不允许切页逃逸
  const blocker = useBlocker(phase === 'confirming')
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker.state])

  // 每次运行成功结束后，触发一次页面数据刷新（全局只通知一次）
  const succeeded = task?.status === 'success'
  useEffect(() => {
    if (!succeeded || task?.data?.notified) return
    updateKB({ notified: true })
    onDone?.()
  }, [succeeded, task?.data?.notified])

  const start = () => {
    void runBatchPlan()
  }

  const confirm = (confirmedGroups: IngestPlanGroup[]) => {
    setConfirming(true)
    void runBatchGeneration(confirmedGroups).finally(() => setConfirming(false))
  }

  const dialog = (
    <IngestPlanDialog
      key={groups?.map((g) => g.key).join(',') ?? 'batch-closed'}
      open={!!groups}
      groups={groups || []}
      confirming={confirming}
      onConfirm={confirm}
      onCancel={() => groups && cancelBatch(groups)}
    />
  )

  const statusElement =
    phase === 'planning' || phase === 'generating' ? (
      <div className="flex items-center gap-2 px-3 py-2 rounded border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan text-sm">
        <Loader2 size={16} className="animate-spin" />
        {phase === 'planning'
          ? t('正在规划摄入页面…')
          : progress
            ? t('摄入中（{fileIndex}/{fileCount}：{filename}）：已生成 {done}/{total} 页', {
                fileIndex: progress.fileIndex,
                fileCount: progress.fileCount,
                filename: progress.filename,
                done: progress.done,
                total: progress.total,
              }) + (progress.current ? t('（当前：{current}）', { current: progress.current }) : '')
            : t('摄入中…')}
      </div>
    ) : null

  return {
    start,
    busy,
    planning: phase === 'planning',
    generating: phase === 'generating',
    dialog,
    statusElement,
  }
}
