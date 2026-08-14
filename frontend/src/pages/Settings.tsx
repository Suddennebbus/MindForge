import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import {
  Key,
  Plus,
  CheckCircle,
  Cpu,
  Pencil,
  Trash2,
  Star,
  Users,
  Shield,
  X,
  AlertTriangle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import type { User, RolePermissions } from '@/types'

interface LLMConfig {
  id: string
  provider: string
  model: string
  base_url: string
  is_default: boolean
}

const emptyLlmForm = {
  provider: '' as string,
  model: '' as string,
  api_key: '',
  base_url: '',
  is_default: false,
}

const ROLE_ORDER = ['admin', 'editor', 'viewer']

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'editor', label: '研究员' },
  { value: 'viewer', label: '游客' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  editor: '研究员',
  viewer: '游客',
}

const ALL_ACTIONS = ['create', 'read', 'update', 'delete', 'execute']
const ALL_RESOURCES = [
  'research_plan',
  'pre_raw',
  'raw',
  'wiki',
  'settings',
  'ingest',
  'explore',
  'lint',
]

const ACTION_LABELS: Record<string, string> = {
  create: '创建',
  read: '查看',
  update: '更新',
  delete: '删除',
  execute: '执行',
}

const RESOURCE_LABELS: Record<string, string> = {
  research_plan: '研究计划',
  pre_raw: '待入库',
  raw: '已入库',
  wiki: 'Wiki',
  settings: '设置',
  ingest: '摄入',
  explore: '探索',
  lint: '体检',
}

