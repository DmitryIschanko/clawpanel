import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Workflow, Play, Trash2, Edit, Loader2, Save, X } from 'lucide-react'
import { chainsApi } from '../services/api'
import type { Chain, ChainNode, ChainEdge } from '../types'

export function ChainsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingChain, setEditingChain] = useState<Chain | null>(null)
  
  const { data: chains, isLoading, refetch } = useQuery<Chain[]>(
    'chains',
    async () => {
      const response = await chainsApi.list()
      return response.data.data
    }
  )

  const handleRun = async (id: number) => {
    await chainsApi.run(id)
    refetch()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this chain?')) return
    await chainsApi.delete(id)
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chains</h1>
          <p className="text-muted-foreground">Build multi-agent workflows</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Create Chain
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : chains?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Workflow className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No chains yet</h3>
          <p className="text-muted-foreground mt-1">Create your first chain to orchestrate agents</p>
        </div>
      ) : (
        <div className="space-y-4">
          {chains?.map((chain) => (
            <div key={chain.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Workflow className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{chain.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {chain.nodes?.length || 0} steps · {chain.triggers?.length || 0} triggers
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRun(chain.id)}
                    className="p-2 rounded-lg hover:bg-muted"
                    title="Run chain"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingChain(chain)}
                    className="p-2 rounded-lg hover:bg-muted"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(chain.id)}
                    className="p-2 rounded-lg hover:bg-muted text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {chain.description && (
                <p className="text-sm text-muted-foreground mt-2">{chain.description}</p>
              )}

              {chain.nodes && chain.nodes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    {chain.nodes.map((node: any, index: number) => (
                      <div key={node.id} className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-muted text-xs">
                          {node.data?.agentId ? `Agent ${node.data.agentId}` : 'Step ' + (index + 1)}
                        </span>
                        {index < chain.nodes.length - 1 && (
                          <span className="text-muted-foreground">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <ChainModal
          onClose={() => setIsCreateModalOpen(false)}
          onSave={async (data) => {
            await chainsApi.create(data)
            setIsCreateModalOpen(false)
            refetch()
          }}
        />
      )}

      {editingChain && (
        <ChainModal
          chain={editingChain}
          onClose={() => setEditingChain(null)}
          onSave={async (data) => {
            await chainsApi.update(editingChain.id, data)
            setEditingChain(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function ChainModal({
  chain,
  onClose,
  onSave,
}: {
  chain?: Chain
  onClose: () => void
  onSave: (data: Partial<Chain>) => void
}) {
  const [formData, setFormData] = useState<Partial<Chain>>({
    name: chain?.name || '',
    description: chain?.description || '',
    nodes: chain?.nodes || [],
    edges: chain?.edges || [],
    triggers: chain?.triggers || [],
    enabled: chain?.enabled ?? true,
  })
  const [newStep, setNewStep] = useState({ agentId: '', instruction: '' })

  const addStep = () => {
    if (!newStep.agentId) return
    const node: ChainNode = {
      id: `node-${Date.now()}`,
      type: 'agent',
      position: { x: 0, y: 0 },
      data: {
        agentId: parseInt(newStep.agentId),
        instruction: newStep.instruction,
        outputMode: 'full',
      },
    }
    setFormData({
      ...formData,
      nodes: [...(formData.nodes || []), node],
    })
    setNewStep({ agentId: '', instruction: '' })
  }

  const removeStep = (index: number) => {
    setFormData({
      ...formData,
      nodes: formData.nodes?.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{chain ? 'Edit Chain' : 'Create Chain'}</h2>
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
              placeholder="My Workflow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              placeholder="Describe what this chain does..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Steps</label>
            <div className="space-y-2 mb-4">
              {formData.nodes?.map((node: any, index: number) => (
                <div key={node.id} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <div>
                    <span className="font-medium">Step {index + 1}:</span>
                    <span className="ml-2">Agent {node.data?.agentId}</span>
                    {node.data?.instruction && (
                      <p className="text-sm text-muted-foreground">{node.data.instruction}</p>
                    )}
                  </div>
                  <button onClick={() => removeStep(index)} className="p-1 rounded hover:bg-muted text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Agent ID"
                value={newStep.agentId}
                onChange={(e) => setNewStep({ ...newStep, agentId: e.target.value })}
                className="w-24 px-3 py-2 rounded-lg bg-secondary border border-border"
              />
              <input
                type="text"
                placeholder="Instruction (optional)"
                value={newStep.instruction}
                onChange={(e) => setNewStep({ ...newStep, instruction: e.target.value })}
                className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border"
              />
              <button onClick={addStep} className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80">
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="enabled" className="text-sm">Enabled</label>
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
            {chain ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
