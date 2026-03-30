# ClawPanel — Документация для AI Агентов

## Обзор проекта

**ClawPanel** — веб-панель управления для [OpenClaw](https://github.com/openclaw/openclaw) (многоагентная LLM-система). Предоставляет UI для управления агентами, LLM-провайдерами, навыками, цепочками (chains), каналами коммуникации, MCP-серверами и мониторинга.

### Технологический стек

| Компонент | Технология | Версия |
|-----------|------------|--------|
| Frontend | React + TypeScript + Vite | React 18, Node 20 |
| Backend | Node.js + Express + TypeScript | Node 20+ |
| База данных | SQLite | better-sqlite3 |
| Стилизация | Tailwind CSS | v3.4+ |
| State Management | Zustand | v4.5+ |
| HTTP Client | Axios | v1.6+ |
| WebSocket | ws (backend) + Native API (frontend) | v8.16+ |
| UI Components | Radix UI | v1.x |
| Документация API | Swagger/OpenAPI | v3.0 |
| E2E Testing | Playwright | v1.58+ |

### Архитектура системы

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

### Компоненты системы

| Компонент | Описание | Порт | Расположение |
|-----------|----------|------|--------------|
| **Nginx** | Reverse proxy, SSL termination | 80, 443 | Docker |
| **Frontend** | React SPA | 80 (internal) | Docker |
| **Backend** | Node.js API, Gateway WS клиент | 3000 | Docker |
| **OpenClaw Gateway** | Gateway для агентов | 18789 | Host (systemd) |
| **Host Executor** | HTTP API для openclaw команд | 3002 | Host (systemd) |

## Структура проекта

```
clawpanel/
├── backend/                    # Node.js + Express backend
│   ├── src/
│   │   ├── __tests__/          # Unit тесты (Jest)
│   │   ├── config/             # Конфигурация приложения
│   │   ├── database/           # SQLite + миграции
│   │   ├── middleware/         # Express middleware (auth, audit, errors)
│   │   ├── routes/             # API endpoints
│   │   ├── services/           # Бизнес-логика
│   │   ├── types/              # TypeScript типы
│   │   ├── utils/              # Утилиты
│   │   ├── websocket/          # WebSocket сервер для frontend
│   │   ├── index.ts            # Точка входа
│   │   └── swagger.ts          # Документация API
│   ├── Dockerfile              # Production образ
│   ├── Dockerfile.test         # Test образ
│   ├── jest.config.js          # Конфигурация тестов
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # React + Vite frontend
│   ├── src/
│   │   ├── components/         # React компоненты
│   │   ├── pages/              # Страницы приложения
│   │   ├── services/           # API клиент (axios)
│   │   ├── stores/             # Zustand stores
│   │   ├── types/              # TypeScript типы
│   │   ├── App.tsx             # Корневой компонент
│   │   └── main.tsx            # Точка входа
│   ├── Dockerfile              # Multi-stage build
│   ├── nginx.conf              # Nginx config для SPA
│   ├── package.json
│   ├── tailwind.config.js      # Tailwind конфигурация
│   ├── tsconfig.json
│   └── vite.config.ts          # Vite конфигурация
├── nginx/                      # Nginx reverse proxy
│   ├── nginx.conf              # Основная конфигурация
│   └── ssl/                    # SSL сертификаты
├── e2e/                        # E2E тесты (Playwright)
├── scripts/                    # Утилиты
├── host-executor.js            # Host Executor (systemd)
├── docker-compose.yml          # Production orchestration
├── docker-compose.test.yml     # Test orchestration
├── install.sh                  # Установочный скрипт
├── playwright.config.ts        # Конфигурация E2E тестов
└── .env.example                # Шаблон переменных окружения
```

## Команды сборки и разработки

### Локальная разработка

```bash
# Backend
cd backend
npm install
npm run dev              # tsx watch src/index.ts
npm run build            # tsc компиляция
npm run start            # node dist/index.js
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit

# Frontend
cd frontend
npm install
npm run dev              # Vite dev server (port 5173)
npm run build            # Production build
npm run preview          # Preview production build
npm run lint             # ESLint
```

### Docker разработка

```bash
# Полный запуск
docker compose up -d

# Пересборка
docker compose down
docker compose build --no-cache
docker compose up -d

# Логи
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx

# База данных
docker compose exec backend npx tsx src/database/migrate.ts

# Сброс пароля admin
docker compose exec backend node /app/fix-admin.js
```

### Тестирование

```bash
# Все тесты
./scripts/test.sh all

# Backend unit тесты
./scripts/test.sh backend

# Coverage
./scripts/test.sh coverage

# Frontend build test
./scripts/test.sh frontend

# E2E тесты
./scripts/test.sh e2e

# Напрямую через npm (backend)
cd backend
npm test                 # Jest
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# E2E через Playwright
npx playwright test
```

## Структура базы данных (SQLite)

### Таблицы

```sql
-- Пользователи
users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'operator',  -- admin, operator, viewer
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  login_attempts INTEGER DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER,
  updated_at INTEGER
)

-- Refresh токены
refresh_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER
)

-- Агенты
agents (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  role TEXT,
  description TEXT,
  color TEXT DEFAULT '#e8ff5a',
  model TEXT,
  fallback_model TEXT,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  thinking_level TEXT DEFAULT 'medium',
  sandbox_mode INTEGER DEFAULT 0,
  system_prompt TEXT,
  status TEXT DEFAULT 'idle',
  skills TEXT,              -- JSON array
  tools TEXT,               -- JSON array
  delegate_to TEXT,         -- JSON array
  created_at INTEGER,
  updated_at INTEGER
)

-- LLM провайдеры
llm_providers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  api_key_env TEXT NOT NULL,
  base_url TEXT,
  enabled INTEGER DEFAULT 1,
  models TEXT               -- JSON array
)

-- Цепочки (Chains)
chains (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  nodes TEXT NOT NULL,      -- JSON (React Flow format)
  edges TEXT NOT NULL,      -- JSON (React Flow format)
  triggers TEXT,            -- JSON array
  variables TEXT,           -- JSON object
  enabled INTEGER DEFAULT 1
)

-- Запуски цепочек
chain_runs (
  id INTEGER PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL,     -- running, completed, failed
  started_at INTEGER,
  completed_at INTEGER,
  output TEXT,              -- JSON
  error TEXT
)

-- Шаги цепочек
chain_steps (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  agent_name TEXT,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER
)

-- Навыки (Skills)
skills (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,     -- clawhub, upload, builtin
  path TEXT,
  content TEXT,             -- SKILL.md content
  enabled INTEGER DEFAULT 1,
  security_flags TEXT       -- JSON
)

-- Каналы
channels (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,       -- telegram, discord, whatsapp, slack
  name TEXT NOT NULL,
  config TEXT NOT NULL,     -- JSON
  status TEXT DEFAULT 'offline',
  agent_id INTEGER,
  allow_from TEXT,          -- JSON array (whitelist)
  dm_policy TEXT DEFAULT 'pairing'
)

-- MCP серверы (v2 - с поддержкой mcporter)
mcp_servers (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  url TEXT,                 -- Для HTTP transport (nullable)
  auth_type TEXT DEFAULT 'none',  -- none, api_key, bearer, basic
  auth_config TEXT,         -- JSON
  config_json TEXT,         -- Raw JSON from pulsemcp.com
  -- MCP v2 поля для OpenClaw mcporter
  transport_type TEXT DEFAULT 'stdio',  -- stdio, http, websocket
  command TEXT,             -- Для stdio transport
  args TEXT,                -- JSON array
  env TEXT,                 -- JSON object для env vars
  description TEXT,
  is_builtin INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
)

-- Инструменты (Tools)
tools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,       -- browser, cron, webhook, mcp
  config TEXT,              -- JSON
  enabled INTEGER DEFAULT 1,
  agent_id INTEGER,         -- NULL = available to all
  mcp_server_id INTEGER     -- NULL = built-in tool
)

-- Сообщения чата
chat_messages (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  role TEXT NOT NULL,       -- 'user' or 'assistant'
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  model TEXT,
  session_id TEXT,
  created_at INTEGER
)

-- Audit логи
audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,             -- JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER
)

-- Настройки
settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER
)

-- Сессии (кэш)
sessions_cache (
  id INTEGER PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  agent_id INTEGER,
  status TEXT DEFAULT 'idle',
  tokens_used INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  last_activity INTEGER,
  data TEXT                 -- JSON
)
```

## API Endpoints

### Базовый URL
- `/api` — REST API
- `/api/docs` — Swagger документация
- `/ws` — WebSocket endpoint

### Основные маршруты

```typescript
// Authentication
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/2fa/setup
POST   /api/auth/2fa/verify
POST   /api/auth/change-password

// Dashboard
GET    /api/dashboard/stats
GET    /api/dashboard/events
POST   /api/dashboard/actions/restart-gateway
POST   /api/dashboard/actions/clear-sessions

// Agents
GET    /api/agents
POST   /api/agents
GET    /api/agents/:id
PUT    /api/agents/:id
DELETE /api/agents/:id
GET    /api/agents/:id/agents-md
PUT    /api/agents/:id/agents-md
GET    /api/agents/:id/soul-md
PUT    /api/agents/:id/soul-md
GET    /api/agents/:id/skills
PUT    /api/agents/:id/skills

// LLM
GET    /api/llm/providers
POST   /api/llm/providers/:id/test
GET    /api/llm/models
PUT    /api/llm/providers/:id/api-key
DELETE /api/llm/providers/:id/api-key

// Sessions
GET    /api/sessions
GET    /api/sessions/:id/history
POST   /api/sessions/:id/compact
POST   /api/sessions/:id/reset

// Skills
GET    /api/skills
POST   /api/skills/install
POST   /api/skills/upload
GET    /api/skills/search

// Chains
GET    /api/chains
POST   /api/chains
GET    /api/chains/:id
PUT    /api/chains/:id
DELETE /api/chains/:id
POST   /api/chains/:id/run
GET    /api/chains/runs/:id
GET    /api/chains/runs/:id/status
GET    /api/chains/runs/:id/download

// Channels
GET    /api/channels
POST   /api/channels
PUT    /api/channels/:id
DELETE /api/channels/:id

// MCP (v2 - с mcporter интеграцией)
GET    /api/mcp                    # Список всех MCP серверов
GET    /api/mcp/builtin            # Встроенные MCP серверы
POST   /api/mcp                    # Создать MCP сервер
GET    /api/mcp/:id                # Получить MCP сервер
PUT    /api/mcp/:id                # Обновить MCP сервер
DELETE /api/mcp/:id                # Удалить MCP сервер
POST   /api/mcp/:id/test           # Тест подключения
POST   /api/mcp/sync               # Синхронизировать с mcporter.json
POST   /api/mcp/import-json        # Импорт из JSON

// Tools
GET    /api/tools
POST   /api/tools
PUT    /api/tools/:id
DELETE /api/tools/:id

// Files
GET    /api/files/tree
GET    /api/files/content
PUT    /api/files/content
POST   /api/files/create
DELETE /api/files

// Users
GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id

// Settings
GET    /api/settings
PUT    /api/settings
POST   /api/settings/backup
POST   /api/settings/restore
```

## MCP (Model Context Protocol)

### Архитектура MCP в OpenClaw

OpenClaw использует **mcporter** skill для работы с MCP серверами. Конфигурация хранится в:
```
~/.openclaw/workspace/config/mcporter.json
```

### Типы транспорта

| Тип | Описание | Когда использовать |
|-----|----------|-------------------|
| **stdio** | Локальные команды (npx, python, node) | Для локальных MCP серверов |
| **http** | HTTP эндпоинты через mcp-remote bridge | Для удаленных MCP серверов |

### Встроенные MCP серверы

- **filesystem** — работа с файлами
- **brave-search** — поиск в интернете
- **puppeteer** — автоматизация браузера
- **github** — интеграция с GitHub
- **postgres** — доступ к PostgreSQL

### Сервис mcporter

```typescript
// backend/src/services/mcporter.ts

// Чтение/запись mcporter.json
readMcporterConfig(): Promise<MCPorterConfig>
writeMcporterConfig(config): Promise<boolean>

// Синхронизация серверов
syncServerToMcporter(name, server): Promise<boolean>
removeServerFromMcporter(name): Promise<boolean>
syncAllServersToMcporter(servers): Promise<boolean>

// Проверка mcp-remote
isMcpRemoteInstalled(): Promise<boolean>
installMcpRemote(): Promise<boolean>
```

### Пример конфигурации mcporter.json

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-key"
      }
    },
    "remote-api": {
      "command": "mcp-remote",
      "args": ["https://api.example.com/mcp"]
    }
  }
}
```

## Цепочки (Chains)

### History Mode

При создании шага цепочки можно выбрать режим передачи контекста:

| Режим | Описание |
|-------|----------|
| **last-only** | Передается только вывод предыдущего шага (по умолчанию) |
| **full-history** | Передается полная история всех предыдущих шагов |
| **smart** | Автоматически определяет, нужна ли полная история |

### Формат chain_steps

```typescript
interface ChainStep {
  id: string;
  agentId: number;
  instruction: string;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  historyMode?: 'last-only' | 'full-history' | 'smart';
  startedAt?: number;
  completedAt?: number;
}
```

## WebSocket протокол

### Подключение
```javascript
const ws = new WebSocket('wss://your-server/ws/chat?token=JWT_TOKEN');
```

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

## Работа с Host Executor

### От backend (TypeScript)
```typescript
import { execOnHost } from './services/hostExecutor';

