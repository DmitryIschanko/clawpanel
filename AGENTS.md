# ClawPanel - Developer Guide

## Project Overview

ClawPanel is a web-based management panel for OpenClaw - a multi-agent LLM system. It provides a React-based UI and Node.js backend for managing agents, channels, chains, and monitoring OpenClaw Gateway.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Nginx     │──────│   React     │      │   Node.js   │
│   :80/443   │      │   Frontend  │      │   Backend   │
│  (Proxy)    │      │   :80       │      │   :3000     │
└─────────────┘      └─────────────┘      └──────┬──────┘
                                                  │
                    ┌─────────────────────────────┼──────────┐
                    │                             │          │
                    │ ws://host.docker.internal   │          │
                    │   :18789                    │          │
                    │                             │          │
            ┌───────▼───────┐            ┌────────▼──────┐  │
            │  OpenClaw     │            │   SSH Client  │  │
            │  Gateway      │            │   (built-in)  │  │
            │  :18789       │            └───────┬───────┘  │
            └───────────────┘                    │          │
                                                 │          │
                                       ┌─────────▼──────────┤
                                       │   Host Server      │
                                       │   :22 (SSH)        │
                                       └────────────────────┘
```

## Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI, Zustand
- **Backend**: Node.js 20, Express, TypeScript, tsx (runtime)
- **Database**: SQLite (better-sqlite3)
- **WebSocket**: ws library (dual client/server)
- **Terminal**: node-pty + SSH
- **Build**: Docker Compose, Vite (frontend)

## Key Files

### Backend (`/backend/src/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express server entry, WebSocket server init |
| `services/gateway.ts` | **Critical**: OpenClaw Gateway WebSocket client |
| `websocket/index.ts` | WebSocket server for frontend clients (chat, terminal, events) |
| `routes/dashboard.ts` | Dashboard stats (includes gateway status) |
| `routes/agents.ts` | CRUD for agents with camelCase/snake_case mapping |
| `database/migrate.ts` | Database initialization |
| `utils/logger.ts` | Winston logger |

### Frontend (`/frontend/src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Main app with routing |
| `pages/Dashboard.tsx` | Dashboard with gateway status widget |
| `pages/Agents.tsx` | Agent management |
| `pages/Chat.tsx` | WebSocket chat with agents |
| `pages/Terminal.tsx` | SSH terminal component |
| `pages/Channels.tsx` | Channel management |
| `pages/Chains.tsx` | Chain builder |
| `stores/` | Zustand state management |

### Config

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Services: backend, frontend, nginx |
| `nginx/nginx.conf` | Reverse proxy config with WebSocket support |
| `backend/Dockerfile` | tsx runtime with openssh-client |
| `backend/ssh-keys/` | SSH keys for terminal host access |

## Gateway WebSocket Protocol

### Connection Flow

1. **Connect** to `ws://host.docker.internal:18789`
2. **Wait** for `connect.challenge` event with `nonce`
3. **Send** `connect` request with:
   - `client.id`: `"gateway-client"` (must be valid constant)
   - `client.mode`: `"backend"` (must be valid constant)
   - `role`: `"operator"`
   - `scopes`: `["operator.read", "operator.write", "operator.admin"]`
   - `auth.password`: from `GATEWAY_PASSWORD` env
4. **Receive** `hello-ok` response on success

### Valid Constants (from OpenClaw source)

**client.id:**
- `cli`, `gateway-client`, `openclaw-macos`, `openclaw-ios`, `openclaw-android`, `node-host`, `test`, `probe`

**client.mode:**
- `cli`, `ui`, `backend`, `node`, `webchat`, `probe`, `test`

### Code Example

```typescript
// From backend/src/services/gateway.ts
const connectMessage = {
  type: 'req',
  id: generateUUID(),
  method: 'connect',
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'gateway-client',  // Valid constant required
      version: '1.0.0',
      platform: 'linux',
      mode: 'backend'        // Valid constant required
    },
    role: 'operator',
    scopes: ['operator.read', 'operator.write', 'operator.admin'],
    auth: { password: process.env.GATEWAY_PASSWORD },
    userAgent: 'clawpanel/1.0.0'
  }
};
```

## WebSocket Server (Frontend)

ClawPanel backend runs a WebSocket server that handles three types of connections:

### 1. Chat WebSocket (`/ws/chat`)
- Real-time messaging with agents
- Requires JWT token in query params
- Connects to OpenClaw Gateway for message routing

### 2. Terminal WebSocket (`/ws/terminal`)
- SSH terminal access to host server
- Uses node-pty with SSH client
- Provides full OpenClaw CLI access

### 3. Events WebSocket (`/ws/events`)
- Real-time events from Gateway
- Broadcasts to all connected clients

### WebSocket Server Setup

```typescript
// From backend/src/index.ts
const wss = new WebSocketServer({ 
  server,
  verifyClient: (info: any) => {
    const pathname = info.req.url?.split('?')[0];
    return pathname?.startsWith('/ws/') || false;
  }
});
setupWebSocketServer(wss);
```

## SSH Terminal

The Terminal feature uses **node-pty** + **SSH** to provide access to the host server:

### How it works:

1. **Frontend**: User opens Terminal page
2. **WebSocket**: Browser connects to `/ws/terminal`
3. **Backend**: Spawns PTY with SSH command:
   ```typescript
   client.terminal = pty.spawn('ssh', [
     '-i', '/root/.ssh/id_ed25519',
     '-o', 'StrictHostKeyChecking=no',
     '-p', '22',
     'root@host.docker.internal'
   ], {
     name: 'xterm-color',
     cols: 80,
     rows: 30,
   });
   ```
4. **Host**: SSH server authenticates using pre-generated keys
5. **User**: Gets full shell access to host with OpenClaw CLI

