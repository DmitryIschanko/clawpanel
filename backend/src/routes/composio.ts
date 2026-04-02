import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { getDatabase } from '../database';
import axios from 'axios';

const router = Router();

// Cache for toolkit catalog (1 hour)
let catalogCache: { data: any[]; ts: number } = { data: [], ts: 0 };
const CACHE_TTL = 3600000; // 1 hour

// Get Composio API key from config
function getApiKey(): string | null {
  const db = getDatabase();
  const config = db.prepare('SELECT api_key FROM composio_config WHERE id = 1').get() as { api_key: string } | undefined;
  return config?.api_key || null;
}

// Validate API key by making a test request
async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await axios.get('https://backend.composio.dev/api/v3/auth_configs?limit=1', {
      headers: { 'x-api-key': apiKey },
      timeout: 5000,
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Get toolkit catalog with caching
async function getToolkitCatalog(apiKey: string): Promise<any[]> {
  if (Date.now() - catalogCache.ts < CACHE_TTL && catalogCache.data.length > 0) {
    return catalogCache.data;
  }

  try {
    const res = await fetch('https://backend.composio.dev/api/v3/toolkits?limit=200', {
      headers: { 'x-api-key': apiKey },
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch catalog: ${res.status}`);
    }

    const data = await res.json() as { items: any[] };
    catalogCache = { data: data.items || [], ts: Date.now() };
    return data.items || [];
  } catch (error) {
    logger.error('Failed to fetch toolkit catalog:', error);
    return [];
  }
}

/**
 * GET /api/composio/config
 * Get Composio configuration status
 */
router.get('/config', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const config = db.prepare('SELECT is_active, connected_at, substr(api_key, 1, 8) || \'...\' as api_key_preview FROM composio_config WHERE id = 1').get() as any;

  res.json({
    success: true,
    data: config || { is_active: 0, api_key_preview: null },
  });
}));

/**
 * POST /api/composio/config
 * Save API key
 */
router.post('/config', authenticateToken, requireAdmin, auditLog('update', 'composio_config'), asyncHandler(async (req, res) => {
  const { api_key } = req.body;

  if (!api_key || typeof api_key !== 'string') {
    throw new ValidationError('API key is required');
  }

  // Validate API key
  const isValid = await validateApiKey(api_key);
  if (!isValid) {
    throw new ValidationError('Invalid API key. Please check your key from https://app.composio.dev');
  }

  const db = getDatabase();
  
  db.prepare(`
    INSERT INTO composio_config (id, api_key, is_active, connected_at, updated_at)
    VALUES (1, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      api_key = excluded.api_key,
      is_active = 1,
      connected_at = datetime('now'),
      updated_at = datetime('now')
  `).run(api_key);

  // Clear cache
  catalogCache = { data: [], ts: 0 };

  res.json({
    success: true,
    message: 'API key saved successfully',
    is_active: true,
  });
}));

/**
 * DELETE /api/composio/config
 * Remove configuration and disconnect all apps
 */
router.delete('/config', authenticateToken, requireAdmin, auditLog('delete', 'composio_config'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  // Delete all composio apps (cascade will delete tools)
  db.prepare('DELETE FROM composio_apps').run();
  
  // Clear config
  db.prepare('UPDATE composio_config SET api_key = NULL, is_active = 0 WHERE id = 1').run();
  
  // Clear cache
  catalogCache = { data: [], ts: 0 };

  res.json({
    success: true,
    message: 'Composio configuration removed',
  });
}));

/**
 * GET /api/composio/catalog
 * Get available toolkit catalog
 */
router.get('/catalog', authenticateToken, asyncHandler(async (req, res) => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new ValidationError('Composio API key not configured');
  }

  const { search, category } = req.query;
  let catalog = await getToolkitCatalog(apiKey);

  // Filter by search
  if (search && typeof search === 'string') {
    const searchLower = search.toLowerCase();
    catalog = catalog.filter((t: any) => 
      t.name?.toLowerCase().includes(searchLower) ||
      t.slug?.toLowerCase().includes(searchLower)
    );
  }

  // Filter by category
  if (category && typeof category === 'string') {
    catalog = catalog.filter((t: any) => 
      t.meta?.categories?.some((c: any) => c.id === category || c.name === category)
    );
  }

  res.json({
    success: true,
    data: catalog.map((t: any) => ({
      slug: t.slug,
      name: t.name,
      logo: t.meta?.logo,
      description: t.meta?.description,
      categories: t.meta?.categories?.map((c: any) => c.name) || [],
      auth_schemes: t.auth_schemes,
      tools_count: t.meta?.tools_count || 0,
    })),
  });
}));

/**
 * GET /api/composio/apps
 * List connected apps
 */
router.get('/apps', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  const apps = db.prepare(`
    SELECT 
      ca.*,
      COUNT(ct.id) as tools_count
    FROM composio_apps ca
    LEFT JOIN composio_tools ct ON ct.app_id = ca.id
    GROUP BY ca.id
    ORDER BY ca.created_at DESC
  `).all();

  res.json({
    success: true,
    data: apps,
  });
}));

/**
 * POST /api/composio/apps
 * Connect a new app (create auth config + initiate connection)
 */
router.post('/apps', authenticateToken, requireAdmin, auditLog('create', 'composio_app'), asyncHandler(async (req, res) => {
  const { toolkit_slug, display_name, logo_url } = req.body;

  if (!toolkit_slug || !display_name) {
    throw new ValidationError('toolkit_slug and display_name are required');
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new ValidationError('Composio API key not configured');
  }

  const db = getDatabase();

  // Check if already connected
  const existing = db.prepare('SELECT id, status FROM composio_apps WHERE toolkit_slug = ?').get(toolkit_slug) as any;
  if (existing && existing.status === 'active') {
    throw new ValidationError('App is already connected');
  }

  try {
    logger.info('Connecting app:', { toolkit_slug, display_name });
    
    // Step 1: Find or create auth config
    const authConfigsRes = await axios.get(`https://backend.composio.dev/api/v3/auth_configs?app_name=${toolkit_slug}&limit=10`, {
      headers: { 'x-api-key': apiKey },
      timeout: 10000,
    });
    
    const authConfigsData = authConfigsRes.data as { items: any[] };
    let authConfigId = authConfigsData.items?.[0]?.id;
    logger.info('Auth config ID:', authConfigId);

    // Step 2: Create connected account link
    const callbackUrl = `${process.env.PANEL_URL || 'http://localhost:3000'}/api/composio/callback`;
    logger.info('Callback URL:', callbackUrl);
    
    const linkRes = await axios.post('https://backend.composio.dev/api/v3/connected_accounts/link', {
      auth_config_id: authConfigId,
      user_id: 'clawpanel-default',
      redirect_uri: callbackUrl,
    }, {
      headers: { 
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const linkData = linkRes.data;
    logger.info('Link response:', linkData);

    // Step 3: Save to database
    const connectedAccountId = linkData.connected_account_id || linkData.id || linkData.connectionRequestId;
    logger.info('Connected account ID:', connectedAccountId);
    
    const result = db.prepare(`
      INSERT INTO composio_apps (toolkit_slug, display_name, logo_url, auth_config_id, status, connected_account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))
      ON CONFLICT(toolkit_slug) DO UPDATE SET
        status = 'pending',
        connected_account_id = excluded.connected_account_id,
        updated_at = datetime('now')
      RETURNING id
    `).run(toolkit_slug, display_name, logo_url || null, authConfigId || null, connectedAccountId);

    const redirectUrl = linkData.redirect_url || linkData.redirectUrl || linkData.url;
    logger.info('Redirect URL:', redirectUrl);

    res.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        redirect_url: redirectUrl,
        status: 'pending',
      },
    });

  } catch (error: any) {
    logger.error('Failed to connect app:', error.message, error.response?.data);
    throw new Error(`Failed to connect app: ${error.message}`);
  }
}));

/**
 * GET /api/composio/callback
 * OAuth callback handler (redirect from Composio)
 */
router.get('/callback', asyncHandler(async (req, res) => {
  const { connectedAccountId, status, error: errorMsg } = req.query;

  logger.info('Composio OAuth callback (GET):', { connectedAccountId, status, error: errorMsg });

  if (!connectedAccountId) {
    return res.redirect('/mcp?tab=composio&status=error&message=Missing+account+ID');
  }

  const db = getDatabase();
  const apiKey = getApiKey();

  if (!apiKey) {
    return res.redirect('/mcp?tab=composio&status=error&message=API+key+not+configured');
  }

  try {
    // Get account status from Composio
    const accountRes = await axios.get(`https://backend.composio.dev/api/v3/connected_accounts/${connectedAccountId}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 10000,
    });

    const account = accountRes.data;
    const isActive = account.status === 'ACTIVE';

    // Update database
    db.prepare(`
      UPDATE composio_apps 
      SET status = ?, 
          error_message = ?,
          updated_at = datetime('now')
      WHERE connected_account_id = ?
    `).run(
      isActive ? 'active' : (status === 'failed' ? 'error' : 'pending'),
      errorMsg || account.statusReason || null,
      connectedAccountId
    );

    // If active, sync tools
    if (isActive) {
      const app = db.prepare('SELECT id FROM composio_apps WHERE connected_account_id = ?').get(connectedAccountId) as any;
      if (app) {
        await syncToolsForApp(app.id, apiKey);
      }
    }

    const redirectStatus = isActive ? 'success' : 'error';
    res.redirect(`/mcp?tab=composio&status=${redirectStatus}`);

  } catch (error: any) {
    logger.error('Callback error:', error);
    res.redirect('/mcp?tab=composio&status=error&message=' + encodeURIComponent(error.message));
  }
}));

/**
 * POST /api/composio/callback
 * Webhook handler from Composio
 */
router.post('/callback', asyncHandler(async (req, res) => {
  logger.info('Composio webhook received:', req.body);

  const { event, data } = req.body;

  if (!event || !data) {
    return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
  }

  const db = getDatabase();
  const apiKey = getApiKey();

  // Handle connected account events
  if (event.includes('connected_account')) {
    const connectedAccountId = data.connected_account_id || data.id;
    
    if (!connectedAccountId) {
      return res.status(400).json({ success: false, error: 'Missing connected account ID' });
    }

    try {
      // Get fresh account status from Composio
      const accountRes = await axios.get(`https://backend.composio.dev/api/v3/connected_accounts/${connectedAccountId}`, {
        headers: { 'x-api-key': apiKey },
        timeout: 10000,
      });

      const account = accountRes.data;
      const isActive = account.status === 'ACTIVE';

      // Update database
      db.prepare(`
        UPDATE composio_apps 
        SET status = ?, 
            error_message = ?,
            updated_at = datetime('now')
        WHERE connected_account_id = ?
      `).run(
        isActive ? 'active' : 'pending',
        data.error_message || account.statusReason || null,
        connectedAccountId
      );

      // If active, sync tools
      if (isActive) {
        const app = db.prepare('SELECT id FROM composio_apps WHERE connected_account_id = ?').get(connectedAccountId) as any;
        if (app) {
          await syncToolsForApp(app.id, apiKey);
          logger.info('Tools synced for app:', app.id);
        }
      }

      logger.info('Webhook processed, status:', { connectedAccountId, status: isActive ? 'active' : 'pending' });
      return res.json({ success: true, status: isActive ? 'active' : 'pending' });

    } catch (error: any) {
      logger.error('Webhook processing error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Acknowledge other events
  res.json({ success: true, acknowledged: true });
}));

/**
 * GET /api/composio/apps/:id/status
 * Check connection status from Composio
 */
router.get('/apps/:id/status', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new ValidationError('Composio API key not configured');
  }

  const db = getDatabase();
  const app = db.prepare('SELECT * FROM composio_apps WHERE id = ?').get(id) as any;

  if (!app) {
    throw new ValidationError('App not found');
  }

  if (!app.connected_account_id) {
    throw new ValidationError('No connected account for this app');
  }

  try {
    // Get account status from Composio
    const accountRes = await axios.get(`https://backend.composio.dev/api/v3/connected_accounts/${app.connected_account_id}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 10000,
    });

    const account = accountRes.data;
    const isActive = account.status === 'ACTIVE';

    // Update database if status changed
    if (isActive && app.status !== 'active') {
      db.prepare(`
        UPDATE composio_apps 
        SET status = 'active', updated_at = datetime('now')
        WHERE id = ?
      `).run(id);

      // Sync tools
      await syncToolsForApp(parseInt(id), apiKey);
    }

    res.json({
      success: true,
      data: {
        status: isActive ? 'active' : account.status?.toLowerCase() || 'pending',
        isActive,
        accountStatus: account.status,
      },
    });

  } catch (error: any) {
    logger.error('Status check error:', error.message);
    throw new Error(`Failed to check status: ${error.message}`);
  }
}));

/**
 * POST /api/composio/apps/:id/sync-tools
 * Sync tools for an app
 */
router.post('/apps/:id/sync-tools', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new ValidationError('Composio API key not configured');
  }

  const count = await syncToolsForApp(parseInt(id), apiKey);

  res.json({
    success: true,
    data: { synced: count },
  });
}));

/**
 * DELETE /api/composio/apps/:id
 * Disconnect and delete app
 */
router.delete('/apps/:id', authenticateToken, requireAdmin, auditLog('delete', 'composio_app'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const apiKey = getApiKey();

  const db = getDatabase();
  const app = db.prepare('SELECT * FROM composio_apps WHERE id = ?').get(id) as any;

  if (!app) {
    throw new ValidationError('App not found');
  }

  // Delete from Composio if API key available
  if (apiKey && app.connected_account_id) {
    try {
      await axios.delete(`https://backend.composio.dev/api/v3/connected_accounts/${app.connected_account_id}`, {
        headers: { 'x-api-key': apiKey },
        timeout: 10000,
      });
    } catch (error) {
      logger.warn('Failed to delete connected account from Composio:', error);
    }
  }

  // Delete from database (cascade will delete tools)
  db.prepare('DELETE FROM composio_apps WHERE id = ?').run(id);

  res.json({
    success: true,
    message: 'App disconnected successfully',
  });
}));

/**
 * Helper: Sync tools for an app
 * NOTE: Composio API v3 doesn't support efficient toolkit-based tool filtering
 * Tools are available directly through Composio when using connected account
 */
async function syncToolsForApp(appId: number, apiKey: string): Promise<number> {
  // Tools sync disabled - API doesn't support toolkit-based filtering efficiently
  // Full tools list requires fetching 1000+ items
  logger.info('Tools sync skipped - using Composio native tool access');
  return 0;
}

export default router;
