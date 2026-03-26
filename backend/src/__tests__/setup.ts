import { getDatabase, closeDatabase } from '../database';
import bcrypt from 'bcryptjs';

// Test database path
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

// Initialize test database before all tests
beforeAll(async () => {
  const db = getDatabase();
  
  // Run migrations
  db.exec(`
    -- Users table
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
    
    -- Refresh tokens
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    -- Agents
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
      skills TEXT,
      tools TEXT,
      delegate_to TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    
    -- MCP servers
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      auth_type TEXT DEFAULT 'none',
      auth_config TEXT,
      config_json TEXT,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    
    -- Tools
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT,
      enabled INTEGER DEFAULT 1,
      agent_id INTEGER,
      mcp_server_id INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
      FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
    );
    
    -- LLM providers
    CREATE TABLE IF NOT EXISTS llm_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      api_key_env TEXT,
      models TEXT
    );
    
    -- Insert default admin user
    INSERT INTO users (id, username, password_hash, role) 
    VALUES (1, 'admin', '${bcrypt.hashSync('admin', 10)}', 'admin');
    
    -- Insert default providers
    INSERT INTO llm_providers (id, name, key, api_key_env, models) VALUES
    (1, 'OpenAI', 'openai', 'OPENAI_API_KEY', '[{"id":"gpt-4o","name":"GPT-4o"}]'),
    (2, 'Anthropic', 'anthropic', 'ANTHROPIC_API_KEY', '[{"id":"claude-opus-4","name":"Claude Opus 4"}]');
  `);
});

// Clean up after all tests
afterAll(async () => {
  closeDatabase();
});

// Reset data between tests
afterEach(async () => {
  const db = getDatabase();
  // Clear test data but keep admin user and providers
  db.exec(`
    DELETE FROM tools;
    DELETE FROM mcp_servers;
    DELETE FROM agents;
    DELETE FROM refresh_tokens WHERE user_id != 1;
  `);
});
