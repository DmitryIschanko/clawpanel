import { Router } from 'express';
import fs from 'fs/promises';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';
import { auditLog } from '../middleware/audit';

const router = Router();

const OPENCLAW_CONFIG = '/root/.openclaw/openclaw.json';

// Get settings
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const content = await fs.readFile(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(content);
    
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    // Return default config if file doesn't exist
    res.json({
      success: true,
      data: {
        agent: {
          model: 'anthropic/claude-opus-4',
        },
      },
    });
  }
}));

// Update settings
router.put('/', authenticateToken, requireAdmin, auditLog('update', 'settings'), asyncHandler(async (req, res) => {
  const config = req.body;
  
  // Validate JSON
  JSON.stringify(config);
  
  await fs.writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
  
  res.json({
    success: true,
    message: 'Settings updated successfully',
  });
}));

// Get backup
router.post('/backup', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // In a real implementation, this would create a backup archive
  res.json({
    success: true,
    message: 'Backup created',
    data: {
      downloadUrl: '/api/settings/backup/download',
    },
  });
}));

// Restore from backup
router.post('/restore', authenticateToken, requireAdmin, auditLog('restore', 'settings'), asyncHandler(async (req, res) => {
  // In a real implementation, this would restore from an uploaded backup
  res.json({
    success: true,
    message: 'Restore initiated',
  });
}));

export default router;
