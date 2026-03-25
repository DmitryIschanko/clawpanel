import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Brain, RefreshCw, Loader2, Check, AlertCircle, Key, Eye, EyeOff, Save, Trash2 } from 'lucide-react'
import { llmApi } from '../services/api'
import type { LLMProvider } from '../types'

function ApiKeyInput({ provider, onSave }: { provider: LLMProvider; onSave: () => void }) {
  const [showKey, setShowKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const queryClient = useQueryClient()
  
  const saveMutation = useMutation(
    (key: string) => llmApi.setApiKey(provider.id, key),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('llm-providers')
        setIsEditing(false)
        setApiKey('')
        onSave()
      },
    }
  )
  
  const deleteMutation = useMutation(
    () => llmApi.deleteApiKey(provider.id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('llm-providers')
        onSave()
      },
    }
  )
  
  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        {provider.has_key ? (
          <>
            <span className="flex items-center gap-1 text-sm text-green-500">
              <Check className="w-4 h-4" />
              API key configured
            </span>
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-primary hover:underline"
            >
              Update
            </button>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isLoading}
              className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              {deleteMutation.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Key className="w-4 h-4" />
            Add API key
          </button>
        )}
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter API key"
          className="w-64 px-3 py-1.5 pr-10 rounded-lg bg-secondary border-0 text-sm focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <button
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <button
        onClick={() => saveMutation.mutate(apiKey)}
        disabled={!apiKey.trim() || saveMutation.isLoading}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
      >
        {saveMutation.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save
      </button>
      <button
        onClick={() => {
          setIsEditing(false)
          setApiKey('')
        }}
        className="px-3 py-1.5 rounded-lg bg-secondary text-sm hover:bg-secondary/80"
      >
        Cancel
      </button>
    </div>
  )
}

export function LLMPage() {
  const [testingProvider, setTestingProvider] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({})
  const queryClient = useQueryClient()
  
  const { data: providers, isLoading, refetch } = useQuery<LLMProvider[]>(
    'llm-providers',
    async () => {
      const response = await llmApi.getProviders()
      return response.data.data
    }
  )

  const handleTest = async (provider: LLMProvider) => {
    setTestingProvider(provider.id)
    try {
      const response = await llmApi.testProvider(provider.id)
      const result = response.data.data
      setTestResults({
        ...testResults,
        [provider.id]: {
          success: result.connected,
          message: result.connected ? 'Connected!' : result.error || 'Failed',
        },
      })
    } catch (error: any) {
      setTestResults({
        ...testResults,
        [provider.id]: {
          success: false,
          message: error.response?.data?.error?.message || 'Connection failed',
        },
      })
    } finally {
      setTestingProvider(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LLM Providers</h1>
          <p className="text-muted-foreground">Configure your AI model providers</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {providers?.map((provider) => (
            <div key={provider.id} className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{provider.name}</h3>
                      {provider.enabled ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-500">
                          Enabled
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {provider.models?.length || 0} models available
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleTest(provider)}
                  disabled={testingProvider === provider.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-sm disabled:opacity-50"
                >
                  {testingProvider === provider.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Test Connection
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <ApiKeyInput 
                  provider={provider} 
                  onSave={() => refetch()} 
                />
              </div>

              {testResults[provider.id] && (
                <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                  testResults[provider.id].success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                }`}>
                  {testResults[provider.id].success ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm">{testResults[provider.id].message}</span>
                </div>
              )}

              {provider.models && provider.models.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-2">Available Models</h4>
                  <div className="flex flex-wrap gap-2">
                    {provider.models.map((model) => (
                      <div
                        key={model.id}
                        className={`px-3 py-1.5 rounded-lg text-sm ${
                          provider.has_key 
                            ? 'bg-secondary' 
                            : 'bg-muted text-muted-foreground'
                        }`}
                        title={`Input: $${model.pricing.input}/1M, Output: $${model.pricing.output}/1M`}
                      >
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">
                          ${model.pricing.input}/${model.pricing.output} per 1M tokens
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
