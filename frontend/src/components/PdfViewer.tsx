import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'

// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const TextLayer = (pdfjsLib as any).TextLayer

export interface PdfViewerRef {
  getTextOffset: (container: Node, offset: number) => number | null
}

interface PdfViewerProps {
  url: string
  annotations: Array<{
    id: string
    start_offset: number
    end_offset: number
  }>
  onHighlightClick?: (annotationId: string) => void
  onLoadError?: () => void
}

interface PageData {
  pageNumber: number
  textLength: number
  canvasWidth: number
  canvasHeight: number
}

export const PdfViewer = forwardRef<PdfViewerRef, PdfViewerProps>(
  function PdfViewer({ url, annotations, onHighlightClick, onLoadError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [numPages, setNumPages] = useState(0)
    const [pdfDoc, setPdfDoc] = useState<any>(null)
    const [pagesData, setPagesData] = useState<PageData[]>([])
    const renderedPages = useRef<Map<number, HTMLDivElement>>(new Map())
    const pdfDocRef = useRef<any>(null)
    const onLoadErrorRef = useRef(onLoadError)

    useEffect(() => {
      pdfDocRef.current = pdfDoc
    }, [pdfDoc])

    useEffect(() => {
      onLoadErrorRef.current = onLoadError
    }, [onLoadError])

    useImperativeHandle(ref, () => ({
      getTextOffset: (container: Node, offset: number) => {
        const root = container instanceof Element ? container.closest('.pdf-page') : container.parentElement?.closest('.pdf-page') ?? null
        if (!root) return null
        const pageNum = parseInt((root as HTMLElement).dataset.pageNumber || '1')
        const pageData = pagesData.find((p) => p.pageNumber === pageNum)
        if (!pageData) return null

        let prevTextLength = 0
        for (const pd of pagesData) {
          if (pd.pageNumber < pageNum) {
            prevTextLength += pd.textLength
          }
        }

        // If container is an Element, offset is child node index
        if (container.nodeType === Node.ELEMENT_NODE) {
          let childTextLen = 0
          for (let i = 0; i < offset && i < container.childNodes.length; i++) {
            childTextLen += getNodeTextLength(container.childNodes[i])
          }
          // Now find where this element's text starts in the page
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
          let total = 0
          let node: Node | null
          while ((node = walker.nextNode())) {
            if (node.parentNode === container || isDescendant(container, node)) {
              return prevTextLength + total + childTextLen
            }
            total += node.textContent?.length || 0
          }
          return null
        }

        // container is a text node
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let total = 0
        let node: Node | null
        while ((node = walker.nextNode())) {
          if (node === container) return prevTextLength + total + offset
          total += node.textContent?.length || 0
        }
        return null
      },
    }))

    useEffect(() => {
      let cancelled = false
      const loadingTask = pdfjsLib.getDocument({ url })
      loadingTask.promise
        .then((pdf) => {
          if (cancelled) {
            if (pdf && typeof (pdf as any).cleanup === 'function') {
              ;(pdf as any).cleanup()
            }
            return
          }
          setPdfDoc(pdf)
          setNumPages(pdf.numPages)
        })
        .catch(() => {
          // 仅真正的加载失败（非组件卸载导致的 cancelled）时通知父级
          if (!cancelled) {
            onLoadErrorRef.current?.()
          }
        })
      return () => {
        cancelled = true
        if (loadingTask && typeof (loadingTask as any).destroy === 'function') {
          ;(loadingTask as any).destroy()
        }
        const doc = pdfDocRef.current
        if (doc && typeof (doc as any).cleanup === 'function') {
          ;(doc as any).cleanup()
        }
      }
    }, [url])

    useEffect(() => {
      if (!pdfDoc || numPages === 0) return

      const loadPages = async () => {
        const data: PageData[] = []
        for (let i = 1; i <= numPages; i++) {
          const page = await pdfDoc.getPage(i)
          const textContent = await page.getTextContent()
          const textLength = textContent.items.reduce(
            (sum: number, item: any) => sum + (item.str?.length || 0),
            0
          )
          const viewport = page.getViewport({ scale: 1.5 })
          data.push({
            pageNumber: i,
            textLength,
            canvasWidth: viewport.width,
            canvasHeight: viewport.height,
          })
        }
        setPagesData(data)
      }

      loadPages()
    }, [pdfDoc, numPages])

    return (
      <div ref={containerRef} className="pdf-viewer space-y-4">
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPage
            key={i}
            pdfDoc={pdfDoc}
            pageNumber={i + 1}
            pagesData={pagesData}
            annotations={annotations}
            onHighlightClick={onHighlightClick}
            onRendered={(el) => {
              renderedPages.current.set(i + 1, el)
            }}
          />
        ))}
      </div>
    )
  }
)

interface PdfPageProps {
  pdfDoc: any
  pageNumber: number
  pagesData: PageData[]
  annotations: Array<{ id: string; start_offset: number; end_offset: number }>
  onHighlightClick?: (annotationId: string) => void
  onRendered?: (el: HTMLDivElement) => void
}

