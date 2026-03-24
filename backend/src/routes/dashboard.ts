import { Router } from 'express';
import { gatewayService } from '../services/gateway';
import { getDatabase } from '../database';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Get dashboard stats
router.get('/stats', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  // Get counts from database
  const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
  const channelCount = db.prepare('SELECT COUNT(*) as count FROM channels').get() as { count: number };
  const skillCount = db.prepare('SELECT COUNT(*) as count FROM skills').get() as { count: number };
  
  // Get gateway status
  const gatewayStatus = gatewayService.getStatus();
  
  // Get today's token usage (placeholder)
  const tokenUsage = {
    today: 0,
    week: 0,
    month: 0,
  };
  
  res.json({
    success: true,
    data: {
      agents: {
        total: agentCount.count,
        active: 0,
        idle: 0,
        error: 0,
      },
      channels: {
        total: channelCount.count,
        online: 0,
        offline: 0,
      },
      skills: skillCount.count,
      gateway: gatewayStatus,
      tokenUsage,
    },
  });
}));

// Get recent events
router.get('/events', authenticateToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: [],
  });
}));

// Quick actions
router.post('/actions/restart-gateway', authenticateToken, asyncHandler(async (req, res) => {
  gatewayService.send({ type: 'gateway:restart' });
  
  res.json({
    success: true,
    message: 'Gateway restart initiated',
  });
}));

router.post('/actions/clear-sessions', authenticateToken, asyncHandler(async (req, res) => {
  gatewayService.send({ type: 'sessions:clear' });
  
  res.json({
    success: true,
    message: 'Sessions cleared',
  });
}));

export default router;
