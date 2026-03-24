# ClawPanel

Веб-панель управления для [OpenClaw](https://github.com/openclaw/openclaw) — многоагентной LLM-системы.

## Возможности

- **Dashboard** — live-лента событий, статус агентов и каналов, расход токенов
- **Agent Manager** — создание, редактирование и удаление агентов с настройками
- **LLM Manager** — управление провайдерами (Anthropic, OpenAI, Google, и др.), тестирование подключения
- **WebChat** — чат с агентами в реальном времени через WebSocket
- **Chain Builder** — создание цепочек агентов для workflow
- **Skill Manager** — установка скилов из ClawHub, загрузка SKILL.md
- **Channel Manager** — подключение Telegram, Discord, WhatsApp, Slack с настройками whitelist
- **File Manager** — просмотр и редактирование файлов с Monaco Editor
- **Web Terminal** — полноценный SSH терминал к серверу с OpenClaw CLI (xterm.js)
- **Monitoring** — графики использования, логи, алерты
- **Settings** — редактор openclaw.json с валидацией, backup/restore

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx (80/443)                      │
│                   Reverse Proxy + SSL                    │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            │
   ┌─────────┐  ┌─────────┐       │
   │ Frontend│  │ Backend │◄──────┼── SSH
   │  React  │  │ Node.js │       │   (host access)
   │  :80    │  │  :3000  │       │
   └─────────┘  └────┬────┘       │
                     │            │
                     │ ws://host.docker.internal:18789
                     │ (WebSocket + challenge-response auth)
                     │            │
                     ▼            ▼
            ┌─────────────────────────┐
            │   OpenClaw Gateway      │
            │   (systemd, host)       │
            │   ws://0.0.0.0:18789    │
            └─────────────────────────┘
```

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

# Генерируем пароль для Gateway
GATEWAY_PASS=$(openssl rand -base64 32)

cat > ~/.openclaw/openclaw.json << CONFIG
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4"
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
      "mode": "password",
      "password": "$GATEWAY_PASS"
    }
  }
}
CONFIG

echo "Gateway password saved to: ~/.openclaw/gateway-password.txt"
echo "$GATEWAY_PASS" > ~/.openclaw/gateway-password.txt

# Создать systemd сервис
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

### 2. Установка ClawPanel

```bash
# Распаковать архив
tar -xzf clawpanel-final.tar.gz
cd clawpanel

# Запустить установку
sudo ./install.sh
```

Или вручную:

```bash
cd clawpanel

# Настроить окружение
./install.sh  # или создайте .env вручную

# Убедитесь, что GATEWAY_PASSWORD совпадает с паролем в ~/.openclaw/openclaw.json

# Собрать и запустить
docker compose build
docker compose up -d

# Инициализировать базу данных
docker compose exec backend npx tsx src/database/migrate.ts

# Сбросить пароль admin (если нужно)
docker compose exec backend node /app/fix-admin.js
```

### 3. Доступ

- **ClawPanel**: http://your-server-ip
- **Логин**: `admin`
- **Пароль**: `admin`

**⚠️ Важно**: Смените пароль сразу после первого входа!

## Настройка API ключей

Отредактируйте `~/.openclaw/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4"
      },
      "models": {
        "anthropic": {
          "apiKey": "sk-ant-..."
        },
        "openai": {
          "apiKey": "sk-..."
        }
      }
    }
  }
}
```

Перезапустите Gateway:
```bash
sudo systemctl restart openclaw-gateway
```

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

### Как использовать:
1. Перейдите в раздел **Skills**
2. Нажмите **"Search ClawHub"** для поиска
3. Введите ключевое слово (например: `web`, `search`, `fetch`)
4. Выберите скилл из результатов поиска
5. Нажмите **"+"** для установки
6. Или используйте **"From ClawHub"** для прямой установки по имени

### Примеры популярных скиллов:
- `web-pilot` — поиск в интернете и чтение страниц
- `web-content-fetcher` — получение содержимого веб-страниц
- `file-reader` — чтение и анализ файлов
- `calculator` — математические вычисления

### Технические детали:
- API endpoint: `https://clawhub.ai/api/v1/`
- Формат: ZIP архив с SKILL.md
- Автоматическая распаковка с помощью `adm-zip`
- Содержимое SKILL.md сохраняется в базу данных SQLite

## Настройка каналов

```bash
# Telegram
openclaw onboard

# Или ручная настройка через openclaw.json
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

### ClawPanel
```bash
cd /path/to/clawpanel

# Логи
docker compose logs -f

# Логи backend (важно для отладки Gateway WebSocket)
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
├── .env                        # Переменные окружения (создается install.sh)
├── install.sh                  # Скрипт установки
├── fix-admin.js               # Скрипт сброса пароля admin
├── README.md                   # Документация
├── AGENTS.md                   # Документация для AI агентов
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
│       │   └── gateway.ts      # WebSocket Gateway клиент
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

# OpenClaw Gateway Password (должен совпадать с openclaw.json)
# Пароль из поля gateway.auth.password в ~/.openclaw/openclaw.json
GATEWAY_PASSWORD=your-gateway-password-here

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
3. **Response** — Backend отвечает `connect` запросом с `auth.password`
4. **Authentication** — Gateway подтверждает `hello-ok` или закрывает соединение

Пример успешного handshake:
```
→ WebSocket connect ws://host.docker.internal:18789
← {"type":"event","event":"connect.challenge","payload":{"nonce":"abc123","ts":1234567890}}
→ {"type":"req","method":"connect","params":{"auth":{"password":"..."},...}}
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

# 3. Проверить пароль Gateway
cat ~/.openclaw/openclaw.json | grep -A2 '"auth"'

# 4. Проверить GATEWAY_PASSWORD в .env
cat /path/to/clawpanel/.env | grep GATEWAY_PASSWORD

# 5. Проверить сетевой доступ из контейнера
docker compose exec backend wget -qO- http://host.docker.internal:18789

# 6. Проверить логи Gateway
sudo journalctl -u openclaw-gateway -f

# 7. Проверить логи backend
docker compose logs -f backend
```

**Решения:**

1. **Неверный пароль** — Убедитесь, что `GATEWAY_PASSWORD` в `.env` совпадает с `gateway.auth.password` в `openclaw.json`:
   ```bash
   # Обновить .env
   echo "GATEWAY_PASSWORD=$(cat ~/.openclaw/gateway-password.txt)" >> /path/to/clawpanel/.env
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
- API ключи только в env переменных
- Защита системных файлов
- HTTPS ready (добавьте SSL сертификаты в nginx/ssl/)
- Gateway password изолирован в env переменной
- WebSocket handshake с challenge-response аутентификацией
- SSH терминал использует ключевую аутентификацию
- SSH ключи недоступны извне контейнера

## Лицензия

MIT
