import { useState, useEffect, useRef } from 'react'
import { Send, Bot } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { agentsApi } from '../services/api'
import { useQuery } from 'react-query'
import type { Agent } from '../types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export function ChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { accessToken } = useAuthStore()

  const { data: agents } = useQuery<Agent[]>('agents-list', async () => {
    const response = await agentsApi.list()
    return response.data.data
  })

  useEffect(() => {
    if (!selectedAgent || !accessToken) return

    const agent = agents?.find((a) => a.id === selectedAgent)
    if (!agent) return

    // Close existing connection first
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Clear messages when switching agents
    setMessages([])

    // Connect WebSocket
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat?agent=${agent.id}&token=${accessToken}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'history') {
        // Load chat history from server
        const historyMessages = data.payload.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        }))
        setMessages(historyMessages)
      } else if (data.type === 'message') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: data.payload.role,
            content: data.payload.content,
            timestamp: Date.now(),
          },
        ])
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [selectedAgent, accessToken, agents])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || !wsRef.current) return

    const message: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, message])
    
    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        agentId: selectedAgent,
        content: input,
      })
    )

    setInput('')
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Agent selector */}
      <div className="w-64 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-3 border-b border-border font-medium">Select Agent</div>
        <div className="flex-1 overflow-auto">
          {agents?.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                selectedAgent === agent.id ? 'bg-primary/10 text-primary' : ''
              }`}
            >
              <div
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{ backgroundColor: agent.color }}
              >
                <Bot className="w-3 h-3 text-black/70" />
              </div>
              <span className="truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        {selectedAgent ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span className="font-medium">
                  {agents?.find((a) => a.id === selectedAgent)?.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-xs text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={handleSend}
                  disabled={!isConnected}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select an agent to start chatting
          </div>
        )}
      </div>
    </div>
  )
}