### SSH Key Setup

```bash
# Generate keys during installation
ssh-keygen -t ed25519 -f ssh-keys/clawpanel -N "" -C "clawpanel-terminal"

# Add public key to host's authorized_keys
cat ssh-keys/clawpanel.pub >> ~/.ssh/authorized_keys

# Copy keys to backend for Docker build
cp -r ssh-keys backend/
```

### Dockerfile Setup

```dockerfile
# Install openssh-client for terminal
RUN apk add --no-cache python3 make g++ openssh-client

# Copy SSH keys
COPY ssh-keys/clawpanel /root/.ssh/id_ed25519
COPY ssh-keys/clawpanel.pub /root/.ssh/id_ed25519.pub
RUN chmod 600 /root/.ssh/id_ed25519 && \
    chmod 644 /root/.ssh/id_ed25519.pub
```

## Environment Variables

```bash
# Required
JWT_SECRET=random-secret
GATEWAY_URL=ws://host.docker.internal:18789
GATEWAY_PASSWORD=match-openclaw-json

# SSH Terminal (optional)
SSH_HOST=host.docker.internal
SSH_USER=root
SSH_PORT=22
SSH_KEY_PATH=/root/.ssh/id_ed25519

# Optional
NODE_ENV=production
SQLITE_PATH=/data/clawpanel.db
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

## TypeScript Configuration

Backend uses relaxed strict mode (no type checking at runtime with tsx):

```json
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "skipLibCheck": true
  }
}
```

## Common Issues

### WebSocket Handshake Failed

**Error:** `invalid connect params: at /client/id: must be equal to constant`

**Fix:** Use valid `client.id` and `client.mode` constants from Gateway protocol.

### "Cannot find module"

**Error:** Module resolution fails in Docker

**Fix:** Check import paths use correct relative paths (`../utils/logger` not `../logger`).

### Gateway Shows Disconnected

**Checklist:**
1. `sudo systemctl status openclaw-gateway` - running?
2. `cat .env | grep GATEWAY_PASSWORD` - matches openclaw.json?
3. `docker compose logs -f backend` - any errors?
4. `docker compose exec backend wget -qO- http://host.docker.internal:18789` - network?

### Terminal Shows "Connection closed"

**Checklist:**
1. SSH server running: `sudo systemctl status ssh`
2. SSH keys exist: `docker compose exec backend ls -la /root/.ssh/`
3. Test SSH: `docker compose exec backend ssh root@host.docker.internal echo OK`

### SSH Connection Fails

**Error:** `ssh: connect to host host.docker.internal port 22: Connection refused`

**Fix:**
```bash
# Install and start SSH
sudo apt-get install -y openssh-server
sudo systemctl enable --now ssh

# Allow root login (if needed)
echo "PermitRootLogin yes" | sudo tee -a /etc/ssh/sshd_config
sudo systemctl restart ssh

# Regenerate keys
cd /path/to/clawpanel
rm -rf ssh-keys backend/ssh-keys
ssh-keygen -t ed25519 -f ssh-keys/clawpanel -N ""
cat ssh-keys/clawpanel.pub >> ~/.ssh/authorized_keys
cp -r ssh-keys backend/
docker compose build --no-cache backend
docker compose up -d
```

## API Endpoints

### Auth
- `POST /api/auth/login` - `{username, password}` → `{accessToken, refreshToken}`
- `POST /api/auth/refresh` - `{refreshToken}` → `{accessToken}`

### Dashboard
- `GET /api/dashboard/stats` - Returns `{agents, channels, skills, gateway, tokenUsage}`

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create agent (supports camelCase fields)
- `GET /api/agents/:id` - Get agent
- `PUT /api/agents/:id` - Update agent (with field name mapping)
- `DELETE /api/agents/:id` - Delete agent

### Channels
- `GET /api/channels` - List channels
- `POST /api/channels` - Create channel
- Similar CRUD pattern

### Chains
- `GET /api/chains` - List chains
- `POST /api/chains` - Create chain
- Similar CRUD pattern

## Docker Commands

```bash
# Development
docker compose up -d
docker compose logs -f backend
docker compose exec backend sh

# Production rebuild
docker compose down
docker compose build --no-cache
docker compose up -d

# Database reset
docker compose exec backend npx tsx src/database/migrate.ts
docker compose exec backend node /app/fix-admin.js

# Test SSH from container
docker compose exec backend ssh -i /root/.ssh/id_ed25519 \
  -o StrictHostKeyChecking=no root@host.docker.internal
```

## Network Model

```
┌──────────────────────────────────────────────────────────┐
│                      Host (your server)                  │
│  ┌─────────────────┐         ┌───────────────────────┐  │
│  │ OpenClaw Gateway│         │   ClawPanel Stack     │  │
│  │   :18789        │◄────────│   Docker Compose      │  │
│  │   (systemd)     │   WS    │                       │  │
│  └─────────────────┘         │  ┌─────────────────┐  │  │
│                              │  │   Backend       │  │  │
│  ~/.openclaw/                │  │   (Node.js)     │  │  │
│  └── openclaw.json           │  │   :3000         │  │  │
│      gateway.auth.password ──┼──┼──► GATEWAY_PASSWORD │  │
│                              │  │                   │  │  │
│  :22 (SSH) ◄─────────────────┼──┼── SSH Terminal    │  │  │
│                              │  └─────────────────┘  │  │
│                              └───────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Security Notes

- JWT tokens: 15min access, 7d refresh
- Passwords: bcrypt hashed
- Gateway password: env variable only
- Rate limiting: 100 req/min per IP
- CORS: configured for nginx proxy
- SSH keys: generated per installation, stored only in container
- SSH access: key-based only, no password auth
- Terminal: isolated to host.docker.internal only