// Выполнить команду
const result = await execOnHost('openclaw agents list');
console.log(result.stdout);

// Парсинг JSON из stderr (fallback режим)
const output = result.stdout?.trim() || result.stderr?.trim() || '';
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

## Переменные окружения

### Backend
```env
# Обязательные
JWT_SECRET=                          # openssl rand -hex 32
GATEWAY_TOKEN=                       # Токен из ~/.openclaw/openclaw.json
HOST_EXECUTOR_TOKEN=                 # Токен для Host Executor

# Опциональные
NODE_ENV=production                  # production | development
PORT=3000
GATEWAY_URL=ws://host.docker.internal:18789
HOST_EXECUTOR_URL=http://172.17.0.1:3002
SQLITE_PATH=/data/clawpanel.db
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
CORS_ORIGIN=*
```

### Frontend
```env
VITE_API_URL=/api
VITE_WS_URL=/ws
```

## Руководство по стилю кода

### TypeScript
- Использовать strict mode (включен в проекте)
- Явные return types для функций
- Избегать `any` — использовать `unknown` + type guards
- Предпочитать `interface` над `type`
- Использовать enums для констант

### React
- Функциональные компоненты + hooks
- Обязательны cleanup функции в useEffect
- Zustand для state management
- Memoize дорогие вычисления (useMemo, useCallback)

