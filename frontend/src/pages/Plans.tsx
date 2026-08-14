import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import { Plan } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import {
  Plus,
  ClipboardList,
  Clock,
  X,
  FileText,
  ArrowLeft,
  Sparkles,
  Loader2,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AgentRunProgress } from '@/components/AgentRunProgress'
import { PageHeader } from '@/components/PageHeader'
import { DataList } from '@/components/DataList'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { toast } from '@/stores/toastStore'
import { useTaskStore } from '@/stores/taskStore'
import {
  useInterviewStore,
  type InterviewQuestion,
  type InterviewAnswer,
  type ChoiceAnswer,
} from '@/stores/interviewStore'

const statusConfig: Record<string, { label: string; variant: 'default' | 'active' | 'success' | 'warning' | 'muted' }> = {
  draft: { label: '草稿', variant: 'default' },
  active: { label: '进行中', variant: 'success' },
  paused: { label: '已暂停', variant: 'warning' },
  completed: { label: '已完成', variant: 'active' },
  archived: { label: '已归档', variant: 'muted' },
  pending_generation: { label: '待生成', variant: 'warning' },
}

export function Plans() {
  const navigate = useNavigate()
  const location = useLocation()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'choose' | 'manual' | 'ai-step1' | 'ai-step2' | 'ai-running' | 'upload'>('choose')
  const [form, setForm] = useState({ title: '', description: '', direction: '' })
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [generateLoading, setGenerateLoading] = useState(false)
  // 访谈状态跨路由持久：点弹窗外 / 切换界面后仍可恢复
  const interviewActive = useInterviewStore((s) => s.active)
  const direction = useInterviewStore((s) => s.direction)
  const questions = useInterviewStore((s) => s.questions)
  const answers = useInterviewStore((s) => s.answers)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [continueRunId, setContinueRunId] = useState<string | null>(null)
  const [showContinueModal, setShowContinueModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'editor'

  useEffect(() => {
    loadPlans()
    // 从探索页「生成研究计划」/「继续采访」进入：恢复或启动 AI 辅助生成访谈
    const autoOpen = (location.state as { autoOpenInterview?: boolean } | null)?.autoOpenInterview
    if (autoOpen && canEdit) {
      window.history.replaceState({}, document.title)
      const st = useInterviewStore.getState()
      setShowModal(true)
      if (st.questions.length > 0) {
        // 访谈已进行到答题环节，直接恢复，保留已作答内容
        setModalMode('ai-step2')
      } else {
        setModalMode('ai-step1')
        void startInterview(st.direction)
      }
      return
    }
    // 从其他页面切回时，若计划生成仍在进行，恢复进度弹窗（Agent run 在服务端继续执行）
    const genTask = useTaskStore.getState().tasks['plan-generation']
    if (genTask?.status === 'running' && genTask.data?.runId) {
      setActiveRunId(genTask.data.runId)
      setModalMode('ai-running')
      setShowModal(true)
    }
    const contTask = useTaskStore.getState().tasks['plan-continue-generation']
    if (contTask?.status === 'running' && contTask.data?.runId) {
      setContinueRunId(contTask.data.runId)
      setShowContinueModal(true)
    }
  }, [])

  const loadPlans = () => {
    setLoading(true)
    api.get('/plans')
      .then((resp) => setPlans(resp.data))
      .catch(() => toast({ title: '加载计划失败', variant: 'error' }))
      .finally(() => setLoading(false))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/plans/${deleteTarget.id}`)
      setPlans((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      toast({ title: '计划已删除', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '删除失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/plans', form)
      setForm({ title: '', description: '', direction: '' })
      setShowModal(false)
      setModalMode('choose')
      loadPlans()
      toast({ title: '计划已创建', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '创建失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const startInterview = async (dir: string) => {
    if (!dir.trim()) return
    setInterviewLoading(true)
    try {
      const resp = await api.post('/ai/plan-interview', { direction: dir.trim() })
      const qs = resp.data.questions || []
      const initialAnswers: Record<string, InterviewAnswer> = {}
      qs.forEach((q: InterviewQuestion) => {
        if (q.type === 'choice') {
          initialAnswers[q.id] = { choice: '', text: '' }
        } else {
          initialAnswers[q.id] = ''
        }
      })
      useInterviewStore.getState().setQuestions(qs, initialAnswers)
      setModalMode('ai-step2')
    } catch (err: any) {
      toast({
        title: '访谈启动失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setInterviewLoading(false)
  }

  const handleStartInterview = () => startInterview(direction)

  const handleGeneratePlan = async () => {
    setGenerateLoading(true)
    try {
      const resp = await api.post('/ai/runs', {
        direction: direction.trim(),
        answers,
      })
      setActiveRunId(resp.data.run_id)
      useTaskStore.getState().startTask('plan-generation', { runId: resp.data.run_id })
      setModalMode('ai-running')
    } catch (err: any) {
      toast({
        title: '生成计划失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setGenerateLoading(false)
  }

  const handleContinueGeneration = async (plan: Plan) => {
    try {
      const resp = await api.post(`/plans/${plan.id}/continue-generation`)
      setContinueRunId(resp.data.run_id)
      useTaskStore.getState().startTask('plan-continue-generation', { runId: resp.data.run_id })
      setShowContinueModal(true)
    } catch (err: any) {
      toast({
        title: '继续生成失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
  }

  const handleContinueComplete = (planId: string) => {
    useTaskStore.getState().succeedTask('plan-continue-generation')
    setShowContinueModal(false)
    setContinueRunId(null)
    loadPlans()
    navigate(`/plans/${planId}`)
  }

  const handleContinueCancel = () => {
    useTaskStore.getState().clearTask('plan-continue-generation')
    setShowContinueModal(false)
    setContinueRunId(null)
    loadPlans()
  }

  const handleRunComplete = (planId: string) => {
    useTaskStore.getState().succeedTask('plan-generation')
    useInterviewStore.getState().complete()
    setShowModal(false)
    setModalMode('choose')
    setActiveRunId(null)
    loadPlans()
    navigate(`/plans/${planId}`)
  }

  const handleRunCancel = () => {
    useTaskStore.getState().clearTask('plan-generation')
    useInterviewStore.getState().dismiss()
    setShowModal(false)
    setModalMode('choose')
    setActiveRunId(null)
  }

  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (file) {
      setUploadFile(file)
      setModalMode('upload')
    }
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  const handleUploadPlan = async () => {
    if (!uploadFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', uploadFile)
    try {
      const resp = await api.post('/plans/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      resetModal()
      loadPlans()
      navigate(`/plans/${resp.data.id}`)
      toast({ title: '计划上传成功', variant: 'success' })
    } catch (err: any) {
      toast({
        title: '上传失败',
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    }
    setUploading(false)
  }

  const resetModal = () => {
    setShowModal(false)
    setModalMode('choose')
    useInterviewStore.getState().dismiss()
    setForm({ title: '', description: '', direction: '' })
    setUploadFile(null)
    setActiveRunId(null)
  }

  // 采访环节（step1/step2）点弹窗外 / 关闭按钮：隐藏弹窗但保留访谈状态（成为「采访进行中」记录）
  const hideInterviewModal = () => {
    setShowModal(false)
  }

  // 从「采访进行中」记录恢复访谈弹窗
  const resumeInterview = () => {
    setShowModal(true)
    setModalMode(questions.length > 0 ? 'ai-step2' : 'ai-step1')
  }

  // 弹窗关闭按钮 / 点弹窗外：采访环节（step1/step2）隐藏保留，其余重置
  const closeModal = () => {
    if (modalMode === 'ai-step1' || modalMode === 'ai-step2') {
      hideInterviewModal()
    } else {
      resetModal()
    }
  }

  const isAnswerComplete = (q: InterviewQuestion): boolean => {
    const ans = answers[q.id]
    if (q.type === 'choice') {
      const ca = ans as ChoiceAnswer
      if (ca?.choice && ca.choice !== '__other__') return true
      if (ca?.choice === '__other__' && ca?.text?.trim()) return true
      if (q.allow_other === false && !ca?.choice) return false
      if (!ca?.choice && !ca?.text?.trim()) return false
      return true
    }
    return typeof ans === 'string' && ans.trim().length > 0
  }

  const renderQuestionInput = (q: InterviewQuestion) => {
    if (q.type === 'choice') {
      const ans = (answers[q.id] as ChoiceAnswer) || { choice: '', text: '' }
      const choices = q.choices || []
      return (
        <div className="space-y-2">
          {choices.map((c) => (
            <label
              key={c}
              className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer transition-colors ${
                ans.choice === c
                  ? 'border-accent-cyan/40 bg-accent-cyan/5'
                  : 'border-subtle hover:border-accent-cyan/20'
              }`}
            >
              <input
                type="radio"
                name={q.id}
                value={c}
                checked={ans.choice === c}
                onChange={() => useInterviewStore.getState().setAnswer(q.id, { ...ans, choice: c })}
                className="accent-accent-cyan"
              />
              <span className="text-sm text-text-primary">{c}</span>
            </label>
          ))}
          {q.allow_other !== false && (
            <label
              className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer transition-colors ${
                ans.choice === '__other__'
                  ? 'border-accent-cyan/40 bg-accent-cyan/5'
                  : 'border-subtle hover:border-accent-cyan/20'
              }`}
            >
              <input
                type="radio"
                name={q.id}
                value="__other__"
                checked={ans.choice === '__other__'}
                onChange={() => useInterviewStore.getState().setAnswer(q.id, { ...ans, choice: '__other__' })}
                className="accent-accent-cyan"
              />
              <span className="text-sm text-text-primary">其他</span>
            </label>
          )}
          {(ans.choice === '__other__' || (choices.length === 0 && q.allow_other !== false)) && (
            <input
              type="text"
              value={ans.text || ''}
              onChange={(e) => useInterviewStore.getState().setAnswer(q.id, { ...ans, text: e.target.value })}
              className="input w-full"
              placeholder={q.placeholder || '请补充说明...'}
            />
          )}
        </div>
      )
    }

    return (
      <input
        type="text"
        value={(answers[q.id] as string) || ''}
        onChange={(e) => useInterviewStore.getState().setAnswer(q.id, e.target.value)}
        className="input w-full"
        placeholder={q.placeholder || '请输入你的回答...'}
      />
    )
  }

  const columns = [
    {
      key: 'title',
      header: '计划',
      render: (plan: Plan) => (
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{plan.title}</div>
          {plan.description && (
            <div className="text-xs text-text-tertiary line-clamp-1">{plan.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      width: '100px',
      render: (plan: Plan) => {
        const cfg = statusConfig[plan.status] || statusConfig.draft
        return <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>
      },
    },
    {
      key: 'meta',
      header: '元信息',
      width: '220px',
      render: (plan: Plan) => (
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-1">
            <Clock size={12} strokeWidth={1.5} />
            {plan.created_at.slice(0, 10)}
          </span>
          {plan.direction && <span className="truncate max-w-[100px]">{plan.direction}</span>}
          {plan.related_slugs.length > 0 && (
            <span className="flex items-center gap-1">
              <FileText size={12} strokeWidth={1.5} />
              {plan.related_slugs.length}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      align: 'right' as const,
      render: (plan: Plan) => (
        <div className="flex items-center justify-end gap-1">
          {plan.status === 'pending_generation' && canEdit && (
            <button
              onClick={(ev) => {
                ev.stopPropagation()
                handleContinueGeneration(plan)
              }}
              className="h-7 px-2 text-xs rounded border border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 flex items-center gap-1 transition-colors"
            >
              <Sparkles size={12} strokeWidth={1.5} />
              继续
            </button>
          )}
          {canEdit && (
            <button
              onClick={(ev) => {
                ev.stopPropagation()
                setDeleteTarget(plan)
              }}
              className="p-1.5 rounded hover:bg-accent-red/10 text-text-tertiary hover:text-accent-red transition-colors"
              aria-label="删除"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="研究计划"
        description="管理研究方向、生成研究计划并跟踪进度。"
        icon={ClipboardList}
        actions={
          canEdit && (
            <button
              onClick={() => {
                setShowModal(true)
                setModalMode('choose')
              }}
              className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
            >
              <Plus size={14} strokeWidth={1.5} />
              新增
            </button>
          )
        }
      />

      {interviewActive && (
        <div className="flex items-center gap-3 px-4 py-3 rounded border border-accent-cyan/30 bg-accent-cyan/10">
          <Sparkles size={16} className="text-accent-cyan shrink-0" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-text-tertiary">采访进行中</span>
            <span className="block text-sm font-medium text-text-primary truncate">{direction || '未命名方向'}</span>
          </div>
          <button onClick={resumeInterview} className="btn-secondary h-7 px-2.5 text-xs shrink-0">
            继续采访
          </button>
          <button
            onClick={() => useInterviewStore.getState().dismiss()}
            className="btn-ghost h-7 px-2.5 text-xs shrink-0"
          >
            放弃
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded bg-surface border border-subtle animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          title="暂无研究计划"
          description="创建第一个计划开始组织研究方向。"
          icon={ClipboardList}
          action={
            canEdit ? (
              <button
                onClick={() => {
                  setShowModal(true)
                  setModalMode('choose')
                }}
                className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <Plus size={14} strokeWidth={1.5} />
                创建第一个计划
              </button>
            ) : undefined
          }
        />
      ) : (
        <DataList
          columns={columns}
          data={plans}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => navigate(`/plans/${p.id}`)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除研究计划"
        description={deleteTarget ? `确定删除「${deleteTarget.title}」？` : ''}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-subtle bg-surface shadow-xl overflow-hidden">
            <div className="px-4 h-12 flex items-center justify-between border-b border-subtle bg-raised/30">
              <span className="text-sm font-medium text-text-primary">
                {modalMode === 'choose' && '新建研究计划'}
                {modalMode === 'manual' && '手动创建计划'}
                {modalMode === 'upload' && '上传研究计划'}
                {modalMode === 'ai-step1' && 'AI 辅助生成'}
                {modalMode === 'ai-step2' && 'AI 访谈'}
                {modalMode === 'ai-running' && 'AI 生成中'}
              </span>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-hover text-text-tertiary transition-colors"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-5 overflow-auto">
              {modalMode === 'choose' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      mode: 'ai-step1',
                      icon: Sparkles,
                      title: 'AI 辅助生成',
                      desc: '描述研究方向，AI 采访并调研生成计划',
                      tone: 'text-accent-cyan',
                      bg: 'bg-accent-cyan/10',
                    },
                    {
                      mode: 'manual',
                      icon: Plus,
                      title: '手动创建',
                      desc: '直接填写标题、描述等信息',
                      tone: 'text-text-secondary',
                      bg: 'bg-raised',
                    },
                    {
                      mode: 'upload',
                      icon: Upload,
                      title: '上传',
                      desc: '上传 markdown / pdf / doc / txt',
                      tone: 'text-accent-green',
                      bg: 'bg-accent-green/10',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.mode}
                      onClick={() => {
                        if (opt.mode === 'upload') {
                          uploadInputRef.current?.click()
                        } else {
                          setModalMode(opt.mode as typeof modalMode)
                        }
                      }}
                      className="flex flex-col gap-3 p-4 rounded border border-subtle bg-surface hover:border-strong hover:bg-raised/50 transition-colors text-left"
                    >
                      <div className={`w-9 h-9 rounded flex items-center justify-center ${opt.bg}`}>
                        <opt.icon size={18} className={opt.tone} strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">{opt.title}</div>
                        <div className="text-xs text-text-tertiary mt-0.5">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                  <input
                    ref={uploadInputRef}
                    type="file"
                    className="hidden"
                    accept=".md,.pdf,.doc,.docx,.txt"
                    onChange={handleUploadFileSelect}
                  />
                </div>
              )}

              {modalMode === 'manual' && (
                <form onSubmit={handleCreate} className="space-y-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1.5">标题</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="input w-full"
                      placeholder="输入计划标题"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1.5">研究方向</label>
                    <input
                      type="text"
                      value={form.direction}
                      onChange={(e) => setForm({ ...form, direction: e.target.value })}
                      className="input w-full"
                      placeholder="如：大模型安全护栏"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-text-tertiary mb-1.5">描述</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="input w-full h-[40vh] resize-y py-2"
                      placeholder="描述研究目标和方法，支持 Markdown 格式..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setModalMode('choose')} className="btn-ghost h-8 px-3 text-xs">
                      <ArrowLeft size={14} className="mr-1" />
                      返回
                    </button>
                    <button type="submit" className="btn-primary h-8 px-3 text-xs">
                      <Plus size={14} strokeWidth={1.5} className="mr-1.5" />
                      创建
                    </button>
                  </div>
                </form>
              )}

              {modalMode === 'upload' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-raised rounded border border-subtle">
                    <FileText size={20} className="text-accent-cyan shrink-0" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{uploadFile?.name}</p>
                      <p className="text-xs text-text-tertiary">支持 Markdown、PDF、Word、TXT</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFile(null)
                        setModalMode('choose')
                      }}
                      className="btn-ghost h-8 px-3 text-xs"
                    >
                      <ArrowLeft size={14} className="mr-1" />
                      返回
                    </button>
                    <button
                      onClick={handleUploadPlan}
                      disabled={uploading}
                      className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
                          上传中…
                        </>
                      ) : (
                        <>
                          <Upload size={14} strokeWidth={1.5} className="mr-1.5" />
                          确认上传
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {modalMode === 'ai-step1' && (
                <div className="space-y-4">
                  <p className="text-sm text-text-secondary">
                    描述你想研究的方向，AI 会向你提出几个澄清问题，帮助你明确研究目标。
                  </p>
                  <textarea
                    value={direction}
                    onChange={(e) => useInterviewStore.getState().setDirection(e.target.value)}
                    className="input w-full h-32 resize-y py-2"
                    placeholder="例如：我想研究大语言模型的安全护栏机制..."
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        useInterviewStore.getState().dismiss()
                        setModalMode('choose')
                      }}
                      className="btn-ghost h-8 px-3 text-xs"
                    >
                      <ArrowLeft size={14} className="mr-1" />
                      返回
                    </button>
                    <button
                      onClick={handleStartInterview}
                      disabled={!direction.trim() || interviewLoading}
                      className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
                    >
                      {interviewLoading ? (
                        <>
                          <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
                          准备问题中…
                        </>
                      ) : (
                        <>
                          <Send size={14} strokeWidth={1.5} className="mr-1.5" />
                          开始访谈
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {modalMode === 'ai-step2' && (
                <div className="space-y-5">
                  <p className="text-sm text-text-secondary">
                    研究方向：<span className="text-text-primary font-medium">{direction}</span>
                  </p>
                  {questions.map((q, i) => (
                    <div key={q.id}>
                      <label className="block text-sm text-text-primary font-medium mb-2">
                        <span className="text-accent-cyan mr-1">{i + 1}.</span>
                        {q.question}
                      </label>
                      {renderQuestionInput(q)}
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setModalMode('ai-step1')} className="btn-ghost h-8 px-3 text-xs">
                      <ArrowLeft size={14} className="mr-1" />
                      返回
                    </button>
                    <button
                      onClick={handleGeneratePlan}
                      disabled={generateLoading || questions.some((q) => !isAnswerComplete(q))}
                      className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
                    >
                      {generateLoading ? (
                        <>
                          <Loader2 size={14} strokeWidth={1.5} className="mr-1.5 animate-spin" />
                          生成中…
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} strokeWidth={1.5} className="mr-1.5" />
                          生成研究计划
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {modalMode === 'ai-running' && activeRunId && (
                <AgentRunProgress
                  runId={activeRunId}
                  onComplete={handleRunComplete}
                  onCancel={handleRunCancel}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {showContinueModal && continueRunId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleContinueCancel} />
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-subtle bg-surface shadow-xl overflow-hidden">
            <div className="px-4 h-12 flex items-center justify-between border-b border-subtle bg-raised/30">
              <span className="text-sm font-medium text-text-primary">AI 正在继续生成研究计划</span>
              <button
                onClick={handleContinueCancel}
                className="p-1 rounded hover:bg-hover text-text-tertiary transition-colors"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-5">
              <AgentRunProgress
                runId={continueRunId}
                onComplete={handleContinueComplete}
                onCancel={handleContinueCancel}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
