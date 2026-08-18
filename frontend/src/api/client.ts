import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { useLangStore } from '@/i18n'

export const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // 后端 LLM 生成内容（采访、计划、体检、探索等）跟随界面语言
  config.headers['X-User-Language'] = useLangStore.getState().lang
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
