# ClawPanel — Документация для AI Агентов

## Краткий обзор

ClawPanel — веб-панель управления для OpenClaw (многоагентная LLM-система). Стек: React 18 + TypeScript, Node.js 24 + Express, SQLite, Docker Compose.

**Ключевые архитектурные особенности:**
- Backend в Docker контейнере, OpenClaw Gateway на хосте (systemd)
- Host Executor HTTP API для выполнения `openclaw` команд с хоста
- Gateway WebSocket protocol с challenge-response аутентификацией
- WebSocket сервер для real-time коммуникации с frontend

## Архитектура системы

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Nginx (80/443)                                     │
│                        Reverse Proxy + SSL                                   │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            │
        ┌─────────┐  ┌─────────┐       │
        │ Frontend│  │ Backend │       │
        │  React  │  │ Node.js │◄──────┼── HTTP API
        │  :80    │  │  :3000  │       │   (Host Executor)
        └─────────┘  └────┬────┘       │
                          │            │
                          │ ws://host.docker.internal:18789
                          │ (WebSocket + token auth)
                          │            │
                          ▼            ▼
                 ┌─────────────────────────┐
                 │   OpenClaw Gateway      │
                 │   (systemd, host)       │
                 │   ws://0.0.0.0:18789    │
                 └─────────────────────────┘
                          │
                          │ http://172.17.0.1:3002
                          ▼
                 ┌─────────────────────────┐
                 │   Host Executor         │
                 │   (systemd, host)       │
                 │   HTTP API :3002        │
                 └─────────────────────────┘
```

## Компоненты

### 1. OpenClaw Gateway (Host)

**Запуск:** systemd сервис `openclaw-gateway`

**Конфигурация:** `~/.openclaw/openclaw.json`

**Порт:** `18789` (WebSocket)

**Аутентификация:** Token-based с challenge-response

```javascript
// Gateway handshake flow
1. Connect to ws://host:18789
2. Receive: { event: 'connect.challenge', nonce: '...' }
3. Send: { method: 'connect', params: { auth: { token: '...' } } }
4. Receive: { type: 'hello-ok' } or connection closed
```

**Важные требования к client.id/mode:**
```javascript
const VALID_CLIENT_IDS = [
  'cli', 'gateway-client', 'openclaw-macos', 
  'openclaw-ios', 'openclaw-android', 'node-host', 'test'
];

const VALID_CLIENT_MODES = [
  'cli', 'ui', 'backend', 'node', 'webchat', 'probe', 'test'
];

// ClawPanel использует:
client.id: 'gateway-client'
client.mode: 'backend'
```

### 2. Host Executor (Host)

**Назначение:** Позволяет Docker контейнеру выполнять `openclaw` команды на хосте

**Запуск:** systemd сервис `clawpanel-host-executor`

**Порт:** `3002` (HTTP)

**Локация:** `/usr/local/bin/host-executor.js` или `/root/clawpanel/host-executor.js`

**API Endpoints:**

```http
GET /health          # Health check
POST /exec           # Execute openclaw command
```

**Request format:**
```json
{
  "command": "openclaw agents list",
  "token": "host-executor-token-from-env"
}
```

**Response format:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "..."
}
```

**Безопасность:**
- Только `openclaw *` команды разрешены (whitelist проверка)
- Токен-аутентификация
- Доступ только из Docker сетей (iptables)

### 3. Backend (Docker)

**Базовый образ:** `node:20-alpine`

**Порт:** `3000`

**Сети:**
- `clawpanel-network` — внутренняя сеть
- `gateway-network` — для подключения к Gateway

**Ключевые сервисы:**

| Файл | Назначение |
|------|------------|
| `services/gateway.ts` | WebSocket клиент для Gateway |
| `services/hostExecutor.ts` | HTTP клиент для Host Executor |
| `services/agentRunner.ts` | Отправка сообщений агентам |
| `websocket/index.ts` | WebSocket сервер для frontend |

