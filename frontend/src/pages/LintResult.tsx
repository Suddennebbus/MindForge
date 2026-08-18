import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { useT } from '@/i18n'
import {
  ArrowLeft, AlertTriangle, Info, CheckCircle, XCircle,
  GitFork, FileQuestion, Wand2, ExternalLink, Loader2,
  MessageSquareWarning, MessageSquarePlus, List, Tag,
} from 'lucide-react'
import {
  IssueCard, SummarySegment, SeverityBadge, SuggestionBlock, IssueMeta, IssueActions,
  type Suggestion,
} from './LintComponents'

/** 各问题类型的含义说明（顶部灰色小字用） */
const ISSUE_TYPE_INFO: Record<string, string> = {
  conflicts: '矛盾检测：不同页面对同一事实的表述存在冲突',
  outdated_content: '过时内容：页面中可能已过时、需要更新的表述',
  missing_backlinks: '反向链接缺口：A 页面链接到 B，但 B 中缺少指回 A 的链接',
  conflict_annotations: '[!conflict] 标注：人工标记的矛盾内容，待核对处理',
  missing_concepts: '缺失概念：被多个实体页引用但尚无独立页面的概念',
  index_consistency: '索引不一致：_wiki_index.md 与实际页面不同步',
  tag_consistency: '标签不一致：_tag_registry.md 与页面实际使用的标签不同步',
  orphan_pages: '孤立页面：未被任何其他页面链接，难以被发现',
  reinforce_annotations: '[!reinforce] 标注：人工标记的论断，待补充佐证',
  info_gaps: '信息缺口：知识库尚无法回答的问题',
}

/** 每条问题的唯一 key（与后端 dismiss 接口约定，前端生成后端只存储） */
const issueKey = {
  conflicts: (c: any) => `conflicts:${(c.pages || []).join(' vs ')}`,
  outdated: (c: any) => `outdated_content:${c.page}:${c.statement}`,
  orphan: (slug: string) => `orphan_pages:${slug}`,
  concept: (c: any) => `missing_concepts:${c.name}`,
  conflictAnn: (a: any) => `conflict_annotations:${a.slug}`,
  reinforceAnn: (a: any) => `reinforce_annotations:${a.slug}`,
  infoGap: (g: any) => `info_gaps:${g.question}`,
}

/**
 * 按当前归类规则从问题列表实时计算摘要计数（不信任报告中固化的 summary，
 * 保证旧报告也按新规则归类；已忽略的问题不计入）。
 * 归类：反向链接缺口/[!conflict] 标注/缺失概念/索引/标签 → Warning；
 *       孤立页面/[!reinforce] 标注 → Info；LLM 项按 severity。
 */
function computeCounts(result: any, dismissed: Set<string>) {
  let critical = 0, warning = 0, info = 0
  if (!result || result.error) return { critical, warning, info }
  const bump = (sev: string) => {
    if (sev === 'high') critical++
    else if (sev === 'low') info++
    else warning++
  }
  for (const c of result.conflicts || []) {
    if (!dismissed.has(issueKey.conflicts(c))) bump(c.severity || 'medium')
  }
  for (const c of result.outdated_content || []) {
    if (!dismissed.has(issueKey.outdated(c))) bump(c.severity || 'medium')
  }
  for (const g of result.info_gaps || []) {
    if (!dismissed.has(issueKey.infoGap(g))) bump(g.severity || 'medium')
  }
  warning += (result.missing_backlinks || []).length
  warning += (result.conflict_annotations || []).filter((a: any) => !dismissed.has(issueKey.conflictAnn(a))).length
  warning += (result.missing_concepts || []).filter((c: any) => !dismissed.has(issueKey.concept(c))).length
  info += (result.orphan_pages || []).filter((s: string) => !dismissed.has(issueKey.orphan(s))).length
  info += (result.reinforce_annotations || []).filter((a: any) => !dismissed.has(issueKey.reinforceAnn(a))).length
  if (result.index_consistency && !result.index_consistency.consistent) warning++
  if (result.tag_consistency && !result.tag_consistency.consistent) warning++
  return { critical, warning, info }
}

/** 自动修复卡片「已修复」判定：fix-all 持久化的 auto_fixes 中对应类型有 fixed 记录 */
const FIXED_TYPE_MAP: Record<string, string> = {
  missing_backlinks: 'add_backlink',
  index_consistency: 'rebuild_index',
  tag_consistency: 'rebuild_tags',
}

