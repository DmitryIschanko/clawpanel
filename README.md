# ClawPanel

Веб-панель управления для [OpenClaw](https://github.com/openclaw/openclaw) — многоагентной LLM-системы.

## Возможности

- **Dashboard** — live-лента событий, статус агентов и каналов, расход токенов
- **Agent Manager** — создание, редактирование и удаление агентов с настройками
- **LLM Manager** — управление провайдерами (Anthropic, OpenAI, Google, Kimi, и др.), API ключи, тестирование подключения
- **WebChat** — чат с агентами в реальном времени через WebSocket
- **Chain Builder** — создание цепочек агентов для workflow
- **Skill Manager** — установка скилов из ClawHub, загрузка SKILL.md, Monaco Editor
- **Channel Manager** — подключение Telegram, Discord, WhatsApp, Slack с настройками whitelist
- **File Manager** — просмотр и редактирование файлов с Monaco Editor
- **Web Terminal** — полноценный SSH терминал к серверу с OpenClaw CLI (xterm.js)
- **Monitoring** — графики использования, логи, алерты
- **Settings** — редактор openclaw.json с валидацией, backup/restore

## Архитектура

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
                 │   - openclaw config     │
                 │   - openclaw agents     │
                 │   - openclaw channels   │
                 └─────────────────────────┘
```

### Компоненты системы

| Компонент | Описание | Порт | Тип |
|-----------|----------|------|-----|
| **Nginx** | Reverse proxy, SSL termination | 80, 443 | Docker |
| **Frontend** | React 18 приложение | 80 (internal) | Docker |
| **Backend** | Node.js API, Gateway WebSocket клиент | 3000 | Docker |
| **OpenClaw Gateway** | Основной Gateway для агентов | 18789 | Host (systemd) |
| **Host Executor** | HTTP API для выполнения openclaw команд | 3002 | Host (systemd) |

## Требования

- Ubuntu 22.04+ / Debian 12+
- Docker 24.0+
- Docker Compose 2.0+
- Node.js 24 LTS (для OpenClaw Gateway)
- OpenSSH server (для терминала)
- 2GB RAM минимум
- 10GB свободного места

## Быстрый старт

### 1. Установка OpenClaw Gateway

```bash
# Установить Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

# Установить OpenClaw
npm install -g openclaw@latest

# Создать конфигурацию
mkdir -p ~/.openclaw

# Генерируем токены
GATEWAY_TOKEN=$(openssl rand -hex 32)
HOST_EXECUTOR_TOKEN=$(openssl rand -hex 32)

cat > ~/.openclaw/openclaw.json << CONFIG
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4.6"
      },
      "workspace": "~/.openclaw/workspace"
    }
  },
  "gateway": {
    "port": 18789,
    "bind": "lan",
    "mode": "local",
    "controlUi": {
      "allowedOrigins": [
        "http://localhost:18789",
        "http://127.0.0.1:18789"
      ]
    },
    "auth": {
      "mode": "token",
      "token": "$GATEWAY_TOKEN"
    }
  }
}
CONFIG

# Сохранить токены
echo "$GATEWAY_TOKEN" > ~/.openclaw/gateway-token.txt
echo "$HOST_EXECUTOR_TOKEN" > ~/.openclaw/host-executor-token.txt

# Создать systemd сервис для Gateway
sudo tee /etc/systemd/system/openclaw-gateway.service > /dev/null << 'SERVICE'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/openclaw gateway --verbose
Restart=always
RestartSec=5
Environment="HOME=/root"
WorkingDirectory=/root

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-gateway

# Проверить статус
sudo systemctl status openclaw-gateway
```

### 2. Установка Host Executor

Host Executor — HTTP сервис на хосте, который позволяет Docker контейнеру выполнять `openclaw` команды.

```bash
cd /path/to/clawpanel

# Скопировать сервис
sudo cp host-executor.js /usr/local/bin/
sudo chmod +x /usr/local/bin/host-executor.js

