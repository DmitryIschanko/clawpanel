import { useQuery } from 'react-query'
import {
  Bot,
  Radio,
  Puzzle,
  Activity,
  RefreshCw,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { dashboardApi } from '../services/api'
import { formatNumber } from '../lib/utils'
import type { DashboardStats } from '../types'

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data, isLoading, refetch } = useQuery<DashboardStats>(
    'dashboard-stats',
    async () => {
      const response = await dashboardApi.getStats()
      return response.data.data
    },
    { refetchInterval: 30000 }
  )

  const handleRestartGateway = async () => {
    if (confirm('Are you sure you want to restart the Gateway?')) {
      await dashboardApi.restartGateway()
    }
  }

  const handleClearSessions = async () => {
    if (confirm('Are you sure you want to clear all sessions?')) {
      await dashboardApi.clearSessions()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const stats = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your OpenClaw setup
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              stats?.gateway.connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-muted-foreground">
            Gateway {stats?.gateway.connected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Agents"
          value={stats?.agents.total || 0}
          subtitle={`${stats?.agents.active || 0} active`}
          icon={Bot}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="Channels"
          value={stats?.channels.total || 0}
          subtitle={`${stats?.channels.online || 0} online`}
          icon={Radio}
          color="bg-accent/10 text-accent"
        />
        <StatCard
          title="Skills"
          value={stats?.skills || 0}
          icon={Puzzle}
          color="bg-secondary text-secondary-foreground"
        />
        <StatCard
          title="Tokens Today"
          value={formatNumber(stats?.tokenUsage.today || 0)}
          subtitle={`${formatNumber(stats?.tokenUsage.week || 0)} this week`}
          icon={Activity}
          color="bg-destructive/10 text-destructive"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleRestartGateway}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <Activity className="w-4 h-4" />
            Restart Gateway
          </button>
          <button
            onClick={handleClearSessions}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear Sessions
          </button>
        </div>
      </div>

      {/* Events Feed */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm">No recent events</p>
              <p className="text-xs text-muted-foreground">
                Events will appear here when the Gateway sends them
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
