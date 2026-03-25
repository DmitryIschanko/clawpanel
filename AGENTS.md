# ClawPanel — AI Agent Guide

> This file contains essential information for AI agents working on the ClawPanel project.
> Always read this file before making significant changes.

## Project Overview

**ClawPanel** is a web control panel for OpenClaw — a multi-agent LLM system. It provides a modern React frontend and Node.js backend for managing agents, LLM providers, channels (Telegram, Discord, WhatsApp, Slack), skills, and monitoring.

**Key Architecture:**
- Frontend: React 18 + TypeScript + Tailwind CSS
- Backend: Node.js 24 + Express + SQLite
- Gateway Integration: WebSocket connection to OpenClaw Gateway
- Terminal: SSH-based terminal via xterm.js

## Quick Links

- Repository: `https://github.com/DmitryIschanko/clawpanel.git`
- Main branch: `main`
- Node.js version: 24 LTS
- Default admin: `admin/admin` (change after first login!)

## Environment Setup

### Local Development (without Docker)

```bash
# 1. Clone and setup
git clone https://github.com/DmitryIschanko/clawpanel.git
cd clawpanel

# 2. Backend
npm install -g pnpm
cd backend && pnpm install

# Create .env
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-production
SQLITE_PATH=./clawpanel.db
GATEWAY_URL=ws://localhost:18789
GATEWAY_TOKEN=your-gateway-token

# Run migrations
npx tsx src/database/migrate.ts

# Start backend
pnpm run dev

# 3. Frontend
cd ../frontend && pnpm install
cp .env.example .env  # VITE_API_URL=http://localhost:3000

# Start frontend
pnpm run dev
```

### Docker Development

```bash
# Full stack with Docker Compose
docker compose up -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Rebuild after changes
docker compose down && docker compose up -d --build
```

## Critical Implementation Details

### Gateway WebSocket Protocol

The Gateway uses a **challenge-response handshake** for authentication:

```typescript
// 1. Connection established
ws.connect('ws://host.docker.internal:18789')

// 2. Gateway sends challenge
// { type: 'event', event: 'connect.challenge', payload: { nonce: '...' } }

// 3. Client responds with connect request
// { type: 'req', method: 'connect', params: { auth: { token: '...' }, ... } }

// 4. Gateway responds
// { type: 'res', ok: true, payload: { type: 'hello-ok' } }
```

**Important:** 
- Use `client.id: 'gateway-client'` and `client.mode: 'backend'` (validated by Gateway)
- Subscribe to events with `subscribe` request
- Token auth mode requires `gateway.auth.token` in `~/.openclaw/openclaw.json`

### Gateway Event Handling (CRITICAL)

**Always clean up event subscriptions when WebSocket closes:**

```typescript
// GOOD - Proper cleanup
const unsubscribe = gatewayService.on('agent', (payload) => {
  // Handle event
});

ws.on('close', () => {
  unsubscribe(); // Critical! Prevents duplicate messages
  clients.delete(ws);
});

// BAD - Memory leak and duplicate messages
ws.on('close', () => {
  clients.delete(ws);
  // Missing unsubscribe!
});
```

### Agent Chat Flow

1. **Frontend** opens WebSocket to `/ws/chat?agent={id}`
2. **Backend** subscribes to Gateway `agent` events for the specific agent
3. **User sends message** → Backend routes via CLI or Gateway
4. **Gateway responds** with streaming `agent` events
5. **Backend accumulates** text and sends final message on `lifecycle:end`
6. **Frontend** displays accumulated message

### Agent ID Mapping

OpenClaw Gateway uses agent names like `clawpanel-1`, `clawpanel-8`. The backend maps numeric IDs from database to full names:

```typescript
const fullAgentName = `clawpanel-${agentId}`;

// When sending via CLI
openclaw agent --agent clawpanel-1 --prompt "Hello"
```

### SSH Terminal Implementation

Terminal uses SSH with key-based auth to host machine:

```typescript
// Environment variables (from .env)
SSH_HOST=host.docker.internal
SSH_USER=root
SSH_PORT=22
SSH_KEY_PATH=/root/.ssh/id_ed25519

// Connection
ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no \
  -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST}
```

SSH keys are generated during installation and mounted from `ssh-keys/` directory.

## Database Schema

**Core tables:**
- users (id, username, password_hash, role, totp_secret, created_at, updated_at)
- llm_providers (id, name, api_key, enabled, created_at)
- agents (id, name, description, system_prompt, enabled, created_at, updated_at)
- channels (id, name, type, config, enabled, created_at, updated_at)
- chains (id, name, description, config, enabled, created_at, updated_at)
- skills (id, name, description, content, source, version, created_at, updated_at)
- files (id, path, content, created_at, updated_at)
- stats (id, date, tokens, requests, errors, created_at)

## Testing Checklist

Before committing, verify:

- [ ] Backend compiles: `cd backend && pnpm run build`
- [ ] Frontend builds: `cd frontend && pnpm run build`
- [ ] TypeScript has no errors
- [ ] API endpoints work (use curl or Postman)
- [ ] WebSocket chat works with multiple agents
- [ ] Terminal connects via SSH
- [ ] Dashboard shows Gateway as connected
- [ ] No duplicate messages in chat
- [ ] Proper cleanup on disconnect

## Common Issues & Solutions

### "Invalid connect params" Gateway error

**Cause:** Incorrect `client.id` or `client.mode`
**Fix:** Use valid values:
```typescript
{
  id: 'gateway-client',
  mode: 'backend'
}
```

### "missing scope: operator.write"

**Cause:** Gateway in `password` auth mode
**Fix:** Switch to `token` auth:
```bash
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token "$(openssl rand -hex 32)"
sudo systemctl restart openclaw-gateway
```