### Именование
- **Компоненты**: PascalCase (`AgentCard.tsx`)
- **Функции/переменные**: camelCase (`getAgentById`)
- **Константы**: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Типы/Интерфейсы**: PascalCase (`AgentConfig`)
- **Файлы**: kebab-case для utils, PascalCase для компонентов

### Обработка ошибок
```typescript
try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error });
  return { success: false, error: error.message };
}
```

## Тестирование

### Backend (Jest)
- Тесты в `backend/src/__tests__/`
- Naming: `*.test.ts`
- In-memory SQLite для тестов
- Setup: `backend/src/__tests__/setup.ts`

```typescript
// Пример теста
describe('Agents API', () => {
  it('should create agent', async () => {
    const response = await request(app)
      .post('/api/agents')
      .send({ name: 'Test Agent', model: 'gpt-4' })
      .expect(201);
    
    expect(response.body.success).toBe(true);
  });
});
```

### E2E (Playwright)
- Тесты в корне проекта: `*.spec.ts`
- Конфигурация: `playwright.config.ts`
- Запуск против запущенного приложения
- Скриншоты при ошибках

```bash
# Запуск E2E
npx playwright test

# Конкретный тест
npx playwright test e2e-test.spec.ts
```

### Доступные E2E тесты
- `e2e-test.spec.ts` — основные сценарии (логин, навигация)
- `e2e-chat-test.spec.ts` — тест чата с WebSocket
- `e2e-create-agent.spec.ts` — создание агента
- `e2e-websocket-test.spec.ts` — дебаг WebSocket
- `e2e-terminal-test.spec.ts` — тест терминала
- `e2e/mcp-happy-path.spec.ts` — тест MCP

