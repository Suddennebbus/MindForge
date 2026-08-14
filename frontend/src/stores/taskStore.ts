import { create } from 'zustand'

export interface TaskRecord {
  status: 'running' | 'success' | 'error'
  startedAt: number
  finishedAt?: number
  data?: any
  error?: string
}

/**
 * 全局异步任务 store：让耗时任务（更新知识库、探索、体检、计划生成等）
 * 在页面切换后继续执行，回到页面时仍能观察到执行状态与结果。
 *
 * 用法：
 * - 一次性 promise 任务：`runTask(key, fn)`，自动记录 running/success/error；
 * - 生命周期由外部回调结束的任务（如 Agent run）：`startTask` → `succeedTask`/`failTask`/`clearTask`。
 */
interface TaskStore {
  tasks: Record<string, TaskRecord>
  startTask: (key: string, data?: any) => void
  updateTaskData: (key: string, partial: Record<string, any>) => void
  succeedTask: (key: string, data?: any) => void
  failTask: (key: string, error: string) => void
  clearTask: (key: string) => void
  runTask: <T>(key: string, fn: () => Promise<T>) => Promise<T | undefined>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: {},

  startTask: (key, data) =>
    set((s) => ({
      tasks: { ...s.tasks, [key]: { status: 'running', startedAt: Date.now(), data } },
    })),

  /** 合并更新运行中任务的 data（如流式进度），不影响 status/startedAt。 */
  updateTaskData: (key, partial) =>
    set((s) => {
      const prev = s.tasks[key]
      if (!prev) return s
      return {
        tasks: { ...s.tasks, [key]: { ...prev, data: { ...prev.data, ...partial } } },
      }
    }),

  succeedTask: (key, data) =>
    set((s) => {
      const prev = s.tasks[key]
      if (!prev) return s
      return {
        tasks: {
          ...s.tasks,
          [key]: { ...prev, status: 'success', data: data ?? prev.data, finishedAt: Date.now() },
        },
      }
    }),

  failTask: (key, error) =>
    set((s) => {
      const prev = s.tasks[key]
      if (!prev) return s
      return {
        tasks: { ...s.tasks, [key]: { ...prev, status: 'error', error, finishedAt: Date.now() } },
      }
    }),

  clearTask: (key) =>
    set((s) => {
      const next = { ...s.tasks }
      delete next[key]
      return { tasks: next }
    }),

  runTask: async (key, fn) => {
    if (get().tasks[key]?.status === 'running') return undefined
    get().startTask(key)
    try {
      const data = await fn()
      get().succeedTask(key, data)
      return data
    } catch (err: any) {
      const message = err?.response?.data?.detail || err?.message || String(err)
      get().failTask(key, message)
      return undefined
    }
  },
}))
