import { execOnHost } from './hostExecutor';
import { logger } from '../utils/logger';

/**
 * MCPorter configuration format for OpenClaw
 * Located at ~/.openclaw/workspace/config/mcporter.json
 */
export interface MCPorterConfig {
  mcpServers: {
    [name: string]: {
      command?: string;
      args?: string[];
      url?: string;  // For HTTP-based MCP servers via mcp-remote bridge
      env?: Record<string, string>;
    };
  };
}

const MCPORTER_CONFIG_PATH = '~/.openclaw/workspace/config/mcporter.json';

/**
 * Read the current mcporter.json from the host
 */
export async function readMcporterConfig(): Promise<MCPorterConfig> {
  try {
    const result = await execOnHost(`cat ${MCPORTER_CONFIG_PATH}`);
    
    if (!result.success || !result.stdout) {
      logger.warn('mcporter.json not found or empty, returning default config');
      return { mcpServers: {} };
    }
    
    // Clean the output (remove any stderr messages that might have been mixed in)
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('No valid JSON found in mcporter.json');
      return { mcpServers: {} };
    }
    
    const config: MCPorterConfig = JSON.parse(jsonMatch[0]);
    return config;
  } catch (error) {
    logger.error('Failed to read mcporter config:', error);
    return { mcpServers: {} };
  }
}

/**
 * Write the mcporter.json to the host
 */
export async function writeMcporterConfig(config: MCPorterConfig): Promise<boolean> {
  try {
    // Ensure the config directory exists
    await execOnHost('mkdir -p ~/.openclaw/workspace/config');
    
    // Write the config file using tee (more reliable than echo)
    const jsonStr = JSON.stringify(config, null, 2);
    
    const result = await execOnHost(`cat << 'MCP_EOF' | tee ${MCPORTER_CONFIG_PATH} > /dev/null
${jsonStr}
MCP_EOF`);
    
    if (!result.success) {
      logger.error('Failed to write mcporter config:', result.stderr);
      return false;
    }
    
    logger.info('mcporter.json updated successfully');
    return true;
  } catch (error) {
    logger.error('Failed to write mcporter config:', error);
    return false;
  }
}

/**
 * Add or update an MCP server in mcporter.json
 */
export async function syncServerToMcporter(
  name: string, 
  server: { 
    transport_type: string;
    command?: string | null;
    args?: string[] | null;
    url?: string | null;
    env?: Record<string, string> | null;
  }
): Promise<boolean> {
  try {
    const config = await readMcporterConfig();
    
    // Build the mcporter server entry based on transport type
    if (server.transport_type === 'stdio' && server.command) {
      // For stdio transport
      config.mcpServers[name] = {
        command: server.command,
        args: server.args || [],
        env: server.env || undefined,
      };
    } else if (server.transport_type === 'http' && server.url) {
      // For HTTP transport - use mcp-remote bridge
      const args = [server.url];
      
      // Special handling for Composio - add headers if COMPOSIO_API_KEY is in env
      if (server.env?.COMPOSIO_API_KEY && server.url.includes('composio.dev')) {
        args.push('--header', `x-consumer-api-key:${server.env.COMPOSIO_API_KEY}`);
      }
      
      config.mcpServers[name] = {
        command: 'mcp-remote',
        args,
        env: server.env || undefined,
      };
    } else {
      logger.error(`Invalid server configuration for ${name}:`, server);
      return false;
    }
    
    return await writeMcporterConfig(config);
  } catch (error) {
    logger.error('Failed to sync server to mcporter:', error);
    return false;
  }
}

/**
 * Remove an MCP server from mcporter.json
 */
export async function removeServerFromMcporter(name: string): Promise<boolean> {
  try {
    const config = await readMcporterConfig();
    
    if (!config.mcpServers[name]) {
      logger.warn(`Server ${name} not found in mcporter config`);
      return true; // Not an error
    }
    
    delete config.mcpServers[name];
    
    return await writeMcporterConfig(config);
  } catch (error) {
    logger.error('Failed to remove server from mcporter:', error);
    return false;
  }
}

/**
 * Get list of built-in MCP servers that OpenClaw supports natively
 */
export function getBuiltinMcpServers(): Array<{
  name: string;
  description: string;
  transport_type: 'stdio';
  command: string;
  args: string[];
  installCommand?: string;
}> {
  return [
    {
      name: 'filesystem',
      description: 'Read and write local files',
      transport_type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '~/.openclaw/workspace'],
      installCommand: 'npm install -g @modelcontextprotocol/server-filesystem',
    },
    {
      name: 'brave-search',
      description: 'Web search using Brave Search API',
      transport_type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      installCommand: 'npm install -g @modelcontextprotocol/server-brave-search',
    },
    {
      name: 'puppeteer',
      description: 'Browser automation with Puppeteer',
      transport_type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      installCommand: 'npm install -g @modelcontextprotocol/server-puppeteer',
    },
    {
      name: 'github',
      description: 'GitHub API integration',
      transport_type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      installCommand: 'npm install -g @modelcontextprotocol/server-github',
    },
    {
      name: 'postgres',
      description: 'PostgreSQL database access',
      transport_type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
      installCommand: 'npm install -g @modelcontextprotocol/server-postgres',
    },
  ];
}

/**
 * Check if mcp-remote is installed (required for HTTP MCP servers)
 */
export async function isMcpRemoteInstalled(): Promise<boolean> {
  try {
    const result = await execOnHost('which mcp-remote');
    return result.success && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Install mcp-remote bridge for HTTP MCP servers
 */
export async function installMcpRemote(): Promise<boolean> {
  try {
    logger.info('Installing mcp-remote bridge...');
    const result = await execOnHost('npm install -g mcp-remote@0.1.38');
    return result.success;
  } catch (error) {
    logger.error('Failed to install mcp-remote:', error);
    return false;
  }
}

/**
 * Sync all enabled MCP servers from database to mcporter.json
 * This should be called after any MCP server change
 */
export async function syncAllServersToMcporter(
  servers: Array<{
    name: string;
    enabled: number;
    transport_type: string;
    command: string | null;
    args: string | null;
    url: string | null;
    env: string | null;
  }>
): Promise<boolean> {
  try {
    const config: MCPorterConfig = { mcpServers: {} };
    
    for (const server of servers) {
      if (!server.enabled) continue;
      
      const env = server.env ? JSON.parse(server.env) : undefined;
      
      if (server.transport_type === 'stdio' && server.command) {
        const args = server.args ? JSON.parse(server.args) : [];
        config.mcpServers[server.name] = {
          command: server.command,
          args,
          env,
        };
      } else if (server.transport_type === 'http' && server.url) {
        config.mcpServers[server.name] = {
          command: 'mcp-remote',
          args: [server.url],
          env,
        };
      }
    }
    
    return await writeMcporterConfig(config);
  } catch (error) {
    logger.error('Failed to sync all servers to mcporter:', error);
    return false;
  }
}
