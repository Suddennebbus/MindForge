import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { PdfViewer } from '@/components/PdfViewer'
import type { PdfViewerRef } from '@/components/PdfViewer'
import { useAuthStore } from '@/stores/authStore'
import type { Annotation, RawFile } from '@/types'
import {
  ArrowLeft,
  X,
  MessageSquarePlus,
  Send,
  Trash2,
  User,
  FileText,
  AlertCircle,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'

interface FileContent {
  type: string
  content?: string
  mime_type?: string
  download_url?: string
}

interface SelectionInfo {
  start: number
  end: number
  text: string
  rect: DOMRect
}

export function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sourceType = searchParams.get('type') || 'raw'
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pdfViewerRef = useRef<PdfViewerRef>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const [file, setFile] = useState<RawFile | null>(null)
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [annotationText, setAnnotationText] = useState('')
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem('reader-annotation-panel-collapsed') === '1'
  )
  const togglePanel = () => {
    setPanelCollapsed((prev) => {
      localStorage.setItem('reader-annotation-panel-collapsed', prev ? '0' : '1')
      return !prev
    })
  }
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const loadData = useCallback(() => {
    if (!id) return
    const listEndpoint = sourceType === 'pre-raw' ? '/raw/pre-raw' : sourceType === 'human-output' ? '/raw/human-outputs' : '/raw'
    api.get(listEndpoint).then((resp) => {
      const f = resp.data.find((x: RawFile) => x.id === id)
      setFile(f || null)
    })
    const contentEndpoint = sourceType === 'human-output' ? `/raw/human-outputs/${id}/content` : `/raw/${id}/content`
    api.get(contentEndpoint).then(async (resp) => {
      const data = resp.data as FileContent
      setFileContent(data)
      if (data.type === 'pdf' && data.download_url) {
        try {
          const blobResp = await api.get(data.download_url, { responseType: 'blob' })
          const url = window.URL.createObjectURL(blobResp.data)
          setPdfBlobUrl(url)
          setPdfError(false)
        } catch {
          setPdfBlobUrl(null)
        }
      }
    })
    const annotationsEndpoint = sourceType === 'human-output'
      ? `/raw/human-outputs/${id}/annotations`
      : `/raw/${id}/annotations`
    api.get(annotationsEndpoint).then((resp) => {
      setAnnotations(resp.data)
    }).finally(() => {
      setLoading(false)
    })
  }, [id, sourceType])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        window.URL.revokeObjectURL(pdfBlobUrl)
      }
    }
  }, [pdfBlobUrl])

  // Render highlights after content and annotations are loaded
  useEffect(() => {
    if (!contentRef.current) return
    // Delay to ensure MarkdownRenderer has finished DOM updates
    const timer = setTimeout(() => {
      if (contentRef.current) {
        applyHighlights(contentRef.current, annotations)
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [annotations])

  // Handle text selection
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const handleMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // Click outside popover closes it
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          setSelection(null)
        }
        return
      }

      const range = sel.getRangeAt(0)
      const info = getSelectionOffsets(range, el)
      if (!info || info.end - info.start < 2) {
        setSelection(null)
        return
      }

      const rect = range.getBoundingClientRect()
      setSelection({ ...info, rect })
      setAnnotationText('')
    }

    el.addEventListener('mouseup', handleMouseUp)
    return () => el.removeEventListener('mouseup', handleMouseUp)
  }, [annotations])

  const handleCreateAnnotation = async () => {
    if (!selection || !annotationText.trim() || !id) return
    const endpoint = sourceType === 'human-output'
      ? `/raw/human-outputs/${id}/annotations`
      : `/raw/${id}/annotations`
    try {
      await api.post(endpoint, {
        start_offset: selection.start,
        end_offset: selection.end,
        selected_text: selection.text,
        content: annotationText.trim(),
      })
      setSelection(null)
      setAnnotationText('')
      window.getSelection()?.removeAllRanges()
      loadData()
    } catch (err: any) {
      alert('添加批注失败：' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDeleteAnnotation = async (annotationId: string) => {
    if (!confirm('确定删除这条批注？')) return
    const endpoint = sourceType === 'human-output'
      ? `/raw/human-outputs/${id}/annotations/${annotationId}`
      : `/raw/${id}/annotations/${annotationId}`
    try {
      await api.delete(endpoint)
      loadData()
    } catch (err: any) {
      alert('删除批注失败：' + (err.response?.data?.detail || err.message))
    }
  }

  const handleHighlightClick = (annotationId: string) => {
    if (panelCollapsed) togglePanel()
    setActiveAnnotationId(annotationId)
    const panelEl = document.getElementById(`annotation-item-${annotationId}`)
    if (panelEl) {
      panelEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleAnnotationItemClick = (annotationId: string) => {
    setActiveAnnotationId(annotationId)
    const highlightEls = contentRef.current?.querySelectorAll(`[data-annotation-id="${annotationId}"]`)
    if (highlightEls && highlightEls.length > 0) {
      const first = highlightEls[0] as HTMLElement
      first.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handlePdfMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelection(null)
      }
      return
    }

    const range = sel.getRangeAt(0)
    const startContainer = range.startContainer
    const endContainer = range.endContainer

    // Check if selection is inside PDF text layer
    const pdfPage = (startContainer instanceof Element ? startContainer : startContainer.parentElement)?.closest('.pdf-page')
    if (!pdfPage) {
      setSelection(null)
      return
    }

    const info = pdfViewerRef.current?.getTextOffset(startContainer, range.startOffset)
    const endInfo = pdfViewerRef.current?.getTextOffset(endContainer, range.endOffset)
    if (info == null || endInfo == null || info >= endInfo) {
      setSelection(null)
      return
    }

    const rect = range.getBoundingClientRect()
    setSelection({ start: info, end: endInfo, text: sel.toString(), rect })
    setAnnotationText('')
  }

  // Close popover on click outside the scrollable document area
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        scrollContainerRef.current &&
        !scrollContainerRef.current.contains(e.target as Node)
      ) {
        setSelection(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-base flex items-center justify-center">
        <div className="h-8 w-32 animate-pulse bg-surface rounded-sm" />
      </div>
    )
  }

  if (!file) {
    return (
      <div className="fixed inset-0 z-50 bg-base flex flex-col items-center justify-center">
        <p className="text-text-tertiary mb-4">文件不存在</p>
        <button
          onClick={() => navigate(sourceType === 'human-output' ? '/human-outputs' : `/${sourceType}`)}
          className="btn-secondary"
        >
          <ArrowLeft size={14} className="mr-1.5" />
          返回列表
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-base flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-default shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(sourceType === 'human-output' ? '/human-outputs' : `/${sourceType}`)}
            className="btn-ghost !h-8 !px-2"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-accent-cyan" strokeWidth={1.5} />
            <h1 className="text-sm font-medium text-text-primary max-w-md truncate">
              {file.original_name}
            </h1>
          </div>
        </div>
        <button
          onClick={() => navigate(`/${sourceType}`)}
          className="btn-ghost !h-8 !w-8 !px-0 flex items-center justify-center"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto relative">
          {fileContent?.type === 'pdf' && pdfBlobUrl && !pdfError && (
            <div className="p-4" onMouseUp={handlePdfMouseUp}>
              <PdfViewer
                ref={pdfViewerRef}
                url={pdfBlobUrl}
                annotations={annotations}
                onHighlightClick={handleHighlightClick}
                onLoadError={() => setPdfError(true)}
              />
            </div>
          )}

          {fileContent?.type === 'pdf' && (!pdfBlobUrl || pdfError) && (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
              <AlertCircle size={32} strokeWidth={1.5} className="mb-3" />
              <p>PDF 加载失败</p>
              <p className="text-xs mt-1">请尝试下载后查看</p>
            </div>
          )}

          {fileContent?.type !== 'pdf' && (
            <div className="max-w-3xl mx-auto p-8">
            {fileContent?.type === 'unsupported' && (
              <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
                <AlertCircle size={32} strokeWidth={1.5} className="mb-3" />
                <p>该文件格式暂不支持在线阅读</p>
                <p className="text-xs mt-1">请下载后在本地查看</p>
              </div>
            )}

            {fileContent?.type === 'text' && fileContent.mime_type === 'text/markdown' && (
              <div
                ref={contentRef}
                className="markdown-body"
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  const mark = target.closest('.annotation-highlight') as HTMLElement | null
                  if (mark?.dataset.annotationId) {
                    handleHighlightClick(mark.dataset.annotationId)
                  }
                }}
              >
                <MarkdownRenderer content={fileContent.content || ''} />
              </div>
            )}

            {fileContent?.type === 'text' && fileContent.mime_type === 'text/plain' && (
              <div
                ref={contentRef}
                className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-mono"
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  const mark = target.closest('.annotation-highlight') as HTMLElement | null
                  if (mark?.dataset.annotationId) {
                    handleHighlightClick(mark.dataset.annotationId)
                  }
                }}
              >
                {fileContent.content}
              </div>
            )}

            {fileContent?.type === 'text' && fileContent.mime_type === 'text/html' && (
              <div
                ref={contentRef}
                className="text-sm text-text-secondary"
                dangerouslySetInnerHTML={{ __html: fileContent.content || '' }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  const mark = target.closest('.annotation-highlight') as HTMLElement | null
                  if (mark?.dataset.annotationId) {
                    handleHighlightClick(mark.dataset.annotationId)
                  }
                }}
              />
            )}
            </div>
          )}

          {/* Annotation popover */}
          {selection && (
            <div
              ref={popoverRef}
              className="annotation-popover"
              style={(() => {
                const container = scrollContainerRef.current
                if (!container) {
                  return { top: selection.rect.bottom + 8, left: Math.max(16, selection.rect.left) }
                }
                const containerRect = container.getBoundingClientRect()
                const top = selection.rect.bottom - containerRect.top + container.scrollTop + 8
                const left = selection.rect.left - containerRect.left + container.scrollLeft
                return {
                  top: Math.min(top, container.scrollHeight - 120),
                  left: Math.max(16, Math.min(left, container.clientWidth - 260)),
                }
              })()}
            >
              <p className="text-xs text-text-muted mb-2 truncate max-w-[220px]">
                选中: {selection.text.slice(0, 40)}{selection.text.length > 40 ? '...' : ''}
              </p>
              <textarea
                value={annotationText}
                onChange={(e) => setAnnotationText(e.target.value)}
                placeholder="输入批注..."
                className="input w-full h-20 resize-none text-sm mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    handleCreateAnnotation()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setSelection(null)
                    window.getSelection()?.removeAllRanges()
                  }}
                  className="btn-ghost text-xs !h-7 !px-2"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateAnnotation}
                  disabled={!annotationText.trim()}
                  className="btn-primary text-xs !h-7 !px-2 disabled:opacity-50"
                >
                  <Send size={12} className="mr-1" />
                  添加批注
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Annotation panel */}
        <div
          className={`border-l border-default flex flex-col shrink-0 bg-surface transition-all duration-200 ${
            panelCollapsed ? 'w-10' : 'w-80'
          }`}
        >
          {panelCollapsed ? (
            <button
              onClick={togglePanel}
              title="展开批注面板"
              className="flex flex-col items-center gap-2 py-3 text-text-muted hover:text-text-primary transition-colors"
            >
              <PanelRightOpen size={15} strokeWidth={1.5} />
              <span className="text-xs">{annotations.length}</span>
            </button>
          ) : (
            <>
          <div className="px-4 py-3 border-b border-default flex items-center gap-2">
            <MessageSquarePlus size={14} strokeWidth={1.5} className="text-accent-cyan" />
            <h3 className="text-sm font-medium flex-1">批注 ({annotations.length})</h3>
            <button
              onClick={togglePanel}
              title="收起批注面板"
              className="p-1 rounded-sm text-text-muted hover:text-text-primary hover:bg-surface-active transition-colors"
            >
              <PanelRightClose size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {annotations.length === 0 && (
              <p className="text-xs text-text-muted text-center py-8">
                暂无批注，选中文本后添加
              </p>
            )}
            {annotations.map((ann) => {
              const canDelete = user && (ann.user_id === user.id || isAdmin)
              const isActive = activeAnnotationId === ann.id
              return (
                <div
                  key={ann.id}
                  id={`annotation-item-${ann.id}`}
                  onClick={() => handleAnnotationItemClick(ann.id)}
                  className={`rounded-md p-2.5 cursor-pointer transition-colors ${
                    isActive ? 'bg-accent-cyan/10 border border-accent-cyan/20' : 'bg-inset border border-transparent hover:border-default'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-sm bg-surface-active flex items-center justify-center shrink-0">
                      <User size={11} className="text-text-muted" />
                    </div>
                    <span className="text-xs font-medium text-text-primary">{ann.username}</span>
                    <span className="text-xs text-text-muted">{ann.created_at.slice(0, 10)}</span>
                  </div>
                  <p className="text-xs text-text-tertiary mb-1.5 italic truncate">
                    "{ann.selected_text.slice(0, 60)}{ann.selected_text.length > 60 ? '...' : ''}"
                  </p>
                  <p className="text-xs text-text-secondary">{ann.content}</p>
                  {canDelete && (
                    <div className="flex justify-end mt-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteAnnotation(ann.id)
                        }}
                        className="p-1 rounded-sm text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        title="删除批注"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Calculate character offsets of a selection within a root element
function getSelectionOffsets(range: Range, root: HTMLElement): { start: number; end: number; text: string } | null {
  const startOffset = getTextOffset(range.startContainer, range.startOffset, root)
  const endOffset = getTextOffset(range.endContainer, range.endOffset, root)
  const text = range.toString()
  if (startOffset === null || endOffset === null || startOffset >= endOffset) return null
  return { start: startOffset, end: endOffset, text }
}

function getTextOffset(container: Node, offset: number, root: HTMLElement): number | null {
  if (container === root) {
    // container is the root itself, count text in child nodes up to offset
    let count = 0
    for (let i = 0; i < offset && i < container.childNodes.length; i++) {
      count += getNodeTextLength(container.childNodes[i])
    }
    return count
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === container || isDescendant(container, node)) {
      if (node === container) {
        return total + offset
      }
      // container is an ancestor of this text node
      return total + offset
    }
    total += node.textContent?.length || 0
  }
  return null
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

// Apply highlight spans to text nodes based on annotation offsets
function applyHighlights(root: HTMLElement, annotations: Annotation[]) {
  // Remove existing highlights
  const existingMarks = root.querySelectorAll('.annotation-highlight')
  existingMarks.forEach((mark) => {
    const parent = mark.parentNode
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
      parent.normalize()
    }
  })

  if (annotations.length === 0) return

  const sorted = [...annotations].sort((a, b) => a.start_offset - b.start_offset)

  // Collect all text nodes
  const textNodes: { node: Text; start: number; end: number }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let pos = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length || 0
    textNodes.push({ node: node as Text, start: pos, end: pos + len })
    pos += len
  }

  // Apply highlights (process in reverse to avoid index shifts)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const ann = sorted[i]
    const annStart = ann.start_offset
    const annEnd = ann.end_offset

    for (const tn of textNodes) {
      if (tn.end <= annStart || tn.start >= annEnd) continue

      const nodeStart = Math.max(tn.start, annStart)
      const nodeEnd = Math.min(tn.end, annEnd)
      const relStart = nodeStart - tn.start
      const relEnd = nodeEnd - tn.start

      if (relStart === 0 && relEnd === tn.end - tn.start) {
        // Whole node is highlighted
        const mark = document.createElement('mark')
        mark.className = 'annotation-highlight'
        mark.dataset.annotationId = ann.id
        mark.textContent = tn.node.textContent || ''
        tn.node.parentNode?.replaceChild(mark, tn.node)
      } else {
        // Partial highlight - split the text node
        const text = tn.node.textContent || ''
        const before = document.createTextNode(text.slice(0, relStart))
        const mark = document.createElement('mark')
        mark.className = 'annotation-highlight'
        mark.dataset.annotationId = ann.id
        mark.textContent = text.slice(relStart, relEnd)
        const after = document.createTextNode(text.slice(relEnd))

        const parent = tn.node.parentNode
        if (!parent) continue
        parent.insertBefore(before, tn.node)
        parent.insertBefore(mark, tn.node)
        parent.insertBefore(after, tn.node)
        parent.removeChild(tn.node)

        // Update textNodes for subsequent iterations in this annotation
        // (simpler to just re-collect, but reverse processing helps)
      }
    }

    // Re-collect text nodes after each annotation (safer but slower)
    textNodes.length = 0
    pos = 0
    const walker2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
    while ((node = walker2.nextNode())) {
      const len = node.textContent?.length || 0
      textNodes.push({ node: node as Text, start: pos, end: pos + len })
      pos += len
    }
  }
}
