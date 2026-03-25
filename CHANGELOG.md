# Changelog

All notable changes to ClawPanel will be documented in this file.

## [1.0.0] - 2026-03-25

### Added
- **API Key Management** — UI for managing LLM provider API keys in LLM Providers page
- **Filtered Model Selection** — Agent creation shows only models from providers with configured keys
- **Gateway Token Authentication** — Support for token-based auth (required for chat functionality)
- **Latest LLM Models (2026)** — Updated models list:
  - Anthropic: Claude Opus 4.6, Claude Sonnet 4.6, Claude Opus 4.5, Claude Sonnet 4.5
  - OpenAI: GPT-5.4, GPT-5.4 Codex, GPT-5.3, GPT-5.2
  - Google: Gemini 3.1 Pro, Gemini 3.1 Flash, Gemini 3 Pro, Gemini 3 Flash
  - Kimi: K2.5, K2, K1.6
  - xAI: Grok 4.1, Grok 4, Grok 3
  - Mistral: Large 3, Medium 3
  - OpenRouter: DeepSeek V3.2, DeepSeek R1, Qwen 3.5, GLM-5, MiniMax M2.5
- **Agent CLI Fallback** — SSH/CLI fallback for sending messages when Gateway WebSocket fails
- **Skill Assignment** — Assign skills to agents with filesystem sync
- **Monaco Editor** — Full-featured SKILL.md editor in browser
- **MCP Servers Management** — CRUD for Model Context Protocol endpoints
- **Tools Management** — Browser, Cron, Webhook tools with agent assignment

### Changed
- **Gateway Auth** — Switched from password to token authentication for full permissions
- **Model Selection** — Dynamic dropdown based on available API keys
- **Database Schema** — Added `api_key` column to `llm_providers` table

### Fixed
- **Chat Functionality** — Fixed "missing scope: operator.write" error by using token auth
- **SPA Routing** — Nginx `try_files` fix for React Router
- **Static Assets** — Proper cache headers for `/assets/` and `/vite.svg`

### Security
- API keys stored in database instead of environment variables
- Gateway token isolation in environment variables

## [0.9.0] - 2026-03-20

### Added
- **Dashboard** — Live events feed, agent/channel status, token usage
- **Agent Manager** — Create, edit, delete agents with full configuration
- **Chain Builder** — Visual workflow builder for agent chains
- **Skill Manager** — ClawHub integration for skill search and install
- **Channel Manager** — Telegram, Discord, WhatsApp, Slack support
- **File Manager** — File browser with Monaco Editor
- **Web Terminal** — SSH terminal via node-pty
- **WebChat** — Real-time chat with agents via WebSocket
- **Monitoring** — Usage graphs and logs

### Technical
- React 18 + TypeScript frontend
- Node.js 20 + Express backend
- SQLite database
- Docker Compose deployment
- WebSocket dual client/server architecture
- SSH key-based terminal access