# Создать systemd сервис
sudo tee /etc/systemd/system/clawpanel-host-executor.service > /dev/null << SERVICE
[Unit]
Description=ClawPanel Host Executor
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/usr/local/bin
ExecStartPre=/bin/sh -c 'iptables -C INPUT -p tcp --dport 3002 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 3002 -j ACCEPT'
ExecStartPre=/bin/sh -c 'iptables -C DOCKER -p tcp --dport 3002 -j ACCEPT 2>/dev/null || iptables -I DOCKER 1 -p tcp --dport 3002 -j ACCEPT'
ExecStart=/usr/bin/node /usr/local/bin/host-executor.js
Restart=always
RestartSec=5
Environment="HOST_EXECUTOR_PORT=3002"
Environment="HOST_EXECUTOR_TOKEN=$(cat ~/.openclaw/host-executor-token.txt)"

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable --now clawpanel-host-executor

# Проверить статус
sudo systemctl status clawpanel-host-executor
```

### 3. Установка ClawPanel

```bash
# Клонировать репозиторий
git clone https://github.com/yourusername/clawpanel.git
cd clawpanel

# Настроить окружение
cat > .env << ENV
# JWT Secret (обязательно смените!)
JWT_SECRET=$(openssl rand -hex 32)

# Node Environment
NODE_ENV=production

# OpenClaw Gateway URL
GATEWAY_URL=ws://host.docker.internal:18789

# OpenClaw Gateway Token
GATEWAY_TOKEN=$(cat ~/.openclaw/gateway-token.txt)

# Host Executor Configuration
HOST_EXECUTOR_URL=http://172.17.0.1:3002
HOST_EXECUTOR_TOKEN=$(cat ~/.openclaw/host-executor-token.txt)

# SSH Terminal Configuration
SSH_HOST=host.docker.internal
SSH_USER=root
SSH_PORT=22
SSH_KEY_PATH=/root/.ssh/id_ed25519

# Database
SQLITE_PATH=/data/clawpanel.db

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
ENV

# Собрать и запустить
docker compose build
docker compose up -d

# Инициализировать базу данных
docker compose exec backend npx tsx src/database/migrate.ts

# Сбросить пароль admin (если нужно)
docker compose exec backend node /app/fix-admin.js
```

### 4. Доступ

- **ClawPanel**: http://your-server-ip
- **Логин**: `admin`
- **Пароль**: `admin`

**⚠️ Важно**: Смените пароль сразу после первого входа!

## Настройка API ключей

### Через UI (рекомендуется)

1. Перейдите в раздел **LLM Providers**
2. Нажмите **"Add API key"** для нужного провайдера
3. Введите API ключ
4. Ключ сохраняется в базе данных SQLite

### Через openclaw.json (для OpenClaw CLI)

Отредактируйте `~/.openclaw/openclaw.json`:

```json
{
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "api_key",
        "apiKey": "sk-ant-..."
      },
      "openai:default": {
        "provider": "openai",
        "mode": "api_key",
        "apiKey": "sk-..."
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "anthropic": {
        "baseUrl": "https://api.anthropic.com",
        "api": "anthropic-messages"
      },
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "api": "openai"
      }
    }
  }
}
```

Перезапустите Gateway:
```bash
sudo systemctl restart openclaw-gateway
```

## Поддерживаемые модели (2026)

### Anthropic
- Claude Opus 4.6, Claude Sonnet 4.6
- Claude Opus 4.5, Claude Sonnet 4.5

### OpenAI
- GPT-5.4, GPT-5.4 Codex
- GPT-5.3, GPT-5.2

### Google
- Gemini 3.1 Pro, Gemini 3.1 Flash
- Gemini 3 Pro, Gemini 3 Flash

### Kimi (Moonshot)
- Kimi K2.5, Kimi K2, Kimi K1.6

### xAI
- Grok 4.1, Grok 4, Grok 3

### Mistral
- Mistral Large 3, Mistral Medium 3

### OpenRouter
- DeepSeek V3.2, DeepSeek R1
- Qwen 3.5, GLM-5, MiniMax M2.5

## Host Executor

Host Executor — HTTP API сервис, который позволяет Docker контейнеру выполнять `openclaw` команды на хосте.

### Зачем нужен?

Docker контейнер не может напрямую выполнять команды `openclaw` на хосте. Host Executor решает эту проблему:

- **Channel Manager** — настройка Telegram, Discord ботов через `openclaw config`
- **Agent Management** — создание и управление агентами через `openclaw agents`
- **Gateway Control** — перезапуск Gateway через `systemctl`

### API Endpoints

```bash
# Health check
GET http://172.17.0.1:3002/health