## Безопасность

### Аутентификация
- JWT tokens (access + refresh)
- TOTP 2FA поддержка
- Rate limiting (100 req/min по умолчанию)
- Account lockout после неудачных попыток

### Авторизация
- Role-based access control (RBAC)
- Роли: admin, operator, viewer
- Middleware: `authenticateToken`, `requireRole`

### Gateway соединение
- Token-based аутентификация
- Challenge-response handshake
- Автоматический reconnect с backoff

### Host Executor
- Только `openclaw *` команды разрешены
- Токен-аутентификация
- Таймаут 1 час, max buffer 1MB

### MCP Security
- API ключи хранятся в mcporter.json на хосте
- Не логировать секреты
- Валидация URL для HTTP transport
- Автоматическая установка mcp-remote при необходимости

### Рекомендации
- Никогда не логировать секреты
- Всегда валидировать входные данные (Zod)
- Использовать parameterized queries (SQLite)
- Content Security Policy включен
- Helmet для security headers

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

# Test from container
docker compose exec backend wget -qO- \
  --post-data='{"command":"openclaw --version","token":"..."}' \
  --header='Content-Type: application/json' \
  http://172.17.0.1:3002/exec

# Check mcporter.json
docker compose exec backend cat ~/.openclaw/workspace/config/mcporter.json
```

### База данных
```bash
# Доступ к SQLite из хоста
sudo sqlite3 /var/lib/docker/volumes/clawpanel_backend-data/_data/clawpanel.db