### Duplicate chat messages

**Cause:** Not unsubscribing from Gateway events
**Fix:** Always call `unsubscribe()` in WebSocket close handler

### Agent not responding to chat

**Cause:** Agent not registered in OpenClaw
**Fix:** Register agents:
```bash
openclaw agents add clawpanel-1 --model kimi/kimi-k2.5
openclaw agents add clawpanel-8 --model kimi/kimi-k2
```

### Terminal connection refused

**Cause:** SSH keys not set up
**Fix:** Regenerate keys and restart:
```bash
./fix-ssh-keys.sh
docker compose restart
```

## Coding Standards

### TypeScript
- Use strict mode: `"strict": true` in tsconfig.json
- Explicit return types for public functions
- No `any` types (use `unknown` with type guards)
- Prefer `interface` over `type` for objects

### React
- Functional components with hooks
- `useEffect` cleanup functions required
- Memoization with `useMemo`/`useCallback` for expensive operations
- Zustand for state management (avoid Context for global state)

### Error Handling
```typescript
// Good - structured error
try {
  const result = await someOperation();
  return { ok: true, data: result };
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  logger.error('Operation failed', { error: message });
  return { ok: false, error: message };
}
```

### Logging
```typescript
// Use the logger utility
import logger from '../utils/logger';

logger.info('Connected to Gateway', { url: gatewayUrl });
logger.error('WebSocket error', { error: error.message });
logger.debug('Received event', { type: message.type });
```

## Deployment Commands

```bash
# Quick deploy to server
ssh root@your-server << 'EOF'
  cd /opt/clawpanel
  git pull origin main
  docker compose down
  docker compose build --no-cache
  docker compose up -d
  docker compose exec backend npx tsx src/database/migrate.ts
  docker compose logs -f backend
EOF
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| JWT_SECRET | Yes | Secret for JWT signing |
| NODE_ENV | Yes | Environment mode (production/development) |
| GATEWAY_URL | Yes | OpenClaw Gateway WebSocket URL |
| GATEWAY_TOKEN | Yes | Token for Gateway auth |
| SSH_HOST | No | SSH server host (default: host.docker.internal) |
| SSH_USER | No | SSH username (default: root) |
| SSH_PORT | No | SSH port (default: 22) |
| SSH_KEY_PATH | No | Path to SSH private key |
| SQLITE_PATH | No | SQLite database path |
| RATE_LIMIT_WINDOW | No | Rate limit window ms (default: 60000) |
| RATE_LIMIT_MAX | No | Max requests per window (default: 100) |

## File Structure

```
backend/src/
├── index.ts              # Entry point, Express setup
├── config/
│   └── index.ts          # Configuration from env
├── database/
│   ├── index.ts          # SQLite connection
│   ├── migrate.ts        # Migration runner
│   └── schema.ts         # Table definitions
├── middleware/
│   ├── auth.ts           # JWT authentication
│   ├── error.ts          # Error handling
│   └── rateLimit.ts      # Rate limiting
├── routes/
│   ├── auth.ts           # Auth endpoints
│   ├── agents.ts         # Agent management
│   ├── llm.ts            # LLM providers
│   ├── skills.ts         # Skill management
│   ├── files.ts          # File operations
│   └── stats.ts          # Statistics
├── services/
│   ├── gateway.ts        # Gateway WebSocket client
│   ├── agentRunner.ts    # CLI fallback for agents
│   └── ssh.ts            # SSH terminal
├── utils/
│   ├── logger.ts         # Winston logger
│   └── hash.ts           # Password hashing
└── websocket/
    └── index.ts          # WebSocket server

frontend/src/
├── App.tsx               # Main app component
├── main.tsx              # Entry point
├── components/           # Reusable UI components
├── pages/                # Page components
│   ├── Dashboard.tsx
│   ├── Agents.tsx
│   ├── Chat.tsx          # Agent chat (WebSocket)
│   ├── Terminal.tsx      # SSH terminal
│   ├── LLMProviders.tsx
│   ├── Skills.tsx
│   ├── Chains.tsx
│   ├── Channels.tsx
│   ├── Files.tsx
│   ├── Stats.tsx
│   ├── Settings.tsx
│   └── Login.tsx
├── services/             # API clients
├── stores/               # Zustand stores
└── types/                # TypeScript types
```

## Gateway Event Types

Subscribe to events using `gatewayService.on(event, handler)`:

| Event | Payload | Description |
|-------|---------|-------------|
| agent | { sessionKey, stream, data } | Agent responses |
| chat | { message, sender } | Chat messages |
| stats | { tokens, requests } | Usage statistics |
| lifecycle | { phase } | Lifecycle events |

Agent response format:
```typescript
interface AgentEvent {
  sessionKey: string;  // "agent:clawpanel-{id}:main"
  stream: 'user' | 'assistant' | 'lifecycle';
  data: {
    text?: string;
    phase?: 'start' | 'thinking' | 'end';
  };
}
```

## Important Notes

1. **Never expose** `JWT_SECRET` or `GATEWAY_TOKEN` in logs or responses
2. **Always** clean up event subscriptions in `useEffect` return functions
3. **Always** validate user input at API boundary
4. **Prefer** token auth for Gateway (password mode has limited permissions)
5. **Test** with multiple agents to ensure no cross-contamination
6. **Use** `clawpanel-{id}` naming convention for agents
7. **SSH** terminal requires proper key setup — always test in fresh container

## Version Info

- Node.js: 24 LTS
- React: 18.x
- TypeScript: 5.x
- Express: 4.x
- SQLite: 3.x
- xterm.js: 5.x
- Zustand: 4.x
- Tailwind CSS: 3.x

## Contributing

See CONTRIBUTING.md for details.

## License

MIT License - see LICENSE file for details.
