# Contributing to ClawPanel

Thank you for your interest in contributing to ClawPanel! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 24 LTS
- Docker and Docker Compose
- Git

### Quick Start

1. Fork and clone the repository:
```bash
git clone https://github.com/DmitryIschanko/clawpanel.git
cd clawpanel
```

2. Start development environment:
```bash
docker compose up -d
```

3. View logs:
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Project Structure

- `backend/` - Node.js + Express + TypeScript API
- `frontend/` - React + TypeScript + Vite SPA
- `nginx/` - Reverse proxy configuration

## Code Style

### TypeScript
- Enable strict mode
- Use explicit return types
- No `any` types
- Prefer interfaces over types

### React
- Functional components with hooks
- UseEffect cleanup functions required
- Zustand for state management
- Memoize expensive computations

### Error Handling
Always handle errors explicitly:
```typescript
try {
  const result = await operation();
  return { ok: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error });
  return { ok: false, error: error.message };
}
```

## Testing

Before submitting PR:
1. Backend builds without errors
2. Frontend builds without errors
3. No TypeScript errors
4. Test with multiple agents
5. Verify no duplicate messages in chat

## Commit Messages

Use conventional commits format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting)
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

Example:
```
feat: add SSH terminal with xterm.js

- Add xterm.js for terminal emulation
- Implement SSH connection via node-ssh
- Add terminal page to sidebar
```

## Pull Request Process

1. Create feature branch from `main`
2. Make changes following code style
3. Test thoroughly
4. Update documentation if needed
5. Submit PR with clear description

## Important Notes

- Read `AGENTS.md` for implementation details
- Never expose secrets in logs or responses
- Always clean up WebSocket subscriptions
- Test with multiple agents to ensure isolation

## Questions?

Open an issue or contact maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