# Полезные запросы
.tables
SELECT * FROM users;
SELECT * FROM agents;
SELECT * FROM mcp_servers;
SELECT * FROM channels;
```

## Распространенные проблемы

### "Host Executor unavailable"
```bash
# 1. Проверить статус сервиса
sudo systemctl status clawpanel-host-executor

# 2. Проверить порт
sudo ss -tlnp | grep 3002

# 3. Проверить iptables
sudo iptables -L INPUT -n | grep 3002

# 4. Перезапустить
sudo systemctl restart clawpanel-host-executor
```

### "Gateway WebSocket handshake failed"
```bash
# 1. Проверить статус Gateway
sudo systemctl status openclaw-gateway

# 2. Проверить совпадение токенов
cat ~/.openclaw/openclaw.json | jq '.gateway.auth.token'
cat .env | grep GATEWAY_TOKEN

# 3. Проверить сеть из контейнера
docker compose exec backend wget http://host.docker.internal:18789
```

### "Cannot execute openclaw command"
- Команда должна начинаться с `openclaw `
- Проверить токен Host Executor
- Проверить установку OpenClaw: `which openclaw`

### MCP сервер не работает
```bash
# 1. Проверить mcporter.json
cat ~/.openclaw/workspace/config/mcporter.json

# 2. Проверить что сервер синхронизирован
# В панели: MCP Servers → Sync to OpenClaw

# 3. Проверить mcp-remote для HTTP серверов
which mcp-remote

# 4. Установить mcp-remote если нужно
npm install -g mcp-remote@0.1.38

# 5. Перезапустить Gateway
sudo systemctl restart openclaw-gateway
```

## CI/CD

### GitHub Actions
- Линтинг и type checking
- Backend unit тесты
- Frontend build
- E2E тесты (опционально)

### Деплой
1. Обновить код: `git pull`
2. Пересобрать: `docker compose build`
3. Перезапустить: `docker compose up -d`
4. Миграции: `docker compose exec backend npx tsx src/database/migrate.ts`

## Полезные ссылки

- [OpenClaw Documentation](https://github.com/openclaw/openclaw)
- [MCP Specification](https://modelcontextprotocol.io/)
- [OpenClaw MCP Guide](https://www.openclawcenter.com/docs/mcp)
- [Pulse MCP Registry](https://www.pulsemcp.com/servers)
- [React Documentation](https://react.dev/)
- [Express.js Documentation](https://expressjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
