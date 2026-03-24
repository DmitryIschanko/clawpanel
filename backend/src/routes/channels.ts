import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';

const router = Router();

// List channels
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channels = db.prepare(`
    SELECT c.*, a.name as agent_name 
    FROM channels c
    LEFT JOIN agents a ON c.agent_id = a.id
    ORDER BY c.created_at DESC
  `).all();
  
  res.json({
    success: true,
    data: channels.map(c => ({
      ...c,
      config: c.config ? JSON.parse(c.config) : {},
      allow_from: c.allow_from ? JSON.parse(c.allow_from) : [],
    })),
  });
}));

// Get single channel
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare(`
    SELECT c.*, a.name as agent_name 
    FROM channels c
    LEFT JOIN agents a ON c.agent_id = a.id
    WHERE c.id = ?
  `).get(req.params.id);
  
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }
  
  res.json({
    success: true,
    data: {
      ...channel,
      config: channel.config ? JSON.parse(channel.config) : {},
      allow_from: channel.allow_from ? JSON.parse(channel.allow_from) : [],
    },
  });
}));

// Create channel
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const {
    type,
    name,
    config,
    agent_id,
    allow_from,
    dm_policy,
  } = req.body;
  
  if (!type || !name) {
    throw new ValidationError('Type and name are required');
  }
  
  const validTypes = ['telegram', 'discord', 'whatsapp', 'slack', 'signal', 'msteams'];
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid channel type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  const result = db.prepare(`
    INSERT INTO channels (type, name, config, agent_id, allow_from, dm_policy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    type,
    name,
    config ? JSON.stringify(config) : '{}',
    agent_id || null,
    allow_from ? JSON.stringify(allow_from) : '[]',
    dm_policy || 'pairing'
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

// Update channel
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT id FROM channels WHERE id = ?').get(req.params.id);
  
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }
  
  const updates = req.body;
  const fields: string[] = [];
  const values: any[] = [];
  
  const jsonFields = ['config', 'allow_from'];
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(jsonFields.includes(key) ? JSON.stringify(value) : value);
    }
  }
  
  if (fields.length > 0) {
    values.push(req.params.id);
    db.prepare(`UPDATE channels SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`)
      .run(...values);
  }
  
  res.json({
    success: true,
    message: 'Channel updated successfully',
  });
}));

// Delete channel
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Channel not found');
  }
  
  res.json({
    success: true,
    message: 'Channel deleted successfully',
  });
}));

// Test channel connection
router.post('/:id/test', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }
  
  // In a real implementation, this would test the channel connection
  
  res.json({
    success: true,
    data: {
      connected: true,
    },
  });
}));

export default router;