function PdfPage({
  pdfDoc,
  pageNumber,
  pagesData,
  annotations,
  onHighlightClick,
  onRendered,
}: PdfPageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(false)
  const renderTaskRef = useRef<any>(null)

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false

    const render = async () => {
      const page = await pdfDoc.getPage(pageNumber)
      const scale = 1.5
      const viewport = page.getViewport({ scale })

      // Render canvas
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height

      const renderTask = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = renderTask
      try {
        await renderTask.promise
      } catch (err: any) {
        if (err?.message?.includes('cancelled')) return
        throw err
      }
      if (cancelled) return

      // Render text layer using pdf.js native TextLayer for correct font/transform handling
      const textLayerDiv = textLayerRef.current
      if (!textLayerDiv) return

      const textContent = await page.getTextContent()
      textLayerDiv.innerHTML = ''

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      })

      await textLayer.render()
      if (cancelled) return

      // Add offset attributes to each rendered text div for annotation support
      const textDivs = textLayer.textDivs as HTMLSpanElement[]
      const textContentItemsStr = textLayer.textContentItemsStr as string[]
      let globalOffset = 0
      for (const pd of pagesData) {
        if (pd.pageNumber < pageNumber) {
          globalOffset += pd.textLength
        }
      }
      for (let i = 0; i < textDivs.length; i++) {
        const div = textDivs[i]
        const str = textContentItemsStr[i] || ''
        div.dataset.startOffset = String(globalOffset)
        div.dataset.endOffset = String(globalOffset + str.length)
        globalOffset += str.length
      }

      // Apply highlights for this page
      const pageAnnotations = annotations.filter((ann) => {
        const pageStart = pagesData
          .filter((p) => p.pageNumber < pageNumber)
          .reduce((sum, p) => sum + p.textLength, 0)
        const pageEnd = pageStart + (pagesData.find((p) => p.pageNumber === pageNumber)?.textLength || 0)
        return ann.start_offset < pageEnd && ann.end_offset > pageStart
      })

      for (const ann of pageAnnotations) {
        applyHighlightToPage(textLayerDiv, ann, pageNumber, pagesData)
      }

      renderedRef.current = true
      if (pageRef.current) onRendered?.(pageRef.current)
    }

    render()

    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {
          // ignore
        }
      }
    }
  }, [pdfDoc, pageNumber, pagesData, annotations])

  return (
    <div
      ref={pageRef}
      className="pdf-page relative bg-white mx-auto"
      data-page-number={pageNumber}
      style={{
        width: pagesData.find((p) => p.pageNumber === pageNumber)?.canvasWidth || 0,
        height: pagesData.find((p) => p.pageNumber === pageNumber)?.canvasHeight || 0,
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement
        const mark = target.closest('.annotation-highlight') as HTMLElement | null
        if (mark?.dataset.annotationId) {
          onHighlightClick?.(mark.dataset.annotationId)
        }
      }}
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0" />
      <div
        ref={textLayerRef}
        className="textLayer absolute top-0 left-0 w-full h-full"
      />
    </div>
  )
}

function isDescendant(ancestor: Node, descendant: Node): boolean {
  let parent = descendant.parentNode
  while (parent) {
    if (parent === ancestor) return true
    parent = parent.parentNode
  }
  return false
}

function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length || 0
  }
  let len = 0
  node.childNodes.forEach((child) => {
    len += getNodeTextLength(child)
  })
  return len
}

function applyHighlightToPage(
  textLayerDiv: HTMLDivElement,
  ann: { id: string; start_offset: number; end_offset: number },
  pageNumber: number,
  pagesData: PageData[]
) {
  const pageStartOffset = pagesData
    .filter((p) => p.pageNumber < pageNumber)
    .reduce((sum, p) => sum + p.textLength, 0)
  const pageEndOffset = pageStartOffset + (pagesData.find((p) => p.pageNumber === pageNumber)?.textLength || 0)

  const annStart = Math.max(ann.start_offset, pageStartOffset)
  const annEnd = Math.min(ann.end_offset, pageEndOffset)

  if (annStart >= annEnd) return

  const spans = Array.from(textLayerDiv.querySelectorAll('span'))
  for (const span of spans) {
    const spanStart = parseInt(span.dataset.startOffset || '0')
    const spanEnd = parseInt(span.dataset.endOffset || '0')

    if (spanEnd <= annStart || spanStart >= annEnd) continue

    const text = span.textContent || ''
    const relStart = Math.max(0, annStart - spanStart)
    const relEnd = Math.min(text.length, annEnd - spanStart)

    if (relStart === 0 && relEnd === text.length) {
      span.classList.add('annotation-highlight')
      span.dataset.annotationId = ann.id
    } else {
      // Partial highlight - split span
      const before = text.slice(0, relStart)
      const hlText = text.slice(relStart, relEnd)
      const after = text.slice(relEnd)

      const parent = span.parentNode
      if (!parent) continue

      const createSpan = (content: string, isHighlight: boolean) => {
        const s = document.createElement('span')
        s.textContent = content
        s.style.cssText = span.style.cssText
        if (isHighlight) {
          s.classList.add('annotation-highlight')
          s.dataset.annotationId = ann.id
        }
        return s
      }

      if (before) parent.insertBefore(createSpan(before, false), span)
      parent.insertBefore(createSpan(hlText, true), span)
      if (after) parent.insertBefore(createSpan(after, false), span)
      parent.removeChild(span)
    }
  }
}
