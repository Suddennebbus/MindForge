import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import {
  Home,
  BookOpen,
  Search,
  ClipboardList,
  MessageSquare,
  PenTool,
  FileText,
  FlaskConical,
  Stethoscope,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  path: string
  label: string
  icon: React.ElementType
}

interface Group {
  label: string
  items: NavItem[]
}

const groups: Group[] = [
  {
    label: '知识消费',
    items: [
      { path: '/', label: '首页', icon: Home },
      { path: '/wiki', label: '知识库', icon: BookOpen },
      { path: '/explore', label: '探索', icon: Search },
    ],
  },
  {
    label: '知识生产',
    items: [
      { path: '/plans', label: '研究计划', icon: ClipboardList },
      { path: '/chat', label: '对话', icon: MessageSquare },
      { path: '/human-outputs', label: '人类产出', icon: PenTool },
    ],
  },
  {
    label: '知识治理',
    items: [
      { path: '/pre-raw', label: '待入库', icon: FileText },
      { path: '/raw', label: '已入库', icon: FlaskConical },
      { path: '/lint', label: '体检', icon: Stethoscope },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={`${collapsed ? 'w-14' : 'w-56'} bg-surface border-r border-default flex flex-col shrink-0 transition-all duration-200`}
    >
      <div
        className={`h-12 flex items-center border-b border-subtle ${collapsed ? 'px-2 justify-center' : 'px-3'}`}
      >
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="MindForge"
            className={`shrink-0 ${collapsed ? 'h-7 w-auto' : 'h-8 w-auto'}`}
          />
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-text-primary">MindForge</span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-auto py-2 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-3 mb-1 text-base font-medium uppercase tracking-wider !text-accent-cyan">
                {group.label}
              </div>
            )}
            <div className={`space-y-0.5 ${collapsed ? 'px-1.5' : 'px-2'}`}>
              {group.items.map((item) => {
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    className={`${active ? 'nav-item-active' : 'nav-item'} ${collapsed ? '!px-0 justify-center' : ''}`}
                  >
                    <item.icon size={15} strokeWidth={1.5} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`py-2 border-t border-subtle space-y-0.5 ${collapsed ? 'px-1.5' : 'px-2'}`}>
        <Link to="/settings" title="设置" className={`nav-item ${collapsed ? '!px-0 justify-center' : ''}`}>
          <Settings size={15} strokeWidth={1.5} />
          {!collapsed && <span>设置</span>}
        </Link>
        <Link to="/audit-log" title="操作日志" className={`nav-item ${collapsed ? '!px-0 justify-center' : ''}`}>
          <ScrollText size={15} strokeWidth={1.5} />
          {!collapsed && <span>操作日志</span>}
        </Link>
        <ThemeToggle collapsed={collapsed} />
        <button
          onClick={logout}
          title="退出"
          className={`nav-item w-full text-left ${collapsed ? '!px-0 justify-center' : ''}`}
        >
          <LogOut size={15} strokeWidth={1.5} />
          {!collapsed && <span>退出</span>}
        </button>
        <button
          onClick={onToggle}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className={`nav-item w-full text-left ${collapsed ? '!px-0 justify-center' : ''}`}
        >
          {collapsed ? (
            <>
              <PanelLeftOpen size={15} strokeWidth={1.5} />
              <span className="hidden">展开</span>
            </>
          ) : (
            <>
              <PanelLeftClose size={15} strokeWidth={1.5} />
              <span>收起</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
