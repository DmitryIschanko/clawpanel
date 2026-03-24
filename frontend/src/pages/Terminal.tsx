import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useAuthStore } from '../stores/auth'
import 'xterm/css/xterm.css'

export function TerminalPage() {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const { accessToken } = useAuthStore()

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#111318',
        foreground: '#e4e7ef',
      },
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    termRef.current = term

    // Connect WebSocket
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/terminal`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      // Send auth token
      ws.send(JSON.stringify({ type: 'auth', token: accessToken }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'output') {
        term.write(data.data)
      } else if (data.type === 'terminal:ready') {
        term.writeln('\r\n\x1b[32mConnected to OpenClaw Terminal\x1b[0m\r\n')
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[31mConnection closed\x1b[0m')
    }

    // Handle input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Handle resize
    const handleResize = () => {
      fitAddon.fit()
      const { cols, rows } = term
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
    }
  }, [accessToken])

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Terminal</h1>
          <p className="text-muted-foreground">
            Access OpenClaw CLI
          </p>
        </div>
      </div>
      
      <div 
        ref={terminalRef} 
        className="flex-1 bg-card border border-border rounded-xl overflow-hidden p-2"
      />
    </div>
  )
}
