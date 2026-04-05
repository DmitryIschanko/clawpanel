import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { 
  setupTelegramChannel, 
  removeTelegramChannel, 
  restartGateway,
  addChannelBinding,
  removeChannelBinding
} from '../services/hostExecutor';
import { logger } from '../utils/logger';
import type { Channel } from '../types/database';

// Extended channel type with joined agent name
interface ChannelWithAgent extends Channel {
  agent_name?: string;
}

const router = Router();

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channels = db.prepare(`
    SELECT c.*, a.name as agent_name 
    FROM channels c
    LEFT JOIN agents a ON c.agent_id = a.id
    ORDER BY c.created_at DESC
  `).all() as ChannelWithAgent[];
  
  res.json({
    success: true,
    data: channels.map(c => {
      // Safely parse JSON fields
      let config = {};
      let allowFrom = [];
      try {
        config = c.config ? JSON.parse(c.config) : {};
      } catch (e) {
        logger.error(`Invalid JSON in config for channel ${c.id}: ${c.config}`);
        config = {};
      }
      try {
        allowFrom = c.allow_from ? JSON.parse(c.allow_from) : [];
      } catch (e) {
        logger.error(`Invalid JSON in allow_from for channel ${c.id}: ${c.allow_from}`);
        allowFrom = [];
      }
      return {
        ...c,
        config,
        allow_from: allowFrom,
      };
    }),
  });
}));

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare(`
    SELECT c.*, a.name as agent_name 
    FROM channels c
    LEFT JOIN agents a ON c.agent_id = a.id
    WHERE c.id = ?
  `).get(req.params.id) as ChannelWithAgent | undefined;
  
  if (!channel) throw new NotFoundError('Channel not found');
  
  // Safely parse JSON fields
  let config = {};
  let allowFrom = [];
  try {
    config = channel.config ? JSON.parse(channel.config) : {};
  } catch (e) {
    logger.error(`Invalid JSON in config for channel ${channel.id}: ${channel.config}`);
    config = {};
  }
  try {
    allowFrom = channel.allow_from ? JSON.parse(channel.allow_from) : [];
  } catch (e) {
    logger.error(`Invalid JSON in allow_from for channel ${channel.id}: ${channel.allow_from}`);
    allowFrom = [];
  }
  
  res.json({
    success: true,
    data: {
      ...channel,
      config,
      allow_from: allowFrom,
    },
  });
}));

router.post('/', authenticateToken, requireAdmin, auditLog('create', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const { type, name, config, agent_id, allow_from, dm_policy } = req.body;
  
  if (!type || !name) throw new ValidationError('Type and name are required');
  
  // Configure Telegram in OpenClaw via host executor
  if (type === 'telegram' && config?.botToken) {
    try {
      await setupTelegramChannel(
        config.botToken,
        dm_policy || 'pairing',
        allow_from || [],
        name  // Use channel name as accountId for multi-bot support
      );
      
      // Add binding for this channel to agent
      const openClawAgentId = agent_id ? `clawpanel-${agent_id}` : 'main';
      await addChannelBinding('telegram', name, openClawAgentId);
      
      await restartGateway();
      logger.info('Telegram configured in OpenClaw');
    } catch (error: any) {
      logger.error('Failed to configure Telegram:', error);
      throw new ValidationError(`Failed to configure Telegram: ${error.message}`);
    }
  }
  
  const result = db.prepare(`
    INSERT INTO channels (type, name, config, agent_id, allow_from, dm_policy, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    type, name, JSON.stringify(config || {}), agent_id || null,
    JSON.stringify(allow_from || []), dm_policy || 'pairing', 'online'
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id) as Channel | undefined;
  if (!channel) throw new NotFoundError('Channel not found');
  
  const updates = req.body;
  const fields: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(['config', 'allow_from'].includes(key) ? JSON.stringify(value) : value);
    }
  }
  
  if (fields.length > 0) {
    values.push(req.params.id);
    db.prepare(`UPDATE channels SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).run(...values);
  }
  
  // Update binding if agent_id changed
  if (updates.agent_id !== undefined && channel.type === 'telegram') {
    try {
      const openClawAgentId = updates.agent_id ? `clawpanel-${updates.agent_id}` : 'main';
      await addChannelBinding('telegram', channel.name, openClawAgentId);
      await restartGateway();
    } catch (error: any) {
      logger.error('Failed to update channel binding:', error);
    }
  }
  
  res.json({ success: true, message: 'Channel updated' });
}));

router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id) as Channel | undefined;
  if (!channel) throw new NotFoundError('Channel not found');
  
  if (channel.type === 'telegram') {
    try { 
      // Remove binding for this channel
      const config = channel.config ? JSON.parse(channel.config) : {};
      await removeChannelBinding('telegram', channel.name);
      // Note: We don't remove the account from OpenClaw config, just the binding
      await restartGateway();
    } catch (e) { /* ignore */ }
  }
  
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Channel deleted' });
}));

router.post('/:id/test', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id) as Channel | undefined;
  if (!channel) throw new NotFoundError('Channel not found');
  
  res.json({
    success: true,
    data: { connected: channel.status === 'online', type: channel.type },
  });
}));

router.post('/actions/restart-gateway', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  await restartGateway();
  res.json({ success: true, message: 'Gateway restarted' });
}));

export default router;
