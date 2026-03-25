import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Globe, Clock, Webhook, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { toolsApi } from '../services/api'

interface Tool {
  id: number
  name: string
  type: 'browser' | 'cron' | 'webhook'
  config: any
  enabled: boolean
  agentId?: number
  createdAt: number
}

const toolIcons = {
  browser: Globe,
  cron: Clock,
  webhook: Webhook,
}

const toolLabels = {
  browser: 'Browser (Chromium)',
  cron: 'Cron Job',
  webhook: 'Webhook',
}

export function ToolsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTool, setNewTool] = useState({ name: '', type: 'browser' as const, config: {} })
  
  const { data: tools, isLoading, refetch } = useQuery<Tool[]>('tools', async () => {
    const response = await toolsApi.list()
    return response.data.data
  })

  const handleCreate = async () => {
    if (!newTool.name) return
    try {
      await toolsApi.create(newTool)
      setIsCreateModalOpen(false)
      setNewTool({ name: '', type: 'browser', config: {} })
      refetch()
    } catch (error) {
      alert('Failed to create tool')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this tool?')) return
    try {
      await toolsApi.delete(id)
      refetch()
    } catch (error) {
      alert('Failed to delete tool')
    }
  }

  const toggleEnabled = async (tool: Tool) => {
    try {
      await toolsApi.update(tool.id, { enabled: !tool.enabled })
      refetch()
    } catch (error) {
      alert('Failed to update tool')
    }
  }

  if (isLoading) {
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
          <p className="text-muted-foreground">Manage built-in tools (Browser, Cron, Webhooks)</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Tool
        </button>
      </div>

      {tools?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No tools configured</h3>
          <p className="text-muted-foreground mt-1">Add your first tool to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tools?.map((tool) => {
            const Icon = toolIcons[tool.type]
            return (
              <div
                key={tool.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
              >
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
                        {toolLabels[tool.type]}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tool.enabled ? 'Active' : 'Disabled'}
                      {tool.agentId && ` • Assigned to agent #${tool.agentId}`}
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
                    onClick={() => handleDelete(tool.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
