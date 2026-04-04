import { getDatabase } from '../database';
import { logger } from '../utils/logger';
import axios from 'axios';

interface ComposioApp {
  id: number;
  toolkit_slug: string;
  display_name: string;
  logo_url?: string;
  status: string;
}

interface ComposioTool {
  name: string;
  display_name?: string;
  description?: string;
}

interface Tool {
  id: number;
  name: string;
  external_id?: string;
  composio_app_id?: number;
}

// Cache for Composio API key
function getApiKey(): string | null {
  const db = getDatabase();
  const config = db.prepare('SELECT api_key FROM composio_config WHERE id = 1').get() as { api_key: string } | undefined;
  return config?.api_key || null;
}

/**
 * Fetch tools from Composio API for a specific app
 */
async function fetchComposioTools(toolkitSlug: string): Promise<ComposioTool[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('No Composio API key configured');
    return [];
  }

  try {
    // Try to get tools from Composio API
    const response = await axios.get(
      `https://backend.composio.dev/api/v3/toolkits/${toolkitSlug}/tools`,
      {
        headers: { 'x-api-key': apiKey },
        timeout: 10000,
      }
    );

    if (response.data && Array.isArray(response.data.items)) {
      return response.data.items.map((item: any) => ({
        name: item.name || item.slug,
        display_name: item.display_name || item.name,
        description: item.description,
      }));
    }
    
    return [];
  } catch (error: any) {
    // If endpoint doesn't exist or returns error, create placeholder
    if (error.response?.status === 404) {
      logger.info(`Composio tools endpoint not available for ${toolkitSlug}, using placeholder`);
      return [{ name: toolkitSlug, display_name: toolkitSlug, description: `${toolkitSlug} tools` }];
    }
    logger.error(`Failed to fetch Composio tools for ${toolkitSlug}:`, error.message);
    return [];
  }
}

/**
 * Sync Composio app tools to database
 */
export async function syncComposioAppTools(appId: number): Promise<void> {
  const db = getDatabase();
  
  try {
    // Get app details
    const app = db.prepare('SELECT * FROM composio_apps WHERE id = ?').get(appId) as ComposioApp | undefined;
    if (!app) {
      logger.warn(`Composio app ${appId} not found`);
      return;
    }

    // Only sync active apps
    if (app.status !== 'active') {
      logger.info(`Skipping tool sync for inactive app: ${app.display_name}`);
      return;
    }

    // Fetch tools from Composio API
    const tools = await fetchComposioTools(app.toolkit_slug);
    
    if (tools.length === 0) {
      logger.info(`No tools found for Composio app: ${app.display_name}`);
      return;
    }

    // Get existing tools for this app
    const existingTools = db.prepare('SELECT * FROM tools WHERE composio_app_id = ?').all(appId) as Tool[];
    const existingMap = new Map(existingTools.map(t => [t.external_id, t]));

    // Create or update tools
    for (const tool of tools) {
      const toolSlug = `${app.toolkit_slug}_${tool.name}`;
      
      if (existingMap.has(toolSlug)) {
        // Update existing tool
        db.prepare(`
          UPDATE tools 
          SET name = ?, description = ?, updated_at = unixepoch()
          WHERE external_id = ? AND composio_app_id = ?
        `).run(
          tool.display_name || tool.name,
          tool.description || `${tool.name} from ${app.display_name}`,
          toolSlug,
          appId
        );
      } else {
        // Create new tool
        db.prepare(`
          INSERT INTO tools (name, type, source, external_id, description, enabled, composio_app_id)
          VALUES (?, 'composio', 'composio', ?, ?, 1, ?)
        `).run(
          tool.display_name || tool.name,
          toolSlug,
          tool.description || `${tool.name} from ${app.display_name}`,
          appId
        );
      }
    }

    // Remove tools that no longer exist
    const currentSlugs = new Set(tools.map(t => `${app.toolkit_slug}_${t.name}`));
    for (const existing of existingTools) {
      if (!currentSlugs.has(existing.external_id || '')) {
        // Remove tool assignments first
        db.prepare('DELETE FROM agent_tools WHERE tool_id = ?').run(existing.id);
        // Remove tool
        db.prepare('DELETE FROM tools WHERE id = ?').run(existing.id);
      }
    }

    logger.info(`Synced ${tools.length} Composio tools for app: ${app.display_name}`);
  } catch (error) {
    logger.error(`Failed to sync Composio app tools for app ${appId}:`, error);
    throw error;
  }
}

/**
 * Remove all tools associated with a Composio app
 */
export async function removeComposioAppTools(appId: number): Promise<void> {
  const db = getDatabase();
  
  try {
    // Get tool IDs first
    const tools = db.prepare('SELECT id FROM tools WHERE composio_app_id = ?').all(appId) as { id: number }[];
    
    // Remove tool assignments
    for (const tool of tools) {
      db.prepare('DELETE FROM agent_tools WHERE tool_id = ?').run(tool.id);
    }
    
    // Remove the tools
    db.prepare('DELETE FROM tools WHERE composio_app_id = ?').run(appId);
    
    logger.info(`Removed Composio tools for app: ${appId}`);
  } catch (error) {
    logger.error(`Failed to remove Composio app tools for app ${appId}:`, error);
    throw error;
  }
}

/**
 * Get tools for a specific Composio app
 */
export function getComposioAppTools(appId: number): Tool[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM tools WHERE composio_app_id = ?').all(appId) as Tool[];
}

/**
 * Sync all active Composio apps' tools
 */
export async function syncAllComposioAppTools(): Promise<void> {
  const db = getDatabase();
  
  try {
    const apps = db.prepare("SELECT * FROM composio_apps WHERE status = 'active'").all() as ComposioApp[];
    
    for (const app of apps) {
      await syncComposioAppTools(app.id);
    }
    
    logger.info(`Synced tools for ${apps.length} Composio apps`);
  } catch (error) {
    logger.error('Failed to sync all Composio app tools:', error);
    throw error;
  }
}
