import { create } from 'zustand'
import { en } from './en'

export type Lang = 'zh' | 'en'

interface LangState {
  lang: Lang
  toggle: () => void
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: (localStorage.getItem('mindforge-lang') as Lang) || 'zh',
  toggle: () => {
    get().setLang(get().lang === 'zh' ? 'en' : 'zh')
  },
  setLang: (lang) => {
    localStorage.setItem('mindforge-lang', lang)
    applyHtmlLang(lang)
    set({ lang })
  },
}))

function applyHtmlLang(lang: Lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}

// 初始化时同步 <html lang>
applyHtmlLang(useLangStore.getState().lang)

export type Vars = Record<string, string | number>

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`))
}

function translate(zh: string, vars: Vars | undefined, lang: Lang): string {
  if (lang === 'zh') return interpolate(zh, vars)
  return interpolate(en[zh] ?? zh, vars)
}

/** 非组件环境（store、模块级函数）使用；不触发重渲染 */
export function t(zh: string, vars?: Vars): string {
  return translate(zh, vars, useLangStore.getState().lang)
}

/** 组件内使用，语言切换时自动重渲染 */
export function useT() {
  const lang = useLangStore((s) => s.lang)
  return (zh: string, vars?: Vars) => translate(zh, vars, lang)
}

/** 日期/数字格式化 locale */
export function useDateLocale(): string {
  return useLangStore((s) => s.lang) === 'zh' ? 'zh-CN' : 'en-US'
}
