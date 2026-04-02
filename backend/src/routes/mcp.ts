import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';
import https from 'https';
import http from 'http';
import type { MCPServer } from '../types/database';
import {
  syncServerToMcporter,
  removeServerFromMcporter,
  syncAllServersToMcporter,
  getBuiltinMcpServers,
  isMcpRemoteInstalled,
  installMcpRemote,
} from '../services/mcporter';

const router = Router();

/**
 * @swagger
 * /mcp:
 *   get:
 *     summary: List all MCP servers
 *     description: Get list of all configured MCP servers
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of MCP servers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       transportType:
 *                         type: string
 *                         enum: [stdio, http, websocket]
 *                       command:
 *                         type: string
 *                       args:
 *                         type: array
 *                         items:
 *                           type: string
 *                       url:
 *                         type: string
 *                       enabled:
 *                         type: boolean
 *                       isBuiltin:
 *                         type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const servers = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all();
  
  res.json({
    success: true,
    data: servers.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      transportType: s.transport_type,
      command: s.command,
      args: s.args ? JSON.parse(s.args) : [],
      url: s.url,
      env: s.env ? JSON.parse(s.env) : {},
      authType: s.auth_type,
      enabled: s.enabled === 1,
      isBuiltin: s.is_builtin === 1,
      createdAt: s.created_at,
    })),
  });
}));

/**
 * @swagger
 * /mcp/builtin:
 *   get:
 *     summary: Get built-in MCP servers list
 *     description: Get list of pre-configured MCP servers
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of built-in MCP servers
 */
router.get('/builtin', authenticateToken, asyncHandler(async (req, res) => {
  const servers = getBuiltinMcpServers();
  res.json({
    success: true,
    data: servers,
  });
}));

