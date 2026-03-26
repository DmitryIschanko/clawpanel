---
title: "[TEST] Add tests for remaining API modules"
labels: ["enhancement", "test", "priority:medium"]
assignees: []
---

## Description
Добавить тесты для оставшихся API модулей. Сейчас есть тесты для auth, agents, mcp. Нужно покрыть остальные модули.

## Modules to test

### P1 (Critical)
- [ ] **Tools** (`src/routes/tools.ts`)
  - Assignment to agents
  - Toggle enabled/disabled
  - List with MCP server names
  
### P2 (Important)
- [ ] **Files** (`src/routes/files.ts`)
  - List directory
  - File tree
  - Read file content
  - Edit file
  
- [ ] **LLM** (`src/routes/llm.ts`)
  - List providers
  - List models
  - Test provider connection

### P3 (Nice to have)
- [ ] **Skills** (`src/routes/skills.ts`)
  - CRUD operations
  - File upload
  
- [ ] **Chains** (`src/routes/chains.ts`)
  - CRUD operations
  
- [ ] **Channels** (`src/routes/channels.ts`)
  - CRUD operations

## Example Test Structure

```typescript
// backend/src/__tests__/tools.test.ts
import request from 'supertest';
import express from 'express';
import toolsRoutes from '../routes/tools';

const app = express();
app.use(express.json());
app.use('/api/tools', toolsRoutes);

describe('Tools API', () => {
  let authToken: string;
  
  beforeEach(async () => {
    // Login and get token
  });
  
  describe('GET /api/tools', () => {
    it('should list all tools', async () => {
      // Test implementation
    });
  });
});
```

## Related
- Base: `backend/src/__tests__/setup.ts`
- Examples: `auth.test.ts`, `agents.test.ts`, `mcp.test.ts`

## Priority
P2 - Расширение тестового покрытия
