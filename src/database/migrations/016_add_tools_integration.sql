-- Migration: Add tools integration for MCP and Composio
-- Adds source tracking and external tool linking

-- Add source column to track tool origin (native, mcp, composio)
ALTER TABLE tools ADD COLUMN source TEXT DEFAULT 'native' CHECK(source IN ('native', 'mcp', 'composio'));

-- Add external_id for linking to external tools (mcp tool name or composio tool slug)
ALTER TABLE tools ADD COLUMN external_id TEXT;

-- Add composio_app_id for linking to composio_apps
ALTER TABLE tools ADD COLUMN composio_app_id INTEGER REFERENCES composio_apps(id);

-- Add description for external tools
ALTER TABLE tools ADD COLUMN description TEXT;

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_tools_source ON tools(source);
CREATE INDEX IF NOT EXISTS idx_tools_external_id ON tools(external_id);
CREATE INDEX IF NOT EXISTS idx_tools_composio_app_id ON tools(composio_app_id);

-- Update existing MCP tools to set source='mcp'
UPDATE tools SET source = 'mcp' WHERE type = 'mcp';

-- Table to store agent-tool assignments (many-to-many)
CREATE TABLE IF NOT EXISTS agent_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(agent_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_tool ON agent_tools(tool_id);
