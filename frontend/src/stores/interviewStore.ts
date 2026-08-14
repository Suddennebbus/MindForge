import { create } from 'zustand'

export interface InterviewQuestion {
  id: string
  question: string
  type?: 'choice' | 'text'
  choices?: string[]
  allow_other?: boolean
  placeholder?: string
}

export interface ChoiceAnswer {
  choice?: string
  text?: string
}

export type InterviewAnswer = string | ChoiceAnswer

/**
 * AI 辅助生成研究计划的访谈状态（跨路由持久）。
 *
 * 访谈（step1 填方向 / step2 答题）进行中若用户点弹窗外或切换到其他界面，
 * 采访状态保留在 store 中，探索页 / 计划页据此展示「采访进行中」记录，
 * 用户点击记录后恢复弹窗继续访谈。显式放弃或生成完成时清空。
 */
interface InterviewStore {
  active: boolean
  direction: string
  questions: InterviewQuestion[]
  answers: Record<string, InterviewAnswer>
  start: (direction: string) => void
  setDirection: (direction: string) => void
  setQuestions: (questions: InterviewQuestion[], answers: Record<string, InterviewAnswer>) => void
  setAnswer: (id: string, value: InterviewAnswer) => void
  dismiss: () => void
  complete: () => void
}

const emptyState = {
  active: false,
  direction: '',
  questions: [] as InterviewQuestion[],
  answers: {} as Record<string, InterviewAnswer>,
}

export const useInterviewStore = create<InterviewStore>((set) => ({
  ...emptyState,
  start: (direction) =>
    set({ active: true, direction, questions: [], answers: {} }),
  setDirection: (direction) => set({ direction }),
  setQuestions: (questions, answers) => set({ questions, answers }),
  setAnswer: (id, value) =>
    set((s) => ({ answers: { ...s.answers, [id]: value } })),
  dismiss: () => set(emptyState),
  complete: () => set(emptyState),
}))
