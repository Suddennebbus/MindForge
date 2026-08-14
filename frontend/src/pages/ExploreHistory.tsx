import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Exploration } from '@/types'
import { ArrowLeft, Trash2, Compass, Clock } from 'lucide-react'

export function ExploreHistory() {
  const navigate = useNavigate()
  const [explorations, setExplorations] = useState<Exploration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/ai/explorations').then((resp) => {
      setExplorations(resp.data)
      setLoading(false)
    })
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条探索记录？')) return
    await api.delete(`/ai/explorations/${id}`)
    setExplorations((prev) => prev.filter((e) => e.id !== id))
  }

  const handleView = (exploration: Exploration) => {
    navigate('/explore', { state: { exploration } })
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="h-8 w-32 animate-pulse bg-surface rounded-sm mx-auto" />
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => navigate('/explore')} className="btn-ghost mb-4">
        <ArrowLeft size={14} className="mr-1.5" />
        返回探索
      </button>

      <h2 className="text-title mb-5">探索历史</h2>

      {explorations.length === 0 && (
        <div className="card text-center py-12 text-text-tertiary">
          <Compass size={32} strokeWidth={1.5} className="mx-auto mb-3 opacity-40" />
          <p>暂无探索记录</p>
          <button onClick={() => navigate('/explore')} className="btn-secondary mt-4">
            开始探索
          </button>
        </div>
      )}

      <div className="space-y-3">
        {explorations.map((e) => {
          let parsedResult: any = null
          try {
            parsedResult = JSON.parse(e.result_json)
          } catch {
            // ignore
          }
          const areaCount = parsedResult?.knowledge_areas?.length || 0
          const gapCount = parsedResult?.gaps?.length || 0
          const recCount = parsedResult?.recommendations?.length || 0

          return (
            <div
              key={e.id}
              className="card cursor-pointer hover:border-accent-cyan/30 transition-colors"
              onClick={() => handleView(e)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {e.direction || '全局探索'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {e.created_at.slice(0, 10)}
                    </span>
                    {areaCount > 0 && <span>{areaCount} 个知识领域</span>}
                    {gapCount > 0 && <span>{gapCount} 个缺口</span>}
                    {recCount > 0 && <span>{recCount} 条建议</span>}
                  </div>
                </div>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation()
                    handleDelete(e.id)
                  }}
                  className="text-text-muted hover:text-accent-red transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
