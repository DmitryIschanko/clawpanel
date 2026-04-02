import { ComposioIntegration } from '../components/ComposioIntegration'

export function ComposioPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composio</h1>
          <p className="text-gray-600 mt-1">
            Connect 1000+ third-party services to your agents
          </p>
        </div>
      </div>

      <ComposioIntegration />
    </div>
  )
}
