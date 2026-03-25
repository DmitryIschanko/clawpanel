# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Skill Manager with ClawHub integration - search and install skills from clawhub.ai
- ZIP extraction for skill archives with automatic SKILL.md loading
- Monaco Editor for SKILL.md editing in browser
- SSH Terminal with xterm.js integration
- Gateway WebSocket client with challenge-response authentication
- Token-based authentication for OpenClaw Gateway

### Fixed
- Chat WebSocket now properly closes old connections before opening new ones
- Fixed duplicate message issue by properly unsubscribing from Gateway events on disconnect
- Fixed agent ID type mismatch (number vs string) in agentRunner.ts
- Fixed "missing scope: operator.write" error by switching Gateway to token auth mode
- Fixed message accumulation to send only final response from Gateway
- VPS CPU optimization by disabling ripgrep (rg) binary

### Changed
- Gateway authentication changed from password to token mode
- Agent registration now uses "clawpanel-{id}" naming convention
- Backend uses SSH/CLI fallback when Gateway WebSocket lacks write permissions

## [0.1.0] - 2026-03-24

### Added
- Initial release of ClawPanel
- Dashboard with live event feed and agent/channel status
- Agent Manager - create, edit, delete agents
- LLM Manager - manage providers (Anthropic, OpenAI, Google, Kimi, etc.)
- Chain Builder - create agent workflows
- Channel Manager - Telegram, Discord, WhatsApp, Slack integration
- File Manager with Monaco Editor
- Settings with openclaw.json editor
- JWT authentication with refresh tokens
- TOTP 2FA for admin
- Rate limiting protection
- SQLite database for persistence
- Docker Compose deployment
