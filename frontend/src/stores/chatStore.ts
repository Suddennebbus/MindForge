import { create } from 'zustand'
import { t } from '@/i18n'

export interface SavedPage {
  slug: string
  title: string
  type: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  savedPages?: SavedPage[]
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

interface ChatState {
  conversations: Conversation[]
  currentId: string | null
  getCurrent: () => Conversation | null
  startNew: () => void
  loadConversation: (id: string) => void
  addMessage: (msg: Message) => void
  updateLastMessage: (content: string) => void
  updateMessage: (index: number, patch: Partial<Message>) => void
  deleteConversation: (id: string) => void
}

const STORAGE_KEY = 'mindforge-conversations'
const CURRENT_ID_KEY = 'mindforge-chat-current-id'

function loadFromStorage(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_ID_KEY)
  } catch {
    return null
  }
}

function saveCurrentId(id: string | null) {
  if (id) {
    localStorage.setItem(CURRENT_ID_KEY, id)
  } else {
    localStorage.removeItem(CURRENT_ID_KEY)
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: loadFromStorage(),
  currentId: loadCurrentId(),

  getCurrent: () => {
    const { conversations, currentId } = get()
    return conversations.find((c) => c.id === currentId) || null
  },

  startNew: () => {
    const newConv: Conversation = {
      id: generateId(),
      title: t('新对话'),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const conversations = [newConv, ...get().conversations]
    saveToStorage(conversations)
    saveCurrentId(newConv.id)
    set({ conversations, currentId: newConv.id })
  },

  loadConversation: (id) => {
    saveCurrentId(id)
    set({ currentId: id })
  },

  addMessage: (msg) => {
    const { conversations, currentId } = get()
    const conv = conversations.find((c) => c.id === currentId)
    if (!conv) return

    const updatedMessages = [...conv.messages, msg]
    const updatedConv = {
      ...conv,
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
      title: (conv.title === '新对话' || conv.title === t('新对话')) && msg.role === 'user'
        ? msg.content.slice(0, 20) || t('新对话')
        : conv.title,
    }
    const updatedConversations = [updatedConv, ...conversations.filter((c) => c.id !== currentId)]
    saveToStorage(updatedConversations)
    set({ conversations: updatedConversations })
  },

  updateLastMessage: (content) => {
    const { conversations, currentId } = get()
    const conv = conversations.find((c) => c.id === currentId)
    if (!conv || conv.messages.length === 0) return

    const updatedMessages = conv.messages.map((m, i) =>
      i === conv.messages.length - 1 && m.role === 'assistant'
        ? { ...m, content }
        : m
    )
    const updatedConv = {
      ...conv,
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
    }
    const updatedConversations = [updatedConv, ...conversations.filter((c) => c.id !== currentId)]
    saveToStorage(updatedConversations)
    set({ conversations: updatedConversations })
  },

  updateMessage: (index, patch) => {
    const { conversations, currentId } = get()
    const conv = conversations.find((c) => c.id === currentId)
    if (!conv || index < 0 || index >= conv.messages.length) return

    const updatedMessages = conv.messages.map((m, i) =>
      i === index ? { ...m, ...patch } : m
    )
    const updatedConv = {
      ...conv,
      messages: updatedMessages,
      updatedAt: new Date().toISOString(),
    }
    const updatedConversations = [updatedConv, ...conversations.filter((c) => c.id !== currentId)]
    saveToStorage(updatedConversations)
    set({ conversations: updatedConversations })
  },

  deleteConversation: (id) => {
    const conversations = get().conversations.filter((c) => c.id !== id)
    saveToStorage(conversations)
    const newCurrentId = get().currentId === id ? null : get().currentId
    saveCurrentId(newCurrentId)
    set({ conversations, currentId: newCurrentId })
  },
}))