import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { AuditLog } from '@/types'
import {
  ScrollText,
  Search,
  Calendar,
  User,
  Loader2,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataList } from '@/components/DataList'
import { EmptyState } from '@/components/EmptyState'
import { toast } from '@/stores/toastStore'
import { t, useT, useDateLocale } from '@/i18n'

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

const specialLabels: Record<string, string> = {
  // 与首页「最近动态」统一命名：摄入类 → 更新知识库；体检类 → 执行知识库体检
  'execute:update_knowledge_base': '更新知识库',
  'execute:ingest': '更新知识库',
  'execute:lint': '执行知识库体检',
  'execute:lint_fix': '执行知识库体检',
  'update:lint': '执行知识库体检',
  'execute:explore': '探索',
  'create:exploration': '保存探索记录',
  'create:human_output': '上传人类产出',
  'execute:human_output': '人类产出转入库',
}

function formatAction(log: AuditLog): string {
  const special = specialLabels[`${log.action_type}:${log.resource_type}`]
  if (special) return t(special)
  const action = actionLabels[log.action_type] || log.action_type
  const resource = resourceLabels[log.resource_type] || log.resource_type
  return `${t(action)}${t(resource)}`
}

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  return date.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AuditLog() {
  const t = useT()
  const dateLocale = useDateLocale()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    action: '',
    operator: '',
    date_from: '',
    date_to: '',
  })

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.action) params.set('action', filters.action)
    if (filters.operator) params.set('operator', filters.operator)
    if (filters.date_from) params.set('date_from', filters.date_from)
    if (filters.date_to) params.set('date_to', filters.date_to)

    api
      .get(`/audit/logs?${params.toString()}`)
      .then((resp) => setLogs(resp.data as AuditLog[]))
      .catch(() => toast({ title: t('加载操作日志失败'), variant: 'error' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleSearch = () => {
    load()
  }

  const handleReset = () => {
    setFilters({ action: '', operator: '', date_from: '', date_to: '' })
    setTimeout(load, 0)
  }

  const columns = [
    {
      key: 'action',
      header: t('操作'),
      width: '60%',
      render: (log: AuditLog) => {
        const label = formatAction(log)
        return (
          <div className="min-w-0">
            <span className="text-xs font-medium text-accent-cyan mr-2">{label}</span>
            {log.href ? (
              <Link
                to={log.href}
                className="text-sm text-text-primary hover:text-accent-cyan transition-colors"
              >
                {log.title || '—'}
              </Link>
            ) : (
              <span className="text-sm text-text-primary">{log.title || '—'}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'operator',
      header: t('操作人'),
      width: '20%',
      render: (log: AuditLog) => (
        <span className="text-sm text-text-secondary truncate">{log.username || '—'}</span>
      ),
    },
    {
      key: 'time',
      header: t('操作时间'),
      width: '20%',
      render: (log: AuditLog) => (
        <span className="text-xs text-text-tertiary">{formatTime(log.created_at, dateLocale)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('操作日志')}
        description={t('查看系统中的所有操作记录，支持按日期、操作人、动作筛选。')}
        icon={ScrollText}
      />

      <div className="flex flex-wrap items-end gap-3 p-3 border border-subtle rounded bg-surface">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">{t('关键词')}</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
            <input
              type="text"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('如 入库 / 删除 / Wiki / 计划')}
              className="input pl-8 w-48"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">{t('操作人')}</label>
          <div className="relative">
            <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
            <input
              type="text"
              value={filters.operator}
              onChange={(e) => setFilters({ ...filters, operator: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('用户名')}
              className="input pl-8 w-40"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">{t('开始日期')}</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
              className="input pl-8 w-40"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">{t('结束日期')}</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
              className="input pl-8 w-40"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={handleReset} className="btn-ghost">
            <X size={14} strokeWidth={1.5} className="mr-1.5" />
            {t('重置')}
          </button>
          <button onClick={handleSearch} disabled={loading} className="btn-primary">
            {loading ? (
              <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
            ) : (
              <Search size={14} strokeWidth={1.5} className="mr-1.5" />
            )}
            {t('筛选')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded bg-surface border border-subtle animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={t('暂无操作日志')}
          description={t('当前筛选条件下没有匹配的记录。')}
        />
      ) : (
        <DataList columns={columns} data={logs} keyExtractor={(l) => l.id} />
      )}
    </div>
  )
}
