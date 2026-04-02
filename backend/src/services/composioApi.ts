import axios from 'axios';
import { logger } from '../utils/logger';

const COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3';

interface ComposioConfig {
  apiKey: string;
}

interface Toolkit {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  auth_schemes: string[];
  composio_managed_auth_schemes: string[];
  no_auth: boolean;
  meta?: {
    description?: string;
    logo?: string;
    categories?: Array<{ id: string; name: string }>;
    tools_count?: number;
    triggers_count?: number;
  };
}

interface ConnectedAccount {
  id: string;
  toolkit: string;
  status: 'active' | 'inactive' | 'initiated';
  createdAt: string;
  updatedAt: string;
}

interface ConnectionRequest {
  connectionRequestId: string;
  redirectUrl: string;
  status: string;
}

class ComposioApiService {
  private apiKey: string;
  private client: any;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: COMPOSIO_BASE_URL,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response: any) => response,
      (error: any) => {
        logger.error('Composio API error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  /**
   * Get all available toolkits
   */
  async getToolkits(params?: {
    limit?: number;
    cursor?: string;
    category?: string;
    search?: string;
  }): Promise<{ items: Toolkit[]; nextCursor?: string; total: number }> {
    try {
      logger.info('Fetching Composio toolkits with limit:', params?.limit || 100);
      
      const response = await this.client.get('/toolkits', {
        params: {
          limit: params?.limit || 100,
          cursor: params?.cursor,
          category: params?.category,
          search: params?.search,
          managed_by: 'all',
        },
      });

      logger.info('Composio toolkits response:', { 
        itemsCount: response.data?.items?.length,
        hasNextCursor: !!response.data?.next_cursor,
        total: response.data?.total_items
      });

      return {
        items: response.data.items || [],
        nextCursor: response.data.next_cursor,
        total: response.data.total_items || 0,
      };
    } catch (error: any) {
      logger.error('Failed to fetch Composio toolkits:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Check if it's an auth error
      if (error.response?.status === 401) {
        throw new Error('Invalid API key. Make sure you are using the Project API Key from https://app.composio.dev/settings/api-keys');
      }
      
      throw new Error('Failed to fetch toolkits from Composio: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Get connected accounts for current user
   */
  async getConnectedAccounts(): Promise<ConnectedAccount[]> {
    try {
      const response = await this.client.get('/connected_accounts');
      return response.data.items || [];
    } catch (error) {
      logger.error('Failed to fetch connected accounts:', error);
      throw new Error('Failed to fetch connected accounts');
    }
  }

  /**
   * Initiate connection for a toolkit
   */
  async initiateConnection(toolkit: string, callbackUrl?: string, userId?: string): Promise<ConnectionRequest> {
    try {
      logger.info('Initiating connection for toolkit:', toolkit);
      
      // First, we need to get or create an auth config for this toolkit
      // For managed auth, we'll use the default auth config
      const authConfigsResponse = await this.client.get('/auth_configs', {
        params: { app_name: toolkit }
      });
      
      const authConfigs = authConfigsResponse.data?.items || [];
      let authConfigId = authConfigs.find((ac: any) => ac.appName === toolkit)?.id;
      
      if (!authConfigId) {
        // Try to get any auth config for this toolkit
        authConfigId = authConfigs[0]?.id;
      }
      
      if (!authConfigId) {
        throw new Error(`No auth config found for ${toolkit}. Please configure it in Composio Dashboard first.`);
      }
      
      logger.info('Using auth config:', authConfigId);
      
      // Use the correct API endpoint format for Composio
      // POST /api/v3/connected_accounts/link - creates a connect link session
      const payload: any = {
        auth_config_id: authConfigId,
        user_id: userId || 'clawpanel-user',
      };
      
      if (callbackUrl) {
        payload.redirect_uri = callbackUrl;
      }
      
      logger.info('Connection payload:', payload);
      
      // Use the /link endpoint for Connect Link flow
      const response = await this.client.post('/connected_accounts/link', payload);

      logger.info('Connection link created:', response.data);

      return {
        connectionRequestId: response.data.connectionRequestId || response.data.id,
        redirectUrl: response.data.redirectUrl || response.data.redirectUri || response.data.url,
        status: response.data.status || 'INITIATED',
      };
    } catch (error: any) {
      logger.error('Failed to initiate connection:', {
        toolkit,
        callbackUrl,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error(`Failed to initiate connection for ${toolkit}: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Delete connected account
   */
  async deleteConnection(connectedAccountId: string): Promise<void> {
    try {
      await this.client.delete(`/connected_accounts/${connectedAccountId}`);
    } catch (error) {
      logger.error('Failed to delete connection:', error);
      throw new Error('Failed to delete connection');
    }
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(connectionRequestId: string): Promise<any> {
    try {
      const response = await this.client.get(`/connected_accounts/requests/${connectionRequestId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get connection status:', error);
      throw new Error('Failed to get connection status');
    }
  }

  /**
   * Get toolkit categories
   */
  async getCategories(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.client.get('/toolkits/categories');
      return response.data.items || [];
    } catch (error) {
      logger.error('Failed to fetch categories:', error);
      return [];
    }
  }
}

export function createComposioService(apiKey: string): ComposioApiService {
  return new ComposioApiService(apiKey);
}

export type { Toolkit, ConnectedAccount, ConnectionRequest };
