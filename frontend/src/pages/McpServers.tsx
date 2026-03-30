import { useState } from 'react'
import { useQuery } from 'react-query'
import { 
  Plus, 
  Server, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  FileJson, 
  Terminal, 
  Globe,
  Settings,
  Package,
  AlertCircle,
} from 'lucide-react'
import { mcpApi } from '../services/api'
import type { McpServer } from '../types'
import { McpGuide } from '../components/McpGuide'

interface BuiltinServer {
  name: string
  description: string
  transport_type: 'stdio'
  command: string
  args: string[]
  installCommand?: string
}

export function McpServersPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isBuiltinModalOpen, setIsBuiltinModalOpen] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  
  // Form state
  const [newServer, setNewServer] = useState<{
    name: string
    description: string
    transportType: 'stdio' | 'http' | 'websocket'
    command: string
    args: string
    url: string
    env: string
  }>({
    name: '',
    description: '',
    transportType: 'stdio',
    command: '',
    args: '',
    url: '',
    env: '',
  })
  
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({})
  
  const { data: servers, isLoading, refetch } = useQuery<McpServer[]>('mcp-servers', async () => {
    const response = await mcpApi.list()
    return response.data.data
  })

  const { data: builtinServers } = useQuery<BuiltinServer[]>('mcp-builtin', async () => {
    const response = await mcpApi.getBuiltin()
    return response.data.data
  }, {
    enabled: isBuiltinModalOpen,
  })

  const handleCreate = async () => {
    if (!newServer.name) return
    
    // Validation
    if (newServer.transportType === 'stdio' && !newServer.command) {
      alert('Command is required for stdio transport')
      return
    }
    if (newServer.transportType === 'http' && !newServer.url) {
      alert('URL is required for http transport')
      return
    }
    
    try {
      const payload: any = {
        name: newServer.name,
        description: newServer.description,
        transportType: newServer.transportType,
      }
      
      if (newServer.transportType === 'stdio') {
        payload.command = newServer.command
        payload.args = newServer.args ? newServer.args.split(' ').filter(a => a.trim()) : []
      } else if (newServer.transportType === 'http') {
        payload.url = newServer.url
      }
      
      if (newServer.env) {
        try {
          payload.env = JSON.parse(newServer.env)
        } catch {
          alert('Invalid JSON in Environment Variables field')
          return
        }
      }
      
      await mcpApi.create(payload)
      setIsCreateModalOpen(false)
      setNewServer({
        name: '',
        description: '',
        transportType: 'stdio',
        command: '',
        args: '',
        url: '',
        env: '',
      })
      refetch()
    } catch (error: any) {
      alert('Failed to create MCP server: ' + (error.response?.data?.error?.message || error.message))
    }
  }

  const handleInstallBuiltin = async (server: BuiltinServer) => {
    try {
      await mcpApi.create({
        name: server.name,
        description: server.description,
        transportType: 'stdio',
        command: server.command,
        args: server.args,
      })
      setIsBuiltinModalOpen(false)
      refetch()
    } catch (error: any) {
      alert('Failed to install: ' + (error.response?.data?.error?.message || error.message))
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

  const handleImportJson = async () => {
    if (!importJson.trim()) return
    setIsImporting(true)
    try {
      const config = JSON.parse(importJson)
      await mcpApi.importJson({ 
        name: config.name || 'Imported MCP Server', 
        configJson: importJson 
      })
      setIsImportModalOpen(false)
      setImportJson('')
      refetch()
    } catch (error: any) {
      alert('Failed to import: ' + (error.response?.data?.error?.message || error.message))
    } finally {
      setIsImporting(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await mcpApi.sync()
      alert('MCP servers synced to OpenClaw successfully')
    } catch (error) {
      alert('Failed to sync MCP servers')
    } finally {
      setIsSyncing(false)
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

  const getTransportIcon = (type: string) => {
    switch (type) {
      case 'stdio':
        return <Terminal className="w-4 h-4" />
      case 'http':
        return <Globe className="w-4 h-4" />
      default:
        return <Server className="w-4 h-4" />
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
          <p className="text-muted-foreground">
            Manage Model Context Protocol servers for OpenClaw
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50"
            title="Sync all servers to mcporter.json"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync to OpenClaw
          </button>
          <button
            onClick={() => setIsBuiltinModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
          >
            <Package className="w-4 h-4" />
            Built-in
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
          >
            <FileJson className="w-4 h-4" />
            Import JSON
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Guide for non-developers */}
      <McpGuide />

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-500">OpenClaw MCP Integration</p>
          <p className="text-muted-foreground mt-1">
            MCP servers are configured in OpenClaw using the <code className="bg-secondary px-1 py-0.5 rounded">mcporter</code> skill.
            Use <strong>stdio</strong> transport for local MCP servers (npx, python) and <strong>http</strong> transport for remote servers via mcp-remote bridge.
            <br />
            <strong>👆 Разверните "Руководство по MCP" выше для подробной инструкции!</strong>
          </p>
        </div>
      </div>

      {servers?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No MCP servers configured</h3>
          <p className="text-muted-foreground mt-1">
            Add your first MCP server or import from pulsemcp.com
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {servers?.map((server) => (
            <div
              key={server.id}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    server.enabled ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                  }`}>
                    {getTransportIcon(server.transportType)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{server.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary flex items-center gap-1">
                        {getTransportIcon(server.transportType)}
                        {server.transportType}
                      </span>
                      {server.isBuiltin && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                          Built-in
                        </span>
                      )}
                    </div>
                    {server.description && (
                      <p className="text-sm text-muted-foreground mt-1">{server.description}</p>
                    )}
                    
                    {/* Transport details */}
                    <div className="mt-2 space-y-1">
                      {server.transportType === 'stdio' && server.command && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {server.command} {server.args?.join(' ')}
                        </p>
                      )}
                      {server.transportType === 'http' && server.url && (
                        <p className="text-xs text-muted-foreground font-mono">{server.url}</p>
                      )}
                    </div>
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
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
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
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={newServer.description}
                  onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                  placeholder="What does this server do?"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Transport Type</label>
                <select
                  value={newServer.transportType}
                  onChange={(e) => setNewServer({ ...newServer, transportType: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                >
                  <option value="stdio">stdio (local command)</option>
                  <option value="http">http (remote via mcp-remote)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Use <strong>stdio</strong> for local MCP servers (npx, python). 
                  Use <strong>http</strong> for remote servers.
                </p>
              </div>
              
              {newServer.transportType === 'stdio' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Command</label>
                    <input
                      type="text"
                      value={newServer.command}
                      onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border font-mono"
                      placeholder="npx"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      The command to run (e.g., npx, python, node)
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Arguments (space-separated)</label>
                    <input
                      type="text"
                      value={newServer.args}
                      onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border font-mono"
                      placeholder="-y @modelcontextprotocol/server-filesystem /path"
                    />
                  </div>
                </>
              )}
              
              {newServer.transportType === 'http' && (
                <div>
                  <label className="block text-sm font-medium mb-1">URL</label>
                  <input
                    type="text"
                    value={newServer.url}
                    onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border font-mono"
                    placeholder="https://api.example.com/mcp"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Will use <code className="bg-secondary px-1 rounded">mcp-remote</code> bridge
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">Environment Variables (JSON)</label>
                <textarea
                  value={newServer.env}
                  onChange={(e) => setNewServer({ ...newServer, env: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border font-mono text-sm"
                  placeholder={`{\n  "API_KEY": "your-key",\n  "DEBUG": "true"\n}`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional JSON object with environment variables
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
                disabled={!newServer.name}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Built-in Modal */}
      {isBuiltinModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Built-in MCP Servers</h2>
                <p className="text-sm text-muted-foreground">
                  Pre-configured MCP servers for common use cases
                </p>
              </div>
              <button
                onClick={() => setIsBuiltinModalOpen(false)}
                className="p-2 rounded-lg hover:bg-muted"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              {builtinServers?.map((server) => (
                <div
                  key={server.name}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted"
                >
                  <div>
                    <h3 className="font-medium">{server.name}</h3>
                    <p className="text-sm text-muted-foreground">{server.description}</p>
                    <code className="text-xs bg-secondary px-2 py-1 rounded mt-2 inline-block">
                      {server.command} {server.args.join(' ')}
                    </code>
                  </div>
                  <button
                    onClick={() => handleInstallBuiltin(server)}
                    disabled={servers?.some(s => s.name === server.name)}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {servers?.some(s => s.name === server.name) ? 'Installed' : 'Install'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Import MCP Server from JSON</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Paste MCP server configuration from{' '}
              <a 
                href="https://www.pulsemcp.com/servers" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                pulsemcp.com
              </a>
              {' '}or other sources
            </p>
            <div className="space-y-4">
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border font-mono text-sm"
                rows={12}
                placeholder={`{
  "name": "My MCP Server",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
  "env": {
    "API_KEY": "your-key"
  }
}`}
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleImportJson}
                disabled={!importJson.trim() || isImporting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