**Переменные окружения:**
```env
# Gateway WebSocket
GATEWAY_URL=ws://host.docker.internal:18789
GATEWAY_TOKEN=...

# Host Executor HTTP
HOST_EXECUTOR_URL=http://172.17.0.1:3002
HOST_EXECUTOR_TOKEN=...

# JWT
JWT_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Database
SQLITE_PATH=/data/clawpanel.db
```

### 4. Frontend (Docker)

**Базовый образ:** `node:20-alpine` (build) + `nginx:alpine` (serve)

**Фреймворк:** React 18 + TypeScript + Vite + Tailwind CSS

**State management:** Zustand

**HTTP client:** Axios

**WebSocket:** Native WebSocket API

## Работа с Host Executor

### От backend (TypeScript)

```typescript
import { execOnHost, setupTelegramChannel } from './services/hostExecutor';

// Выполнить произвольную команду
const result = await execOnHost('openclaw agents list');
console.log(result.stdout);

// Настроить Telegram канал
await setupTelegramChannel('bot-token', 'pairing', ['@username']);

// Перезапустить Gateway
await execOnHost('systemctl restart openclaw-gateway');
```

**Важно**: Когда openclaw работает в fallback режиме (Gateway не доступен), JSON ответ может быть в stderr вместо stdout. Проверяйте оба потока:
```typescript
const output = result.stdout?.trim() || result.stderr?.trim() || '';
// Извлеките JSON из stderr
const jsonMatch = output.match(/\{[\s\S]*"payloads"[\s\S]*\}/);
if (jsonMatch) {
  const response = JSON.parse(jsonMatch[0]);
  return response.payloads[0]?.text;
}
```

### Прямой HTTP запрос

```bash
curl -X POST http://172.17.0.1:3002/exec \
  -H "Content-Type: application/json" \
  -d '{
    "command": "openclaw config set channels.telegram.enabled true",
    "token": "your-host-executor-token"
  }'
```

## Работа с Gateway

### От backend (WebSocket)

```typescript
import { getGatewayClient } from './services/gateway';

const gateway = getGatewayClient();

// Отправить сообщение агенту
await gateway.sendAgentMessage(agentId, message, sessionKey);

// Получить список агентов
const agents = gateway.getConnectedAgents();

// Получить health status
const health = gateway.getLastHealth();
```

**Примечание**: Новые агенты автоматически регистрируются в OpenClaw при создании через `agentsApi.create()`. Gateway перезапускается автоматически для подхвата новых агентов.

### События Gateway

```typescript
// Gateway events forwarded to frontend via WebSocket:
- 'health'          // Periodic health update
- 'agent'           // Agent message/response
- 'heartbeat'       // Heartbeat status
- 'tick'            // Time tick
- 'connect.challenge'  // Auth challenge
- 'hello-ok'        // Auth success
```

## WebSocket протокол (Frontend ↔ Backend)

### Подключение

```javascript
const ws = new WebSocket('wss://your-server/ws');

// Аутентификация через токен (передается в query param или header)
// Backend middleware проверяет JWT токен
```

### Ping/Pong (Keep-alive)

Сервер посылает ping каждые 30 секунд для поддержания соединения открытым во время длительных ответов LLM (5-10 секунд). Это предотвращает таймаут клиента.

### Сообщения от backend

```typescript
// Gateway events
{
  type: 'gateway',
  event: 'health' | 'agent' | 'heartbeat' | 'tick',
  payload: { ... }
}

// Agent responses
{
  type: 'agent',
  agentId: 'clawpanel-1',
  message: { ... }
}

// Terminal output
{
  type: 'terminal',
  data: 'output from SSH'
}
```

### Сообщения в backend

```typescript
// Send message to agent
{
  type: 'chat',
  agentId: 'clawpanel-1',
  content: 'Hello!'
}

// Terminal input
{
  type: 'terminal',
  data: 'command to execute'
}
```

