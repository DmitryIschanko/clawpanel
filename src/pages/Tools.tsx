import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Globe, Clock, Webhook, Trash2, Loader2, CheckCircle2, Bot, Server, Cloud, Filter } from 'lucide-react'
import { toolsApi, agentsApi } from '../services/api'
import type { Tool } from '../types'

interface Agent {
  id: number
  name: string
}

type ToolSource = 'all' | 'native' | 'mcp' | 'composio'

const toolIcons = {
  browser: Globe,
  cron: Clock,
  webhook: Webhook,
  mcp: Server,
  composio: Cloud,
}

const toolLabels = {
  browser: 'Browser (Chromium)',
  cron: 'Cron Job',
  webhook: 'Webhook',
  mcp: 'MCP Tool',
  composio: 'Composio Tool',
}

const sourceLabels = {
  native: 'Native',
  mcp: 'MCP',
  composio: 'Composio',
}

const sourceColors = {
  native: 'bg-blue-500/10 text-blue-500',
  mcp: 'bg-purple-500/10 text-purple-500',
  composio: 'bg-green-500/10 text-green-500',
}

export function ToolsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTool, setNewTool] = useState({ name: '', type: 'browser' as const, agentId: 0, config: {} })
  const [sourceFilter, setSourceFilter] = useState<ToolSource>('all')
  
  const { data: tools, isLoading: toolsLoading, refetch: refetchTools } = useQuery<Tool[]>('tools', async () => {
    const response = await toolsApi.list()
    return response.data.data
  })

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>('agents-list', async () => {
    const response = await agentsApi.list()
    return response.data.data
  })

  const getAgentName = (agentId?: number) => {
    if (!agentId) return null
    const agent = agents?.find(a => a.id === agentId)
    return agent?.name || `Agent #${agentId}`
  }

  const handleCreate = async () => {
    if (!newTool.name) return
    try {
      const data: any = { name: newTool.name, type: newTool.type, config: {} }
      if (newTool.agentId > 0) {
        data.agentId = newTool.agentId
      }
      await toolsApi.create(data)
      setIsCreateModalOpen(false)
      setNewTool({ name: '', type: 'browser', agentId: 0, config: {} })
      refetchTools()
    } catch (error) {
      alert('Failed to create tool')
    }
  }

  const handleDelete = async (id: number, source?: string) => {
    if (source === 'mcp' || source === 'composio') {
      alert('External tools cannot be deleted. Disable the source (MCP server or Composio app) instead.')
      return
    }
    if (!confirm('Delete this tool?')) return
    try {
      await toolsApi.delete(id)
      refetchTools()
    } catch (error) {
      alert('Failed to delete tool')
    }
  }

  const toggleEnabled = async (tool: Tool) => {
    try {
      await toolsApi.update(tool.id, { enabled: !tool.enabled })
      refetchTools()
    } catch (error) {
      alert('Failed to update tool')
    }
  }

  const assignAgent = async (toolId: number, agentId: number) => {
    try {
      await toolsApi.update(toolId, { agentId: agentId > 0 ? agentId : null })
      refetchTools()
    } catch (error) {
      alert('Failed to assign agent')
    }
  }

  // Filter tools by source
  const filteredTools = tools?.filter(tool => {
    if (sourceFilter === 'all') return true
    return tool.source === sourceFilter
  })

  if (toolsLoading || agentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-muted-foreground">Manage tools - built-in (Browser, Cron, Webhooks), MCP and Composio tools</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Tool
        </button>
      </div>

      {/* Source Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Filter by source:</span>
        <div className="flex gap-1">
          {(['all', 'native', 'mcp', 'composio'] as ToolSource[]).map((source) => (
            <button
              key={source}
              onClick={() => setSourceFilter(source)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                sourceFilter === source
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary hover:bg-secondary/80'
              }`}
            >
              {source === 'all' ? 'All' : sourceLabels[source]}
            </button>
          ))}
        </div>
      </div>

      {filteredTools?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No tools found</h3>
          <p className="text-muted-foreground mt-1">
            {sourceFilter === 'all' ? 'Add your first tool to get started' : `No ${sourceLabels[sourceFilter]} tools found`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTools?.map((tool) => {
            const Icon = toolIcons[tool.type] || Server
            const agentName = getAgentName(tool.agentId)
            const isExternal = tool.source === 'mcp' || tool.source === 'composio'
            return (
              <div
                key={tool.id}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      tool.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{tool.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">
                          {toolLabels[tool.type] || tool.type}
                        </span>
                        {/* Source badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sourceColors[tool.source || 'native']}`}>
                          {sourceLabels[tool.source || 'native']}
                        </span>
                        {/* MCP/Composio specific badge */}
                        {tool.mcpServerName && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500">
                            MCP: {tool.mcpServerName}
                          </span>
                        )}
                        {tool.composioAppName && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
                            {tool.composioAppName}
                          </span>
                        )}
                      </div>
                      {tool.description && (
                        <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {tool.enabled ? 'Active' : 'Disabled'}
                        {agentName && (
                          <span className="ml-2 text-green-500">• {agentName}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {tool.enabled && (
                      <span className="text-green-500">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    )}

                    <button
                      onClick={() => toggleEnabled(tool)}
                      className={`px-3 py-1 rounded-lg text-sm ${
                        tool.enabled
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tool.enabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <button
                      onClick={() => handleDelete(tool.id, tool.source)}
                      className={`p-2 rounded-lg ${
                        isExternal
                          ? 'text-muted-foreground cursor-not-allowed'
                          : 'hover:bg-destructive/10 text-destructive'
                      }`}
                      title={isExternal ? 'External tools cannot be deleted directly' : 'Delete tool'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Agent assignment */}
                <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Assign to agent:</span>
                  <select
                    value={tool.agentId || 0}
                    onChange={(e) => assignAgent(tool.id, parseInt(e.target.value))}
                    className="px-3 py-1 rounded-lg bg-secondary border border-border text-sm"
                  >
                    <option value={0}>All agents (global)</option>
                    {agents?.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add Tool</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newTool.name}
                  onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                  placeholder="e.g., My Browser Tool"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newTool.type}
                  onChange={(e) => setNewTool({ ...newTool, type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                >
                  <option value="browser">Browser (Chromium)</option>
                  <option value="cron">Cron Job</option>
                  <option value="webhook">Webhook</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Assign to Agent</label>
                <select
                  value={newTool.agentId}
                  onChange={(e) => setNewTool({ ...newTool, agentId: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                >
                  <option value={0}>All agents (global)</option>
                  {agents?.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  If not assigned, tool will be available to all agents
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTool.name}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Add Tool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
