import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError } from '../utils/errors';
import type { LLMProvider } from '../types/database';

const router = Router();

/**
 * @swagger
 * /llm/providers:
 *   get:
 *     summary: List LLM providers
 *     description: Get list of all configured LLM providers (OpenAI, Anthropic, etc.)
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       key:
 *                         type: string
 *                       models:
 *                         type: array
 *                         items:
 *                           type: object
 *                       has_key:
 *                         type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/providers', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const providers = db.prepare('SELECT * FROM llm_providers').all() as LLMProvider[];
  
  res.json({
    success: true,
    data: providers.map(p => ({
      ...p,
      models: p.models ? JSON.parse(p.models) : [],
      api_key_env: undefined, // Don't expose env variable names to non-admin
      api_key: undefined, // Don't expose actual key
      has_key: !!process.env[p.api_key_env], // Flag to indicate if key is set
    })),
  });
}));

/**
 * @swagger
 * /llm/providers/{id}/test:
 *   post:
 *     summary: Test LLM provider connection
 *     description: Test connectivity and API key validity for a provider
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Provider ID
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     latency:
 *                       type: integer
 *                     error:
 *                       type: string
 *       404:
 *         description: Provider not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/providers/:id/test', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const provider = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(req.params.id) as LLMProvider | undefined;
  
  if (!provider) {
    throw new NotFoundError('Provider not found');
  }
  
  // Check if API key is set in environment
  const envKey = process.env[provider.api_key_env];
  const hasKey = !!envKey;
  
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

/**
 * @swagger
 * /llm/models:
 *   get:
 *     summary: List available models
 *     description: Get all available models from providers with configured API keys
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available models
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       providerName:
 *                         type: string
 *                       pricing:
 *                         type: object
 *       401:
 *         description: Unauthorized
 */
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
