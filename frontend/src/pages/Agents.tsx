import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Search, Bot, MoreVertical, Edit, Trash2, Loader2, Save, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { agentsApi } from '../services/api'
import { formatDate } from '../lib/utils'
import type { Agent } from '../types'

export function AgentsPage() {
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  
  const { data: agents, isLoading, refetch } = useQuery<Agent[]>(
    'agents',
    async () => {
      const response = await agentsApi.list({ search })
      return response.data.data
    }
  )

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this agent?')) return
    await agentsApi.delete(id)
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground">Manage your AI agents</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Create Agent
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : agents?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No agents yet</h3>
          <p className="text-muted-foreground mt-1">Create your first agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents?.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={() => setEditingAgent(agent)}
              onDelete={() => handleDelete(agent.id)}
            />
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <AgentModal
          onClose={() => setIsCreateModalOpen(false)}
          onSave={async (data) => {
            await agentsApi.create(data)
            setIsCreateModalOpen(false)
            refetch()
          }}
        />
      )}

      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSave={async (data) => {
            await agentsApi.update(editingAgent.id, data)
            setEditingAgent(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: Agent
  onEdit: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: agent.color }}
          >
            <Bot className="w-5 h-5 text-black/70" />
          </div>
          <div>
            <h3 className="font-semibold">{agent.name}</h3>
            <p className="text-sm text-muted-foreground">{agent.role || 'No role'}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-muted"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-32 bg-card border border-border rounded-lg shadow-lg z-10">
              <button
                onClick={() => { onEdit(); setShowMenu(false) }}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm w-full"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => { onDelete(); setShowMenu(false) }}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm text-destructive w-full"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
        {agent.description || 'No description'}
      </p>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <span>Model: {agent.model || 'Default'}</span>
        <span>T: {agent.temperature}</span>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Updated {formatDate(agent.updated_at)}
        </span>
        <Link
          to={`/agents/${agent.id}`}
          className="text-sm text-primary hover:underline"
        >
          Configure →
        </Link>
      </div>
    </div>
  )
}

function AgentModal({
  agent,
  onClose,
  onSave,
}: {
  agent?: Agent
  onClose: () => void
  onSave: (data: Partial<Agent>) => void
}) {
  const [formData, setFormData] = useState<Partial<Agent>>({
    name: agent?.name || '',
    role: agent?.role || '',
    description: agent?.description || '',
    color: agent?.color || '#e8ff5a',
    model: agent?.model || '',
    temperature: agent?.temperature ?? 0.7,
    max_tokens: agent?.max_tokens ?? 4096,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{agent ? 'Edit Agent' : 'Create Agent'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              placeholder="Agent name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              placeholder="e.g., Developer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              placeholder="Describe what this agent does..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-10 h-10 rounded border-0 p-0"
                />
                <span className="text-sm text-muted-foreground">{formData.color}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              <select
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              >
                <option value="">Default</option>
                <option value="anthropic/claude-opus-4">Claude Opus 4</option>
                <option value="openai/gpt-4o">GPT-4o</option>
                <option value="google/gemini-2.0-flash">Gemini 2.0 Flash</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Temperature</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Max Tokens</label>
              <input
                type="number"
                value={formData.max_tokens}
                onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80">
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            disabled={!formData.name}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {agent ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
