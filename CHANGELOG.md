# Changelog

Все значимые изменения в этом проекте будут задокументированы в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Composio Integration** — интеграция с Composio для подключения 1000+ сервисов к агентам
  - Поддержка OAuth2 авторизации для внешних сервисов (Google Sheets, Gmail, GitHub, Notion, и др.)
  - Каталог доступных интеграций с поиском
  - Автоматическое обновление статуса подключения через webhooks
  - Управление connected accounts через UI
  - Callback endpoint для обработки OAuth редиректов: `/api/composio/callback`
  - Webhook endpoint для получения событий от Composio: `POST /api/composio/callback`

- **Новые таблицы в базе данных:**
  - `composio_config` — хранение API ключа и настроек
  - `composio_apps` — подключенные сервисы (connected accounts)
  - `composio_tools` — кэш доступных инструментов (опционально)

- **API эндпоинты Composio:**
  - `GET /api/composio/config` — получить статус конфигурации
  - `POST /api/composio/config` — сохранить API ключ
  - `DELETE /api/composio/config` — удалить конфигурацию
  - `GET /api/composio/catalog` — каталог доступных интеграций
  - `GET /api/composio/apps` — список подключенных приложений
  - `POST /api/composio/apps` — подключить новое приложение
  - `DELETE /api/composio/apps/:id` — отключить приложение
  - `GET /api/composio/apps/:id/status` — проверить статус подключения
  - `POST /api/composio/apps/:id/sync` — синхронизировать инструменты
  - `GET /api/composio/callback` — OAuth callback handler
  - `POST /api/composio/callback` — Webhook handler

- **Новые компоненты frontend:**
  - `ComposioIntegration.tsx` — основной компонент интеграции
  - `ComposioPage.tsx` — отдельная страница в навигации
  - Поддержка темной/светлой темы для всех Composio компонентов

### Changed
- **Меню навигации** — добавлен пункт "Composio" для быстрого доступа к интеграциям
- **Страница MCP** — интеграция Composio встроена в раздел MCP Servers

### Technical Details
- Используется официальный REST API Composio (backend.composio.dev/api/v3)
- Аутентификация через `x-api-key` header
- Поддержка auth schemes: OAUTH2
- Единый `user_id` для всей панели: `clawpanel-default`
- Callback URL для настройки в Composio Dashboard: `https://your-domain.com/api/composio/callback`

## [1.2.0] - 2026-04-01

### Added
- **MCP v2 — полная интеграция с OpenClaw mcporter**
  - Поддержка stdio транспорта (нативный OpenClaw формат)
  - HTTP транспорт через mcp-remote bridge
  - Автоматическая синхронизация с `~/.openclaw/workspace/config/mcporter.json`
  - Автоматический перезапуск Gateway при изменении MCP серверов
  - Встроенные MCP серверы: filesystem, brave-search, puppeteer, github, postgres
  
- **Новые поля в таблице mcp_servers:**
  - `transport_type` — тип транспорта (stdio/http/websocket)
  - `command` — команда для stdio транспорта
  - `args` — аргументы команды (JSON массив)
  - `env` — переменные окружения (JSON объект)
  - `is_builtin` — флаг встроенного сервера
  
- **API эндпоинты MCP:**
  - `GET /api/mcp/builtin` — список встроенных серверов
  - `POST /api/mcp/:id/sync` — синхронизация с mcporter
  - `POST /api/mcp/sync-all` — синхронизация всех серверов
  
- **MCP Guide (frontend)** — интерактивное руководство по настройке MCP
  - Accordion-интерфейс с 9 разделами
  - Примеры команд для популярных серверов
  - Объяснение transport types для не-разработчиков

### Changed
- **Полный рефакторинг MCP интеграции**
  - Замена HTTP-based MCP на stdio транспорт (OpenClaw совместимость)
  - Сервис `mcporter.ts` для синхронизации с OpenClaw конфигом
  - Обновлены API routes в `routes/mcp.ts`
  
- **Улучшена страница Chains:**
  - Поддержка history modes: `last-only`, `full-history`, `smart`
  - Отображение вывода каждого шага в реальном времени
  - Улучшенная обработка JSON ответов от агентов

### Fixed
- Синтаксическая ошибка в `routes/mcp.ts` (лишняя закрывающая скобка)
- Несоответствие имен функций в `mcporter.ts`
- Проблемы с CRLF line endings при деплое на Linux

## [1.1.0] - 2026-03-25

### Added
- **Автоматическая регистрация агентов в OpenClaw** при создании через Web UI
- **Автоматический перезапуск Gateway** после создания агента для включения Gateway режима
- **WebSocket ping/pong** — поддержание соединения открытым во время длительных ответов LLM
- **Host Executor** — новый HTTP API сервис для выполнения `openclaw` команд на хосте из Docker контейнера
  - Порт `3002` с token-аутентификацией
  - Whitelist команд: только `openclaw *`
  - Systemd сервис `clawpanel-host-executor.service` с автозапуском
  - iptables правила для доступа из Docker сетей
  - Эндпоинты: `GET /health`, `POST /exec`
  
- **Новые переменные окружения:**
  - `HOST_EXECUTOR_URL` — URL для подключения к Host Executor
  - `HOST_EXECUTOR_TOKEN` — токен аутентификации

- **Новый сервис в backend:**
  - `services/hostExecutor.ts` — HTTP клиент для Host Executor

### Changed
- **Channel Manager** теперь использует Host Executor вместо SSH для настройки Telegram
  - Удалена зависимость от SSH для конфигурации каналов
  - Прямой вызов `openclaw config set` через HTTP API
  
- **Обновлена архитектура** в документации:
  - Добавлен Host Executor в схему системы
  - Обновлены инструкции по установке

- **Обновлены зависимости:**
  - Добавлен `axios` в `backend/package.json`

### Removed
- **SSH для выполнения команд** — заменен на Host Executor HTTP API
  - SSH теперь используется только для Web Terminal

### Fixed
- Проблема с Docker networking при попытках SSH из контейнера на хост
- Fail2ban блокировка при неправильных SSH попытках

### Security
- Host Executor проверяет whitelist команд (только `openclaw *`)
- Токен-аутентификация для всех запросов к Host Executor
- Доступ только из Docker сетей через iptables

## [1.0.0] - 2026-03-20

### Added
- **Dashboard** — live-лента событий, статус агентов и каналов, расход токенов
- **Agent Manager** — создание, редактирование и удаление агентов
- **LLM Manager** — управление провайдерами (Anthropic, OpenAI, Google, Kimi, и др.)
- **WebChat** — чат с агентами в реальном времени через WebSocket
- **Chain Builder** — создание цепочек агентов
- **Skill Manager** — установка скилов из ClawHub
- **Channel Manager** — подключение Telegram, Discord, WhatsApp, Slack
- **File Manager** — просмотр и редактирование файлов
- **Web Terminal** — SSH терминал к серверу с OpenClaw CLI
- **Monitoring** — графики использования, логи
- **Settings** — редактор openclaw.json с валидацией

### Technical
- React 18 + TypeScript frontend
- Node.js 24 + Express backend
- SQLite база данных
- Docker Compose развертывание
- Gateway WebSocket protocol интеграция
- JWT аутентификация с refresh токенами
- TOTP 2FA для администраторов
- Rate limiting
