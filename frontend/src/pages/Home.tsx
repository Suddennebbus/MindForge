import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ClipboardList,
  FileInput,
  RefreshCw,
  Loader2,
  AlertCircle,
  Activity,
  Clock,
  ArrowUpRight,
} from 'lucide-react'
import { api } from '@/api/client'
import type { Dashboard } from '@/types'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { useSetPageWidth } from '@/components/PageWidth'
import { toast } from '@/stores/toastStore'
import { useBatchIngest } from '@/components/BatchIngest'
import { t, useT, useDateLocale } from '@/i18n'

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
  title,
}: {
  label: string
  value: number
  icon: React.ElementType
  tone?: 'cyan' | 'amber' | 'green' | 'red'
  onClick?: () => void
  title?: string
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-accent-amber'
      : tone === 'green'
        ? 'text-accent-green'
        : tone === 'red'
          ? 'text-accent-red'
          : 'text-accent-cyan'

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={title}
      className="flex items-center gap-3 px-4 py-3 border border-subtle rounded bg-surface hover:border-strong transition-colors text-left"
    >
      <Icon size={18} className={toneClass} strokeWidth={1.5} />
      <div className="min-w-0">
        <div className="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">{value}</div>
        <div className="text-[11px] uppercase tracking-wider text-text-tertiary">{label}</div>
      </div>
    </button>
  )
}

function Section({
  title,
  href,
  children,
  empty,
}: {
  title: string
  href?: string
  children: React.ReactNode
  empty?: boolean
}) {
  const t = useT()
  return (
    <div className="border border-subtle rounded bg-surface overflow-hidden transition-all duration-200 hover:scale-[1.01] hover:border-strong hover:shadow-lg">
      <div className="flex items-center justify-between px-4 h-10 border-b border-subtle bg-raised/30">
        <span className="text-xs font-medium uppercase tracking-wider !text-accent-cyan">{title}</span>
        {href && (
          <Link
            to={href}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            {t('查看全部')} <ArrowUpRight size={12} strokeWidth={1.5} />
          </Link>
        )}
      </div>
      <div className={empty ? 'p-4' : ''}>{children}</div>
    </div>
  )
}

function RecentList({ items }: { items: Dashboard['recent_wiki'] }) {
  const t = useT()
  if (items.length === 0) {
    return <EmptyState title={t('暂无记录')} icon={Clock} className="border-0 bg-transparent" />
  }

  return (
    <div className="divide-y divide-subtle">
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.href || '#'}
          className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-hover transition-colors"
        >
          <div className="min-w-0">
            <div className="text-sm text-text-primary truncate">{item.title}</div>
            {item.subtitle && (
              <div className="text-xs text-text-tertiary truncate">{item.subtitle}</div>
            )}
          </div>
          <ArrowUpRight size={14} className="text-text-muted shrink-0" strokeWidth={1.5} />
        </Link>
      ))}
    </div>
  )
}

interface RunningAction {
  key: string
  label: string
  operator: string
  started_at: string
}

const actionLabels: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  execute: '执行',
}

const resourceLabels: Record<string, string> = {
  wiki: 'Wiki',
  raw: '资料',
  pre_raw: '待审资料',
  ingest: '入库',
  update_knowledge_base: '知识库恢复',
  plan: '计划',
  explore: '探索',
  exploration: '探索记录',
  lint: '体检',
  lint_fix: '体检修复',
  human_output: '人类产出',
}

function formatActivityAction(item: Dashboard['recent_activity'][number]) {
  const action = actionLabels[item.action_type || ''] || item.action || '操作'
  const resource = resourceLabels[item.resource_type || ''] || item.type
  // 统一命名：摄入类操作（含「更新知识库」按钮）一律显示「更新知识库」；
  // 体检类操作（体检/修复/忽略）一律显示「执行知识库体检」
  if (item.resource_type === 'ingest' || item.resource_type === 'update_knowledge_base') return t('更新知识库')
  if (item.resource_type === 'lint' || item.resource_type === 'lint_fix') return t('执行知识库体检')
  // 兜底：后端已下发统一名时直接采用（resource_type 缺失等异常情况）
  if (item.type === '更新知识库' || item.type === '执行知识库体检') return t(item.type)
  if (item.action_type === 'create' && item.resource_type === 'raw') return t('上传资料')
  if (item.action_type === 'create' && item.resource_type === 'pre_raw') return t('上传待审资料')
  if (item.action_type === 'create' && item.resource_type === 'plan') return t('生成计划')
  if (item.action_type === 'execute' && item.resource_type === 'explore') return t('探索')
  if (item.action_type === 'create' && item.resource_type === 'exploration') return t('保存探索记录')
  if (item.action_type === 'create' && item.resource_type === 'human_output') return t('上传人类产出')
  if (item.action_type === 'execute' && item.resource_type === 'human_output') return t('人类产出转入库')
  return `${t(action)}${t(resource)}`
}

