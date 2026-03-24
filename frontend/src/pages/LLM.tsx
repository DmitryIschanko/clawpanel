import { useState } from 'react'
import { useQuery } from 'react-query'
import { Brain, RefreshCw, Loader2, Check, AlertCircle, Key } from 'lucide-react'
import { llmApi } from '../services/api'
import type { LLMProvider } from '../types'

export function LLMPage() {
  const [testingProvider, setTestingProvider] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({})
  
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
                        className="px-3 py-1.5 rounded-lg bg-secondary text-sm"
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

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">API Keys</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          API keys are stored in environment variables. Set them in your <code>~/.openclaw/openclaw.json</code> or environment.
        </p>
        <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
          <p><span className="text-green-400">ANTHROPIC_API_KEY</span>=sk-ant-...</p>
          <p><span className="text-green-400">OPENAI_API_KEY</span>=sk-...</p>
          <p><span className="text-green-400">GOOGLE_API_KEY</span>=...</p>
        </div>
      </div>
    </div>
  )
}
