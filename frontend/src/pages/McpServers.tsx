import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Server, Trash2, Loader2, CheckCircle2, XCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { mcpApi } from '../services/api'

interface McpServer {
  id: number
  name: string
  url: string
  authType: string
  enabled: boolean
  createdAt: number
}

export function McpServersPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newServer, setNewServer] = useState({ name: '', url: '', authType: 'none' })
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({})
  
  const { data: servers, isLoading, refetch } = useQuery<McpServer[]>('mcp-servers', async () => {
    const response = await mcpApi.list()
    return response.data.data
  })

  const handleCreate = async () => {
    if (!newServer.name || !newServer.url) return
    try {
      await mcpApi.create(newServer)
      setIsCreateModalOpen(false)
      setNewServer({ name: '', url: '', authType: 'none' })
      refetch()
    } catch (error) {
      alert('Failed to create MCP server')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this MCP server?')) return
    try {
      await mcpApi.delete(id)
      refetch()
    } catch (error) {
      alert('Failed to delete MCP server')
    }
  }

  const handleTest = async (server: McpServer) => {
    setTestingId(server.id)
    try {
      const response = await mcpApi.test(server.id)
      const result = response.data.data
      setTestResults(prev => ({
        ...prev,
        [server.id]: {
          success: result.reachable,
          message: result.reachable ? 'Connected successfully' : `Failed: ${result.error || 'Unknown error'}`
        }
      }))
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [server.id]: { success: false, message: 'Test failed' }
      }))
    } finally {
      setTestingId(null)
    }
  }

  const toggleEnabled = async (server: McpServer) => {
    try {
      await mcpApi.update(server.id, { enabled: !server.enabled })
      refetch()
    } catch (error) {
      alert('Failed to update MCP server')
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
          <h1 className="text-2xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground">Manage Model Context Protocol endpoints</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      {servers?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No MCP servers configured</h3>
          <p className="text-muted-foreground mt-1">Add your first MCP endpoint to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {servers?.map((server) => (
            <div
              key={server.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  server.enabled ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                }`}>
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{server.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">
                      {server.authType}
                    </span>
                  </div>
                  <a
                    href={server.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    {server.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {testResults[server.id] && (
                  <span className={`text-xs flex items-center gap-1 ${
                    testResults[server.id].success ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {testResults[server.id].success ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    {testResults[server.id].message}
                  </span>
                )}

                <button
                  onClick={() => handleTest(server)}
                  disabled={testingId === server.id}
                  className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50"
                  title="Test connection"
                >
                  {testingId === server.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>

                <button
                  onClick={() => toggleEnabled(server)}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    server.enabled
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {server.enabled ? 'Enabled' : 'Disabled'}
                </button>

                <button
                  onClick={() => handleDelete(server.id)}
                  className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add MCP Server</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                  placeholder="e.g., My MCP Server"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <input
                  type="text"
                  value={newServer.url}
                  onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                  placeholder="https://api.example.com/mcp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Authentication</label>
                <select
                  value={newServer.authType}
                  onChange={(e) => setNewServer({ ...newServer, authType: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                >
                  <option value="none">None</option>
                  <option value="api_key">API Key</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
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
                disabled={!newServer.name || !newServer.url}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
