import { useMemo, useState } from 'react'
import { FileText, Lightbulb, Layers, Tag, FileArchive } from 'lucide-react'
import { useT } from '@/i18n'

export interface IngestPlanPage {
  title: string
  type: 'entity' | 'concept' | 'synthesis'
  summary: string
  tags: string[]
  new_tags: string[]
  action: 'new' | 'enrich'
  target_slug: string
}

export interface IngestPlanGroup {
  key: string // ingest session id
  label: string // 来源文件名
  pages: IngestPlanPage[]
}

interface IngestPlanDialogProps {
  open: boolean
  groups: IngestPlanGroup[]
  confirming?: boolean
  onConfirm: (confirmed: IngestPlanGroup[]) => void
  onCancel: () => void
}

const typeBadge: Record<string, { label: string; className: string }> = {
  entity: { label: '实体', className: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10' },
  concept: { label: '概念', className: 'text-wiki-concept border-wiki-concept/30 bg-wiki-concept/10' },
  synthesis: { label: '综合', className: 'text-accent-green border-accent-green/30 bg-accent-green/10' },
}

const typeIcon = { entity: FileText, concept: Lightbulb, synthesis: Layers }

/**
 * 两阶段摄入的规划确认对话框（支持单文件或多文件批量）：
 * - 页面清单：按文件分组，勾选要生成的页面（新建 / 完善已有页）；
 * - 新标签区：LLM 提议的新标签逐项确认，未批准的不会写入知识库。
 */
export function IngestPlanDialog({
  open,
  groups,
  confirming,
  onConfirm,
  onCancel,
}: IngestPlanDialogProps) {
  const t = useT()
  const allNewTags = useMemo(
    () => [...new Set(groups.flatMap((g) => g.pages.flatMap((p) => p.new_tags)))].sort(),
    [groups],
  )
  const totalPages = useMemo(() => groups.reduce((n, g) => n + g.pages.length, 0), [groups])

  const [checkedPages, setCheckedPages] = useState<Set<string>>(
    () => new Set(groups.flatMap((g) => g.pages.map((_, i) => `${g.key}:${i}`))),
  )
  const [approvedTags, setApprovedTags] = useState<Set<string>>(() => new Set(allNewTags))

  const selectedCount = checkedPages.size

  if (!open) return null

  const togglePage = (id: string) => {
    setCheckedPages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTag = (tag: string) => {
    setApprovedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const handleConfirm = () => {
    const confirmed = groups
      .map((g) => ({
        ...g,
        pages: g.pages
          .filter((_, i) => checkedPages.has(`${g.key}:${i}`))
          .map((p) => ({
            ...p,
            // 已批准的新标签合并进页面 tags；未批准的不提交
            tags: [...p.tags, ...p.new_tags.filter((t) => approvedTags.has(t))],
          })),
      }))
      .filter((g) => g.pages.length > 0)
    onConfirm(confirmed)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-2xl rounded-lg border border-subtle bg-surface shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-subtle">
          <div>
            <h3 className="text-base font-medium text-text-primary">{t('确认摄入规划')}</h3>
            <p className="mt-1 text-sm text-text-secondary">
              {t('AI 为 {files} 份资料规划了 {pages} 个页面，请勾选要生成的页面并审核新标签', { files: groups.length, pages: totalPages })}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="border border-subtle rounded overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-raised border-b border-subtle">
                <FileArchive size={12} strokeWidth={1.5} className="text-text-tertiary" />
                <span className="text-xs font-medium text-text-secondary truncate">{g.label}</span>
                <span className="text-[10px] text-text-muted">{t('{n} 页', { n: g.pages.length })}</span>
              </div>
              <div className="divide-y divide-subtle">
                {g.pages.map((p, i) => {
                  const id = `${g.key}:${i}`
                  const badge = typeBadge[p.type] || typeBadge.entity
                  const Icon = typeIcon[p.type] || FileText
                  return (
                    <label
                      key={id}
                      className="grid grid-cols-[2rem_4.5rem_1fr_6rem] items-center gap-2 px-3 py-2.5 hover:bg-hover cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checkedPages.has(id)}
                        onChange={() => togglePage(id)}
                        className="accent-current text-accent-cyan w-3.5 h-3.5"
                      />
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[11px] ${badge.className}`}>
                        <Icon size={11} strokeWidth={1.5} />
                        {t(badge.label)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-text-primary truncate">{p.title}</span>
                        {p.summary && (
                          <span className="block text-xs text-text-tertiary truncate">{p.summary}</span>
                        )}
                      </span>
                      <span className="text-right">
                        {p.action === 'enrich' ? (
                          <span className="text-[11px] font-mono text-accent-amber" title={p.target_slug}>
                            {t('完善 {slug}', { slug: p.target_slug })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-accent-green">{t('新建')}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}

          {allNewTags.length > 0 && (
            <div className="border border-subtle rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Tag size={12} strokeWidth={1.5} className="text-accent-amber" />
                  {t('AI 提议的新标签（{approved}/{total} 已批准）', { approved: approvedTags.size, total: allNewTags.length })}
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() => setApprovedTags(new Set(allNewTags))}
                    className="text-[11px] text-text-tertiary hover:text-accent-cyan transition-colors"
                  >
                    {t('全选')}
                  </button>
                  <button
                    onClick={() => setApprovedTags(new Set())}
                    className="text-[11px] text-text-tertiary hover:text-accent-cyan transition-colors"
                  >
                    {t('全不选')}
                  </button>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allNewTags.map((tag) => (
                  <label
                    key={tag}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer transition-colors ${
                      approvedTags.has(tag)
                        ? 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan'
                        : 'border-subtle text-text-tertiary hover:border-strong'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={approvedTags.has(tag)}
                      onChange={() => toggleTag(tag)}
                      className="accent-current w-3 h-3"
                    />
                    #{tag}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-subtle bg-raised/30 rounded-b-lg">
          <button onClick={onCancel} className="btn-secondary h-8 px-3 text-sm">
            {t('放弃')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0 || confirming}
            className="h-8 px-3 text-sm rounded font-medium transition-colors bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/20 disabled:opacity-50"
          >
            {confirming ? t('提交中…') : t('确认生成（{n} 页）', { n: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  )
}
