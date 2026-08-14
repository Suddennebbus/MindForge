import { createContext, useContext, useState, useCallback } from 'react'

type PageWidth = 'default' | 'wide' | 'reader'

interface PageWidthContextValue {
  width: PageWidth
  setWidth: (width: PageWidth) => void
}

const PageWidthContext = createContext<PageWidthContextValue | undefined>(undefined)

export function PageWidthProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<PageWidth>('default')
  return (
    <PageWidthContext.Provider value={{ width, setWidth }}>
      {children}
    </PageWidthContext.Provider>
  )
}

export function usePageWidth() {
  const ctx = useContext(PageWidthContext)
  if (!ctx) throw new Error('usePageWidth must be used within PageWidthProvider')
  return ctx
}

export function useSetPageWidth(width: PageWidth) {
  const { setWidth } = usePageWidth()
  const setter = useCallback(() => setWidth(width), [setWidth, width])
  return setter
}
