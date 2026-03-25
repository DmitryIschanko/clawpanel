import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { Bot, Save, Loader2, CheckCircle2 } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { agentsApi } from '../services/api'
import { AgentSkills } from '../components/AgentSkills'
import type { Agent } from '../types'

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const queryClient = useQueryClient()
  
  const [activeTab, setActiveTab] = useState<'general' | 'prompt' | 'soul' | 'skills'>('general')
  const [agentsMd, setAgentsMd] = useState('')
  const [soulMd, setSoulMd] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  
  // General form state
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    description: '',
    model: '',
    temperature: 0.7,
    max_tokens: 4096,
  })

  const { data: agent, isLoading } = useQuery<Agent>(
    ['agent', id],
    async () => {
      if (isNew) return null
      const response = await agentsApi.get(Number(id))
      return response.data.data
    },
    { enabled: !isNew }
  )

  // Load agent data into form
  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name || '',
        role: agent.role || '',
        description: agent.description || '',
        model: agent.model || '',
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.max_tokens ?? 4096,
      })
    }
  }, [agent])

  // Load AGENTS.md
  useQuery(
    ['agents-md', id],
    async () => {
      if (isNew) return null
      const response = await agentsApi.getAgentsMd(Number(id))
      setAgentsMd(response.data.data.content)
      return response.data.data
    },
    { enabled: !isNew && activeTab === 'prompt' }
  )

  // Load SOUL.md
  useQuery(
    ['soul-md', id],
    async () => {
      if (isNew) return null
      const response = await agentsApi.getSoulMd(Number(id))
      setSoulMd(response.data.data.content)
      return response.data.data
    },
    { enabled: !isNew && activeTab === 'soul' }
  )

  const handleSave = async () => {
    if (isNew) return
    
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      if (activeTab === 'general') {
        await agentsApi.update(Number(id), {
          name: formData.name,
          role: formData.role,
          description: formData.description,
          model: formData.model,
          temperature: formData.temperature,
          max_tokens: formData.max_tokens,
        })
        // Refresh agent data
        queryClient.invalidateQueries(['agent', id])
      } else if (activeTab === 'prompt') {
        await agentsApi.updateAgentsMd(Number(id), agentsMd)
      } else if (activeTab === 'soul') {
        await agentsApi.updateSoulMd(Number(id), soulMd)
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Save failed:', error)
      alert('Failed to save changes')
    } finally {
      setIsSaving(false)
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
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: agent?.color || '#e8ff5a' }}
          >
            <Bot className="w-6 h-6 text-black/70" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isNew ? 'Create Agent' : (formData.name || agent?.name)}
            </h1>
            <p className="text-muted-foreground">
              {isNew ? 'Configure your new agent' : (formData.description || agent?.description)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-green-500 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['general', 'prompt', 'soul', 'skills'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {activeTab === 'general' && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-3 gap-4">
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
                  <option value="kimi/kimi-code">Kimi Code</option>
                </select>
              </div>
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
        )}

        {activeTab === 'prompt' && (
          <div className="h-[600px]">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={agentsMd}
              onChange={(value) => setAgentsMd(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
              }}
            />
          </div>
        )}

        {activeTab === 'soul' && (
          <div className="h-[600px]">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              value={soulMd}
              onChange={(value) => setSoulMd(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
              }}
            />
          </div>
        )}

        {activeTab === 'skills' && !isNew && (
          <AgentSkills agentId={Number(id)} />
        )}
      </div>
    </div>
  )
}
