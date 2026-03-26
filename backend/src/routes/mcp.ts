import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';
import https from 'https';
import http from 'http';

// MCP Server type from database
interface McpServer {
  id: number;
  name: string;
  url: string;
  auth_type: string;
  auth_config?: string;
  config_json?: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

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
 *                       url:
 *                         type: string
 *                       authType:
 *                         type: string
 *                       enabled:
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
      url: s.url,
      authType: s.auth_type,
      enabled: s.enabled === 1,
      createdAt: s.created_at,
    })),
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
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as McpServer | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  res.json({
    success: true,
    data: {
      id: server.id,
      name: server.name,
      url: server.url,
      authType: server.auth_type,
      authConfig: server.auth_config ? JSON.parse(server.auth_config) : {},
      enabled: server.enabled === 1,
      createdAt: server.created_at,
    },
  });
}));

// Create MCP server
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'mcp'), asyncHandler(async (req, res) => {
  const { name, url, authType, authConfig } = req.body;
  
  if (!name || !url) {
    throw new ValidationError('Name and URL are required');
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new ValidationError('Invalid URL format');
  }
  
  const db = getDatabase();
  
  // Check for duplicate name
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    throw new ValidationError('MCP server with this name already exists');
  }
  
  const result = db.prepare(`
    INSERT INTO mcp_servers (name, url, auth_type, auth_config, enabled)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    name,
    url,
    authType || 'none',
    authConfig ? JSON.stringify(authConfig) : '{}'
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

/**
 * @swagger
 * /mcp/import-json:
 *   post:
 *     summary: Import MCP server from JSON
 *     description: Import MCP server configuration from JSON (e.g., from pulsemcp.com)
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
 *                 example: '{"name":"My MCP","url":"https://api.example.com/mcp","tools":[{"name":"search","description":"Search tool"}]}'
 *     responses:
 *       201:
 *         description: MCP server imported successfully
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
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     toolsImported:
 *                       type: integer
 *       400:
 *         description: Invalid JSON or missing URL
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
  
  // Extract required fields
  const name = config.name || config.mcpServer?.name || 'Imported MCP Server';
  const url = config.url || config.mcpServer?.url;
  
  if (!url) {
    throw new ValidationError('URL is required in JSON config');
  }
  
  // Detect auth type from config
  let authType = 'none';
  let authConfig = {};
  
  if (config.auth?.type === 'api_key' || config.apiKey) {
    authType = 'api_key';
    authConfig = { apiKey: config.auth?.apiKey || config.apiKey };
  } else if (config.auth?.type === 'bearer' || config.bearerToken) {
    authType = 'bearer';
    authConfig = { token: config.auth?.token || config.bearerToken };
  } else if (config.auth?.type === 'basic' || (config.username && config.password)) {
    authType = 'basic';
    authConfig = { 
      username: config.auth?.username || config.username,
      password: config.auth?.password || config.password
    };
  }
  
  const db = getDatabase();
  
  // Check for duplicate name
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    throw new ValidationError('MCP server with this name already exists');
  }
  
  // Insert MCP server with config_json
  const result = db.prepare(`
    INSERT INTO mcp_servers (name, url, auth_type, auth_config, config_json, enabled)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    name,
    url,
    authType,
    JSON.stringify(authConfig),
    configJson
  );
  
  const mcpServerId = result.lastInsertRowid;
  
  // Extract and create tools from config
  const tools = config.tools || config.mcpServer?.tools || [];
  if (Array.isArray(tools) && tools.length > 0) {
    const toolStmt = db.prepare(`
      INSERT INTO tools (name, type, config, enabled, mcp_server_id)
      VALUES (?, 'mcp', ?, 1, ?)
    `);
    
    for (const tool of tools) {
      const toolName = tool.name || tool.function?.name || 'Unnamed Tool';
      const toolConfig = JSON.stringify({
        description: tool.description || tool.function?.description,
        parameters: tool.parameters || tool.function?.parameters,
      });
      
      try {
        toolStmt.run(toolName, toolConfig, mcpServerId);
      } catch (e) {
        logger.warn(`Failed to import tool ${toolName}: ${e}`);
      }
    }
  }
  
  res.status(201).json({
    success: true,
    data: { 
      id: mcpServerId,
      name,
      url,
      toolsImported: tools.length,
    },
  });
}));

// Update MCP server
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'mcp'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(req.params.id) as { id: number } | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  const { name, url, authType, authConfig, enabled } = req.body;
  const fields: string[] = [];
  const values: any[] = [];
  
  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (url !== undefined) {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new ValidationError('Invalid URL format');
    }
    fields.push('url = ?');
    values.push(url);
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
    values.push(req.params.id);
    db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`)
      .run(...values);
  }
  
  res.json({
    success: true,
    message: 'MCP server updated successfully',
  });
}));

/**
 * @swagger
 * /mcp/{id}:
 *   delete:
 *     summary: Delete MCP server
 *     description: Delete MCP server and associated tools
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
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as McpServer | undefined;
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  // Validate URL format first
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
      const req = protocol.request(url, { method: 'GET', timeout: 5000 }, (res) => {
        resolve({ status: res.statusCode });
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      
      req.end();
    });
    
    res.json({
      success: true,
      data: { reachable: true },
    });
  } catch (error) {
    logger.warn(`MCP server ${server.name} test failed: ${error}`);
    res.json({
      success: true,
      data: { reachable: false, error: (error as Error).message },
    });
  }
}));

export default router;
