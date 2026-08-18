import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/i18n'

export function ChangePassword() {
  const t = useT()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)

  if (!token) return <Navigate to="/login" replace />
  if (user && !user.must_change_password) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError(t('两次输入的新密码不一致'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      if (user) setAuth({ ...user, must_change_password: false }, token)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('修改密码失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full rounded-md bg-[#1e222b] border border-transparent px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488]'

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#0b0d13] px-4">
      <div className="w-full max-w-sm rounded-xl bg-[#15181f] p-8 shadow-xl">
        <h1 className="text-lg font-semibold text-gray-100">{t('设置新密码')}</h1>
        <p className="mt-1 text-sm text-gray-400">
          {t('首次登录需要修改初始密码后才能继续使用')}
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t('当前密码')}
            required
            className={inputCls}
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('新密码（至少 6 位）')}
            required
            minLength={6}
            className={inputCls}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('确认新密码')}
            required
            minLength={6}
            className={inputCls}
          />
          {error && <p className="text-sm text-red-400">{t(error)}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="btn-teal w-full py-2 rounded-md disabled:opacity-50"
          >
            {submitting ? t('提交中…') : t('确认修改')}
          </button>
        </form>
      </div>
    </div>
  )
}
