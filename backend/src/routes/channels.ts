import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { 
  setupTelegramChannel, 
  removeTelegramChannel, 
  getChannelStatus,
  restartGateway 
} from '../services/channelManager';
import { logger } from '../utils/logger';

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
  
  // Get actual status from OpenClaw
  const status = await getChannelStatus();
  
  res.json({
    success: true,
    data: channels.map(c => ({
      ...c,
      config: c.config ? JSON.parse(c.config) : {},
      allow_from: c.allow_from ? JSON.parse(c.allow_from) : [],
      // Override status with actual OpenClaw status
      status: c.type === 'telegram' && status.telegram ? 'online' : c.status,
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

// Get available agents for channel binding
router.get('/agents/available', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agents = db.prepare(`
    SELECT id, name, color FROM agents WHERE enabled = 1 ORDER BY name
  `).all();
  
  res.json({
    success: true,
    data: agents,
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
  
  // For Telegram, configure in OpenClaw
  if (type === 'telegram' && config?.botToken) {
    try {
      await setupTelegramChannel(
        config.botToken,
        dm_policy || 'pairing',
        allow_from || []
      );
      logger.info('Telegram channel configured in OpenClaw');
    } catch (error: any) {
      logger.error('Failed to configure Telegram in OpenClaw:', error);
      throw new ValidationError(`Failed to configure Telegram: ${error.message}`);
    }
  }
  
  const result = db.prepare(`
    INSERT INTO channels (type, name, config, agent_id, allow_from, dm_policy, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    type,
    name,
    config ? JSON.stringify(config) : '{}',
    agent_id || null,
    allow_from ? JSON.stringify(allow_from) : '[]',
    dm_policy || 'pairing',
    type === 'telegram' ? 'online' : 'offline'
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

// Update channel
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  
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
  
  // If Telegram config updated, sync with OpenClaw
  if (channel.type === 'telegram' && updates.config?.botToken) {
    try {
      await setupTelegramChannel(
        updates.config.botToken,
        updates.dm_policy || channel.dm_policy,
        updates.allow_from || JSON.parse(channel.allow_from || '[]')
      );
      logger.info('Telegram channel updated in OpenClaw');
    } catch (error: any) {
      logger.error('Failed to update Telegram in OpenClaw:', error);
      throw new ValidationError(`Failed to update Telegram: ${error.message}`);
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
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }
  
  // For Telegram, disable in OpenClaw
  if (channel.type === 'telegram') {
    try {
      await removeTelegramChannel();
      logger.info('Telegram channel disabled in OpenClaw');
    } catch (error: any) {
      logger.error('Failed to disable Telegram in OpenClaw:', error);
      // Continue with deletion even if OpenClaw fails
    }
  }
  
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
  
  // Get actual status from OpenClaw
  const status = await getChannelStatus();
  
  let connected = false;
  if (channel.type === 'telegram') {
    connected = status.telegram;
  }
  
  // Update channel status in DB
  db.prepare('UPDATE channels SET status = ? WHERE id = ?')
    .run(connected ? 'online' : 'offline', req.params.id);
  
  res.json({
    success: true,
    data: {
      connected,
      type: channel.type,
    },
  });
}));

// Restart Gateway (apply channel changes)
router.post('/actions/restart-gateway', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  try {
    await restartGateway();
    
    res.json({
      success: true,
      message: 'Gateway restart initiated',
    });
  } catch (error: any) {
    logger.error('Failed to restart Gateway:', error);
    throw new ValidationError(`Failed to restart Gateway: ${error.message}`);
  }
}));

export default router;
