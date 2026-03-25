import { useState, useEffect } from 'react'
import { useQuery } from 'react-query'
import { Loader2, CheckCircle2, AlertTriangle, Puzzle } from 'lucide-react'
import { agentsApi } from '../services/api'

interface AgentSkillsProps {
  agentId: number
}

interface Skill {
  id: number
  name: string
  description?: string
  source: string
  enabled: boolean
  assigned: boolean
}

export function AgentSkills({ agentId }: AgentSkillsProps) {
  const [selectedSkills, setSelectedSkills] = useState<number[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { data, isLoading, refetch } = useQuery(
    ['agent-skills', agentId],
    async () => {
      const response = await agentsApi.getSkills(agentId)
      return response.data.data
    }
  )

  // Initialize selected skills from data
  useEffect(() => {
    if (data?.assignedSkillIds) {
      setSelectedSkills(data.assignedSkillIds)
    }
  }, [data])

  const handleToggleSkill = (skillId: number) => {
    setSelectedSkills(prev => 
      prev.includes(skillId) 
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await agentsApi.updateSkills(agentId, selectedSkills)
      setSaveSuccess(true)
      refetch()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save skills:', error)
      alert('Failed to save skills')
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

  const skills: Skill[] = data?.availableSkills || []
  const hasChanges = JSON.stringify(selectedSkills.sort()) !== JSON.stringify((data?.assignedSkillIds || []).sort())

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Assigned Skills</h3>
          <p className="text-sm text-muted-foreground">
            Select skills that this agent can use
          </p>
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
            disabled={isSaving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Puzzle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No skills available</h3>
          <p className="text-muted-foreground mt-1">
            Install skills from ClawHub first
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {skills.map((skill) => (
            <div
              key={skill.id}
              onClick={() => handleToggleSkill(skill.id)}
              className={`border rounded-xl p-4 cursor-pointer transition-colors ${
                selectedSkills.includes(skill.id)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={selectedSkills.includes(skill.id)}
                    onChange={() => {}}
                    className="w-4 h-4 rounded border-border"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{skill.name}</h4>
                    {skill.source === 'clawhub' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">
                        ClawHub
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {skill.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {skill.enabled ? (
                      <span className="text-xs flex items-center gap-1 text-green-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="text-xs flex items-center gap-1 text-yellow-500">
                        <AlertTriangle className="w-3 h-3" />
                        Disabled
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasChanges && (
        <div className="text-sm text-muted-foreground">
          You have unsaved changes
        </div>
      )}
    </div>
  )
}
