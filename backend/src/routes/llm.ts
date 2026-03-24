import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';

const router = Router();

// List providers
router.get('/providers', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const providers = db.prepare('SELECT * FROM llm_providers').all();
  
  res.json({
    success: true,
    data: providers.map(p => ({
      ...p,
      models: p.models ? JSON.parse(p.models) : [],
      api_key_env: undefined, // Don't expose env variable names to non-admin
    })),
  });
}));

// Test provider connection
router.post('/providers/:id/test', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const provider = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(req.params.id);
  
  if (!provider) {
    throw new NotFoundError('Provider not found');
  }
  
  // Check if API key is set in environment
  const apiKey = process.env[provider.api_key_env];
  
  if (!apiKey) {
    res.json({
      success: true,
      data: {
        connected: false,
        error: `API key not set in environment variable ${provider.api_key_env}`,
      },
    });
    return;
  }
  
  // In a real implementation, this would make a test request to the provider
  res.json({
    success: true,
    data: {
      connected: true,
      latency: 0,
    },
  });
}));

// Get available models
router.get('/models', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const providers = db.prepare('SELECT * FROM llm_providers WHERE enabled = 1').all();
  
  const allModels = providers.flatMap((p: any) => {
    const models = p.models ? JSON.parse(p.models) : [];
    return models.map((m: any) => ({
      ...m,
      provider: p.key,
      providerName: p.name,
    }));
  });
  
  res.json({
    success: true,
    data: allModels,
  });
}));

export default router;
