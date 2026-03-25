# Changelog

Все значимые изменения в этом проекте будут задокументированы в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
