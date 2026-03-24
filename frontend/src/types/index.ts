export interface User {
  id: number
  username: string
  role: 'admin' | 'operator' | 'viewer'
  totp_enabled: boolean
  created_at: number
}

export interface Agent {
  id: number
  name: string
  avatar?: string
  role?: string
  description?: string
  color: string
  model?: string
  fallback_model?: string
  temperature: number
  max_tokens: number
  thinking_level: string
  sandbox_mode: boolean
  skills: string[]
  tools: string[]
  delegate_to: string[]
  created_at: number
  updated_at: number
}

export interface LLMProvider {
  id: number
  name: string
  key: string
  base_url?: string
  enabled: boolean
  models: LLMModel[]
}

export interface LLMModel {
  id: string
  name: string
  pricing: {
    input: number
    output: number
  }
}

export interface Session {
  id: string
  agent_id?: number
  status: 'idle' | 'running' | 'error'
  tokens_used: number
  messages_count: number
  last_activity?: number
}

export interface Skill {
  id: number
  name: string
  description?: string
  source: 'clawhub' | 'upload' | 'builtin'
  path?: string
  content?: string
  enabled: boolean
  security_flags?: {
    hasExternalFetch?: boolean
    hasEval?: boolean
  }
  openclaw?: {
    installed: boolean
    path?: string
    files?: string[]
  }
  gatewayRestarted?: boolean
}

export interface Chain {
  id: number
  name: string
  description?: string
  nodes: ChainNode[]
  edges: ChainEdge[]
  triggers: ChainTrigger[]
  variables: Record<string, any>
  enabled: boolean
}

export interface ChainNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    agentId?: number
    instruction?: string
    outputMode?: 'full' | 'summary' | 'none'
  }
}

export interface ChainEdge {
  id: string
  source: string
  target: string
  label?: string
  condition?: string
}

export interface ChainTrigger {
  type: 'manual' | 'cron' | 'webhook' | 'event'
  config: Record<string, any>
}

export interface Channel {
  id: number
  type: string
  name: string
  config: Record<string, any>
  status: 'online' | 'offline' | 'reconnecting' | 'error'
  agent_id?: number
  agent_name?: string
  allow_from: string[]
  dm_policy: 'pairing' | 'open' | 'restricted'
}

export interface FileNode {
  name: string
  type: 'file' | 'directory'
  path: string
  size?: number
  modified?: string
  children?: FileNode[]
}

export interface DashboardStats {
  agents: {
    total: number
    active: number
    idle: number
    error: number
  }
  channels: {
    total: number
    online: number
    offline: number
  }
  skills: number
  gateway: {
    connected: boolean
  }
  tokenUsage: {
    today: number
    week: number
    month: number
  }
}
