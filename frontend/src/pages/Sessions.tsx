import { useQuery } from 'react-query'
import { MessageSquare, Trash2, Minimize2, Loader2 } from 'lucide-react'
import { sessionsApi } from '../services/api'
import type { Session } from '../types'

export function SessionsPage() {
  const { data: sessions, isLoading, refetch } = useQuery<Session[]>(
    'sessions',
    async () => {
      const response = await sessionsApi.list()
      return response.data.data
    },
    { refetchInterval: 10000 }
  )

  const handleReset = async (id: string) => {
    if (!confirm('Reset this session?')) return
    await sessionsApi.reset(id)
    refetch()
  }

  const handleCompact = async (id: string) => {
    await sessionsApi.compact(id)
    refetch()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-muted-foreground">Manage active agent sessions</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : sessions?.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No active sessions</h3>
          <p className="text-muted-foreground mt-1">
            Sessions will appear here when agents are active
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions?.map((session) => (
            <div
              key={session.id}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      session.status === 'running'
                        ? 'bg-yellow-500'
                        : session.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-green-500'
                    }`}
                  />
                  <div>
                    <p className="font-medium">{session.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {session.tokens_used.toLocaleString()} tokens · {session.messages_count} messages
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCompact(session.id)}
                    className="p-2 rounded-lg hover:bg-muted"
                    title="Compact session"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReset(session.id)}
                    className="p-2 rounded-lg hover:bg-muted text-destructive"
                    title="Reset session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