function ActivityList({ items }: { items: Dashboard['recent_activity'] }) {
  const t = useT()
  const dateLocale = useDateLocale()
  if (items.length === 0) {
    return <EmptyState title={t('暂无动态')} icon={Activity} className="border-0 bg-transparent" />
  }

  const formatTime = (value: string) => {
    const date = new Date(value)
    return date.toLocaleString(dateLocale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      <div className="grid grid-cols-[3fr_1fr_1fr] px-4 py-2 bg-raised border-b border-subtle text-[10px] uppercase tracking-wider text-text-tertiary">
        <span>{t('操作')}</span>
        <span>{t('操作人')}</span>
        <span className="text-right">{t('操作时间')}</span>
      </div>
      <div className="divide-y divide-subtle">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.href || '#'}
            className="grid grid-cols-[3fr_1fr_1fr] items-center gap-3 px-4 py-2.5 hover:bg-hover transition-colors"
          >
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-xs font-medium text-accent-cyan truncate">{formatActivityAction(item)}</span>
              <span className="text-sm text-text-primary truncate" title={item.title}>{item.title}</span>
            </div>
            <span className="text-xs text-text-tertiary truncate">{item.operator || '—'}</span>
            <time className="text-[11px] text-text-muted text-right">{formatTime(item.created_at)}</time>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function Home() {
  const t = useT()
  const navigate = useNavigate()
  const setWide = useSetPageWidth('wide')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningActions, setRunningActions] = useState<RunningAction[]>([])
  const kb = useBatchIngest(() => {
    api.get<Dashboard>('/dashboard')
      .then((resp) => setDashboard(resp.data))
      .catch(() => {})
  })

  useEffect(() => {
    setWide()
    api.get<Dashboard>('/dashboard')
      .then((resp) => setDashboard(resp.data))
      .catch(() => toast({ title: t('加载仪表盘失败'), variant: 'error' }))
      .finally(() => setLoading(false))
  }, [setWide])

  // 轮询团队正在执行的重操作，置顶提示避免并发冲突
  useEffect(() => {
    const load = () =>
      api.get('/dashboard/running-actions')
        .then((resp) => setRunningActions(resp.data.actions || []))
        .catch(() => {})
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center text-text-tertiary">
        <Loader2 size={24} className="animate-spin mr-2" strokeWidth={1.5} />
        {t('加载工作台…')}
      </div>
    )
  }

  if (!dashboard) {
    return (
      <EmptyState
        title={t('无法加载工作台')}
        description={t('请检查网络连接或稍后重试')}
        icon={AlertCircle}
      />
    )
  }

  const healthDesc = t('基于最近一次 Wiki 体检结果计算（满分100分）')

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('工作台')}
        description={t('概览知识生产与治理状态，快速进入关键流程。')}
        icon={Activity}
        actions={
          <button
            onClick={kb.start}
            disabled={kb.busy}
            className="btn-primary flex items-center gap-2 disabled:opacity-60"
          >
            {kb.busy ? (
              <Loader2 size={16} className="animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw size={16} strokeWidth={1.5} />
            )}
            {t('更新知识库')}
          </button>
        }
      />

      {kb.statusElement}
      {kb.dialog}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t('待审阅')}
          value={dashboard.pending_review}
          icon={FileInput}
          tone={dashboard.pending_review > 0 ? 'amber' : 'cyan'}
          onClick={() => navigate('/pre-raw')}
        />
        <StatCard
          label={t('待同步')}
          value={dashboard.pending_sync}
          icon={RefreshCw}
          tone={dashboard.pending_sync > 0 ? 'amber' : 'cyan'}
          onClick={kb.busy ? undefined : kb.start}
          title={t('点击执行摄入并检查快照更新页面')}
        />
        <StatCard
          label={t('进行中计划')}
          value={dashboard.active_plans}
          icon={ClipboardList}
          tone="cyan"
          onClick={() => navigate('/plans')}
        />
        <StatCard
          label={t('健康度')}
          value={dashboard.health_score}
          icon={Activity}
          tone={dashboard.health_score < 80 ? 'amber' : 'green'}
          onClick={() => navigate('/lint')}
          title={healthDesc}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section title={t('最近 WIKI')} href="/wiki">
          <RecentList items={dashboard.recent_wiki} />
        </Section>
        <Section title={t('最近资料')} href="/raw">
          <RecentList items={dashboard.recent_raw} />
        </Section>
        <Section title={t('最近计划')} href="/plans">
          <RecentList items={dashboard.recent_plans} />
        </Section>
      </div>

      <Section title={t('最近动态')} href="/audit-log">
        {runningActions.length > 0 && (
          <div className="divide-y divide-subtle border-b border-subtle">
            {runningActions.map((a) => (
              <div key={a.key} className="flex items-center gap-2.5 px-4 py-3 bg-orange-500/10">
                <Loader2 size={20} className="animate-spin text-orange-500 shrink-0" strokeWidth={2.5} />
                <span className="text-lg font-bold text-orange-500">
                  {t('{operator} 正在{label}，为避免冲突请暂缓同类操作', { operator: a.operator, label: t(a.label) })}
                </span>
              </div>
            ))}
          </div>
        )}
        <ActivityList items={dashboard.recent_activity} />
      </Section>
    </div>
  )
}
