import { useState } from 'react'
import { useQuery } from 'react-query'
import { Plus, Puzzle, Upload, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { skillsApi } from '../services/api'
import type { Skill } from '../types'

export function SkillsPage() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillContent, setNewSkillContent] = useState('')
  
  const { data: skills, isLoading, refetch } = useQuery<Skill[]>('skills', async () => {
    const response = await skillsApi.list()
    return response.data.data
  })

  const handleInstall = async (name: string) => {
    await skillsApi.install(name)
    refetch()
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

  return (
    <div className="space-y-6">
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
            onClick={() => handleInstall('example-skill')}
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
                <button
                  onClick={() => handleDelete(skill.id)}
                  className="p-1 rounded hover:bg-muted text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <p className="text-sm text-muted-foreground mt-3">{skill.description || 'No description'}</p>
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    skill.enabled
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {skill.enabled ? 'Enabled' : 'Disabled'}
                </span>
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
    </div>
  )
}
