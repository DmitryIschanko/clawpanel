import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { 
  Cloud, 
  ChevronDown, 
  ChevronRight, 
  ToggleLeft, 
  ToggleRight,
  CheckSquare,
  Square,
  Loader2,
  Server
} from 'lucide-react';
import { toolsApi, agentsApi } from '../services/api';

interface ComposioTool {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  agentId: number | null;
}

interface ComposioAppGroup {
  appId: number;
  appName: string;
  toolkitSlug: string;
  logoUrl: string | null;
  totalTools: number;
  enabledTools: number;
  tools: ComposioTool[];
}

interface Agent {
  id: number;
  name: string;
}

export function ComposioToolsManager() {
  const [expandedApps, setExpandedApps] = useState<Set<number>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<number>(0);
  const [updatingApps, setUpdatingApps] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  // Fetch grouped tools
  const { data: groupedData, isLoading: groupsLoading } = useQuery<ComposioAppGroup[]>(
    'composio-tools-grouped',
    async () => {
      const response = await toolsApi.getGroupedByApp();
      return response.data.data || [];
    }
  );

  // Fetch agents for assignment
  const { data: agentsData } = useQuery<Agent[]>('agents-list', async () => {
    const response = await agentsApi.list();
    return response.data.data || [];
  });

  const apps = groupedData || [];
  const agents = agentsData || [];

  const toggleApp = (appId: number) => {
    setExpandedApps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(appId)) {
        newSet.delete(appId);
      } else {
        newSet.add(appId);
      }
      return newSet;
    });
  };

  const handleBulkToggle = async (appId: number, enable: boolean) => {
    setUpdatingApps(prev => new Set(prev).add(appId));
    try {
      await toolsApi.bulkUpdateByApp(appId, {
        enabled: enable,
        agentId: selectedAgent > 0 ? selectedAgent : undefined,
      });
      await queryClient.invalidateQueries('composio-tools-grouped');
    } catch (error) {
      console.error('Failed to update tools:', error);
      alert('Failed to update tools');
    } finally {
      setUpdatingApps(prev => {
        const newSet = new Set(prev);
        newSet.delete(appId);
        return newSet;
      });
    }
  };

  const handleToolToggle = async (toolId: number, currentEnabled: boolean) => {
    try {
      await toolsApi.update(toolId, {
        enabled: !currentEnabled,
        agentId: selectedAgent > 0 ? selectedAgent : undefined,
      });
      await queryClient.invalidateQueries('composio-tools-grouped');
    } catch (error) {
      console.error('Failed to update tool:', error);
      alert('Failed to update tool');
    }
  };

  if (groupsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Cloud className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No Composio apps connected</p>
        <p className="text-sm mt-2">Connect apps in MCP → Composio → Catalog</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agent selector */}
      <div className="bg-card border border-border rounded-lg p-4">
        <label className="block text-sm font-medium mb-2">Assign tools to agent</label>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(parseInt(e.target.value))}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
        >
          <option value={0}>All agents (global)</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Tools will be assigned to selected agent when enabled
        </p>
      </div>

      {/* App groups */}
      <div className="space-y-3">
        {apps.map((app) => {
          const isExpanded = expandedApps.has(app.appId);
          const isUpdating = updatingApps.has(app.appId);
          const allEnabled = app.enabledTools === app.totalTools;
          const someEnabled = app.enabledTools > 0 && !allEnabled;

          return (
            <div
              key={app.appId}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              {/* App header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => toggleApp(app.appId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                  
                  {app.logoUrl ? (
                    <img
                      src={app.logoUrl}
                      alt={app.appName}
                      className="w-8 h-8 rounded object-contain"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <Server className="w-4 h-4 text-primary" />
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium">{app.appName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {app.enabledTools} / {app.totalTools} tools enabled
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Enable/Disable all buttons */}
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {!allEnabled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBulkToggle(app.appId, true);
                          }}
                          className="px-3 py-1.5 text-xs bg-green-500/10 text-green-500 rounded hover:bg-green-500/20 transition-colors"
                        >
                          Enable all
                        </button>
                      )}
                      {app.enabledTools > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBulkToggle(app.appId, false);
                          }}
                          className="px-3 py-1.5 text-xs bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors"
                        >
                          Disable all
                        </button>
                      )}
                    </>
                  )}

                  {/* Status indicator */}
                  <div className="ml-2">
                    {allEnabled ? (
                      <ToggleRight className="w-6 h-6 text-green-500" />
                    ) : someEnabled ? (
                      <div className="w-6 h-6 rounded-full border-2 border-yellow-500 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      </div>
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Tools list (collapsible) */}
              {isExpanded && (
                <div className="border-t border-border">
                  <div className="max-h-96 overflow-y-auto">
                    {app.tools.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors border-b border-border last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{tool.name}</p>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {tool.description}
                            </p>
                          )}
                          {tool.agentId && (
                            <p className="text-xs text-blue-500">
                              Assigned to: {agents.find(a => a.id === tool.agentId)?.name || `Agent #${tool.agentId}`}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => handleToolToggle(tool.id, tool.enabled)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                            tool.enabled
                              ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                              : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                          }`}
                        >
                          {tool.enabled ? (
                            <>
                              <CheckSquare className="w-4 h-4" />
                              Enabled
                            </>
                          ) : (
                            <>
                              <Square className="w-4 h-4" />
                              Disabled
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="bg-secondary/50 rounded-lg p-4 text-sm text-muted-foreground">
        <p>
          Total: {apps.reduce((acc, app) => acc + app.totalTools, 0)} tools across {apps.length} apps
        </p>
        <p>
          Enabled: {apps.reduce((acc, app) => acc + app.enabledTools, 0)} tools
        </p>
      </div>
    </div>
  );
}
