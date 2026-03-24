import { getDatabase, closeDatabase } from './index';

const migrations = [
  // Users table
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    login_attempts INTEGER DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
  
  // Refresh tokens table
  `
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  `,
  
  // Agents table
  `
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    avatar TEXT,
    role TEXT,
    description TEXT,
    color TEXT DEFAULT '#e8ff5a',
    model TEXT,
    fallback_model TEXT,
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    thinking_level TEXT DEFAULT 'medium',
    sandbox_mode INTEGER DEFAULT 0,
    skills TEXT, -- JSON array
    tools TEXT, -- JSON array
    delegate_to TEXT, -- JSON array
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
  
  // LLM Providers table
  `
  CREATE TABLE IF NOT EXISTS llm_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL,
    api_key_env TEXT NOT NULL, -- env variable name, not the key itself
    base_url TEXT,
    enabled INTEGER DEFAULT 1,
    models TEXT, -- JSON array
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
  
  // Chains table
  `
  CREATE TABLE IF NOT EXISTS chains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    nodes TEXT NOT NULL, -- JSON array (React Flow format)
    edges TEXT NOT NULL, -- JSON array (React Flow format)
    triggers TEXT, -- JSON array
    variables TEXT, -- JSON object
    enabled INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
  
  // Chain runs table
  `
  CREATE TABLE IF NOT EXISTS chain_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    status TEXT NOT NULL, -- running, completed, failed
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    output TEXT, -- JSON
    error TEXT,
    FOREIGN KEY (chain_id) REFERENCES chains(id) ON DELETE CASCADE
  );
  `,
  
  // Skills table
  `
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    source TEXT NOT NULL, -- clawhub, upload, builtin
    path TEXT,
    content TEXT, -- SKILL.md content
    enabled INTEGER DEFAULT 1,
    security_flags TEXT, -- JSON
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
  
  // Channels table
  `
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- telegram, discord, whatsapp, etc.
    name TEXT NOT NULL,
    config TEXT NOT NULL, -- JSON
    status TEXT DEFAULT 'offline',
    agent_id INTEGER,
    allow_from TEXT, -- JSON array (whitelist)
    dm_policy TEXT DEFAULT 'pairing',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
  );
  `,
  
  // Audit logs table
  `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details TEXT, -- JSON
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  `,
  
  // Add system_prompt column to agents if not exists (migration)
  `
  ALTER TABLE agents ADD COLUMN system_prompt TEXT;
  `,
  
  // Add status column to agents if not exists
  `
  ALTER TABLE agents ADD COLUMN status TEXT DEFAULT 'idle';
  `,
  
  // Sessions cache table
  `
  CREATE TABLE IF NOT EXISTS sessions_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    agent_id INTEGER,
    status TEXT DEFAULT 'idle',
    tokens_used INTEGER DEFAULT 0,
    messages_count INTEGER DEFAULT 0,
    last_activity INTEGER,
    data TEXT, -- JSON
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
  
  // Settings table
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );
  `,
];

const seeds = [
  // Default admin user (password: admin) - will be updated by fix-admin.js
  `
  INSERT OR IGNORE INTO users (id, username, password_hash, role) 
  VALUES (1, 'admin', '$2a$10$PLACEHOLDER_WILL_BE_UPDATED_BY_FIX_ADMIN', 'admin');
  `,
  
  // Default LLM providers
  `
  INSERT OR IGNORE INTO llm_providers (id, name, key, api_key_env, models) VALUES
  (1, 'Anthropic', 'anthropic', 'ANTHROPIC_API_KEY', '[{"id":"claude-opus-4","name":"Claude Opus 4","pricing":{"input":15,"output":75}}]'),
  (2, 'OpenAI', 'openai', 'OPENAI_API_KEY', '[{"id":"gpt-4o","name":"GPT-4o","pricing":{"input":5,"output":15}}]'),
  (3, 'Google', 'google', 'GOOGLE_API_KEY', '[{"id":"gemini-2.0-flash","name":"Gemini 2.0 Flash","pricing":{"input":0.1,"output":0.4}}]'),
  (4, 'xAI', 'xai', 'XAI_API_KEY', '[{"id":"grok-2","name":"Grok 2","pricing":{"input":2,"output":10}}]'),
  (5, 'Kimi (Moonshot)', 'kimi', 'KIMI_API_KEY', '[{"id":"kimi-k2","name":"Kimi K2","pricing":{"input":1,"output":4}}]'),
  (6, 'Mistral', 'mistral', 'MISTRAL_API_KEY', '[{"id":"mistral-large","name":"Mistral Large","pricing":{"input":2,"output":6}}]'),
  (7, 'Ollama', 'ollama', 'OLLAMA_HOST', '[{"id":"llama3.2","name":"Llama 3.2","pricing":{"input":0,"output":0}}]'),
  (8, 'OpenRouter', 'openrouter', 'OPENROUTER_API_KEY', '[{"id":"openrouter/auto","name":"OpenRouter Auto","pricing":{"input":0,"output":0}}]');
  `,
];

async function migrate() {
  console.log('Running migrations...');
  const db = getDatabase();
  
  try {
    for (const migration of migrations) {
      db.exec(migration);
    }
    console.log('Migrations completed successfully');
    
    console.log('Running seeds...');
    for (const seed of seeds) {
      db.exec(seed);
    }
    console.log('Seeds completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

migrate();
