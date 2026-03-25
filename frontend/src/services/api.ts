import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import type { Agent, Skill, Chain, Channel } from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) {
          useAuthStore.getState().logout()
          return Promise.reject(error)
        }
        
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        })
        
        const { accessToken, refreshToken: newRefreshToken } = response.data.data
        useAuthStore.getState().setTokens(accessToken, newRefreshToken)
        
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        useAuthStore.getState().logout()
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: (username: string, password: string, totpCode?: string) =>
    api.post('/auth/login', { username, password, totpCode }),
  
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  
  setup2FA: () => api.post('/auth/2fa/setup'),
  verify2FA: (code: string) => api.post('/auth/2fa/verify', { code }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
}

// Dashboard API
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getEvents: () => api.get('/dashboard/events'),
  restartGateway: () => api.post('/dashboard/actions/restart-gateway'),
  clearSessions: () => api.post('/dashboard/actions/clear-sessions'),
}

// Agents API
export const agentsApi = {
  list: (params?: { search?: string; role?: string }) =>
    api.get('/agents', { params }),
  get: (id: number) => api.get(`/agents/${id}`),
  create: (data: Partial<Agent>) => api.post('/agents', data),
  update: (id: number, data: Partial<Agent>) => api.put(`/agents/${id}`, data),
  delete: (id: number) => api.delete(`/agents/${id}`),
  getAgentsMd: (id: number) => api.get(`/agents/${id}/agents-md`),
  updateAgentsMd: (id: number, content: string) =>
    api.put(`/agents/${id}/agents-md`, { content }),
  getSoulMd: (id: number) => api.get(`/agents/${id}/soul-md`),
  updateSoulMd: (id: number, content: string) =>
    api.put(`/agents/${id}/soul-md`, { content }),
  getSkills: (id: number) => api.get(`/agents/${id}/skills`),
  updateSkills: (id: number, skillIds: number[]) => api.put(`/agents/${id}/skills`, { skillIds }),
}

// LLM API
export const llmApi = {
  getProviders: () => api.get('/llm/providers'),
  testProvider: (id: number) => api.post(`/llm/providers/${id}/test`),
  getModels: () => api.get('/llm/models'),
}

// Sessions API
export const sessionsApi = {
  list: () => api.get('/sessions'),
  getHistory: (id: string) => api.get(`/sessions/${id}/history`),
  compact: (id: string) => api.post(`/sessions/${id}/compact`),
  reset: (id: string) => api.post(`/sessions/${id}/reset`),
}

// Skills API
export const skillsApi = {
  list: () => api.get('/skills'),
  get: (id: number) => api.get(`/skills/${id}`),
  search: (query: string) => api.get(`/skills/search?q=${encodeURIComponent(query)}`),
  install: (name: string) => api.post('/skills/install', { name }),
  upload: (name: string, content: string) =>
    api.post('/skills/upload', { name, content }),
  update: (id: number, data: Partial<Skill>) => api.put(`/skills/${id}`, data),
  delete: (id: number) => api.delete(`/skills/${id}`),
  getContent: (id: number) => api.get(`/skills/${id}/content`),
  updateContent: (id: number, content: string) => api.put(`/skills/${id}/content`, { content }),
}

// Chains API
export const chainsApi = {
  list: () => api.get('/chains'),
  get: (id: number) => api.get(`/chains/${id}`),
  create: (data: Partial<Chain>) => api.post('/chains', data),
  update: (id: number, data: Partial<Chain>) => api.put(`/chains/${id}`, data),
  delete: (id: number) => api.delete(`/chains/${id}`),
  run: (id: number) => api.post(`/chains/${id}/run`),
}

// Channels API
export const channelsApi = {
  list: () => api.get('/channels'),
  get: (id: number) => api.get(`/channels/${id}`),
  create: (data: Partial<Channel>) => api.post('/channels', data),
  update: (id: number, data: Partial<Channel>) => api.put(`/channels/${id}`, data),
  delete: (id: number) => api.delete(`/channels/${id}`),
  test: (id: number) => api.post(`/channels/${id}/test`),
}

// Files API
export const filesApi = {
  getTree: (path?: string) => api.get('/files/tree', { params: { path } }),
  getContent: (path: string) =>
    api.get('/files/content', { params: { path } }),
  updateContent: (path: string, content: string) =>
    api.put('/files/content', { path, content }),
  create: (path: string, type: 'file' | 'directory') =>
    api.post('/files/create', { path, type }),
  delete: (path: string) =>
    api.delete('/files', { params: { path } }),
}

// Users API
export const usersApi = {
  list: () => api.get('/users'),
  me: () => api.get('/users/me'),
  create: (data: { username: string; password: string; role: string }) =>
    api.post('/users', data),
  update: (id: number, data: Partial<{ role: string; password: string }>) =>
    api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
}

// Settings API
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
  backup: () => api.post('/settings/backup'),
  restore: () => api.post('/settings/restore'),
}

// MCP Servers API
export const mcpApi = {
  list: () => api.get('/mcp'),
  get: (id: number) => api.get(`/mcp/${id}`),
  create: (data: { name: string; url: string; authType?: string; authConfig?: any }) =>
    api.post('/mcp', data),
  update: (id: number, data: Partial<{ name: string; url: string; authType: string; authConfig: any; enabled: boolean }>) =>
    api.put(`/mcp/${id}`, data),
  delete: (id: number) => api.delete(`/mcp/${id}`),
  test: (id: number) => api.post(`/mcp/${id}/test`),
}

// Tools API
export const toolsApi = {
  list: () => api.get('/tools'),
  get: (id: number) => api.get(`/tools/${id}`),
  create: (data: { name: string; type: 'browser' | 'cron' | 'webhook'; config?: any; agentId?: number }) =>
    api.post('/tools', data),
  update: (id: number, data: Partial<{ name: string; config: any; enabled: boolean; agentId: number }>) =>
    api.put(`/tools/${id}`, data),
  delete: (id: number) => api.delete(`/tools/${id}`),
}
