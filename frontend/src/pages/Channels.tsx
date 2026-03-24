import { useState } from 'react'
import { useQuery } from 'react-query'
import { Radio, Plus, Trash2, Loader2, Save, X } from 'lucide-react'
import { channelsApi } from '../services/api'
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
  { value: 'pairing', label: 'Pairing Required' },
  { value: 'open', label: 'Open' },
  { value: 'restricted', label: 'Restricted' },
]

export function ChannelsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  
  const { data: channels, isLoading, refetch } = useQuery<Channel[]>(
    'channels',
    async () => {
      const response = await channelsApi.list()
      return response.data.data
    }
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'reconnecting': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getChannelIcon = (type: string) => {
    return CHANNEL_TYPES.find(t => t.id === type)?.icon || '📡'
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this channel?')) return
    await channelsApi.delete(id)
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Channels</h1>
          <p className="text-muted-foreground">Connect messaging platforms</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Channel
        </button>
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
                <button
                  onClick={() => handleDelete(channel.id)}
                  className="p-1 rounded hover:bg-muted text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent:</span>
                  <span>{channel.agent_name || 'None'}</span>
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
          onClose={() => setIsCreateModalOpen(false)}
          onSave={async (data) => {
            await channelsApi.create(data)
            setIsCreateModalOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function ChannelModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (data: Partial<Channel>) => void
}) {
  const [formData, setFormData] = useState<Partial<Channel>>({
    type: 'telegram',
    name: '',
    dm_policy: 'pairing',
    allow_from: [],
    config: {},
  })
  const [whitelistInput, setWhitelistInput] = useState('')

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Channel</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
            >
              {CHANNEL_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              placeholder="My Telegram Bot"
            />
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
                placeholder="User ID or username"
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

          <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Configuration Note:</p>
            <p>Token/credentials for the channel should be configured in your OpenClaw Gateway config file (~/.openclaw/openclaw.json).</p>
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
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
