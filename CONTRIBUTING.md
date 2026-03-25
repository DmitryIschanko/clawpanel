# Contributing to ClawPanel

Thank you for your interest in contributing to ClawPanel! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- Docker 24.0+
- Docker Compose 2.0+
- OpenClaw Gateway installed locally

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/clawpanel.git
   cd clawpanel
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development servers**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm install
   npm run dev

   # Terminal 2: Frontend
   cd frontend
   npm install
   npm run dev
   ```

4. **Or use Docker**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

## Project Structure

```
clawpanel/
├── backend/           # Node.js + Express API
│   ├── src/
│   │   ├── routes/    # API route handlers
│   │   ├── services/  # Business logic
│   │   ├── websocket/ # WebSocket server
│   │   └── database/  # Migrations and queries
│   └── tests/
├── frontend/          # React + TypeScript
│   ├── src/
│   │   ├── pages/     # Page components
│   │   ├── components/# Reusable components
│   │   └── services/  # API clients
│   └── tests/
└── nginx/             # Nginx configuration
```

## Coding Standards

### TypeScript

- Use strict TypeScript where possible
- Prefer `interface` over `type` for object shapes
- Use explicit return types on public functions

### React

- Use functional components with hooks
- Use React Query for server state
- Use Zustand for client state
- Prefer composition over inheritance

### Backend

- Use async/await, avoid callbacks
- Validate all inputs with Zod
- Use Winston for logging
- Handle errors gracefully

## Commit Messages

Use conventional commits format:

```
feat: add new feature
fix: fix bug in chat
docs: update README
style: fix formatting
refactor: restructure code
test: add tests
chore: update dependencies
```

## Pull Request Process

1. Create a feature branch from `main`
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes and commit

3. Push to your fork
   ```bash
   git push origin feature/my-feature
   ```

4. Create a Pull Request with:
   - Clear description of changes
   - Screenshots (if UI changes)
   - Test instructions
   - Related issue numbers

## Testing

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### Integration Tests

```bash
docker compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Code Review

All submissions require review. We look for:

- Code quality and readability
- Test coverage
- Documentation updates
- Backwards compatibility
- Security considerations

## Reporting Issues

### Bug Reports

Include:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, versions)
- Logs or screenshots

### Feature Requests

Include:
- Use case description
- Proposed solution
- Alternatives considered

## Security

Report security vulnerabilities to security@clawpanel.dev instead of public issues.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
