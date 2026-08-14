import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/api/client'
import { Hammer, Compass, Network, HeartPulse } from 'lucide-react'

// 四色图标方块取自系统既有 token 色相（cyan/green/entity紫/amber），与参考图的多色节奏一致
const capabilities = [
  {
    icon: Hammer,
    tile: 'bg-cyan-400/10 border-cyan-400/20 text-cyan-400',
    title: '基于LLM-Wiki的知识铸造',
    desc: '将论文、报告与经验，转化为结构化、可连接、可演进的知识网络',
  },
  {
    icon: Compass,
    tile: 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400',
    title: '知识探索引擎',
    desc: '分析领域知识覆盖，发现研究缺口，生成下一步探索方向',
  },
  {
    icon: Network,
    tile: 'bg-violet-400/10 border-violet-400/20 text-violet-400',
    title: '知识图谱',
    desc: '通过双向链接形成可导航、可溯源的知识网络',
  },
  {
    icon: HeartPulse,
    tile: 'bg-amber-400/10 border-amber-400/20 text-amber-400',
    title: '知识体检',
    desc: '自动发现知识缺口、孤立页面与结构问题，让知识库持续健康演进',
  },
]

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const resp = await api.post('/auth/login', { username, password })
      const { access_token } = resp.data
      const me = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      })
      setAuth(me.data, access_token)
      navigate(me.data.must_change_password ? '/change-password' : '/')
    } catch (err: any) {
      setError(err.response?.data?.detail || '登录失败')
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-[#0b0d13]">
      {/* 角落环境光：顶部偏蓝、左下微紫、右下微绿，全部低饱和 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            'radial-gradient(ellipse 50% 45% at 70% 0%, rgba(59, 91, 219, 0.10) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 40% at 0% 100%, rgba(139, 92, 246, 0.07) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 40% at 100% 100%, rgba(52, 211, 153, 0.06) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      {/* 顶栏：Logo + 字标 */}
      <header className="relative flex items-center gap-3 px-8 lg:px-14 pt-7">
        <img src="/logo.png" alt="MindForge" className="h-11 w-auto" />
        <span className="text-2xl font-bold text-gray-50 tracking-tight">MindForge</span>
      </header>

      {/* 主体：左品牌叙事 / 右登录卡 */}
      <main className="relative flex-1 flex items-center px-8 lg:px-14 py-10">
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-14 lg:gap-20 items-center">
          {/* 左侧 */}
          <div>
            <h1 className="text-3xl md:text-5xl font-bold text-gray-50 tracking-tight leading-tight xl:whitespace-nowrap">
              MindForge，垂域知识铸造平台
            </h1>
            <p className="mt-4 text-lg md:text-xl text-gray-400">
              让知识持续生长，让研究方向主动浮现
            </p>

            <ul className="mt-10 space-y-6">
              {capabilities.map((c) => (
                <li key={c.title} className="flex items-start gap-4">
                  <span className={`shrink-0 h-10 w-10 rounded-md border flex items-center justify-center ${c.tile}`}>
                    <c.icon size={19} strokeWidth={1.5} />
                  </span>
                  <div>
                    <div className="text-xl font-bold text-gray-100">{c.title}</div>
                    <div className="mt-1 text-lg text-gray-500">{c.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 右侧：登录卡片 */}
          <div className="lg:justify-self-end w-full max-w-md">
            <div className="rounded-lg border border-white/10 bg-[#15181f]/90 backdrop-blur-sm p-8 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
              {error && (
                <div className="mb-5 px-3.5 py-2.5 rounded-md bg-red-500/10 border border-red-500/25 text-base text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">用户名</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-md bg-[#1e222b] border border-white/10 text-[17px] text-gray-100 placeholder:text-gray-500 transition-colors focus:outline-none focus:border-[#0d9488] focus:ring-2 focus:ring-[#0d9488]/30"
                    placeholder="输入用户名"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-md bg-[#1e222b] border border-white/10 text-[17px] text-gray-100 placeholder:text-gray-500 transition-colors focus:outline-none focus:border-[#0d9488] focus:ring-2 focus:ring-[#0d9488]/30"
                    placeholder="输入密码"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full h-11 mt-1 rounded-md bg-[#0d9488] text-white text-[17px] font-semibold transition-all hover:bg-[#0f766e] active:scale-[0.98]"
                >
                  登录
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-500">
                请联系管理员创建账号
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative pb-6 text-center text-xs text-gray-600">
        © 2026 MindForge
      </footer>
    </div>
  )
}
