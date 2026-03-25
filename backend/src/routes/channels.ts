import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { 
  setupTelegramChannel, 
  removeTelegramChannel, 
  restartGateway 
} from '../services/hostExecutor';
import { logger } from '../utils/logger';

const router = Router();

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

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare(`
    SELECT c.*, a.name as agent_name 
    FROM channels c
    LEFT JOIN agents a ON c.agent_id = a.id
    WHERE c.id = ?
  `).get(req.params.id);
  
  if (!channel) throw new NotFoundError('Channel not found');
  
  res.json({
    success: true,
    data: {
      ...channel,
      config: channel.config ? JSON.parse(channel.config) : {},
      allow_from: channel.allow_from ? JSON.parse(channel.allow_from) : [],
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
        allow_from || []
      );
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
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
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
  
  res.json({ success: true, message: 'Channel updated' });
}));

router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'channel'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) throw new NotFoundError('Channel not found');
  
  if (channel.type === 'telegram') {
    try { await removeTelegramChannel(); } catch (e) { /* ignore */ }
  }
  
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Channel deleted' });
}));

router.post('/:id/test', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
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
