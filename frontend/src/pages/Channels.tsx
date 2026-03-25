import { useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { Radio, Plus, Trash2, Loader2, Save, X, CheckCircle, AlertCircle, RefreshCw, Bot } from 'lucide-react'
import { channelsApi, agentsApi } from '../services/api'
import type { Channel } from '../types'

const CHANNEL_TYPES = [
  { id: 'telegram', name: 'Telegram', icon: '📱' },
  { id: 'discord', name: 'Discord', icon: '🎮' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
  { id: 'slack', name: 'Slack', icon: '💼' },
  { id: 'signal', name: 'Signal', icon: '🔒' },
  { id: 'msteams', name: 'Microsoft Teams', icon: '👥' },
]

const DM_POLICIES = [
  { value: 'pairing', label: 'Pairing Required', description: 'Users must pair with agent first' },
  { value: 'open', label: 'Open', description: 'Anyone can message the agent' },
  { value: 'restricted', label: 'Restricted', description: 'Only whitelisted users can message' },
]

export function ChannelsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const queryClient = useQueryClient()

  const { data: channels, isLoading, refetch } = useQuery<Channel[]>(
    'channels',
    async () => {
      const response = await channelsApi.list()
      return response.data.data
    }
  )

  const { data: agents } = useQuery('agents-list', async () => {
    const response = await agentsApi.list()
    return response.data.data
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'reconnecting': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />
      default: return <Radio className="w-4 h-4 text-gray-500" />
    }
  }

  const getChannelIcon = (type: string) => {
    return CHANNEL_TYPES.find(t => t.id === type)?.icon || '📡'
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this channel? This will disable it in OpenClaw.')) return
    await channelsApi.delete(id)
    refetch()
  }

  const handleRestartGateway = async () => {
    if (!confirm('Restart OpenClaw Gateway to apply changes?')) return
    setIsRestarting(true)
    try {
      await channelsApi.restartGateway()
      alert('Gateway restart initiated. Please wait 10-20 seconds.')
    } catch (error: any) {
      alert('Failed to restart Gateway: ' + error.message)
    } finally {
      setIsRestarting(false)
    }
  }

  const handleTest = async (id: number) => {
    try {
      const response = await channelsApi.test(id)
      const { connected } = response.data.data
      alert(connected ? 'Channel is connected!' : 'Channel is not connected. Check configuration.')
      refetch()
    } catch (error: any) {
      alert('Test failed: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Channels</h1>
          <p className="text-muted-foreground">Connect messaging platforms to agents</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRestartGateway}
            disabled={isRestarting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-50"
          >
            {isRestarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Restart Gateway
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : channels?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No channels connected</h3>
          <p className="text-muted-foreground mt-1">Add a channel to start receiving messages</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels?.map((channel) => (
            <div key={channel.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getChannelIcon(channel.type)}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{channel.name}</h3>
                      <div
                        className={`w-2 h-2 rounded-full ${getStatusColor(channel.status)}`}
                        title={channel.status}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">{channel.type}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleTest(channel.id)}
                    className="p-1 rounded hover:bg-muted"
                    title="Test connection"
                  >
                    {getStatusIcon(channel.status)}
                  </button>
                  <button
                    onClick={() => setEditingChannel(channel)}
                    className="p-1 rounded hover:bg-muted"
                    title="Edit"
                  >
                    <Bot className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(channel.id)}
                    className="p-1 rounded hover:bg-muted text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent:</span>
                  <span className="font-medium">{channel.agent_name || 'None (main agent)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DM Policy:</span>
                  <span className="capitalize">{channel.dm_policy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Whitelist:</span>
                  <span>{channel.allow_from?.length || 0} users</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <ChannelModal
          agents={agents || []}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={async (data) => {
            console.log('onSave called with data:', data)
            try {
              const response = await channelsApi.create(data)
              console.log('Channel created successfully:', response.data)
              const message = response.data.data?.message || 'Channel created successfully'
              alert(message)
              setIsCreateModalOpen(false)
              refetch()
            } catch (error: any) {
              console.error('Failed to create channel:', error)
              alert('Error: ' + (error.response?.data?.error?.message || error.message))
            }
          }}
        />
      )}

      {editingChannel && (
        <ChannelModal
          channel={editingChannel}
          agents={agents || []}
          onClose={() => setEditingChannel(null)}
          onSave={async (data) => {
            await channelsApi.update(editingChannel.id, data)
            setEditingChannel(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function ChannelModal({
  channel,
  agents,
  onClose,
  onSave,
}: {
  channel?: Channel | null
  agents: any[]
  onClose: () => void
  onSave: (data: Partial<Channel>) => void
}) {
  const isEditing = !!channel
  const [formData, setFormData] = useState<Partial<Channel>>({
    type: channel?.type || 'telegram',
    name: channel?.name || '',
    dm_policy: channel?.dm_policy || 'pairing',
    allow_from: channel?.allow_from || [],
    agent_id: channel?.agent_id || null,
    config: channel?.config || {},
  })
  const [whitelistInput, setWhitelistInput] = useState('')
  const [botToken, setBotToken] = useState(channel?.config?.botToken || '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (formData.type === 'telegram' && !isEditing) {
      if (!botToken?.trim()) {
        newErrors.botToken = 'Bot Token is required for Telegram'
      } else if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(botToken.trim())) {
        newErrors.botToken = 'Invalid Bot Token format (should be like: 123456789:ABCdef...)'
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBlur = (field: string) => {
    setTouched({ ...touched, [field]: true })
    validate()
  }

  const handleSave = () => {
    console.log('handleSave called')
    setTouched({ name: true, botToken: true })
    
    const isValid = validate()
    console.log('Validation result:', isValid, 'Errors:', errors)
    
    if (!isValid) {
      console.log('Validation failed, not saving')
      return
    }
    
    const data = {
      ...formData,
      name: formData.name?.trim(),
      config: {
        ...formData.config,
        botToken: botToken?.trim() || undefined,
      },
    }
    console.log('Saving data:', data)
    onSave(data)
  }

  const addToWhitelist = () => {
    if (!whitelistInput.trim()) return
    setFormData({
      ...formData,
      allow_from: [...(formData.allow_from || []), whitelistInput.trim()],
    })
    setWhitelistInput('')
  }

  const removeFromWhitelist = (index: number) => {
    setFormData({
      ...formData,
      allow_from: formData.allow_from?.filter((_, i) => i !== index),
    })
  }

  const selectedAgent = agents.find(a => a.id === formData.agent_id)
  const isValid = !errors.name && (!errors.botToken || isEditing)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit Channel' : 'Add Channel'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => {
                setFormData({ ...formData, type: e.target.value })
                setErrors({})
              }}
              disabled={isEditing}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border disabled:opacity-50"
            >
              {CHANNEL_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Name
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value })
                if (errors.name) setErrors({ ...errors, name: '' })
              }}
              onBlur={() => handleBlur('name')}
              className={`w-full px-3 py-2 rounded-lg bg-secondary border ${
                touched.name && errors.name 
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                  : 'border-border'
              }`}
              placeholder="My Telegram Bot"
            />
            {touched.name && errors.name && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </p>
            )}
          </div>

          {formData.type === 'telegram' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Bot Token
                <span className="text-xs text-muted-foreground ml-1">(from @BotFather)</span>
                {!isEditing && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => {
                  setBotToken(e.target.value)
                  if (errors.botToken) setErrors({ ...errors, botToken: '' })
                }}
                onBlur={() => handleBlur('botToken')}
                className={`w-full px-3 py-2 rounded-lg bg-secondary border font-mono text-sm ${
                  touched.botToken && errors.botToken 
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                    : 'border-border'
                }`}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                disabled={isEditing}
              />
              {touched.botToken && errors.botToken && (
                <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.botToken}
                </p>
              )}
              {!isEditing && (
                <p className="text-xs text-muted-foreground mt-1">
                  The token will be stored in OpenClaw configuration
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Assigned Agent</label>
            <select
              value={formData.agent_id || ''}
              onChange={(e) => setFormData({ ...formData, agent_id: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            >
              <option value="">Main Agent (default)</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            {selectedAgent && (
              <div className="flex items-center gap-2 mt-2 text-sm">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: selectedAgent.color }}
                />
                <span className="text-muted-foreground">
                  Messages will be handled by {selectedAgent.name}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">DM Policy</label>
            <select
              value={formData.dm_policy}
              onChange={(e) => setFormData({ ...formData, dm_policy: e.target.value as any })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            >
              {DM_POLICIES.map((policy) => (
                <option key={policy.value} value={policy.value}>{policy.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {DM_POLICIES.find(p => p.value === formData.dm_policy)?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Whitelist</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={whitelistInput}
                onChange={(e) => setWhitelistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToWhitelist()}
                className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border"
                placeholder="User ID or @username"
              />
              <button
                onClick={addToWhitelist}
                className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.allow_from?.map((item, index) => (
                <span key={index} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-sm">
                  {item}
                  <button onClick={() => removeFromWhitelist(index)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {!isEditing && formData.type === 'telegram' && botToken && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-sm">
              <p className="font-medium text-yellow-500 mb-2">⚠️ Manual Configuration Required</p>
              <p className="text-muted-foreground mb-2">
                After saving, run these commands in the Terminal to configure OpenClaw:
              </p>
              <div className="bg-black/50 rounded p-2 font-mono text-xs space-y-1">
                <div>openclaw config set channels.telegram.enabled true</div>
                <div>openclaw config set channels.telegram.botToken "{botToken.substring(0, 20)}..."</div>
                <div>openclaw config set channels.telegram.dmPolicy "{formData.dm_policy}"</div>
                <div>sudo systemctl restart openclaw-gateway</div>
              </div>
            </div>
          )}

          <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Users message your Telegram bot</li>
              <li>Messages are routed to the assigned agent</li>
              <li>Agent responses are sent back to Telegram</li>
              <li>DM Policy controls who can interact with the bot</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="w-4 h-4" />
            {isEditing ? 'Save Changes' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  )
}
