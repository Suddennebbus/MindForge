import { useSyncExternalStore } from 'react'
import { en } from './i18n-en'

export type Lang = 'zh' | 'en'

let current: Lang = (localStorage.getItem('mindforge-intro-lang') as Lang) || 'zh'
const listeners = new Set<() => void>()

function applyHtmlLang(l: Lang) {
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
}
applyHtmlLang(current)

export function toggleLang() {
  current = current === 'zh' ? 'en' : 'zh'
  localStorage.setItem('mindforge-intro-lang', current)
  applyHtmlLang(current)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current)
}

/** 组件内使用：const t = useT()，之后 t('中文文案') */
export function useT() {
  const lang = useLang()
  return (zh: string): string => (lang === 'zh' ? zh : (en[zh] ?? zh))
}

/** 截图路径：英文版优先用 /screenshots/en/ 下的同名文件 */
export function useShot() {
  const lang = useLang()
  return (name: string): string => (lang === 'en' ? `/screenshots/en/${name}` : `/screenshots/${name}`)
}
