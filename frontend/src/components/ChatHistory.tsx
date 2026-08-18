import { Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useT } from '@/i18n'
import { ConfirmDialog } from './ConfirmDialog'

export function ChatHistory() {
  const t = useT()
  const { conversations, currentId, startNew, loadConversation, deleteConversation } = useChatStore()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const handleDelete = () => {
    if (!deleteId) return
    deleteConversation(deleteId)
    setDeleteId(null)
  }

  if (collapsed) {
    return (
      <div className="w-10 h-full flex flex-col items-center py-2 gap-1 border-r border-default bg-surface shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded text-text-muted hover:text-text-secondary hover:bg-hover transition-colors"
          aria-label={t('展开对话列表')}
          title={t('展开对话列表')}
        >
          <PanelLeftOpen size={15} strokeWidth={1.5} />
        </button>
        <button
          onClick={startNew}
          className="p-1.5 rounded text-text-muted hover:text-text-secondary hover:bg-hover transition-colors"
          aria-label={t('新对话')}
          title={t('新对话')}
        >
          <Plus size={15} strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-56 h-full flex flex-col border-r border-default bg-surface shrink-0">
      <div className="p-3 border-b border-default flex items-center gap-1.5">
        <button
          onClick={startNew}
          className="btn-primary flex-1 h-8 text-xs flex items-center justify-center gap-1.5"
        >
          <Plus size={14} strokeWidth={1.5} />
          {t('新对话')}
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="shrink-0 p-1.5 rounded text-text-muted hover:text-text-secondary hover:bg-hover transition-colors"
          aria-label={t('收起对话列表')}
          title={t('收起对话列表')}
        >
          <PanelLeftClose size={15} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-0.5">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => loadConversation(conv.id)}
            className={`group flex items-center gap-2 px-2.5 py-2 rounded cursor-pointer text-xs transition-colors ${
              conv.id === currentId
                ? 'bg-raised text-text-primary border border-subtle'
                : 'text-text-secondary hover:bg-hover'
            }`}
          >
            <MessageSquare size={13} className="shrink-0 text-text-muted" strokeWidth={1.5} />
            <span className="truncate flex-1">{conv.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDeleteId(conv.id)
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-accent-red hover:bg-accent-red/10 text-text-tertiary transition-all"
              aria-label={t('删除')}
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">{t('暂无历史对话')}</p>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title={t('删除对话')}
        description={t('确定删除此对话？')}
        variant="danger"
        confirmLabel={t('删除')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
