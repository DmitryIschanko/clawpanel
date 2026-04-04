import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Loader2, CheckCircle2, Server, Globe, Clock, Webhook, Cloud, Wrench } from 'lucide-react'
import { agentsApi } from '../services/api'
import type { Tool } from '../types'

interface AgentToolsProps {
  agentId: number
}

const toolIcons = {
  browser: Globe,
  cron: Clock,
  webhook: Webhook,
  mcp: Server,
  composio: Cloud,
}

const sourceLabels = {
  native: 'Native',
  mcp: 'MCP Server',
  composio: 'Composio',
}

const sourceColors = {
  native: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  mcp: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  composio: 'bg-green-500/10 text-green-500 border-green-500/20',
}

export function AgentTools({ agentId }: AgentToolsProps) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)

  const { data: tools, isLoading } = useQuery<Tool[]>(
    ['agent-tools', agentId],
    async () => {
      const response = await agentsApi.getTools(agentId)
      return response.data.data
    }
  )

  const updateToolsMutation = useMutation(
    async (toolIds: number[]) => {
      await agentsApi.updateTools(agentId, toolIds)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['agent-tools', agentId])
      },
    }
  )

  const handleToggleTool = async (toolId: number, isAssigned: boolean) => {
    if (saving) return
    setSaving(true)

    try {
      const currentAssigned = tools?.filter(t => t.isAssigned).map(t => t.id) || []
      let newAssigned: number[]

      if (isAssigned) {
        // Remove tool
        newAssigned = currentAssigned.filter(id => id !== toolId)
      } else {
        // Add tool
        newAssigned = [...currentAssigned, toolId]
      }

      await updateToolsMutation.mutateAsync(newAssigned)
    } finally {
      setSaving(false)
    }
  }

  // Group tools by source
  const groupedTools = tools?.reduce((acc, tool) => {
    const source = tool.source || 'native'
    if (!acc[source]) acc[source] = []
    acc[source].push(tool)
    return acc
  }, {} as Record<string, Tool[]>)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const sources = ['native', 'mcp', 'composio'] as const

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Assigned Tools
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select tools that this agent can use. Tools are grouped by source.
          </p>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        )}
      </div>

      {tools?.length === 0 ? (
        <div className="text-center py-12 bg-muted/50 rounded-lg border border-dashed">
          <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="text-lg font-medium">No tools available</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Configure tools in the Tools page first
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sources.map((source) => {
            const sourceTools = groupedTools?.[source] || []
            if (sourceTools.length === 0) return null

            return (
              <div key={source} className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {sourceLabels[source]} ({sourceTools.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sourceTools.map((tool) => {
                    const Icon = toolIcons[tool.type] || Wrench
                    return (
                      <div
                        key={tool.id}
                        onClick={() => handleToggleTool(tool.id, tool.isAssigned || false)}
                        className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          tool.isAssigned
                            ? sourceColors[source]
                            : 'bg-card border-border hover:border-muted-foreground/50'
                        } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            tool.isAssigned ? 'bg-white/20' : 'bg-muted'
                          }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium truncate">{tool.name}</h5>
                              {tool.isAssigned && (
                                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                              )}
                            </div>
                            {tool.description && (
                              <p className={`text-sm mt-1 line-clamp-2 ${
                                tool.isAssigned ? 'text-current/80' : 'text-muted-foreground'
                              }`}>
                                {tool.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {tool.mcpServerName && (
                                <span className="text-xs px-2 py-0.5 rounded bg-white/20">
                                  {tool.mcpServerName}
                                </span>
                              )}
                              {tool.composioAppName && (
                                <span className="text-xs px-2 py-0.5 rounded bg-white/20">
                                  {tool.composioAppName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {tools && tools.length > 0 && (
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{tools.filter(t => t.isAssigned).length}</span> of{' '}
            <span className="font-medium">{tools.length}</span> tools assigned to this agent
          </p>
        </div>
      )}
    </div>
  )
}
