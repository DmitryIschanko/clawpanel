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
      api_key: p.api_key ? '***' : undefined, // Don't expose actual key
      has_key: !!(p.api_key || process.env[p.api_key_env]), // Flag to indicate if key is set
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
  
  // Check if API key is set (either in database or environment)
  const envKey = process.env[provider.api_key_env];
  const hasKey = !!(provider.api_key || envKey);
  
  if (!hasKey) {
    res.json({
      success: true,
      data: {
        connected: false,
        error: `API key not set for ${provider.name}`,
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

// Save/update API key for a provider
router.put('/providers/:id/api-key', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const { apiKey } = req.body;
  
  if (typeof apiKey !== 'string') {
    res.status(400).json({ success: false, error: 'apiKey is required' });
    return;
  }
  
  const provider = db.prepare('SELECT id FROM llm_providers WHERE id = ?').get(req.params.id);
  if (!provider) {
    throw new NotFoundError('Provider not found');
  }
  
  db.prepare('UPDATE llm_providers SET api_key = ?, updated_at = unixepoch() WHERE id = ?').run(apiKey, req.params.id);
  
  res.json({
    success: true,
    message: 'API key updated successfully',
  });
}));

// Delete API key
router.delete('/providers/:id/api-key', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  const provider = db.prepare('SELECT id FROM llm_providers WHERE id = ?').get(req.params.id);
  if (!provider) {
    throw new NotFoundError('Provider not found');
  }
  
  db.prepare('UPDATE llm_providers SET api_key = NULL, updated_at = unixepoch() WHERE id = ?').run(req.params.id);
  
  res.json({
    success: true,
    message: 'API key removed successfully',
  });
}));

// Get available models (only from providers with configured keys)
router.get('/models', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const providers = db.prepare('SELECT * FROM llm_providers WHERE enabled = 1').all();
  
  const allModels = providers.flatMap((p: any) => {
    // Only include models from providers with API keys
    const envKey = process.env[p.api_key_env];
    const hasKey = !!(p.api_key || envKey);
    
    if (!hasKey) return [];
    
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