## Структура базы данных (SQLite)

### Таблицы

```sql
-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'operator',
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

-- Agents
CREATE TABLE agents (
  id INTEGER PRIMARY KEY,
  name TEXT,
  model TEXT,
  system_prompt TEXT,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  workspace TEXT,
  status TEXT DEFAULT 'offline',
  created_at INTEGER,
  updated_at INTEGER
);

-- Channels
CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  type TEXT,  -- 'telegram', 'discord', etc.
  name TEXT,
  config TEXT,  -- JSON
  status TEXT DEFAULT 'offline',
  agent_id INTEGER,
  allow_from TEXT,  -- JSON array
  dm_policy TEXT DEFAULT 'pairing',
  created_at INTEGER,
  updated_at INTEGER
);

-- API Keys
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY,
  provider TEXT,
  key_name TEXT,
  key_value TEXT,  -- encrypted
  is_active INTEGER DEFAULT 1,
  created_at INTEGER
);

-- Skills
CREATE TABLE skills (
  id INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  content TEXT,  -- SKILL.md content
  installed_at INTEGER
);
```

## Типичные задачи

### Добавить новый endpoint

```typescript
// backend/src/routes/myFeature.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  // Your code here
  res.json({ success: true, data: [...] });
});

export default router;
```

```typescript
// backend/src/routes/index.ts
import myFeatureRoutes from './myFeature';

router.use('/api/my-feature', myFeatureRoutes);
```

### Добавить новую страницу

```typescript
// frontend/src/pages/MyPage.tsx
import { useState } from 'react';

export function MyPage() {
  // Your component code
  return <div>...</div>;
}
```

```typescript
// frontend/src/App.tsx
import { MyPage } from './pages/MyPage';

// Add route
<Route path="/my-page" element={<MyPage />} />

// Add to navigation
{ icon: IconName, label: 'My Page', path: '/my-page' }
```

### Выполнить openclaw команду из фичи

```typescript
import { execOnHost } from '../services/hostExecutor';

async function myFeature() {
  try {
    const result = await execOnHost('openclaw mycommand');
    
    if (result.success) {
      console.log('Output:', result.stdout);
    } else {
      console.error('Error:', result.stderr);
    }
  } catch (error) {
    console.error('Failed to execute:', error);
  }
}
```

## Отладка

### Логи компонентов

```bash
# Gateway (host)
sudo journalctl -u openclaw-gateway -f

# Host Executor (host)
sudo journalctl -u clawpanel-host-executor -f

# Backend (docker)
docker compose logs -f backend

# Frontend (docker)
docker compose logs -f frontend

# Nginx (docker)
docker compose logs -f nginx
```

### Тестирование компонентов

```bash
# Test Gateway from host
curl http://localhost:18789

# Test Host Executor from host
curl -X POST http://localhost:3002/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"openclaw --version","token":"..."}'

# Test Host Executor from container
docker compose exec backend wget -qO- \
  --post-data='{"command":"openclaw --version","token":"..."}' \
  --header='Content-Type: application/json' \
  http://172.17.0.1:3002/exec

# Test Gateway from container
docker compose exec backend wget -qO- \
  http://host.docker.internal:18789
```

### База данных

```bash
# Access SQLite from host
sudo sqlite3 /var/lib/docker/volumes/clawpanel_backend-data/_data/clawpanel.db

# Common queries
.tables
SELECT * FROM users;
SELECT * FROM agents;
SELECT * FROM channels;
```

## Разработка

### Локальная разработка backend

```bash
cd backend
npm install
npm run dev  # Uses tsx watch
```

### Локальная разработка frontend

```bash
cd frontend
npm install
npm run dev  # Vite dev server
```

### Пересборка Docker

```bash
# Full rebuild
docker compose down
docker compose build --no-cache
docker compose up -d

# Single service
docker compose build --no-cache backend
docker compose up -d backend
```

## Chain Execution (Цепочки агентов)

