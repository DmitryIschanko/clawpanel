/**
 * Composio Integration Service
 * Provides integration with Composio API for MCP Tool Router
 * https://composio.dev
 */

import { logger } from '../utils/logger';
import axios from 'axios';

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api';
const COMPOSIO_MCP_BASE = 'https://connect.composio.dev/mcp';

export interface ComposioTool {
  name: string;
  displayName: string;
  description: string;
  logo?: string;
  category?: string;
}

export interface ComposioConnection {
  id: string;
  appName: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface ToolRouterSession {
  url: string;
  sessionId: string;
}

/**
 * Get list of available tools from Composio
 */
export async function getAvailableTools(apiKey: string): Promise<ComposioTool[]> {
  try {
    const response = await axios.get(`${COMPOSIO_API_BASE}/v1/apps`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const data = response.data;
    
    // Filter apps that support MCP
    const tools = data.items
      ?.filter((app: any) => app.supported_auth_modes?.includes('mcp'))
      ?.map((app: any) => ({
        name: app.name,
        displayName: app.display_name || app.name,
        description: app.description || '',
        logo: app.logo,
        category: app.category,
      })) || [];

    return tools;
  } catch (error: any) {
    logger.error('Failed to fetch Composio tools:', error.message || error);
    throw error;
  }
}

/**
 * Get user's connected apps/integrations
 */
export async function getConnections(apiKey: string): Promise<ComposioConnection[]> {
  try {
    const response = await axios.get(`${COMPOSIO_API_BASE}/v1/connected-apps`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const data = response.data;
    
    return data.items?.map((conn: any) => ({
      id: conn.id,
      appName: conn.app_name,
      status: conn.status,
      createdAt: conn.created_at,
    })) || [];
  } catch (error: any) {
    logger.error('Failed to fetch Composio connections:', error.message || error);
    throw error;
  }
}

/**
 * Get Tool Router MCP URL
 * Composio использует unified endpoint: https://connect.composio.dev/mcp
 * с заголовком x-consumer-api-key для аутентификации
 */
export function getToolRouterUrl(): string {
  return COMPOSIO_MCP_BASE;
}

/**
 * Create Tool Router session for MCP
 * Для Composio API key интеграции используется unified endpoint
 */
export async function createToolRouterSession(
  apiKey: string,
  userId: string = 'default'
): Promise<ToolRouterSession> {
  // Для Composio API key интеграции используется unified endpoint
  // с передачей ключа через заголовок x-consumer-api-key
  return {
    url: COMPOSIO_MCP_BASE,
    sessionId: userId,
  };
}

/**
 * Get MCP URL for specific tool
 * Для Composio API key интеграции используется unified endpoint
 * с заголовком x-consumer-api-key для всех инструментов
 */
export async function getToolMcpUrl(
  apiKey: string,
  toolName: string,
  connectionId?: string
): Promise<string> {
  // Для Composio API key интеграции используется unified endpoint
  // Все инструменты доступны через один URL с передачей ключа в заголовке
  // @ts-ignore - parameter kept for compatibility
  void apiKey; void toolName; void connectionId;
  return COMPOSIO_MCP_BASE;
}

/**
 * Validate API key
 * Проверяем ключ через запрос списка apps
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await axios.get(`${COMPOSIO_API_BASE}/v1/apps?limit=1`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    return response.status === 200;
  } catch (error: any) {
    logger.error('Failed to validate Composio API key:', error.message || error);
    return false;
  }
}

/**
 * Get OAuth URL for connecting a tool
 */
export function getOAuthUrl(apiKey: string, toolName: string, redirectUrl: string): string {
  return `${COMPOSIO_API_BASE}/v1/apps/${toolName}/oauth?api_key=${apiKey}&redirect_url=${encodeURIComponent(redirectUrl)}`;
}
