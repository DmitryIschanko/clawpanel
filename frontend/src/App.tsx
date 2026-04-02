import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { useAuthStore } from './stores/auth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { AgentsPage } from './pages/Agents'
import { AgentDetailPage } from './pages/AgentDetail'
import { LLMPage } from './pages/LLM'
import { SessionsPage } from './pages/Sessions'
import { SkillsPage } from './pages/Skills'
import { ChainsPage } from './pages/Chains'
import { ChannelsPage } from './pages/Channels'
import { FilesPage } from './pages/Files'
import { TerminalPage } from './pages/Terminal'
import { ChatPage } from './pages/Chat'
import { SettingsPage } from './pages/Settings'
import { UsersPage } from './pages/Users'
import { McpServersPage } from './pages/McpServers'
import { ToolsPage } from './pages/Tools'
import { ComposioPage } from './pages/Composio'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:id" element={<AgentDetailPage />} />
            <Route path="llm" element={<LLMPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="skills" element={<SkillsPage />} />
            <Route path="chains" element={<ChainsPage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="terminal" element={<TerminalPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="mcp" element={<McpServersPage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="composio" element={<ComposioPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
