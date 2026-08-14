import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useTaskStore } from '@/stores/taskStore'
import { toast } from '@/stores/toastStore'
import { useNavigate, Link } from 'react-router-dom'
import {
  Stethoscope, CheckCircle, Clock, Trash2, Loader2,
} from 'lucide-react'
import type { LintReport } from '@/types'

export function Lint() {
  const lintTask = useTaskStore((s) => s.tasks['lint'])
  const isLoading = lintTask?.status === 'running'
  const [reports, setReports] = useState<LintReport[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'editor'
  const navigate = useNavigate()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = () => {
    setHistoryLoading(true)
    api.get('/ai/lint-reports')
      .then((resp) => setReports(resp.data))
      .finally(() => setHistoryLoading(false))
  }

  const handleLint = async () => {
    if (!canEdit) return
    const data = await useTaskStore.getState().runTask('lint', async () => {
      const resp = await api.post('/ai/lint')
      return resp.data
    })
    if (data) {
      loadHistory()
      if (data.report_id) {
        navigate(`/lint/${data.report_id}`)
      }
    } else {
      const err = useTaskStore.getState().tasks['lint']?.error
      if (err) {
        toast({ title: '体检失败', description: err, variant: 'error' })
      }
    }
  }

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('确定删除这条体检记录？')) return
    try {
      await api.delete(`/ai/lint-reports/${id}`)
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch (err: any) {
      alert('删除失败：' + (err.response?.data?.detail || err.message))
    }
  }

  const renderHistoryItem = (report: LintReport) => {
    let parsed: any = null
    try {
      parsed = JSON.parse(report.result_json)
    } catch {
      // ignore
    }
    const s = parsed?.summary || {}

    return (
      <Link
        key={report.id}
        to={`/lint/${report.id}`}
        className="card block cursor-pointer hover:border-accent-cyan/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary truncate">
              体检报告
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {report.created_at.slice(0, 10)}
              </span>
              {s.critical > 0 && <span className="text-accent-red">{s.critical} Critical</span>}
              {s.warning > 0 && <span className="text-accent-amber">{s.warning} Warning</span>}
              {s.info > 0 && <span className="text-accent-cyan">{s.info} Info</span>}
              {s.pass > 0 && <span className="text-accent-green">Pass</span>}
            </div>
          </div>
          <button
            onClick={(ev) => { ev.preventDefault(); handleDeleteHistory(report.id) }}
            className="text-text-muted hover:text-accent-red transition-colors shrink-0"
            title="删除"
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </Link>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-title">体检中心</h2>
        <button
          onClick={handleLint}
          disabled={isLoading || !canEdit}
          className="btn-primary"
        >
          {isLoading ? (
            <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
          ) : (
            <Stethoscope size={14} strokeWidth={1.5} className="mr-1.5" />
          )}
          {isLoading ? '检查中...' : '开始体检'}
        </button>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-3">
          <CheckCircle size={20} className="text-accent-green" strokeWidth={1.5} />
          <div>
            <p className="text-body text-text-primary">Wiki 体检中心</p>
            <p className="text-small text-text-tertiary mt-0.5">
              点击右上角「开始体检」检查 Wiki 健康状态，包括矛盾、过时内容、孤立页面、反向链接缺口、索引与标签一致性等。
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-subtitle mb-4">体检记录</h3>
        {historyLoading ? (
          <div className="py-8 text-center">
            <div className="h-8 w-32 animate-pulse bg-surface rounded-sm mx-auto" />
          </div>
        ) : reports.length === 0 ? (
          <div className="card text-center py-10 text-text-tertiary">
            <p className="text-sm">暂无体检记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(renderHistoryItem)}
          </div>
        )}
      </div>
    </div>
  )
}
