import { Router } from 'express';
import { gatewayService } from '../services/gateway';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';

const router = Router();

// List sessions
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  // Get sessions from Gateway
  try {
    const sessions = await gatewayService.getAgents(); // This gets agent sessions
    
    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    res.json({
      success: true,
      data: [],
    });
  }
}));

// Get session history
router.get('/:id/history', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const history = await gatewayService.getSessionHistory(req.params.id);
    
    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    throw new NotFoundError('Session not found');
  }
}));

// Compact session
router.post('/:id/compact', authenticateToken, asyncHandler(async (req, res) => {
  gatewayService.compactSession(req.params.id);
  
  res.json({
    success: true,
    message: 'Session compact initiated',
  });
}));

// Reset session
router.post('/:id/reset', authenticateToken, asyncHandler(async (req, res) => {
  gatewayService.resetSession(req.params.id);
  
  res.json({
    success: true,
    message: 'Session reset initiated',
  });
}));

export default router;
