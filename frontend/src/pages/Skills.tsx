import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Puzzle, Upload, Trash2, AlertTriangle, Loader2, Search, ExternalLink, CheckCircle2, XCircle, RefreshCw, Edit, Save } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { skillsApi } from '../services/api'
import type { Skill } from '../types'

interface ClawHubResult {
  slug: string;
  displayName: string;
  summary: string;
  version?: string;
  updatedAt: number;
}

export function SkillsPage() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isClawHubModalOpen, setIsClawHubModalOpen] = useState(false)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [isSavingContent, setIsSavingContent] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillContent, setNewSkillContent] = useState('')
  const [clawHubSkillName, setClawHubSkillName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ClawHubResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [installStatus, setInstallStatus] = useState<{show: boolean; message: string; type: 'success' | 'error'}>({show: false, message: '', type: 'success'})
  
  const { data: skills, isLoading, refetch } = useQuery<Skill[]>('skills', async () => {
    const response = await skillsApi.list()
    return response.data.data
  })

  const handleInstall = async (name: string) => {
    try {
      const response = await skillsApi.install(name)
      const { openclawInstalled, gatewayRestarted } = response.data.data
      
      let message = `Skill "${name}" installed successfully`
      if (openclawInstalled && gatewayRestarted) {
        message += '. Gateway restarted and skill is now active!'
      } else if (openclawInstalled) {
        message += '. Gateway restart failed - skill will be active after next restart.'
      }
      
      setInstallStatus({ show: true, message, type: 'success' })
      setTimeout(() => setInstallStatus(prev => ({ ...prev, show: false })), 5000)
      refetch()
    } catch (error) {
      setInstallStatus({ show: true, message: `Failed to install skill: ${error}`, type: 'error' })
      setTimeout(() => setInstallStatus(prev => ({ ...prev, show: false })), 5000)
    }
  }

  const handleClawHubInstall = async () => {
    if (!clawHubSkillName) return
    try {
      const response = await skillsApi.install(clawHubSkillName)
      const { openclawInstalled, gatewayRestarted } = response.data.data
      
      let message = `Skill "${clawHubSkillName}" installed successfully`
      if (openclawInstalled && gatewayRestarted) {
        message += '. Gateway restarted and skill is now active!'
      } else if (openclawInstalled) {
        message += '. Gateway restart failed - skill will be active after next restart.'
      }
      
      setInstallStatus({ show: true, message, type: 'success' })
      setTimeout(() => setInstallStatus(prev => ({ ...prev, show: false })), 5000)
      setIsClawHubModalOpen(false)
      setClawHubSkillName('')
      refetch()
    } catch (error) {
      setInstallStatus({ show: true, message: `Failed to install skill: ${error}`, type: 'error' })
      setTimeout(() => setInstallStatus(prev => ({ ...prev, show: false })), 5000)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery) return
    setIsSearching(true)
    try {
      const response = await skillsApi.search(searchQuery)
      setSearchResults(response.data.data || [])
    } catch (error) {
      console.error('Search failed:', error)
    }
    setIsSearching(false)
  }

  const handleUpload = async () => {
    if (!newSkillName || !newSkillContent) return
    await skillsApi.upload(newSkillName, newSkillContent)
    setIsUploadModalOpen(false)
    setNewSkillName('')
    setNewSkillContent('')
    refetch()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this skill?')) return
    await skillsApi.delete(id)
    refetch()
  }

  const handleEditSkill = async (skill: Skill) => {
    setEditingSkill(skill)
    setIsEditModalOpen(true)
    try {
      const response = await skillsApi.getContent(skill.id)
      setSkillContent(response.data.data.content)
    } catch (error) {
      console.error('Failed to load skill content:', error)
      setSkillContent(skill.content || '')
    }
  }

  const handleSaveSkillContent = async () => {
    if (!editingSkill) return
    setIsSavingContent(true)
    try {
      await skillsApi.updateContent(editingSkill.id, skillContent)
      setIsEditModalOpen(false)
      setEditingSkill(null)
      refetch()
    } catch (error) {
      console.error('Failed to save skill content:', error)
      alert('Failed to save changes')
    } finally {
      setIsSavingContent(false)
    }
  }

  return (
    <div className="space-y-6">
      {installStatus.show && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          installStatus.type === 'success' 
            ? 'bg-green-500/10 border border-green-500/20 text-green-500' 
            : 'bg-red-500/10 border border-red-500/20 text-red-500'
        }`}>
          {installStatus.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
          <span>{installStatus.message}</span>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="text-muted-foreground">Manage agent capabilities</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
          <button
            onClick={() => setIsSearchModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
          >
            <Search className="w-4 h-4" />
            Search ClawHub
          </button>
          <button
            onClick={() => setIsClawHubModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            From ClawHub
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : skills?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Puzzle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No skills installed</h3>
          <p className="text-muted-foreground mt-1">Install skills from ClawHub or upload your own</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills?.map((skill) => (
            <div
              key={skill.id}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Puzzle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{skill.name}</h3>
                      {skill.security_flags?.hasExternalFetch && (
                        <AlertTriangle className="w-4 h-4 text-yellow-500" aria-label="Uses external fetch" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{skill.source}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditSkill(skill)}
                    className="p-1 rounded hover:bg-muted text-primary"
                    title="Edit SKILL.md"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(skill.id)}
                    className="p-1 rounded hover:bg-muted text-destructive"
                    title="Delete skill"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground mt-3">{skill.description || 'No description'}</p>
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      skill.enabled
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {skill.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {skill.openclaw?.installed ? (
                    <span className="text-xs flex items-center gap-1 text-green-500" title={`Installed at: ${skill.openclaw.path}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      OpenClaw
                    </span>
                  ) : (
                    <span className="text-xs flex items-center gap-1 text-yellow-500" title="Not installed in OpenClaw">
                      <XCircle className="w-3 h-3" />
                      OpenClaw
                    </span>
                  )}
                </div>
                {skill.source === 'clawhub' && (
                  <a
                    href={`https://clawhub.ai/skill/${skill.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1 text-primary hover:underline"
                  >
                    View on ClawHub <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl">
            <h2 className="text-lg font-semibold mb-4">Upload Skill</h2>
            <input
              type="text"
              placeholder="Skill name"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border mb-4"
            />
            <textarea
              placeholder="SKILL.md content..."
              value={newSkillContent}
              onChange={(e) => setNewSkillContent(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border mb-4 font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {isClawHubModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-2">Install from ClawHub</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the skill name from ClawHub repository
            </p>
            <input
              type="text"
              placeholder="e.g., web-search, calculator, file-reader..."
              value={clawHubSkillName}
              onChange={(e) => setClawHubSkillName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsClawHubModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleClawHubInstall}
                disabled={!clawHubSkillName}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {isSearchModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Search ClawHub</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Search skills... (e.g., web, search, fetch)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Found {searchResults.length} skills
                </p>
                {searchResults.map((result) => (
                  <div
                    key={result.slug}
                    className="border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{result.displayName}</h3>
                          <span className="text-xs text-muted-foreground">({result.slug})</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {result.summary}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {result.version && <span>v{result.version}</span>}
                          <span>Updated: {new Date(result.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <a
                          href={`https://clawhub.ai/skill/${result.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-secondary hover:bg-secondary/80"
                          title="View on ClawHub"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => {
                            handleInstall(result.slug)
                            setIsSearchModalOpen(false)
                          }}
                          className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                          title="Install"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && !isSearching && searchQuery && (
              <p className="text-center text-muted-foreground py-8">
                No skills found. Try a different search term.
              </p>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setIsSearchModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingSkill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold">Edit SKILL.md</h2>
                <p className="text-sm text-muted-foreground">{editingSkill.name}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSkillContent}
                  disabled={isSavingContent}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSavingContent && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="markdown"
                value={skillContent}
                onChange={(value) => setSkillContent(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
