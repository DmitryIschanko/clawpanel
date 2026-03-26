---
title: "[TEST] Setup GitHub Actions for Backend Tests"
labels: ["enhancement", "test", "priority:high"]
assignees: []
---

## Description
Настроить автоматический запуск тестов при PR/push. После коммита d60f342 добавлены 32 теста, нужен CI для их запуска.

## Acceptance Criteria
- [ ] GitHub Actions workflow для backend tests
- [ ] Использование Docker для better-sqlite3 (нативный модуль)
- [ ] Отчёт о покрытии в PR
- [ ] Блокировка merge при failed tests
- [ ] Кэширование node_modules для скорости

## Proposed Workflow

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./backend
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: './backend/package-lock.json'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Rebuild better-sqlite3
        run: npm rebuild better-sqlite3
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
```

## Related
- Commit: d60f342 - добавлены Jest тесты
- Files: `backend/src/__tests__/*.test.ts`

## Priority
P1 - Блокирует автоматизацию тестирования
