-- Composio integration tables

-- Configuration table (single row per instance)
CREATE TABLE IF NOT EXISTS composio_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  api_key TEXT,
  is_active INTEGER DEFAULT 0,
  connected_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Connected apps/services
CREATE TABLE IF NOT EXISTS composio_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  toolkit_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  logo_url TEXT,
  auth_config_id TEXT,
  auth_scheme TEXT,
  status TEXT DEFAULT 'disconnected',
  connected_account_id TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tools cache from Composio
CREATE TABLE IF NOT EXISTS composio_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER REFERENCES composio_apps(id) ON DELETE CASCADE,
  tool_slug TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  input_schema TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_composio_apps_status ON composio_apps(status);
CREATE INDEX IF NOT EXISTS idx_composio_tools_app_id ON composio_tools(app_id);
CREATE INDEX IF NOT EXISTS idx_composio_tools_slug ON composio_tools(tool_slug);

-- Add columns to existing tools table (SQLite doesn't support IF NOT EXISTS for ALTER)
-- These may fail if columns already exist, that's ok
ALTER TABLE tools ADD COLUMN composio_tool_slug TEXT;
ALTER TABLE tools ADD COLUMN source TEXT DEFAULT 'mcp';
