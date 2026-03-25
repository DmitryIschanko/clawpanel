import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';
import https from 'https';
import http from 'http';

const router = Router();

// List MCP servers
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

// Get single MCP server
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id);
  
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
  const existing = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name);
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

// Update MCP server
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'mcp'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(req.params.id);
  
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

// Delete MCP server
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

// Test MCP server connection
router.post('/:id/test', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id);
  
  if (!server) {
    throw new NotFoundError('MCP server not found');
  }
  
  // Simple health check - try to connect
  const url = new URL(server.url);
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
