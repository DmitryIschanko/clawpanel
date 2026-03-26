---
title: "[TEST] Setup Vitest for Frontend"
labels: ["enhancement", "test", "priority:medium"]
assignees: []
---

## Description
Настроить Vitest для unit-тестирования React компонентов. Vitest работает нативно с Vite и быстрее Jest.

## Setup Steps

```bash
cd /root/clawpanel/frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

## Configuration

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

## Components to Test

### P1 (Critical)
- [ ] **LoginForm**
  - Render with inputs
  - Submit with valid credentials
  - Show error on invalid credentials
  - Loading state

### P2 (Important)
- [ ] **AgentCard**
  - Render agent info
  - Edit button click
  - Delete button click
  
- [ ] **McpImportModal**
  - Open/close
  - JSON validation
  - Submit valid config
  - Show errors

### P3 (Nice to have)
- [ ] **ToolAssignment**
  - Assign agent to tool
  - Unassign agent
  
- [ ] **AgentCreationModal**
  - Fill form
  - Submit
  - Validation

## Example Test

```tsx
// frontend/src/components/__tests__/LoginForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginForm } from '../LoginForm';

describe('LoginForm', () => {
  it('should render login form', () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });
  
  it('should call onSubmit with credentials', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'admin' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'admin' }
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    
    expect(onSubmit).toHaveBeenCalledWith({ username: 'admin', password: 'admin' });
  });
});
```

## Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

## Priority
P2 - Фронтенд тестирование