# Execute command
POST http://172.17.0.1:3002/exec
Content-Type: application/json

{
  "command": "openclaw agents list",
  "token": "your-host-executor-token"
}
```

### Безопасность

- Токен-аутентификация (`HOST_EXECUTOR_TOKEN`)
- Только `openclaw *` команды разрешены (whitelist)
- Доступ только из Docker сетей (iptables)
- Не слушает на публичных интерфейсах

## Web Terminal (SSH)

ClawPanel включает **полноценный SSH терминал** с прямым доступом к серверу, где установлен OpenClaw.

### Особенности:
- Подключение через SSH ключи (без пароля)
- Полный доступ к OpenClaw CLI
- Поддержка всех команд терминала
- Автоматическая генерация ключей при установке

### Как использовать:
1. Откройте **Terminal** в боковом меню
2. Терминал автоматически подключится к серверу через SSH
3. Используйте `openclaw` команды напрямую:
   ```bash
   openclaw doctor          # Проверка состояния
   openclaw onboard         # Настройка каналов
   openclaw --help          # Справка
   ```

### Безопасность:
- SSH ключи генерируются автоматически во время установки
- Ключи хранятся только внутри Docker контейнера
- Доступ только к локальному хосту (host.docker.internal)

## Skill Manager (ClawHub)

ClawPanel интегрирован с [ClawHub](https://clawhub.ai/) — официальным реестром скиллов для OpenClaw.

### Возможности:
- **Поиск скиллов** — поиск по названию и описанию
- **Просмотр** — просмотр деталей скилла на clawhub.ai
- **Установка** — автоматическая загрузка и распаковка ZIP архива
- **ZIP Extraction** — автоматическое извлечение SKILL.md из архива
- **Monaco Editor** — редактирование SKILL.md прямо в браузере

### Как использовать:
1. Перейдите в раздел **Skills**
2. Нажмите **"Search ClawHub"** для поиска
3. Введите ключевое слово (например: `web`, `search`, `fetch`)
4. Выберите скилл из результатов поиска
5. Нажмите **"+"** для установки
6. Или используйте **"From ClawHub"** для прямой установки по имени

### Технические детали:
- API endpoint: `https://clawhub.ai/api/v1/`
- Формат: ZIP архив с SKILL.md
- Автоматическая распаковка с помощью `adm-zip`
- Содержимое SKILL.md сохраняется в базу данных SQLite

## Создание агентов

### Через Web UI

1. Перейдите в раздел **Agents**
2. Нажмите **"Create Agent"**
3. Заполните форму:
   - **Name** — имя агента
   - **Role** — роль (например: "Developer")
   - **Model** — выберите LLM модель (только с настроенными API ключами)
   - **Temperature** — креативность (0.0 — точный, 2.0 — максимально креативный)
4. Нажмите **"Create"**

**Что происходит при создании:**
1. Агент создаётся в базе данных
2. Создаётся workspace в `~/.openclaw/agents/clawpanel-{id}`
3. Агент регистрируется в OpenClaw (`openclaw agents add`)
4. Gateway автоматически перезапускается

### Режимы работы агентов

| Режим | Описание | Скорость | Требования |
|-------|----------|----------|------------|
| **Gateway** | Прямое подключение к Gateway | ⚡ Быстро (< 1 сек) | Агент зарегистрирован в Gateway |
| **Embedded** | Fallback режим | 🐢 Медленнее (3-5 сек) | Работает всегда |

Новые агенты автоматически работают в Gateway режиме после перезапуска.

## Настройка каналов

### Telegram

1. Перейдите в раздел **Channels**
2. Нажмите **"Add Channel"**
3. Выберите тип **Telegram**
4. Введите:
   - **Name** — название канала (например: "My Bot")
   - **Bot Token** — токен от @BotFather
   - **Agent** — выберите агента, который будет отвечать на сообщения
5. Нажмите **"Create"**

Host Executor автоматически выполнит:
```bash
openclaw config set channels.telegram.enabled true
openclaw config set channels.telegram.botToken "your-token"
openclaw config set channels.telegram.dmPolicy "pairing"
```

