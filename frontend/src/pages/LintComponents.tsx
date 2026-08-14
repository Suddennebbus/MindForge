import type { ReactNode } from 'react'

export interface Suggestion {
  type: string
  target: string
  description: string
  suggestion: string
  auto_fixable: boolean
  fix_action?: { type: string; from: string; to: string }
}

export function SummarySegment({ count, total, color }: { count: number; total: number; color: string }) {
  if (total === 0 || count === 0) return null
  return (
    <div
      className={`${color}`}
      style={{ width: `${(count / total) * 100}%` }}
    />
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    high: 'Critical',
    medium: 'Warning',
    low: 'Info',
  }
  const color =
    severity === 'high' ? 'text-accent-red bg-accent-red/10' :
    severity === 'medium' ? 'text-accent-amber bg-accent-amber/10' :
    'text-accent-cyan bg-accent-cyan/10'
  return (
    <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-sm ${color}`}>
      {map[severity] || severity}
    </span>
  )
}

export function IssueCard({
  icon, title, color, action, children
}: {
  icon: ReactNode
  title: string
  color: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className={`text-subtitle ${color} flex-1`}>{title}</h3>
        {action}
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  )
}

/** 每条问题下的「原因 / 修复建议」说明行（标签加粗） */
export function IssueMeta({ reason, suggestion }: { reason?: string; suggestion?: string }) {
  if (!reason && !suggestion) return null
  return (
    <div className="mt-1 space-y-0.5">
      {reason && (
        <p className="text-small text-text-tertiary">
          <span className="font-bold text-text-secondary">原因：</span>{reason}
        </p>
      )}
      {suggestion && (
        <p className="text-small text-text-tertiary">
          <span className="font-bold text-text-secondary">修复建议：</span>{suggestion}
        </p>
      )}
    </div>
  )
}

/** 需人工参与修复的问题项操作区：「按建议修复」+「忽略」；已修复后灰色「已修复」 */
export function IssueActions({
  fixed, onFix, onDismiss, pending,
}: {
  fixed: boolean
  onFix: () => void
  onDismiss: () => void
  pending?: boolean
}) {
  if (fixed) {
    return (
      <button disabled className="btn-teal mt-1.5 text-sm px-3 py-1 h-auto">
        已修复
      </button>
    )
  }
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button onClick={onFix} disabled={pending} className="btn-teal text-sm px-3 py-1 h-auto">
        按建议修复
      </button>
      <button onClick={onDismiss} disabled={pending} className="btn-dismiss px-2.5 py-1 h-auto">
        忽略
      </button>
    </div>
  )
}

export function SuggestionBlock({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="mt-2 p-2.5 bg-inset rounded-md border border-default/50">
      <p className="text-sm text-text-secondary">{suggestion.suggestion}</p>
      {suggestion.auto_fixable && (
        <span className="inline-block mt-1 text-xs text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded-sm">
          可自动修复
        </span>
      )}
    </div>
  )
}