interface FixOutcome {
  type: string
  fixed_count: number
  skipped_count: number
  fixes: any[]
}

function FixResultBlock({ outcome }: { outcome: FixOutcome }) {
  const t = useT()
  return (
    <div className={`mt-2 text-xs px-2.5 py-2 rounded-sm ${outcome.fixed_count > 0 ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-amber/10 text-accent-amber'}`}>
      {t('已修复 {fixed} 项，跳过 {skipped} 项', { fixed: outcome.fixed_count, skipped: outcome.skipped_count })}
      {outcome.fixes?.map((f: any, i: number) => (
        <div key={i} className="mt-1 font-mono opacity-90">
          {f.type} → {f.status}{f.reason ? ` (${f.reason})` : ''}
        </div>
      ))}
    </div>
  )
}

export function LintResult() {
  const t = useT()
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'editor'

  const [result, setResult] = useState<any>(null)
  const [suggestions] = useState<Suggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fixingType, setFixingType] = useState<string | null>(null)
  const [fixOutcome, setFixOutcome] = useState<FixOutcome | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) return
    setIsLoading(true)
    api.get(`/ai/lint-reports/${reportId}`)
      .then((resp) => {
        try {
          setResult(JSON.parse(resp.data.result_json))
        } catch {
          setResult({ error: t('无法解析保存的报告') })
        }
      })
      .catch((err) => {
        setResult({ error: String(err) })
      })
      .finally(() => setIsLoading(false))
  }, [reportId])

  const handleFix = async (fixType: string) => {
    if (!reportId || !canEdit || fixingType) return
    setFixingType(fixType)
    setFixOutcome(null)
    try {
      const resp = await api.post(`/ai/lint/${reportId}/fix-all?fix_type=${fixType}`)
      setFixOutcome({ type: fixType, ...resp.data })
      // Reload report to refresh state
      const updated = await api.get(`/ai/lint-reports/${reportId}`)
      try {
        setResult(JSON.parse(updated.data.result_json))
      } catch {
        // ignore
      }
    } catch (err: any) {
      setFixOutcome({
        type: fixType,
        fixed_count: 0,
        skipped_count: 0,
        fixes: [{ type: 'error', status: 'error', reason: err.response?.data?.detail || String(err) }],
      })
    }
    setFixingType(null)
  }

  const handleDismiss = async (key: string) => {
    if (!reportId || !canEdit || dismissing) return
    setDismissing(key)
    try {
      await api.post(`/ai/lint/${reportId}/dismiss`, { issue_key: key })
      setResult((prev: any) => ({ ...prev, dismissed: [...(prev.dismissed || []), key] }))
    } catch (err: any) {
      toast({ title: t('忽略失败'), description: err.response?.data?.detail || String(err), variant: 'error' })
    }
    setDismissing(null)
  }

  const renderFixButton = (fixType: string) => {
    if (!canEdit) return null
    const fixed = (result?.auto_fixes || []).some(
      (f: any) => f.type === FIXED_TYPE_MAP[fixType] && f.status === 'fixed'
    )
    if (fixed) {
      return (
        <button disabled className="btn-teal text-sm px-3 py-1 h-auto shrink-0">
          {t('已修复')}
        </button>
      )
    }
    const busy = fixingType === fixType
    return (
      <button
        onClick={() => handleFix(fixType)}
        disabled={fixingType !== null}
        className="btn-teal text-sm px-3 py-1 h-auto shrink-0"
      >
        {busy ? (
          <Loader2 size={12} className="mr-1 animate-spin" />
        ) : (
          <Wand2 size={12} strokeWidth={1.5} className="mr-1" />
        )}
        {busy ? t('修复中...') : t('一键修复')}
      </button>
    )
  }

  const getSuggestion = (type: string, target: string) => {
    return suggestions.find((s) => s.type === type && s.target === target)
  }

  const hasIssues = result && !result.error && (
    (result.conflicts?.length > 0) ||
    (result.outdated_content?.length > 0) ||
    (result.orphan_pages?.length > 0) ||
    (result.missing_concepts?.length > 0) ||
    (result.missing_backlinks?.length > 0) ||
    (result.info_gaps?.length > 0) ||
    (result.conflict_annotations?.length > 0) ||
    (result.index_consistency && !result.index_consistency.consistent) ||
    (result.tag_consistency && !result.tag_consistency.consistent)
  )

  const dismissedSet = new Set<string>(result?.dismissed || [])
  const counts = computeCounts(result, dismissedSet)
  const summaryTotal = counts.critical + counts.warning + counts.info

  // 本次体检实际出现的问题类型（用于顶部含义说明）
  const presentTypes = result && !result.error
    ? Object.keys(ISSUE_TYPE_INFO).filter((key) => {
        const val = result[key]
        if (Array.isArray(val)) return val.length > 0
        if (val && typeof val === 'object') return val.consistent === false
        return false
      })
    : []

  if (isLoading) {
    return (
      <div className="py-20 text-center text-text-tertiary">
        <Loader2 size={24} className="animate-spin mx-auto mb-3" />
        <p className="text-sm">{t('加载体检报告中...')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link
          to="/lint"
          className="flex items-center justify-center w-8 h-8 rounded-md border border-default text-text-secondary hover:text-text-primary hover:border-accent-cyan/30 transition-colors"
          title={t('返回体检中心')}
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </Link>
        <h2 className="text-title">{t('体检报告')}</h2>
      </div>

      {result?.error && (
        <div className="card border-l-2 border-accent-red">
          <p className="text-small text-accent-red">{result.error}</p>
        </div>
      )}

      {!result?.error && result && (
        <div className="space-y-4">
          {presentTypes.length > 0 && (
            <div className="px-1">
              <p className="text-xs text-text-muted mb-1">{t('本次体检发现的问题类型说明：')}</p>
              <ul className="space-y-0.5">
                {presentTypes.map((key) => (
                  <li key={key} className="text-xs text-text-muted">{t(ISSUE_TYPE_INFO[key])}</li>
                ))}
              </ul>
            </div>
          )}

          {!hasIssues && (
            <div className="card flex items-center gap-3 py-6">
              <CheckCircle size={20} className="text-accent-green" strokeWidth={1.5} />
              <p className="text-body text-text-secondary">{t('Wiki 健康状况良好，未发现明显问题。')}</p>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-subtitle">{t('体检摘要')}</h3>
              <span className="text-mono text-text-primary text-sm">{t('{n} 项', { n: summaryTotal })}</span>
            </div>
            <div className="h-3 flex rounded-full overflow-hidden bg-inset">
              {summaryTotal === 0 ? (
                <div className="flex-1 bg-accent-green" />
              ) : (
                <>
                  <SummarySegment count={counts.critical} total={summaryTotal} color="bg-accent-red" />
                  <SummarySegment count={counts.warning} total={summaryTotal} color="bg-accent-amber" />
                  <SummarySegment count={counts.info} total={summaryTotal} color="bg-accent-cyan" />
                </>
              )}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-text-secondary">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-red" />Critical {counts.critical}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-amber" />Warning {counts.warning}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-cyan" />Info {counts.info}</span>
            </div>
          </div>

          {result.conflicts?.length > 0 && (
            <IssueCard
              icon={<XCircle size={15} className="text-accent-red" strokeWidth={1.5} />}
              title={t('矛盾检测 ({n})', { n: result.conflicts.length })}
              color="text-accent-red"
            >
              {result.conflicts.map((c: any, i: number) => {
                const target = c.pages.join(' vs ')
                const sug = getSuggestion('conflicts', target)
                return (
                  <div key={i} className="border-l-2 border-accent-red pl-3 py-1">
                    <p className="text-small font-mono text-text-secondary">{target}</p>
                    <IssueMeta
                      reason={c.description}
                      suggestion={t('人工核对两页的矛盾表述，统一事实后更新页面内容')}
                    />
                    {c.severity && <SeverityBadge severity={c.severity} />}
                    {sug && <SuggestionBlock suggestion={sug} />}
                    <div className="flex gap-2 mt-2 items-center">
                      {c.pages.map((slug: string) => (
                        <button
                          key={slug}
                          onClick={() => navigate(`/wiki/${slug}`)}
                          className="text-xs text-accent-cyan hover:underline flex items-center gap-0.5"
                        >
                          <ExternalLink size={10} />
                          {t('前往 {slug}', { slug })}
                        </button>
                      ))}
                      {canEdit && (
                        <IssueActions
                          fixed={dismissedSet.has(issueKey.conflicts(c))}
                          pending={dismissing === issueKey.conflicts(c)}
                          onFix={() => navigate(`/wiki/${c.pages[0]}`)}
                          onDismiss={() => handleDismiss(issueKey.conflicts(c))}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </IssueCard>
          )}

          {result.outdated_content?.length > 0 && (
            <IssueCard
              icon={<Loader2 size={15} className="text-accent-amber" strokeWidth={1.5} />}
              title={t('过时内容 ({n})', { n: result.outdated_content.length })}
              color="text-accent-amber"
            >
              {result.outdated_content.map((c: any, i: number) => {
                const sug = getSuggestion('outdated_content', c.statement)
                return (
                  <div key={i} className="border-l-2 border-accent-amber pl-3 py-1">
                    <p className="text-body font-medium text-text-primary">{c.statement}</p>
                    <p className="text-small font-mono text-text-secondary mt-0.5">[[{c.page}]]</p>
                    <IssueMeta
                      reason={c.reason}
                      suggestion={t('前往页面核实该表述，更新为最新事实')}
                    />
                    {c.severity && <SeverityBadge severity={c.severity} />}
                    {sug && <SuggestionBlock suggestion={sug} />}
                    <div className="flex gap-2 mt-2 items-center">
                      <button
                        onClick={() => navigate(`/wiki/${c.page}`)}
                        className="text-xs text-accent-cyan hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink size={10} />
                        {t('前往 {page}', { page: c.page })}
                      </button>
                      {canEdit && (
                        <IssueActions
                          fixed={dismissedSet.has(issueKey.outdated(c))}
                          pending={dismissing === issueKey.outdated(c)}
                          onFix={() => navigate(`/wiki/${c.page}`)}
                          onDismiss={() => handleDismiss(issueKey.outdated(c))}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </IssueCard>
          )}

          {result.missing_backlinks?.length > 0 && (
            <IssueCard
              icon={<GitFork size={15} className="text-accent-amber" strokeWidth={1.5} />}
              title={t('反向链接缺口 ({n})', { n: result.missing_backlinks.length })}
              color="text-accent-amber"
              action={renderFixButton('missing_backlinks')}
            >
              {result.missing_backlinks.map((b: any, i: number) => {
                const sug = getSuggestion('missing_backlinks', `${b.from} → ${b.to}`)
                return (
                  <div key={i} className="border-l-2 border-accent-amber pl-3 py-1">
                    <p className="text-small font-mono text-text-secondary">
                      {b.from} → {b.to}
                    </p>
                    <IssueMeta
                      reason={t('[[{from}]] 链接到 [[{to}]]，但 [[{to}]] 中缺少指回的链接', { from: b.from, to: b.to })}
                      suggestion={t('在 [[{to}]] 页面补充 [[{from}]] 链接（可点右上角「一键修复」自动完成）', { from: b.from, to: b.to })}
                    />
                    {sug && <SuggestionBlock suggestion={sug} />}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => navigate(`/wiki/${b.to}`)}
                        className="text-xs text-accent-cyan hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink size={10} />
                        {t('前往 {to}', { to: b.to })}
                      </button>
                    </div>
                  </div>
                )
              })}
              {fixOutcome?.type === 'missing_backlinks' && <FixResultBlock outcome={fixOutcome} />}
            </IssueCard>
          )}

          {result.conflict_annotations?.length > 0 && (
            <IssueCard
              icon={<MessageSquareWarning size={15} className="text-accent-amber" strokeWidth={1.5} />}
              title={t('[!conflict] 标注 ({n})', { n: result.conflict_annotations.length })}
              color="text-accent-amber"
            >
              {result.conflict_annotations.map((a: any, i: number) => {
                const sug = getSuggestion('conflict_annotations', a.slug)
                return (
                  <div key={i} className="border-l-2 border-accent-amber pl-3 py-1">
                    <p className="text-small font-mono text-text-secondary">[[{a.slug}]]</p>
                    <p className="text-small text-text-tertiary mt-0.5 font-mono">{a.context}</p>
                    <IssueMeta
                      reason={t('页面中存在人工标记的 [!conflict] 矛盾标注')}
                      suggestion={t('核对标注处的矛盾内容，解决后手动移除标注')}
                    />
                    {sug && <SuggestionBlock suggestion={sug} />}
                    <div className="flex gap-2 mt-2 items-center">
                      <button
                        onClick={() => navigate(`/wiki/${a.slug}`)}
                        className="text-xs text-accent-cyan hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink size={10} />
                        {t('前往 {slug}', { slug: a.slug })}
                      </button>
                      {canEdit && (
                        <IssueActions
                          fixed={dismissedSet.has(issueKey.conflictAnn(a))}
                          pending={dismissing === issueKey.conflictAnn(a)}
                          onFix={() => navigate(`/wiki/${a.slug}`)}
                          onDismiss={() => handleDismiss(issueKey.conflictAnn(a))}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </IssueCard>
          )}

          {result.missing_concepts?.length > 0 && (
            <IssueCard
              icon={<FileQuestion size={15} className="text-wiki-concept" strokeWidth={1.5} />}
              title={t('缺失概念 ({n})', { n: result.missing_concepts.length })}
              color="text-wiki-concept"
            >
              {result.missing_concepts.map((c: any, i: number) => {
                const sug = getSuggestion('missing_concepts', c.name)
                return (
                  <div key={i} className="border-l-2 border-wiki-concept pl-3 py-1">
                    <p className="text-body font-medium text-text-primary">{c.name}</p>
                    <IssueMeta
                      reason={t('被 {n} 个实体页引用，但尚无独立页面', { n: c.referenced_by.length })}
                      suggestion={t('摄入或上传相关资料，经摄入流程创建该概念页')}
                    />
                    {sug && <SuggestionBlock suggestion={sug} />}
                    {canEdit && (
                      <IssueActions
                        fixed={dismissedSet.has(issueKey.concept(c))}
                        pending={dismissing === issueKey.concept(c)}
                        onFix={() => navigate('/raw')}
                        onDismiss={() => handleDismiss(issueKey.concept(c))}
                      />
                    )}
                  </div>
                )
              })}
            </IssueCard>
          )}

          {result.index_consistency && !result.index_consistency.consistent && (
            <IssueCard
              icon={<List size={15} className="text-accent-amber" strokeWidth={1.5} />}
              title={t('索引不一致')}
              color="text-accent-amber"
              action={renderFixButton('index_consistency')}
            >
              <IssueMeta
                reason={t('_wiki_index.md 与实际页面不同步')}
                suggestion={t('点击右上角「一键修复」重建索引')}
              />
              <div className="space-y-2">
                {result.index_consistency.missing_from_index?.length > 0 && (
                  <div>
                    <p className="text-small text-text-secondary">{t('缺失于 _wiki_index.md 的页面：')}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {result.index_consistency.missing_from_index.map((slug: string) => (
                        <button
                          key={slug}
                          onClick={() => navigate(`/wiki/${slug}`)}
                          className="text-xs font-mono text-text-muted bg-inset px-2 py-1 rounded-sm hover:text-accent-cyan transition-colors"
                        >
                          {slug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {result.index_consistency.extra_in_index?.length > 0 && (
                  <div>
                    <p className="text-small text-text-secondary">{t('索引中多余的页面：')}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {result.index_consistency.extra_in_index.map((slug: string) => (
                        <span key={slug} className="text-xs font-mono text-text-muted bg-inset px-2 py-1 rounded-sm">
                          {slug}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {fixOutcome?.type === 'index_consistency' && <FixResultBlock outcome={fixOutcome} />}
            </IssueCard>
          )}

          {result.tag_consistency && !result.tag_consistency.consistent && (
            <IssueCard
              icon={<Tag size={15} className="text-accent-amber" strokeWidth={1.5} />}
              title={t('标签不一致')}
              color="text-accent-amber"
              action={renderFixButton('tag_consistency')}
            >
              <IssueMeta
                reason={t('_tag_registry.md 与页面实际使用的标签不同步')}
                suggestion={t('点击右上角「一键修复」重建标签注册表')}
              />
              <div className="space-y-2">
                {result.tag_consistency.missing_from_registry?.length > 0 && (
                  <div>
                    <p className="text-small text-text-secondary">{t('未在 _tag_registry.md 中注册的标签：')}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {result.tag_consistency.missing_from_registry.map((tag: string) => (
                        <span key={tag} className="text-xs font-mono text-text-muted bg-inset px-2 py-1 rounded-sm">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.tag_consistency.extra_in_registry?.length > 0 && (
                  <div>
                    <p className="text-small text-text-secondary">{t('注册表中多余（未被使用）的标签：')}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {result.tag_consistency.extra_in_registry.map((tag: string) => (
                        <span key={tag} className="text-xs font-mono text-text-muted bg-inset px-2 py-1 rounded-sm">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {fixOutcome?.type === 'tag_consistency' && <FixResultBlock outcome={fixOutcome} />}
            </IssueCard>
          )}

          {result.orphan_pages?.length > 0 && (
            <IssueCard
              icon={<AlertTriangle size={15} className="text-accent-cyan" strokeWidth={1.5} />}
              title={t('孤立页面 ({n})', { n: result.orphan_pages.length })}
              color="text-accent-cyan"
            >
              {result.orphan_pages.map((slug: string) => (
                <div key={slug} className="border-l-2 border-accent-cyan pl-3 py-1">
                  <button
                    onClick={() => navigate(`/wiki/${slug}`)}
                    className="text-small font-mono text-text-secondary hover:text-accent-cyan transition-colors"
                  >
                    {slug}
                  </button>
                  <IssueMeta
                    reason={t('未被任何其他页面链接，难以被发现')}
                    suggestion={t('在相关页面中添加 [[{slug}]] 链接，或确认该页面是否应保留', { slug })}
                  />
                  {canEdit && (
                    <IssueActions
                      fixed={dismissedSet.has(issueKey.orphan(slug))}
                      pending={dismissing === issueKey.orphan(slug)}
                      onFix={() => navigate(`/wiki/${slug}`)}
                      onDismiss={() => handleDismiss(issueKey.orphan(slug))}
                    />
                  )}
                </div>
              ))}
            </IssueCard>
          )}

          {result.reinforce_annotations?.length > 0 && (
            <IssueCard
              icon={<MessageSquarePlus size={15} className="text-accent-green" strokeWidth={1.5} />}
              title={t('[!reinforce] 标注 ({n})', { n: result.reinforce_annotations.length })}
              color="text-accent-green"
            >
              {result.reinforce_annotations.map((a: any, i: number) => {
                const sug = getSuggestion('reinforce_annotations', a.slug)
                return (
                  <div key={i} className="border-l-2 border-accent-green pl-3 py-1">
                    <p className="text-small font-mono text-text-secondary">[[{a.slug}]]</p>
                    <p className="text-small text-text-tertiary mt-0.5 font-mono">{a.context}</p>
                    <IssueMeta
                      reason={t('页面中存在人工标记的 [!reinforce] 待佐证标注')}
                      suggestion={t('补充佐证资料确认该论断后，手动移除标注')}
                    />
                    {sug && <SuggestionBlock suggestion={sug} />}
                    <div className="flex gap-2 mt-2 items-center">
                      <button
                        onClick={() => navigate(`/wiki/${a.slug}`)}
                        className="text-xs text-accent-cyan hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink size={10} />
                        {t('前往 {slug}', { slug: a.slug })}
                      </button>
                      {canEdit && (
                        <IssueActions
                          fixed={dismissedSet.has(issueKey.reinforceAnn(a))}
                          pending={dismissing === issueKey.reinforceAnn(a)}
                          onFix={() => navigate(`/wiki/${a.slug}`)}
                          onDismiss={() => handleDismiss(issueKey.reinforceAnn(a))}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </IssueCard>
          )}

          {result.info_gaps?.length > 0 && (
            <IssueCard
              icon={<Info size={15} className="text-text-muted" strokeWidth={1.5} />}
              title={t('信息缺口 ({n})', { n: result.info_gaps.length })}
              color="text-text-secondary"
            >
              {result.info_gaps.map((g: any, i: number) => {
                const sug = getSuggestion('info_gaps', g.question)
                return (
                  <div key={i} className="border-l-2 border-default pl-3 py-1">
                    <p className="text-body text-text-primary">{g.question}</p>
                    <IssueMeta
                      reason={t('知识库中缺乏回答该问题的内容')}
                      suggestion={g.suggested_source ? t('按建议来源补充资料：{source}', { source: g.suggested_source }) : undefined}
                    />
                    {g.severity && <SeverityBadge severity={g.severity} />}
                    {sug && <SuggestionBlock suggestion={sug} />}
                    {canEdit && (
                      <IssueActions
                        fixed={dismissedSet.has(issueKey.infoGap(g))}
                        pending={dismissing === issueKey.infoGap(g)}
                        onFix={() => navigate('/raw')}
                        onDismiss={() => handleDismiss(issueKey.infoGap(g))}
                      />
                    )}
                  </div>
                )
              })}
            </IssueCard>
          )}
        </div>
      )}
    </div>
  )
}
