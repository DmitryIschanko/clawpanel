import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import {
  Cloud,
  Key,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Search,
  Grid,
  List,
  Plug,
  Settings,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { composioApi } from '../services/api';

interface ComposioConfig {
  is_active: number;
  api_key_preview: string | null;
  connected_at: string | null;
}

interface ComposioApp {
  id: number;
  toolkit_slug: string;
  display_name: string;
  logo_url: string | null;
  status: 'disconnected' | 'pending' | 'active' | 'error';
  tools_count: number;
  error_message: string | null;
  updated_at: string;
}

interface Toolkit {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  categories: string[];
  auth_schemes: string[];
  tools_count: number;
}

export function ComposioIntegration() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'connected' | 'settings'>('catalog');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isExpanded, setIsExpanded] = useState(true);
  const queryClient = useQueryClient();

  const { data: configData } = useQuery<{ is_active: number; api_key_preview: string | null }>(
    'composio-config',
    async () => {
      const response = await composioApi.getComposioConfig();
      return response.data.data;
    }
  );

  const config = configData || { is_active: 0, api_key_preview: null };
  const isActive = config.is_active === 1;

  const { data: appsData, refetch: refetchApps } = useQuery<ComposioApp[]>(
    'composio-apps',
    async () => {
      const response = await composioApi.getComposioApps();
      return response.data.data || [];
    },
    { enabled: isActive, refetchInterval: 5000 }
  );

  const connectedApps = appsData || [];

  const { data: catalogData } = useQuery<Toolkit[]>(
    'composio-catalog',
    async () => {
      const response = await composioApi.getComposioCatalog({ search: searchQuery });
      return response.data.data || [];
    },
    { enabled: isActive }
  );

  const catalog = catalogData || [];

  const saveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      await composioApi.saveComposioConfig(apiKey.trim());
      await queryClient.invalidateQueries('composio-config');
      setApiKey('');
      alert('API key saved successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const connectApp = async (toolkit: Toolkit) => {
    setConnectingApp(toolkit.slug);
    try {
      const response = await composioApi.connectComposioApp({
        toolkit_slug: toolkit.slug,
        display_name: toolkit.name,
        logo_url: toolkit.logo,
      });
      
      const responseData = response.data.data || response.data;
      const redirect_url = responseData.redirect_url || responseData.redirectUrl || responseData.url;
      
      if (redirect_url) {
        window.location.href = redirect_url;
      } else {
        alert('No redirect URL received from server');
      }
      
      await refetchApps();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || error.message || 'Failed to connect app');
    } finally {
      setConnectingApp(null);
    }
  };

  const disconnectApp = async (app: ComposioApp) => {
    if (!confirm(`Disconnect ${app.display_name}?`)) return;
    try {
      await composioApi.disconnectComposioApp(app.id);
      await refetchApps();
      alert(`${app.display_name} disconnected successfully`);
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Failed to disconnect app');
    }
  };

  const checkStatus = async (appId: number) => {
    try {
      const response = await composioApi.checkComposioAppStatus(appId);
      await refetchApps();
      
      // If app became active, sync tools automatically
      if (response.data.data?.isActive) {
        try {
          await composioApi.syncComposioTools(appId);
          await refetchApps();
          alert('App connected and tools synced successfully!');
        } catch (syncError: any) {
          console.error('Failed to sync tools:', syncError);
        }
      }
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Failed to check status');
    }
  };

  const syncTools = async (appId: number) => {
    try {
      await composioApi.syncComposioTools(appId);
      await refetchApps();
      alert('Tools synced successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Failed to sync tools');
    }
  };

  // Auto-check status for pending apps
  useEffect(() => {
    if (!connectedApps.length) return;
    
    const pendingApps = connectedApps.filter(app => app.status === 'pending');
    if (pendingApps.length === 0) return;

    const interval = setInterval(() => {
      pendingApps.forEach(app => checkStatus(app.id));
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [connectedApps]);

  const isConnected = (slug: string) => {
    return connectedApps.some((a) => a.toolkit_slug === slug && a.status === 'active');
  };

  if (!isActive) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900">Composio Integration</h3>
              <p className="text-sm text-gray-600">Connect 1000+ tools to your agents</p>
            </div>
          </div>
          {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </button>

        {isExpanded && (
          <div className="px-6 pb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Key className="w-4 h-4" />
                Configure API Key
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Get your API key from{' '}
                <a href="https://app.composio.dev" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">
                  Composio Dashboard
                </a>
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="cp_..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={saveApiKey}
                  disabled={isSaving || !apiKey.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header - Clickable */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-200"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600 rounded-lg">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-gray-900">Composio Integration</h3>
            <p className="text-sm text-gray-600">
              {connectedApps.filter((a) => a.status === 'active').length} apps connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            Active
          </span>
          {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </div>
      </button>

      {/* Content - Collapsible */}
      {isExpanded && (
        <div>
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('catalog')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'catalog'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Grid className="w-4 h-4 inline mr-1" />
                Catalog
              </button>
              <button
                onClick={() => setActiveTab('connected')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'connected'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Plug className="w-4 h-4 inline mr-1" />
                Connected ({connectedApps.length})
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Settings className="w-4 h-4 inline mr-1" />
                Settings
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === 'catalog' && (
              <div className="space-y-4">
                {/* Search */}
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search services..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Catalog Grid */}
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catalog.map((toolkit) => (
                      <ToolkitCard
                        key={toolkit.slug}
                        toolkit={toolkit}
                        isConnected={isConnected(toolkit.slug)}
                        onConnect={() => connectApp(toolkit)}
                        isConnecting={connectingApp === toolkit.slug}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {catalog.map((toolkit) => (
                      <ToolkitListItem
                        key={toolkit.slug}
                        toolkit={toolkit}
                        isConnected={isConnected(toolkit.slug)}
                        onConnect={() => connectApp(toolkit)}
                        isConnecting={connectingApp === toolkit.slug}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'connected' && (
              <div className="space-y-4">
                {connectedApps.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Cloud className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No connected apps yet</p>
                    <p className="text-sm mt-2">Go to Catalog to connect your first service</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <button
                        onClick={async () => {
                          try {
                            await composioApi.syncAllTools();
                            await refetchApps();
                            alert('All tools synced successfully!');
                          } catch (error: any) {
                            alert(error.response?.data?.error?.message || 'Failed to sync tools');
                          }
                        }}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                      >
                        <Cloud className="w-4 h-4" />
                        Sync All Tools
                      </button>
                    </div>
                    <div className="space-y-3">
                    {connectedApps.map((app) => (
                      <div
                        key={app.id}
                        className={`flex items-center justify-between p-4 border rounded-lg ${
                          app.status === 'active' ? 'border-green-200 bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {app.logo_url ? (
                            <img src={app.logo_url} alt={app.display_name} className="w-10 h-10 rounded object-contain" />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-500 font-bold">
                              {app.display_name[0]}
                            </div>
                          )}
                          <div>
                            <h4 className="font-medium text-gray-900">{app.display_name}</h4>
                            <div className="flex items-center gap-2 text-sm">
                              <StatusBadge status={app.status} />
                              <span className="text-gray-500">via Composio</span>
                            </div>
                            {app.error_message && (
                              <p className="text-xs text-red-600 mt-1">{app.error_message}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {app.status === 'pending' && (
                            <button
                              onClick={() => checkStatus(app.id)}
                              className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                            >
                              <Loader2 className="w-4 h-4 inline mr-1" />
                              Check Status
                            </button>
                          )}
                          
                          {app.status === 'active' && (
                            <button
                              onClick={() => syncTools(app.id)}
                              className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-md"
                            >
                              <Cloud className="w-4 h-4 inline mr-1" />
                              Sync Tools
                            </button>
                          )}

                          <button
                            onClick={() => disconnectApp(app)}
                            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="w-4 h-4 inline mr-1" />
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-green-900">Connected</h4>
                  </div>
                  <p className="text-sm text-green-800">
                    API Key: {config.api_key_preview}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Update API Key</h4>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="New API key..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={saveApiKey}
                      disabled={isSaving || !apiKey.trim()}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                    </button>
                  </div>
                </div>

                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <h4 className="text-sm font-medium text-red-900 mb-2">Danger Zone</h4>
                  <p className="text-sm text-red-700 mb-3">
                    Disconnecting will remove all Composio integrations and tools.
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure? This will disconnect all apps.')) return;
                      await composioApi.deleteComposioConfig();
                      await queryClient.invalidateQueries('composio-config');
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
                  >
                    Disconnect All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
    disconnected: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] || styles.disconnected}`}>
      {status}
    </span>
  );
}

// Toolkit Card Component
interface ToolkitCardProps {
  toolkit: Toolkit;
  isConnected: boolean;
  onConnect: () => void;
  isConnecting: boolean;
}

function ToolkitCard({ toolkit, isConnected, onConnect, isConnecting }: ToolkitCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {toolkit.logo ? (
            <img src={toolkit.logo} alt={toolkit.name} className="w-10 h-10 rounded object-contain" />
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-500 font-bold">
              {toolkit.name[0]}
            </div>
          )}
          <div>
            <h4 className="font-medium text-gray-900">{toolkit.name}</h4>
            <p className="text-xs text-gray-500">{toolkit.tools_count} tools</p>
          </div>
        </div>
        {isConnected && (
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        )}
      </div>

      {toolkit.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{toolkit.description}</p>
      )}

      <button
        onClick={onConnect}
        disabled={isConnected || isConnecting}
        className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isConnected
            ? 'bg-green-100 text-green-700 cursor-default'
            : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
        }`}
      >
        {isConnecting ? (
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
        ) : isConnected ? (
          'Connected'
        ) : (
          <>
            <Plus className="w-4 h-4 inline mr-1" />
            Connect
          </>
        )}
      </button>
    </div>
  );
}

// Toolkit List Item Component
function ToolkitListItem({ toolkit, isConnected, onConnect, isConnecting }: ToolkitCardProps) {
  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
      <div className="flex items-center gap-3">
        {toolkit.logo ? (
          <img src={toolkit.logo} alt={toolkit.name} className="w-8 h-8 rounded object-contain" />
        ) : (
          <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-sm font-bold">
            {toolkit.name[0]}
          </div>
        )}
        <div>
          <h4 className="font-medium text-gray-900">{toolkit.name}</h4>
          <p className="text-xs text-gray-500">{toolkit.tools_count} tools</p>
        </div>
      </div>

      <button
        onClick={onConnect}
        disabled={isConnected || isConnecting}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          isConnected ? 'text-green-700 bg-green-100' : 'text-purple-600 hover:bg-purple-50'
        }`}
      >
        {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : isConnected ? 'Connected' : 'Connect'}
      </button>
    </div>
  );
}