**Важно**: После создания канала, агент автоматически привязывается к каналу. Если нужно сменить агента:
```bash
# Отвязать старого агента
openclaw agents unbind --agent main --bind telegram:default

# Привязать нового агента
openclaw agents bind --agent clawpanel-1 --bind telegram:default

# Перезапустить Gateway
sudo systemctl restart openclaw-gateway
```

### Другие каналы

```bash
# Ручная настройка через openclaw.json
openclaw onboard
```

## Команды управления

### OpenClaw Gateway
```bash
# Статус
sudo systemctl status openclaw-gateway

# Логи
sudo journalctl -u openclaw-gateway -f

# Перезапуск
sudo systemctl restart openclaw-gateway
```

### Host Executor
```bash
# Статус
sudo systemctl status clawpanel-host-executor

# Логи
sudo journalctl -u clawpanel-host-executor -f

# Перезапуск
sudo systemctl restart clawpanel-host-executor

# Тест API
curl -X POST http://localhost:3002/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"openclaw --version","token":"your-token"}'
```

### ClawPanel
```bash
cd /path/to/clawpanel

# Логи
docker compose logs -f

# Логи backend
docker compose logs -f backend

# Перезапуск
docker compose restart

# Остановка
docker compose down

# Сброс пароля admin
docker compose exec backend node /app/fix-admin.js

# Обновление (пересборка)
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose exec backend npx tsx src/database/migrate.ts
```

## Структура проекта

```
clawpanel/
├── docker-compose.yml          # Docker Compose конфигурация
├── .env                        # Переменные окружения
├── .env.example                # Пример переменных окружения
├── host-executor.js            # Host Executor HTTP сервис
├── install.sh                  # Скрипт установки
├── fix-admin.js               # Скрипт сброса пароля admin
├── README.md                   # Документация
├── AGENTS.md                   # Документация для AI агентов
├── CHANGELOG.md               # История изменений
├── nginx/
│   └── nginx.conf              # Nginx конфигурация
├── backend/                    # Node.js API
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── ssh-keys/               # SSH ключи для терминала
│   └── src/
│       ├── index.ts            # Entry point
│       ├── config/
│       ├── database/
│       │   └── migrate.ts      # Миграции БД
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       │   ├── gateway.ts      # WebSocket Gateway клиент
│       │   ├── hostExecutor.ts # HTTP клиент для Host Executor
│       │   └── agentRunner.ts  # CLI fallback для сообщений
│       ├── utils/
│       └── websocket/          # WebSocket сервер для UI
└── frontend/                   # React приложение
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx
        ├── components/
        ├── pages/              # Все страницы UI
        ├── services/
        ├── stores/
        └── types/
```

## Переменные окружения

Создайте файл `.env` перед запуском:

