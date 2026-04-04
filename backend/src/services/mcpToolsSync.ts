import { getDatabase } from '../database';
import { logger } from '../utils/logger';

interface MCPServer {
  id: number;
  name: string;
  description?: string;
  transport_type: string;
  enabled: number;
}

interface Tool {
  id: number;
  name: string;
  type: string;
  source: string;
  external_id?: string;
  mcp_server_id?: number;
  enabled: number;
}

/**
 * Sync MCP server tools to database
 * Creates placeholder tools for MCP servers (actual tool list comes from MCP protocol)
 */
export async function syncMcpServerTools(serverId: number): Promise<void> {
  const db = getDatabase();
  
  try {
    // Get server details
    const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId) as MCPServer | undefined;
    if (!server) {
      logger.warn(`MCP server ${serverId} not found`);
      return;
    }

    // Check if tools already exist for this server
    const existingTools = db.prepare('SELECT * FROM tools WHERE mcp_server_id = ?').all(serverId) as Tool[];
    
    if (existingTools.length === 0) {
      // Create a placeholder tool for this MCP server
      // The actual tools are discovered at runtime via MCP protocol
      db.prepare(`
        INSERT INTO tools (name, type, source, description, enabled, mcp_server_id)
        VALUES (?, 'mcp', 'mcp', ?, 1, ?)
      `).run(
        `${server.name} Tools`,
        server.description || `Tools from ${server.name} MCP server`,
        serverId
      );
      
      logger.info(`Created MCP tools placeholder for server: ${server.name}`);
    }
  } catch (error) {
    logger.error(`Failed to sync MCP server tools for server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Remove all tools associated with an MCP server
 */
export async function removeMcpServerTools(serverId: number): Promise<void> {
  const db = getDatabase();
  
  try {
    // Remove tool assignments first
    db.prepare(`
      DELETE FROM agent_tools 
      WHERE tool_id IN (SELECT id FROM tools WHERE mcp_server_id = ?)
    `).run(serverId);
    
    // Remove the tools
    db.prepare('DELETE FROM tools WHERE mcp_server_id = ?').run(serverId);
    
    logger.info(`Removed MCP tools for server: ${serverId}`);
  } catch (error) {
    logger.error(`Failed to remove MCP server tools for server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Get tools for a specific MCP server
 */
export function getMcpServerTools(serverId: number): Tool[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM tools WHERE mcp_server_id = ?').all(serverId) as Tool[];
}

/**
 * Sync all enabled MCP servers' tools
 */
export async function syncAllMcpServerTools(): Promise<void> {
  const db = getDatabase();
  
  try {
    const servers = db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1').all() as MCPServer[];
    
    for (const server of servers) {
      await syncMcpServerTools(server.id);
    }
    
    logger.info(`Synced tools for ${servers.length} MCP servers`);
  } catch (error) {
    logger.error('Failed to sync all MCP server tools:', error);
    throw error;
  }
}
