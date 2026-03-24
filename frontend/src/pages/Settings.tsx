import { useState, useEffect } from 'react'
import { useQuery } from 'react-query'
import { Save, Download, Upload, Loader2, AlertCircle, Check } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { settingsApi } from '../services/api'

export function SettingsPage() {
  const [config, setConfig] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data, isLoading } = useQuery(
    'settings',
    async () => {
      const response = await settingsApi.get()
      const configStr = JSON.stringify(response.data.data, null, 2)
      setConfig(configStr)
      return response.data.data
    }
  )

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus(null)
    try {
      const parsed = JSON.parse(config)
      await settingsApi.update(parsed)
      setSaveStatus({ type: 'success', message: 'Settings saved successfully' })
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (error: any) {
      setSaveStatus({ type: 'error', message: error.message || 'Invalid JSON' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleBackup = async () => {
    const response = await settingsApi.backup()
    alert('Backup created: ' + response.data.data.downloadUrl)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure OpenClaw settings</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
          >
            <Download className="w-4 h-4" />
            Backup
          </button>
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

      {saveStatus && (
        <div className={`p-3 rounded-lg flex items-center gap-2 ${
          saveStatus.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {saveStatus.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm">{saveStatus.message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="h-[600px] bg-card border border-border rounded-xl overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="json"
            value={config}
            onChange={(value) => setConfig(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">Environment Variables</h3>
        <p className="text-sm text-muted-foreground mb-4">
          These environment variables can be configured in your <code>.env</code> file:
        </p>
        <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
          <p><span className="text-green-400">JWT_SECRET</span>=your-secret-key</p>
          <p><span className="text-green-400">GATEWAY_URL</span>=ws://172.17.0.1:18789</p>
          <p><span className="text-green-400">ANTHROPIC_API_KEY</span>=sk-ant-...</p>
          <p><span className="text-green-400">OPENAI_API_KEY</span>=sk-...</p>
          <p><span className="text-green-400">TELEGRAM_BOT_TOKEN</span>=...</p>
          <p><span className="text-green-400">DISCORD_BOT_TOKEN</span>=...</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">System Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">OpenClaw Config Path:</span>
            <code className="bg-muted px-2 py-0.5 rounded">~/.openclaw/openclaw.json</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Workspace Path:</span>
            <code className="bg-muted px-2 py-0.5 rounded">~/.openclaw/workspace</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database Path:</span>
            <code className="bg-muted px-2 py-0.5 rounded">/data/clawpanel.db</code>
          </div>
        </div>
      </div>
    </div>
  )
}