```env
# JWT Secret (обязательно смените!)
JWT_SECRET=your-secret-key-here

# Node Environment
NODE_ENV=production

# OpenClaw Gateway URL (Docker container connects to host)
# For Linux: ws://172.17.0.1:18789
# For macOS/Windows: ws://host.docker.internal:18789
GATEWAY_URL=ws://host.docker.internal:18789

# OpenClaw Gateway Token (должен совпадать с openclaw.json)
GATEWAY_TOKEN=your-gateway-token-here

# Host Executor Configuration
HOST_EXECUTOR_URL=http://172.17.0.1:3002
HOST_EXECUTOR_TOKEN=your-host-executor-token-here

# SSH Terminal Configuration (опционально)
SSH_HOST=host.docker.internal
SSH_USER=root
SSH_PORT=22
SSH_KEY_PATH=/root/.ssh/id_ed25519

# Database
SQLITE_PATH=/data/clawpanel.db

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

## Gateway WebSocket Protocol

ClawPanel использует официальный Gateway WebSocket protocol для подключения к OpenClaw Gateway.

### Handshake процесс

1. **Подключение** — Backend устанавливает WebSocket соединение с Gateway
2. **Challenge** — Gateway отправляет `connect.challenge` с `nonce`
3. **Response** — Backend отвечает `connect` запросом с `auth.token`
4. **Authentication** — Gateway подтверждает `hello-ok` или закрывает соединение

Пример успешного handshake:
```
→ WebSocket connect ws://host.docker.internal:18789
← {"type":"event","event":"connect.challenge","payload":{"nonce":"abc123","ts":1234567890}}
→ {"type":"req","method":"connect","params":{"auth":{"token":"..."},...}}
← {"type":"res","ok":true,"payload":{"type":"hello-ok",...}}
```

### Требования к client.id и client.mode

Gateway проверяет поля `client.id` и `client.mode` на соответствие разрешенным значениям:

**client.id:**
- `cli` — CLI клиент
- `gateway-client` — Backend клиент (используется ClawPanel)
- `openclaw-macos` — macOS приложение
- `openclaw-ios` — iOS приложение
- `openclaw-android` — Android приложение
- `node-host` — Нода
- `test` — Тестовый клиент

**client.mode:**
- `cli` — CLI режим
- `ui` — UI режим
- `backend` — Backend сервис (используется ClawPanel)
- `node` — Нода
- `webchat` — Web чат
- `probe` — Пробник
- `test` — Тестовый режим

## Решение проблем

### Не работает логин admin/admin
```bash
# Сбросить пароль
cd /path/to/clawpanel
docker compose exec backend node /app/fix-admin.js
```

### Gateway не подключается (WebSocket handshake failed)

**Симптомы:**
- Dashboard показывает `gateway: { connected: false }`
- В логах backend: `invalid connect params` или `invalid-handshake`

**Проверки:**
```bash
# 1. Проверить, что Gateway запущен
sudo systemctl status openclaw-gateway

# 2. Проверить порт
ss -tlnp | grep 18789

# 3. Проверить токен Gateway
cat ~/.openclaw/openclaw.json | jq -r '.gateway.auth.token'

# 4. Проверить GATEWAY_TOKEN в .env
cat /path/to/clawpanel/.env | grep GATEWAY_TOKEN

# 5. Проверить сетевой доступ из контейнера
docker compose exec backend wget -qO- http://host.docker.internal:18789

# 6. Проверить логи Gateway
sudo journalctl -u openclaw-gateway -f

# 7. Проверить логи backend
docker compose logs -f backend
```

**Решения:**

1. **Неверный токен** — Убедитесь, что `GATEWAY_TOKEN` в `.env` совпадает с `gateway.auth.token` в `openclaw.json`:
   ```bash
   # Обновить .env
   echo "GATEWAY_TOKEN=$(cat ~/.openclaw/gateway-token.txt)" >> /path/to/clawpanel/.env
   docker compose restart backend
   ```

2. **Неправильный client.id/mode** — Используйте валидные значения:
   - `client.id: "gateway-client"`
   - `client.mode: "backend"`

3. **Сетевые проблемы** — Убедитесь, что Gateway доступен из контейнера:
   ```bash
   # Для Linux
   GATEWAY_URL=ws://172.17.0.1:18789
   
   # Для macOS/Windows
   GATEWAY_URL=ws://host.docker.internal:18789
   ```

### Host Executor не работает

**Симптомы:**
- Ошибки при создании каналов
- В логах backend: `Host execution failed`

**Проверки:**
```bash
# 1. Проверить статус сервиса
sudo systemctl status clawpanel-host-executor

# 2. Проверить порт
ss -tlnp | grep 3002

# 3. Проверить iptables
sudo iptables -L INPUT -n | grep 3002
sudo iptables -L DOCKER -n | grep 3002

# 4. Проверить токен
cat ~/.openclaw/host-executor-token.txt
cat /path/to/clawpanel/.env | grep HOST_EXECUTOR_TOKEN

# 5. Тест из контейнера
docker compose exec backend wget -qO- \
  --post-data='{"command":"openclaw --version","token":"your-token"}' \
  --header='Content-Type: application/json' \
  http://172.17.0.1:3002/exec

