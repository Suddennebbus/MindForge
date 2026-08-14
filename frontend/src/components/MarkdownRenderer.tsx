import { marked } from 'marked'
import { useMemo } from 'react'

interface MarkdownRendererProps {
  content: string
  onWikiLinkClick?: (slug: string) => void
}

// Wiki link regex: [[slug]] or [[display|slug]]
const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export function MarkdownRenderer({ content, onWikiLinkClick }: MarkdownRendererProps) {
  const html = useMemo(() => {
    // Replace wiki links with placeholder anchors before markdown parsing
    // to avoid conflicts with markdown link syntax
    let processed = content
    const wikiLinks: { placeholder: string; slug: string; display: string }[] = []
    let index = 0

    processed = processed.replace(WIKI_LINK_REGEX, (_match, p1, p2) => {
      const slug = p2 ? p2.trim() : p1.trim()
      const display = p1.trim()
      const placeholder = `__WIKI_LINK_${index}__`
      wikiLinks.push({ placeholder, slug, display })
      index++
      return placeholder
    })

    // Convert markdown to HTML
    let html = marked.parse(processed, { async: false }) as string

    // Replace placeholders with actual links
    for (const { placeholder, slug, display } of wikiLinks) {
      html = html.replace(
        placeholder,
        `<a href="/wiki/${encodeURIComponent(slug)}" class="wiki-link" data-slug="${slug}">${display}</a>`
      )
    }

    return html
  }, [content])

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const link = target.closest('.wiki-link') as HTMLAnchorElement | null
    if (link) {
      e.preventDefault()
      const slug = link.dataset.slug
      if (slug && onWikiLinkClick) {
        onWikiLinkClick(slug)
      }
    }
  }

  return (
    <div
      className="markdown-body"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
