import request from 'supertest';
import express from 'express';
import mcpRoutes from '../routes/mcp';
import authRoutes from '../routes/auth';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/mcp', mcpRoutes);
app.use(errorHandler);

describe('MCP API', () => {
  let authToken: string;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });
    authToken = res.body.data.accessToken;
  });

  describe('GET /api/mcp', () => {
    it('should list all MCP servers', async () => {
      const res = await request(app)
        .get('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject unauthorized access', async () => {
      const res = await request(app)
        .get('/api/mcp');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/mcp/import-json', () => {
    it('should import MCP server from valid JSON', async () => {
      const configJson = JSON.stringify({
        name: 'Test MCP Server',
        url: 'https://api.example.com/mcp',
        auth: { type: 'api_key', apiKey: 'test-key' },
        tools: [
          { name: 'search', description: 'Search tool' },
          { name: 'fetch', description: 'Fetch tool' },
        ],
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Test MCP Server');
      expect(res.body.data.toolsImported).toBe(2);
    });

    it('should reject invalid JSON', async () => {
      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson: 'not valid json' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid JSON');
    });

    it('should reject missing URL', async () => {
      const configJson = JSON.stringify({
        name: 'No URL Server',
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('URL is required');
    });

    it('should reject duplicate names', async () => {
      const configJson = JSON.stringify({
        name: 'Duplicate MCP',
        url: 'https://example.com/mcp',
        tools: [],
      });

      // First import
      await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      // Second import with same name
      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already exists');
    });

    it('should parse auth config correctly', async () => {
      const configJson = JSON.stringify({
        name: 'Auth Test MCP',
        url: 'https://api.example.com/mcp',
        auth: { type: 'bearer', token: 'test-token' },
        tools: [],
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toBe('https://api.example.com/mcp');
    });
  });

  describe('GET /api/mcp/:id', () => {
    it('should get MCP server by id', async () => {
      // Create MCP first
      const configJson = JSON.stringify({
        name: 'Get Test MCP',
        url: 'https://example.com/mcp',
        tools: [],
      });

      const createRes = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/mcp/${mcpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Get Test MCP');
    });

    it('should return 404 for non-existent MCP', async () => {
      const res = await request(app)
        .get('/api/mcp/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/mcp/:id', () => {
    it('should delete MCP server and cascade tools', async () => {
      // Create MCP with tools
      const configJson = JSON.stringify({
        name: 'Delete Test MCP',
        url: 'https://example.com/mcp',
        tools: [{ name: 'tool_to_delete', description: 'Will be deleted' }],
      });

      const createRes = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/mcp/${mcpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const getRes = await request(app)
        .get(`/api/mcp/${mcpId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent MCP', async () => {
      const res = await request(app)
        .delete('/api/mcp/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/mcp/:id/test', () => {
    it('should test MCP connection', async () => {
      // Create MCP
      const configJson = JSON.stringify({
        name: 'Test Connection MCP',
        url: 'https://example.com/mcp',
        tools: [],
      });

      const createRes = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/mcp/${mcpId}/test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('reachable');
    });

    it('should handle invalid URL gracefully', async () => {
      // Create MCP with invalid URL
      const configJson = JSON.stringify({
        name: 'Invalid URL MCP',
        url: 'not-a-valid-url',
        tools: [],
      });

      const createRes = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/mcp/${mcpId}/test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reachable).toBe(false);
      expect(res.body.data.error).toContain('Invalid URL');
    });
  });
});