# 6. Логи Host Executor
sudo journalctl -u clawpanel-host-executor -f
```

**Решения:**

1. **Host Executor не запущен**:
   ```bash
   sudo systemctl restart clawpanel-host-executor
   sudo systemctl enable clawpanel-host-executor
   ```

2. **Firewall блокирует порт 3002**:
   ```bash
   # Разрешить порт в iptables
   sudo iptables -I INPUT 1 -p tcp --dport 3002 -j ACCEPT
   sudo iptables -I DOCKER 1 -p tcp --dport 3002 -j ACCEPT
   ```

3. **Неверный токен**:
   ```bash
   # Обновить .env
   echo "HOST_EXECUTOR_TOKEN=$(cat ~/.openclaw/host-executor-token.txt)" >> /path/to/clawpanel/.env
   docker compose restart backend
   ```

### Чат с агентами не работает

**Симптомы:**
- Сообщения отправляются, но нет ответа
- В логах: `missing scope: operator.write`

**Решение:**
Gateway в режиме `password` auth не даёт права на отправку сообщений. Используйте режим `token`:

```bash
# Сгенерировать токен
TOKEN=$(openssl rand -hex 32)

# Обновить openclaw.json
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token "$TOKEN"

# Обновить .env
echo "GATEWAY_TOKEN=$TOKEN" >> /path/to/clawpanel/.env

# Перезапустить
sudo systemctl restart openclaw-gateway
docker compose restart backend
```

### Чат: агенты не отвечают

**Проверки:**
```bash
# 1. Проверить, что агенты зарегистрированы в OpenClaw
openclaw agents list

# 2. Если их нет - зарегистрировать
openclaw agents add clawpanel-1 --model kimi/kimi-k2.5 --workspace ~/.openclaw/agents/clawpanel-1
openclaw agents add clawpanel-8 --model kimi/kimi-k2 --workspace ~/.openclaw/agents/clawpanel-8

# 3. Перезапустить Gateway
sudo systemctl restart openclaw-gateway
```

### Чат: сообщения идут обоим агентам

Это происходит, если frontend создаёт несколько WebSocket соединений. Убедитесь, что:
- Используется актуальная версия frontend (после коммита `fix: chat WebSocket`)
- При переключении агента старое соединение закрывается

### Терминал не подключается

**Симптомы:**
- Терминал показывает ошибку подключения
- SSH не устанавливается

**Проверки:**
```bash
# 1. Проверить SSH ключи в контейнере
docker compose exec backend ls -la /root/.ssh/

# 2. Проверить SSH подключение из контейнера
docker compose exec backend ssh -i /root/.ssh/id_ed25519 \
  -o StrictHostKeyChecking=no root@host.docker.internal "echo OK"

# 3. Проверить логи backend
docker compose logs backend | grep -i "ssh\|terminal"
```

**Решения:**

1. **SSH ключи не сгенерированы**:
   ```bash
   # Перегенерировать ключи
   cd /path/to/clawpanel
   rm -rf ssh-keys
   ssh-keygen -t ed25519 -f ssh-keys/clawpanel -N "" -C "clawpanel-terminal"
   cat ssh-keys/clawpanel.pub >> ~/.ssh/authorized_keys
   docker compose down
   cp -r ssh-keys backend/
   docker compose build --no-cache backend
   docker compose up -d
   ```

2. **SSH сервер недоступен**:
   ```bash
   # Установить и запустить SSH
   sudo apt-get install -y openssh-server
   sudo systemctl enable --now ssh
   
   # Разрешить root доступ (если нужно)
   echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
   sudo systemctl restart ssh
   ```

### Ошибки сборки
```bash
# Пересобрать без кэша
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Проблемы с правами доступа
```bash
# Исправить права на директории
docker compose down
sudo chown -R 1000:1000 /path/to/clawpanel/backend-data
sudo chmod 755 /root/.openclaw
sudo chmod 600 /root/.ssh/authorized_keys
docker compose up -d
```

## Безопасность

- JWT аутентификация (access 15min + refresh 7d)
- TOTP 2FA для Admin (включается в настройках)
- Rate limiting (100 req/min)
- API ключи хранятся в базе данных (SQLite)
- Защита системных файлов
- HTTPS ready (добавьте SSL сертификаты в nginx/ssl/)
- Gateway token изолирован в env переменной
- WebSocket handshake с challenge-response аутентификацией
- Host Executor с токен-аутентификацией и whitelist команд
- SSH терминал использует ключевую аутентификацию
- SSH ключи недоступны извне контейнера

## Лицензия

MIT
