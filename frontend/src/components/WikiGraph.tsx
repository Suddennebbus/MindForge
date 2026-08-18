import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import cytoscape from 'cytoscape'
import { Search, X } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useT } from '@/i18n'

interface GraphNode {
  id: string
  slug: string
  title: string
  type: string
  linked_slugs: string[]
}

const typeColors: Record<string, string> = {
  entity: '#a78bfa',
  concept: '#22d3ee',
  synthesis: '#4ade80',
}

const themeColors = {
  dark: {
    textPrimary: '#e8e8e8',
    bgBase: '#0d0d0d',
    borderDefault: '#262626',
    borderStrong: '#404040',
    accentCyan: '#22d3ee',
  },
  light: {
    textPrimary: '#1a1a1a',
    bgBase: '#f5f5f5',
    borderDefault: '#e0e0e0',
    borderStrong: '#d0d0d0',
    accentCyan: '#0d9488',
  },
}

export function WikiGraph({ focusSlug }: { focusSlug?: string | null }) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const navigate = useNavigate()
  const resolved = useThemeStore((s) => s.resolved)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    api.get('/wiki/graph').then((resp) => {
      setNodes(resp.data)
      setLoading(false)
    })
  }, [])

  // 聚焦模式：仅保留目标页及其双向直接关联页；关键词：匹配页 + 其一度邻居
  const { displayed, matched } = useMemo(() => {
    let base = nodes
    if (focusSlug) {
      const keep = new Set<string>([focusSlug])
      nodes.forEach((n) => {
        if (n.slug === focusSlug) n.linked_slugs.forEach((s) => keep.add(s))
        else if (n.linked_slugs.includes(focusSlug)) keep.add(n.slug)
      })
      base = nodes.filter((n) => keep.has(n.slug))
    }
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return { displayed: base, matched: new Set<string>() }
    const baseSlugs = new Set(base.map((n) => n.slug))
    const matched = new Set(
      base
        .filter((n) => n.title.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q))
        .map((n) => n.slug)
    )
    const keep = new Set(matched)
    base.forEach((n) => {
      if (matched.has(n.slug)) {
        n.linked_slugs.forEach((s) => { if (baseSlugs.has(s)) keep.add(s) })
      } else if (n.linked_slugs.some((s) => matched.has(s))) {
        keep.add(n.slug)
      }
    })
    return { displayed: base.filter((n) => keep.has(n.slug)), matched }
  }, [nodes, focusSlug, deferredQuery])

  useEffect(() => {
    if (!containerRef.current || displayed.length === 0) return

    const colors = themeColors[resolved] || themeColors.dark

    const elements: cytoscape.ElementDefinition[] = []
    const slugToId: Record<string, string> = {}

    displayed.forEach((n) => {
      slugToId[n.slug] = n.id
      const degree = n.linked_slugs.length
      const classes: string[] = []
      if (n.slug === focusSlug) classes.push('focus-node')
      if (matched.has(n.slug)) classes.push('match-node')
      elements.push({
        data: {
          id: n.id,
          label: n.title,
          slug: n.slug,
          type: n.type,
          degree,
        },
        classes: classes.join(' '),
      })
    })

    displayed.forEach((n) => {
      n.linked_slugs.forEach((targetSlug) => {
        const targetId = slugToId[targetSlug]
        if (targetId) {
          elements.push({
            data: {
              source: n.id,
              target: targetId,
            },
          })
        }
      })
    })

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: cytoscape.NodeSingular) =>
              typeColors[ele.data('type')] || '#6b7280',
            label: 'data(label)',
            width: (ele: cytoscape.NodeSingular) =>
              Math.max(20, 10 + ele.data('degree') * 6),
            height: (ele: cytoscape.NodeSingular) =>
              Math.max(20, 10 + ele.data('degree') * 6),
            color: colors.textPrimary,
            'font-size': '11px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'text-background-color': colors.bgBase,
            'text-background-opacity': 0.8,
            'text-background-padding': '2px 4px',
            'text-background-shape': 'roundrectangle',
            'border-width': 1,
            'border-color': colors.borderStrong,
            'transition-property': 'background-color, border-color, opacity',
            'transition-duration': 150,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': colors.borderDefault,
            'target-arrow-color': colors.borderDefault,
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.6,
            'curve-style': 'bezier',
            opacity: 0.5,
          },
        },
        {
          selector: '.focus-node',
          style: {
            'border-color': colors.accentCyan,
            'border-width': 3,
          },
        },
        {
          selector: '.match-node',
          style: {
            'border-color': colors.accentCyan,
            'border-width': 2,
          },
        },
        {
          selector: '.hovered',
          style: {
            'border-color': colors.accentCyan,
            'border-width': 2,
          },
        },
        {
          selector: '.dimmed',
          style: {
            opacity: 0.15,
          },
        },
        {
          selector: '.highlighted',
          style: {
            opacity: 1,
            'line-color': colors.accentCyan,
            'target-arrow-color': colors.accentCyan,
            width: 2,
          },
        },
      ],
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 1.5,
    })

    cyRef.current = cy

    const layout = cy.layout({
      name: 'cose',
      padding: 20,
      nodeRepulsion: 8000,
      idealEdgeLength: 80,
      edgeElasticity: 100,
      nestingFactor: 5,
      gravity: 10,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0,
    } as any)

    layout.on('layoutstop', () => {
      cy.fit(cy.elements(), 40)
    })

    layout.run()

    cy.on('tap', 'node', (evt) => {
      const slug = evt.target.data('slug')
      if (slug) navigate(`/wiki/${slug}`)
    })

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      node.addClass('hovered')

      const connected = node.closedNeighborhood()
      cy.elements().addClass('dimmed')
      connected.removeClass('dimmed')
      connected.edges().addClass('highlighted')
    })

    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target
      node.removeClass('hovered')
      cy.elements().removeClass('dimmed highlighted')
    })

    cy.on('dbltap', () => {
      cy.fit(cy.elements(), 40)
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [displayed, matched, focusSlug, navigate, resolved])

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="h-8 w-32 animate-pulse bg-surface rounded-sm" />
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-text-tertiary">
        <p>{t('知识库为空，暂无图谱可展示')}</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full rounded-md border border-default bg-surface"
        style={{ height: 'calc(100vh - 12rem)' }}
      />
      {displayed.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm pointer-events-none">
          {query ? t('无匹配结点，换个关键词试试') : t('该页面暂无关联页面')}
        </div>
      )}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('筛选结点（标题 / slug）…')}
            className="input h-7 pl-7 pr-6 text-xs w-52"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('清除筛选')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {query && (
          <span className="text-[11px] text-text-tertiary bg-surface/80 px-1.5 py-0.5 rounded-sm backdrop-blur-sm">
            {t('匹配 {n} 页', { n: matched.size })}
          </span>
        )}
      </div>
      <div className="absolute top-3 right-3 flex gap-2">
        <button
          onClick={() => cyRef.current?.fit(cyRef.current.elements(), 40)}
          className="btn-secondary text-xs !h-7 !px-2"
        >
          {t('重置视图')}
        </button>
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={() => {
            const cy = cyRef.current
            if (!cy) return
            const center = { x: cy.width() / 2, y: cy.height() / 2 }
            cy.animate(
              { zoom: { level: cy.zoom() * 1.12, position: center } },
              { duration: 250, easing: 'ease-out' }
            )
          }}
          className="btn-secondary text-xs !h-7 !w-7 flex items-center justify-center"
          title={t('放大')}
        >
          +
        </button>
        <button
          onClick={() => {
            const cy = cyRef.current
            if (!cy) return
            const center = { x: cy.width() / 2, y: cy.height() / 2 }
            cy.animate(
              { zoom: { level: cy.zoom() / 1.12, position: center } },
              { duration: 250, easing: 'ease-out' }
            )
          }}
          className="btn-secondary text-xs !h-7 !w-7 flex items-center justify-center"
          title={t('缩小')}
        >
          −
        </button>
      </div>
      <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-text-muted bg-surface/80 px-2 py-1 rounded-sm backdrop-blur-sm">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: typeColors.entity }} />
          {t('实体')}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: typeColors.concept }} />
          {t('概念')}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: typeColors.synthesis }} />
          {t('综合')}
        </span>
      </div>
    </div>
  )
}
