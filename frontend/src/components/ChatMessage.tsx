import { User, Bot, Copy, CheckCircle, BookPlus, Loader2, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MarkdownRenderer } from './MarkdownRenderer'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore, type Message, type SavedPage } from '@/stores/chatStore'
import { toast } from '@/stores/toastStore'
import { useT } from '@/i18n'

interface ChatMessageProps {
  message: Message
  messageIndex: number
  question?: string
  streaming?: boolean
}

// 回答末尾的提议格式：提议：可将上述内容保存为综合页面「标题」，...
// 英文界面下 LLM 输出 Proposal: ... 「Title」，两种标签都要识别（标题定界符「」不变）
const PROPOSAL_RE = /(?:提议|proposal)[:：][^\n]*「([^」]+)」/i

function extractProposal(content: string): string | null {
  const match = content.match(PROPOSAL_RE)
  return match ? match[1].trim() : null
}

export function ChatMessage({ message, messageIndex, question, streaming }: ChatMessageProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const isUser = message.role === 'user'
  const currentUser = useAuthStore((s) => s.user)
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'editor'
  const updateMessage = useChatStore((s) => s.updateMessage)

  const proposalTitle = !isUser && !streaming ? extractProposal(message.content) : null
  const savedPages = message.savedPages

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAccept = async () => {
    if (!question || saving) return
    setSaving(true)
    try {
      const resp = await api.post('/ai/query/save-synthesis', {
        question,
        answer: message.content,
        title: proposalTitle || '',
      })
      const pages = (resp.data as { pages?: SavedPage[] }).pages || []
      updateMessage(messageIndex, { savedPages: pages })
      toast({
        title: t('已保存到知识库'),
        description: pages.map((p) => p.title).join('、'),
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: t('保存失败'),
        description: err.response?.data?.detail || err.message,
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`py-3 px-5 hover:bg-surface/50 transition-colors ${isUser ? '' : 'border-l-2 border-transparent hover:border-accent-cyan/30'}`}>
      <div className="max-w-3xl mx-auto flex gap-3">
        <div
          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center ${
            isUser ? 'bg-raised' : 'bg-accent-cyan/10'
          }`}
        >
          {isUser ? (
            <User size={14} className="text-text-secondary" strokeWidth={1.5} />
          ) : (
            <Bot size={14} className="text-accent-cyan" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-muted mb-1">
            {isUser ? t('你') : 'Assistant'}
          </div>
          <div className="text-sm text-text-secondary leading-relaxed">
            {isUser ? (
              <p className="whitespace-pre-wrap text-text-primary">{message.content}</p>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </div>
          {!isUser && proposalTitle && canEdit && (
            savedPages && savedPages.length > 0 ? (
              <div className="mt-3 flex items-center gap-2 text-lg text-accent-green">
                <CheckCircle size={20} strokeWidth={1.5} />
                <span>{t('已保存到知识库：')}</span>
                {savedPages.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/wiki/${p.slug}`}
                    className="inline-flex items-center gap-1 text-accent-cyan hover:underline"
                  >
                    {p.title}
                    <ExternalLink size={16} strokeWidth={1.5} />
                  </Link>
                ))}
              </div>
            ) : (
              <button
                onClick={handleAccept}
                disabled={saving || !question}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan text-lg font-bold hover:bg-accent-cyan/20 transition-colors disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <BookPlus size={18} strokeWidth={1.5} />
                )}
                {saving ? t('正在保存到知识库…') : t('同意')}
              </button>
            )
          )}
          {!isUser && message.content && (
            <button
              onClick={handleCopy}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            >
              {copied ? <CheckCircle size={11} strokeWidth={1.5} /> : <Copy size={11} strokeWidth={1.5} />}
              {copied ? t('已复制') : t('复制')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
