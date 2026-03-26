// Database entity types
// These interfaces represent the raw data from SQLite database

export interface Chain {
  id: number;
  name: string;
  description: string | null;
  nodes: string; // JSON string
  edges: string; // JSON string
  triggers: string | null; // JSON string
  variables: string | null; // JSON string
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface ChainRun {
  id: number;
  chain_id: number;
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  completed_at: number | null;
  output: string | null; // JSON string
  error: string | null;
}

export interface Skill {
  id: number;
  name: string;
  description: string | null;
  source: 'clawhub' | 'upload' | 'builtin';
  path: string | null;
  content: string | null;
  enabled: number;
  security_flags: string | null; // JSON string
  created_at: number;
  updated_at: number;
}

export interface Channel {
  id: number;
  type: string;
  name: string;
  config: string; // JSON string
  status: string;
  agent_id: number | null;
  allow_from: string | null; // JSON string
  dm_policy: string;
  created_at: number;
  updated_at: number;
}

export interface LLMProvider {
  id: number;
  name: string;
  key: string;
  api_key_env: string;
  base_url: string | null;
  enabled: number;
  models: string | null; // JSON string
  created_at: number;
  updated_at: number;
}

export interface Agent {
  id: number;
  name: string;
  avatar: string | null;
  role: string | null;
  description: string | null;
  color: string;
  model: string | null;
  fallback_model: string | null;
  temperature: number;
  max_tokens: number;
  thinking_level: string;
  sandbox_mode: number;
  skills: string | null; // JSON string
  tools: string | null; // JSON string
  delegate_to: string | null; // JSON string
  system_prompt: string | null;
  status: string | null;
  created_at: number;
  updated_at: number;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'operator';
  totp_secret: string | null;
  totp_enabled: number;
  login_attempts: number;
  locked_until: number | null;
  created_at: number;
  updated_at: number;
}

export interface MCPServer {
  id: number;
  name: string;
  url: string;
  auth_type: 'none' | 'api_key' | 'bearer' | 'basic';
  auth_config: string | null; // JSON string
  enabled: number;
  config_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface Tool {
  id: number;
  name: string;
  type: string;
  config: string | null; // JSON string
  enabled: number;
  agent_id: number | null;
  mcp_server_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface SessionCache {
  id: number;
  session_id: string;
  agent_id: number | null;
  status: string;
  tokens_used: number;
  messages_count: number;
  last_activity: number | null;
  data: string | null; // JSON string
  updated_at: number;
}