export function Settings() {
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [form, setForm] = useState({ ...emptyLlmForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    api.get('/llm-configs').then((resp) => setConfigs(resp.data))
  }

  const resetForm = () => {
    setForm({ ...emptyLlmForm })
    setEditingId(null)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          provider: form.provider,
          model: form.model,
          base_url: form.base_url || null,
          is_default: form.is_default,
        }
        if (form.api_key.trim()) {
          payload.api_key = form.api_key
        }
        await api.put(`/llm-configs/${editingId}`, payload)
      } else {
        await api.post('/llm-configs', {
          provider: form.provider,
          model: form.model,
          api_key: form.api_key,
          base_url: form.base_url || null,
          is_default: form.is_default,
        })
      }
      resetForm()
      loadConfigs()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '操作失败')
        : '操作失败'
      setError(msg)
    }
  }

  const handleEdit = (c: LLMConfig) => {
    setForm({
      provider: c.provider,
      model: c.model,
      api_key: '',
      base_url: c.base_url || '',
      is_default: c.is_default,
    })
    setEditingId(c.id)
    setError('')
  }

  const handleSetDefault = async (id: string) => {
    await api.patch(`/llm-configs/${id}/default`)
    loadConfigs()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此配置？')) return
    await api.delete(`/llm-configs/${id}`)
    loadConfigs()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-title mb-5">设置</h2>

      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Cpu size={15} className="text-accent-cyan" strokeWidth={1.5} />
          <h3 className="text-subtitle">LLM 配置</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="提供商（如 openai / deepseek / anthropic）"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="input"
            />
            <input
              type="text"
              placeholder="模型名（如 gpt-4o / deepseek-chat）"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="input"
            />
          </div>
          <input
            type="password"
            placeholder={editingId ? 'API Key（留空保持原值）' : 'API Key'}
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            className="input w-full"
          />
          <input
            type="text"
            placeholder="Base URL（可选）"
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            className="input w-full"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="accent-accent-cyan"
            />
            <span className="text-small text-text-secondary">设为默认模型</span>
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary">
              {editingId ? (
                <>
                  <CheckCircle size={14} strokeWidth={1.5} className="mr-1.5" />
                  保存修改
                </>
              ) : (
                <>
                  <Plus size={14} strokeWidth={1.5} className="mr-1.5" />
                  添加配置
                </>
              )}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary">
                取消
              </button>
            )}
            {saved && (
              <span className="text-xs text-accent-green flex items-center gap-1">
                <CheckCircle size={12} />
                已保存
              </span>
            )}
          </div>
          {error && (
            <p className="text-xs text-accent-red">{error}</p>
          )}
        </form>

        {configs.length > 0 && (
          <div className="mt-5 pt-4 border-t border-subtle space-y-2">
            {!configs.some((c) => c.is_default) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded border border-accent-amber/30 bg-accent-amber/10 text-accent-amber text-xs">
                <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0" />
                尚未设置默认模型，AI 功能（摄入、探索、问答、计划）将无法使用，请在下方选择一个模型设为默认。
              </div>
            )}
            {configs.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2.5 bg-inset rounded-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Key size={13} className="text-text-muted shrink-0" strokeWidth={1.5} />
                  <span className="text-small text-text-secondary truncate">
                    {c.provider} / {c.model}
                  </span>
                  {c.base_url && (
                    <span className="text-xs font-mono text-text-muted truncate max-w-[200px]">
                      {c.base_url}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {c.is_default ? (
                    <span className="badge text-accent-green">默认</span>
                  ) : (
                    <button
                      onClick={() => handleSetDefault(c.id)}
                      className="btn-secondary h-7 px-2.5 text-xs flex items-center gap-1"
                    >
                      <Star size={12} strokeWidth={1.5} />
                      设为默认
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(c)}
                    className="btn-ghost !h-7 !w-7 !px-0 justify-center"
                    title="编辑"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="btn-ghost !h-7 !w-7 !px-0 justify-center hover:text-accent-red"
                    title="删除"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminSection />
    </div>
  )
}

function AdminSection() {
  const currentUser = useAuthStore((s) => s.user)
  if (currentUser?.role !== 'admin') return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield size={18} className="text-accent-cyan" strokeWidth={1.5} />
        <h3 className="text-subtitle">管理员功能</h3>
      </div>
      <UserManagement />
      <RolePermissionManagement />
    </div>
  )
}

function UserManagement() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = () => {
    api.get('/auth/users').then((resp) => setUsers(resp.data as User[]))
  }

  const resetForm = () => {
    setForm({ username: '', email: '', password: '', role: 'viewer' })
    setEditingId(null)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {}
        if (form.email.trim()) payload.email = form.email
        if (form.password.trim()) payload.password = form.password
        payload.role = form.role
        await api.put(`/auth/users/${editingId}`, payload)
      } else {
        await api.post('/auth/users', {
          username: form.username,
          email: form.email || undefined,
          password: form.password,
          role: form.role,
        })
      }
      resetForm()
      loadUsers()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '操作失败')
        : '操作失败'
      setError(msg)
    }
  }

  const handleEdit = (u: User) => {
    setForm({
      username: u.username,
      email: u.email,
      password: '',
      role: u.role,
    })
    setEditingId(u.id)
    setError('')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该用户？此操作不可撤销。')) return
    try {
      await api.delete(`/auth/users/${id}`)
      loadUsers()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '删除失败')
        : '删除失败'
      alert(msg)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-5">
        <Users size={15} className="text-accent-cyan" strokeWidth={1.5} />
        <h3 className="text-subtitle">用户管理</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="用户名"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="input"
            disabled={!!editingId}
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="input"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="email"
          placeholder="邮箱（可选，留空则自动生成）"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="input w-full"
        />
        <input
          type="password"
          placeholder={editingId ? '密码（留空保持原值）' : '密码'}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="input w-full"
          required={!editingId}
        />
        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary">
            {editingId ? (
              <>
                <CheckCircle size={14} strokeWidth={1.5} className="mr-1.5" />
                保存修改
              </>
            ) : (
              <>
                <Plus size={14} strokeWidth={1.5} className="mr-1.5" />
                添加用户
              </>
            )}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-secondary">
              <X size={14} strokeWidth={1.5} className="mr-1.5" />
              取消
            </button>
          )}
          {saved && (
            <span className="text-xs text-accent-green flex items-center gap-1">
              <CheckCircle size={12} />
              已保存
            </span>
          )}
        </div>
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </form>

      <div className="border-t border-subtle pt-4">
        <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">用户列表</div>
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex items-center justify-between p-2.5 rounded-sm ${u.id === currentUser?.id ? 'bg-accent-cyan/10 border border-accent-cyan/20' : 'bg-inset'}`}
            >
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate">
                  {u.username}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-accent-cyan">（当前账号）</span>
                  )}
                </div>
                <div className="text-xs text-text-tertiary truncate">
                  {u.email} · {ROLE_LABELS[u.role] || u.role}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  onClick={() => handleEdit(u)}
                  className="btn-ghost !h-7 !w-7 !px-0 justify-center"
                  title="编辑"
                >
                  <Pencil size={13} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="btn-ghost !h-7 !w-7 !px-0 justify-center hover:text-accent-red"
                  title="删除"
                  disabled={u.id === currentUser?.id}
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-sm text-text-tertiary py-2">暂无用户</div>
          )}
        </div>
      </div>
    </div>
  )
}

function RolePermissionManagement() {
  const [roles, setRoles] = useState<RolePermissions[]>([])
  const [savedRole, setSavedRole] = useState<string | null>(null)

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = () => {
    api.get('/auth/roles').then((resp) => setRoles(resp.data as RolePermissions[]))
  }

  const hasPermission = (role: RolePermissions, action: string, resource: string) => {
    return role.permissions.some((p) => p.action === action && p.resource === resource)
  }

  const togglePermission = (roleName: string, action: string, resource: string) => {
    setRoles((prev) =>
      prev.map((role) => {
        if (role.role_name !== roleName) return role
        const exists = hasPermission(role, action, resource)
        const permissions = exists
          ? role.permissions.filter((p) => !(p.action === action && p.resource === resource))
          : [...role.permissions, { action, resource }]
        return { ...role, permissions }
      })
    )
  }

  const saveRole = async (roleName: string) => {
    const role = roles.find((r) => r.role_name === roleName)
    if (!role) return
    try {
      await api.put(`/auth/roles/${roleName}/permissions`, {
        permissions: role.permissions,
      })
      setSavedRole(roleName)
      setTimeout(() => setSavedRole(null), 2000)
      loadRoles()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '保存失败')
        : '保存失败'
      alert(msg)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-5">
        <Shield size={15} className="text-accent-cyan" strokeWidth={1.5} />
        <h3 className="text-subtitle">角色权限管理</h3>
      </div>

      <div className="space-y-6">
        {[...roles]
          .sort((a, b) => ROLE_ORDER.indexOf(a.role_name) - ROLE_ORDER.indexOf(b.role_name))
          .map((role) => (
          <div key={role.role_name} className="border border-subtle rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-raised/30 border-b border-subtle">
              <span className="text-sm font-medium text-text-primary">
                {ROLE_LABELS[role.role_name] || role.role_name}
              </span>
              <div className="flex items-center gap-2">
                {savedRole === role.role_name && (
                  <span className="text-xs text-accent-green flex items-center gap-1">
                    <CheckCircle size={12} />
                    已保存
                  </span>
                )}
                <button
                  onClick={() => saveRole(role.role_name)}
                  className="btn-primary text-xs !px-3 !py-1"
                >
                  保存权限
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-subtle bg-inset/50">
                    <th className="text-left px-3 py-2 text-text-tertiary font-medium">资源</th>
                    {ALL_ACTIONS.map((action) => (
                      <th
                        key={action}
                        className="text-center px-2 py-2 text-text-tertiary font-medium min-w-[64px]"
                      >
                        {ACTION_LABELS[action]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_RESOURCES.map((resource) => (
                    <tr key={resource} className="border-b border-subtle last:border-b-0">
                      <td className="px-3 py-2 text-text-secondary">{RESOURCE_LABELS[resource]}</td>
                      {ALL_ACTIONS.map((action) => (
                        <td key={action} className="text-center px-2 py-2">
                          <input
                            type="checkbox"
                            checked={hasPermission(role, action, resource)}
                            onChange={() => togglePermission(role.role_name, action, resource)}
                            className="accent-accent-cyan"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-inset rounded-sm text-xs text-text-tertiary space-y-1">
        <p>默认权限说明：</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <span className="text-text-secondary">管理员</span>：可执行所有操作，包括用户与权限管理。
          </li>
          <li>
            <span className="text-text-secondary">研究员</span>：可创建、更新、删除知识与资料，执行探索、摄入、体检等操作。
          </li>
          <li>
            <span className="text-text-secondary">游客</span>：仅可查看内容并使用对话模块。
          </li>
        </ul>
      </div>
    </div>
  )
}