/**
 * @swagger
 * /mcp/{id}:
 *   get:
 *     summary: Get MCP server by ID
 *     description: Get detailed information about a specific MCP server
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: MCP Server ID
 *     responses:
 *       200:
 *         description: MCP server details
 *       404:
 *         description: MCP server not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as MCPServer | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  res.json({
    success: true,
    data: {
      id: server.id,
      name: server.name,
      description: server.description,
      transportType: server.transport_type,
      command: server.command,
      args: server.args ? JSON.parse(server.args) : [],
      url: server.url,
      env: server.env ? JSON.parse(server.env) : {},
      authType: server.auth_type,
      authConfig: server.auth_config ? JSON.parse(server.auth_config) : {},
      enabled: server.enabled === 1,
      isBuiltin: server.is_builtin === 1,
      createdAt: server.created_at,
    },
  });
}));

// Create MCP server
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'mcp'), asyncHandler(async (req, res) => {
  const { 
    name, 
    description,
    transportType,
    command, 
    args, 
    url,
    env,
    authType, 
    authConfig 
  } = req.body;
  
  if (!name) {
    throw new ValidationError('Name is required');
  }
  
  if (!transportType || !['stdio', 'http', 'websocket'].includes(transportType)) {
    throw new ValidationError('Valid transportType is required (stdio, http, websocket)');
  }
  
  // Validate transport-specific fields
  if (transportType === 'stdio' && !command) {
    throw new ValidationError('Command is required for stdio transport');
  }
  
  if (transportType === 'http' && !url) {
    throw new ValidationError('URL is required for http transport');
  }
  
  // Validate URL format for HTTP transport
  if (transportType === 'http' && url) {
    try {
      new URL(url);
    } catch {
      throw new ValidationError('Invalid URL format');
    }
    
    // Check if mcp-remote is installed for HTTP transport
    const hasMcpRemote = await isMcpRemoteInstalled();
    if (!hasMcpRemote) {
      logger.info('mcp-remote not found, attempting to install...');
      const installed = await installMcpRemote();
      if (!installed) {
        throw new ValidationError('Failed to install mcp-remote bridge required for HTTP MCP servers. Please install manually: npm install -g mcp-remote@0.1.38');
      }
    }
  }
  
  const db = getDatabase();
  
  // Check for duplicate name
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    throw new ValidationError('MCP server with this name already exists');
  }
  
  const result = db.prepare(`
    INSERT INTO mcp_servers (
      name, description, transport_type, command, args, url, env,
      auth_type, auth_config, enabled, is_builtin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
  `).run(
    name,
    description || null,
    transportType,
    command || null,
    args ? JSON.stringify(args) : null,
    url || null,
    env ? JSON.stringify(env) : null,
    authType || 'none',
    authConfig ? JSON.stringify(authConfig) : '{}'
  );
  
  const mcpServerId = result.lastInsertRowid;
  
  // Sync to mcporter.json
  const syncResult = await syncServerToMcporter(name, {
    transport_type: transportType,
    command,
    args,
    url,
    env,
  });
  
  if (!syncResult) {
    logger.warn(`Failed to sync MCP server ${name} to mcporter.json`);
  }
  
  res.status(201).json({
    success: true,
    data: { 
      id: mcpServerId,
      name,
      transportType,
      command,
      args,
      url,
    },
    mcporterSync: syncResult,
  });
}));

/**
 * @swagger
 * /mcp/import-json:
 *   post:
 *     summary: Import MCP server from JSON (legacy pulsemcp.com format)
 *     description: Import MCP server configuration from JSON - converts to mcporter format
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - configJson
 *             properties:
 *               configJson:
 *                 type: string
 *                 description: JSON configuration string
 *     responses:
 *       201:
 *         description: MCP server imported successfully
 *       400:
 *         description: Invalid JSON
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/import-json', authenticateToken, requireAdmin, auditLog('create', 'mcp'), asyncHandler(async (req, res) => {
  const { configJson } = req.body;
  
  if (!configJson) {
    throw new ValidationError('configJson is required');
  }
  
  // Parse the JSON config
  let config: any;
  try {
    config = JSON.parse(configJson);
  } catch (e) {
    throw new ValidationError('Invalid JSON format');
  }
  
  // Extract fields - support both old and new formats
  const name = config.name || config.mcpServer?.name;
  const description = config.description || config.mcpServer?.description;
  
  if (!name) {
    throw new ValidationError('Name is required in JSON config');
  }
  
  const db = getDatabase();
  
  // Check for duplicate name
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    throw new ValidationError('MCP server with this name already exists');
  }
  
  // Determine transport type and configuration
  let transportType: string;
  let command: string | null = null;
  let args: string[] | null = null;
  let url: string | null = config.url || config.mcpServer?.url || null;
  let env: Record<string, string> | null = null;
  
  // If command is provided, use stdio transport
  if (config.command || config.mcpServer?.command) {
    transportType = 'stdio';
    command = config.command || config.mcpServer?.command;
    args = config.args || config.mcpServer?.args || [];
    env = config.env || config.mcpServer?.env || null;
  } else if (url) {
    // HTTP transport
    transportType = 'http';
    
    // Check if mcp-remote is installed
    const hasMcpRemote = await isMcpRemoteInstalled();
    if (!hasMcpRemote) {
      const installed = await installMcpRemote();
      if (!installed) {
        throw new ValidationError('Failed to install mcp-remote bridge required for HTTP MCP servers');
      }
    }
  } else {
    throw new ValidationError('Either command (for stdio) or url (for http) is required in JSON config');
  }
  
  // Detect auth type from config
  let authType = 'none';
  let authConfig = {};
  
  if (config.auth?.type === 'api_key' || config.apiKey) {
    authType = 'api_key';
    authConfig = { apiKey: config.auth?.apiKey || config.apiKey };
    if (!env) env = {};
    env.API_KEY = config.auth?.apiKey || config.apiKey;
  } else if (config.auth?.type === 'bearer' || config.bearerToken) {
    authType = 'bearer';
    authConfig = { token: config.auth?.token || config.bearerToken };
    if (!env) env = {};
    env.TOKEN = config.auth?.token || config.bearerToken;
  } else if (config.auth?.type === 'basic' || (config.username && config.password)) {
    authType = 'basic';
    authConfig = { 
      username: config.auth?.username || config.username,
      password: config.auth?.password || config.password
    };
    if (!env) env = {};
    env.USERNAME = config.auth?.username || config.username;
    env.PASSWORD = config.auth?.password || config.password;
  }
  
  // Insert MCP server
  const result = db.prepare(`
    INSERT INTO mcp_servers (
      name, description, transport_type, command, args, url, env,
      auth_type, auth_config, config_json, enabled, is_builtin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
  `).run(
    name,
    description || null,
    transportType,
    command ? JSON.stringify(command) : null,
    args ? JSON.stringify(args) : null,
    url,
    env ? JSON.stringify(env) : null,
    authType,
    JSON.stringify(authConfig),
    configJson
  );
  
  const mcpServerId = result.lastInsertRowid;
  
  // Sync to mcporter.json
  const syncResult = await syncServerToMcporter(name, {
    transport_type: transportType,
    command,
    args: args || [],
    url,
    env,
  });
  
  res.status(201).json({
    success: true,
    data: { 
      id: mcpServerId,
      name,
      transportType,
      url,
    },
    mcporterSync: syncResult,
  });
}));

/**
 * @swagger
 * /mcp/{id}:
 *   put:
 *     summary: Update MCP server
 *     description: Update MCP server configuration (admin only)
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: MCP Server ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               transportType:
 *                 type: string
 *                 enum: [stdio, http, websocket]
 *               command:
 *                 type: string
 *               args:
 *                 type: array
 *               url:
 *                 type: string
 *               env:
 *                 type: object
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: MCP server updated successfully
 *       404:
 *         description: MCP server not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'mcp'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as MCPServer | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  const { 
    name, 
    description,
    transportType,
    command, 
    args, 
    url,
    env,
    authType, 
    authConfig, 
    enabled 
  } = req.body;
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (name !== undefined) {
    // Check for duplicate name if changing
    if (name !== server.name) {
      const existing = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name) as { id: number } | undefined;
      if (existing) {
        throw new ValidationError('MCP server with this name already exists');
      }
    }
    fields.push('name = ?');
    values.push(name);
  }
  
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description);
  }
  
  if (transportType !== undefined) {
    fields.push('transport_type = ?');
    values.push(transportType);
  }
  
  if (command !== undefined) {
    fields.push('command = ?');
    values.push(command);
  }
  
  if (args !== undefined) {
    fields.push('args = ?');
    values.push(JSON.stringify(args));
  }
  
  if (url !== undefined) {
    // Validate URL
    if (url) {
      try {
        new URL(url);
      } catch {
        throw new ValidationError('Invalid URL format');
      }
    }
    fields.push('url = ?');
    values.push(url);
  }
  
  if (env !== undefined) {
    fields.push('env = ?');
    values.push(JSON.stringify(env));
  }
  
  if (authType !== undefined) {
    fields.push('auth_type = ?');
    values.push(authType);
  }
  
  if (authConfig !== undefined) {
    fields.push('auth_config = ?');
    values.push(JSON.stringify(authConfig));
  }
  
  if (enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }
  
  if (fields.length > 0) {
    fields.push('updated_at = unixepoch()');
    values.push(req.params.id);
    db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  }
  
  // Get updated server
  const updatedServer = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as MCPServer;
  
  // Sync to mcporter.json (only if enabled)
  let syncResult = false;
  if (updatedServer.enabled === 1) {
    syncResult = await syncServerToMcporter(updatedServer.name, {
      transport_type: updatedServer.transport_type,
      command: updatedServer.command,
      args: updatedServer.args ? JSON.parse(updatedServer.args) : [],
      url: updatedServer.url,
      env: updatedServer.env ? JSON.parse(updatedServer.env) : undefined,
    });
  } else {
    // Remove from mcporter if disabled
    syncResult = await removeServerFromMcporter(updatedServer.name);
  }
  
  res.json({
    success: true,
    message: 'MCP server updated successfully',
    mcporterSync: syncResult,
  });
}));

/**
 * @swagger
 * /mcp/{id}:
 *   delete:
 *     summary: Delete MCP server
 *     description: Delete MCP server and remove from mcporter.json (admin only)
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: MCP Server ID
 *     responses:
 *       200:
 *         description: MCP server deleted successfully
 *       404:
 *         description: MCP server not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'mcp'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT name FROM mcp_servers WHERE id = ?').get(req.params.id) as { name: string } | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  // Remove from mcporter.json first
  await removeServerFromMcporter(server.name);
  
  // Delete from database
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('MCP server not found');
  }
  
  res.json({
    success: true,
    message: 'MCP server deleted successfully',
  });
}));

/**
 * @swagger
 * /mcp/sync:
 *   post:
 *     summary: Sync all MCP servers to mcporter.json
 *     description: Sync all enabled MCP servers from database to mcporter.json
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync completed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/sync', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const servers = db.prepare('SELECT * FROM mcp_servers').all() as MCPServer[];
  
  const syncResult = await syncAllServersToMcporter(servers.map(s => ({
    name: s.name,
    enabled: s.enabled,
    transport_type: s.transport_type,
    command: s.command,
    args: s.args,
    url: s.url,
    env: s.env,
  })));
  
  res.json({
    success: true,
    data: { synced: servers.length },
    mcporterSync: syncResult,
  });
}));

/**
 * @swagger
 * /mcp/{id}/test:
 *   post:
 *     summary: Test MCP server connection
 *     description: Test connectivity to MCP server endpoint
 *     tags: [MCP Servers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: MCP Server ID
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     reachable:
 *                       type: boolean
 *                     error:
 *                       type: string
 *       404:
 *         description: MCP server not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/test', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as MCPServer | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  // For stdio transport, we can't easily test - just verify command exists
  if (server.transport_type === 'stdio') {
    if (!server.command) {
      res.json({
        success: true,
        data: { reachable: false, error: 'No command configured' },
      });
      return;
    }
    
    // Try to check if command exists
    const { execOnHost } = await import('../services/hostExecutor');
    const checkResult = await execOnHost(`which ${server.command.split(' ')[0]}`);
    
    res.json({
      success: true,
      data: { 
        reachable: checkResult.success,
        error: checkResult.success ? undefined : `Command not found: ${server.command}`,
        transport: 'stdio',
      },
    });
    return;
  }
  
  // For HTTP transport, test the URL
  if (!server.url) {
    res.json({
      success: true,
      data: { reachable: false, error: 'No URL configured' },
    });
    return;
  }
  
  let url: URL;
  try {
    url = new URL(server.url);
  } catch {
    res.json({
      success: true,
      data: { reachable: false, error: 'Invalid URL format' },
    });
    return;
  }
  
  const protocol = url.protocol === 'https:' ? https : http;
  
  try {
    await new Promise((resolve, reject) => {
      const request = protocol.request(url, { method: 'GET', timeout: 5000 }, (response) => {
        resolve({ status: response.statusCode });
      });
      
      request.on('error', (err) => {
        reject(err);
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Timeout'));
      });
      
      request.end();
    });
    
    res.json({
      success: true,
      data: { reachable: true, transport: 'http' },
    });
  } catch (error) {
    logger.warn(`MCP server ${server.name} test failed: ${error}`);
    res.json({
      success: true,
      data: { reachable: false, error: (error as Error).message, transport: 'http' },
    });
  }
}));

export default router;
