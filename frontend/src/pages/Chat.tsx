import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatHistory } from '@/components/ChatHistory'
import { useSetPageWidth } from '@/components/PageWidth'
import { toast } from '@/stores/toastStore'
import { useT, useLangStore } from '@/i18n'

export function Chat() {
  const t = useT()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const setWide = useSetPageWidth('wide')

  const currentId = useChatStore((s) => s.currentId)
  const conversations = useChatStore((s) => s.conversations)
  const startNew = useChatStore((s) => s.startNew)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateLastMessage = useChatStore((s) => s.updateLastMessage)

  // 直接订阅 conversations，消息更新（如保存到知识库后的 savedPages）才能实时触发重渲染
  const conversation = conversations.find((c) => c.id === currentId) || null
  const messages = conversation?.messages || []

  useEffect(() => {
    setWide()
  }, [setWide])

  useEffect(() => {
    if (!currentId) {
      startNew()
    }
  }, [currentId, startNew])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentId) return
    const userMsg = input.trim()
    addMessage({ role: 'user', content: userMsg })
    setInput('')
    setIsLoading(true)

    try {
      const token = useAuthStore.getState().token
      const resp = await fetch('/api/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Language': useLangStore.getState().lang,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: userMsg }),
      })

      if (!resp.ok) {
        if (resp.status === 401) {
          useAuthStore.getState().logout()
          window.location.href = '/login'
          return
        }
        const errBody = await resp.json().catch(() => ({}))
        throw new Error(errBody.detail || `HTTP ${resp.status}`)
      }

      addMessage({ role: 'assistant', content: '' })

      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            if (data === 'None' || data === 'null') continue
            // 后端以 JSON 编码每个 chunk 以保留换行；解析失败时按原始文本兜底
            let piece = data
            try {
              piece = JSON.parse(data)
            } catch {
              // 非 JSON 数据（旧格式/异常行），原样拼接
            }
            assistantContent += piece
            updateLastMessage(assistantContent)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addMessage({ role: 'assistant', content: `Error: ${msg}` })
      toast({ title: t('请求失败'), description: t(msg), variant: 'error' })
    }
    setIsLoading(false)
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] -m-6">
      <ChatHistory />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-tertiary">
              <p className="text-base font-medium text-text-secondary mb-1">{t('AI 对话')}</p>
              <p className="text-sm">{t('基于当前知识库回答你的问题')}</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-5 space-y-1">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  message={msg}
                  messageIndex={i}
                  question={
                    msg.role === 'assistant' && i > 0 && messages[i - 1].role === 'user'
                      ? messages[i - 1].content
                      : undefined
                  }
                  streaming={isLoading && i === messages.length - 1}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-default bg-surface">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('输入问题...')}
              className="input flex-1"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="btn-primary h-9 w-9 !px-0 flex items-center justify-center disabled:opacity-60"
            >
              <Send size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
