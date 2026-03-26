import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';

interface Tool {
  id: number;
  name: string;
  type: string;
  config?: string;
  enabled: number;
  agent_id?: number;
  mcp_server_id?: number;
  created_at: number;
  updated_at: number;
}

const router = Router();

// List tools
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const tools = db.prepare(`
    SELECT t.*, m.name as mcp_server_name 
    FROM tools t
    LEFT JOIN mcp_servers m ON t.mcp_server_id = m.id
    ORDER BY t.created_at DESC
  `).all();
  
  res.json({
    success: true,
    data: tools.map((t: any) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      config: t.config ? JSON.parse(t.config) : {},
      enabled: t.enabled === 1,
      agentId: t.agent_id,
      mcpServerName: t.mcp_server_name,
      createdAt: t.created_at,
    })),
  });
}));

// Get single tool
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(req.params.id) as Tool | undefined;
  
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }
  
  res.json({
    success: true,
    data: {
      id: tool.id,
      name: tool.name,
      type: tool.type,
      config: tool.config ? JSON.parse(tool.config) : {},
      enabled: tool.enabled === 1,
      agentId: tool.agent_id,
      createdAt: tool.created_at,
    },
  });
}));

// Create tool
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'tool'), asyncHandler(async (req, res) => {
  const { name, type, config, agentId } = req.body;
  
  if (!name || !type) {
    throw new ValidationError('Name and type are required');
  }
  
  if (!['browser', 'cron', 'webhook'].includes(type)) {
    throw new ValidationError('Invalid tool type. Must be browser, cron, or webhook');
  }
  
  const db = getDatabase();
  
  // Check for duplicate name
  const existing = db.prepare('SELECT id FROM tools WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    throw new ValidationError('Tool with this name already exists');
  }
  
  const result = db.prepare(`
    INSERT INTO tools (name, type, config, enabled, agent_id)
    VALUES (?, ?, ?, 1, ?)
  `).run(
    name,
    type,
    config ? JSON.stringify(config) : '{}',
    agentId || null
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

// Update tool
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'tool'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const tool = db.prepare('SELECT id FROM tools WHERE id = ?').get(req.params.id);
  
  if (!tool) {
    throw new NotFoundError('Tool not found');
  }
  
  const { name, config, enabled, agentId } = req.body;
  const fields: string[] = [];
  const values: any[] = [];
  
  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (config !== undefined) {
    fields.push('config = ?');
    values.push(JSON.stringify(config));
  }
  if (enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }
  if (agentId !== undefined) {
    fields.push('agent_id = ?');
    values.push(agentId);
  }
  
  if (fields.length > 0) {
    values.push(req.params.id);
    db.prepare(`UPDATE tools SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`)
      .run(...values);
  }
  
  res.json({
    success: true,
    message: 'Tool updated successfully',
  });
}));

// Delete tool
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'tool'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM tools WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Tool not found');
  }
  
  res.json({
    success: true,
    message: 'Tool deleted successfully',
  });
}));

export default router;