Мульти-агентные цепочки позволяют создавать пайплайны: разработка → код-ревью → исправление.

### Архитектура цепочек

```
Пользовательский запрос
        │
        ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Step 1      │────▶│   Step 2      │────▶│   Step 3      │
│  Developer    │     │   Reviewer    │     │  Developer    │
│  Agent #1     │     │   Agent #26   │     │  Agent #1     │
└───────────────┘     └───────────────┘     └───────────────┘
       │                      │                      │
       ▼                      ▼                      ▼
   chain_steps             chain_steps            chain_steps
   (output saved)          (output saved)         (output saved)
```

### Таблицы БД

```sql
-- Хранение результатов каждого шага
CREATE TABLE chain_steps (
  id INTEGER PRIMARY KEY,
  run_id INTEGER,           -- FK to chain_runs
  step_order INTEGER,       -- Порядковый номер шага
  agent_id INTEGER,         -- ID агента
  input TEXT,               -- Промпт (с контекстом от предыдущих шагов)
  output TEXT,              -- Ответ агента
  status TEXT,              -- pending|running|completed|error
  started_at INTEGER,
  completed_at INTEGER
);
```

### Как работает передача контекста

```typescript
// Каждый шаг получает вывод ВСЕХ предыдущих шагов
async function buildStepPrompt(runId, currentStep, currentIndex) {
  const previousSteps = db.query(
    'SELECT output FROM chain_steps WHERE run_id = ? AND step_order < ?'
  );
  
  let prompt = '';
  previousSteps.forEach(step => {
    const cleanOutput = parseAgentOutput(step.output);
    prompt += `Previous output:\n${cleanOutput}\n\n`;
  });
  
  prompt += currentStep.instruction;
  return prompt;
}
```

### Пример цепочки из 3 агентов

```json
[
  {
    "id": "step1",
    "agentId": 1,
    "instruction": "Напиши функцию факториала на Python"
  },
  {
    "id": "step2", 
    "agentId": 26,
    "instruction": "Проверь код на ошибки и стиль"
  },
  {
    "id": "step3",
    "agentId": 1,
    "instruction": "Исправь код по рекомендациям"
  }
]
```

### Парсинг ответа агента

Агенты возвращают JSON с `payloads`, нужно извлечь чистый текст:

```typescript
function parseAgentOutput(output: string): string {
  if (!output.includes('"payloads"')) return output;
  
  const jsonMatch = output.match(/\{[\s\S]*"payloads"[\s\S]*\}/);
  if (jsonMatch) {
    const response = JSON.parse(jsonMatch[0]);
    return response.payloads[0]?.text || output;
  }
  return output;
}
```

## Распространенные проблемы

### "Host Executor unavailable"

```bash
# 1. Check service status
sudo systemctl status clawpanel-host-executor

# 2. Check port
sudo ss -tlnp | grep 3002

# 3. Check iptables
sudo iptables -L INPUT -n | grep 3002
sudo iptables -L DOCKER -n | grep 3002

# 4. Restart service
sudo systemctl restart clawpanel-host-executor
```

### "Gateway WebSocket handshake failed"

```bash
# 1. Check service status
sudo systemctl status openclaw-gateway

# 2. Check token match
cat ~/.openclaw/openclaw.json | jq '.gateway.auth.token'
cat .env | grep GATEWAY_TOKEN

# 3. Check network from container
docker compose exec backend wget http://host.docker.internal:18789
```

### "Cannot execute openclaw command"

Убедитесь, что:
1. Команда начинается с `openclaw `
2. Токен Host Executor правильный
3. OpenClaw установлен на хосте: `which openclaw`

## Ссылки

- [OpenClaw Documentation](https://github.com/openclaw/openclaw)
- [Gateway Protocol Specification](https://github.com/openclaw/openclaw/blob/main/docs/gateway-protocol.md)
- [React Documentation](https://react.dev/)
- [Express.js Documentation](https://expressjs.com/)
