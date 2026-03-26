import request from 'supertest';
import express from 'express';
import toolsRoutes from '../routes/tools';
import authRoutes from '../routes/auth';
import mcpRoutes from '../routes/mcp';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/mcp', mcpRoutes);
app.use(errorHandler);

describe('Tools API', () => {
  let authToken: string;
  let testToolId: number;
  let testAgentId: number;

  beforeEach(async () => {
    // Login to get auth token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });
    authToken = res.body.data.accessToken;
  });

  describe('GET /api/tools', () => {
    it('should list all tools including MCP tools', async () => {
      // First create MCP server with tools
      const mcpImport = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          configJson: JSON.stringify({
            name: `Test MCP ${Date.now()}`,
            url: 'https://test.example.com/mcp',
            tools: [
              { name: 'test_tool', description: 'Test tool' }
            ]
          })
        });

      const res = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should include MCP server name for MCP tools', async () => {
      // Import MCP with tools
      await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          configJson: JSON.stringify({
            name: 'MCP With Name',
            url: 'https://test.example.com/mcp',
            tools: [
              { name: 'named_tool', description: 'Named tool' }
            ]
          })
        });

      const res = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${authToken}`);

      const mcpTool = res.body.data.find((t: any) => t.name === 'named_tool');
      expect(mcpTool).toBeDefined();
      expect(mcpTool.mcpServerName).toBe('MCP With Name');
    });

    it('should reject unauthorized access', async () => {
      const res = await request(app)
        .get('/api/tools');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/tools/:id', () => {
    it('should get tool by id', async () => {
      // Create MCP with tool first
      await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          configJson: JSON.stringify({
            name: 'Get Tool Test',
            url: 'https://test.example.com/mcp',
            tools: [
              { name: 'gettable_tool', description: 'Gettable' }
            ]
          })
        });

      // Get list to find tool ID
      const listRes = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${authToken}`);

      const tool = listRes.body.data.find((t: any) => t.name === 'gettable_tool');
      expect(tool).toBeDefined();

      const res = await request(app)
        .get(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('gettable_tool');
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app)
        .get('/api/tools/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/tools/:id', () => {
    it('should update tool (assign agent)', async () => {
      // Create MCP with tool
      await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          configJson: JSON.stringify({
            name: 'Update Tool Test',
            url: 'https://test.example.com/mcp',
            tools: [
              { name: 'updatable_tool', description: 'Updatable' }
            ]
          })
        });

      // Get tool ID
      const listRes = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${authToken}`);

      const tool = listRes.body.data.find((t: any) => t.name === 'updatable_tool');

      // Update tool
      const res = await request(app)
        .put(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify update
      const getRes = await request(app)
        .get(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.body.data.enabled).toBe(false);
    });

    it('should return 404 for non-existent tool', async () => {
      const res = await request(app)
        .put('/api/tools/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: false });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Tool toggle', () => {
    it('should toggle tool enabled state', async () => {
      // Create MCP with tool
      await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          configJson: JSON.stringify({
            name: 'Toggle Tool Test',
            url: 'https://test.example.com/mcp',
            tools: [
              { name: 'toggleable_tool', description: 'Toggleable' }
            ]
          })
        });

      // Get tool
      const listRes = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${authToken}`);

      const tool = listRes.body.data.find((t: any) => t.name === 'toggleable_tool');
      expect(tool.enabled).toBe(true);

      // Toggle off
      await request(app)
        .put(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: false });

      // Verify toggled off
      const getRes = await request(app)
        .get(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getRes.body.data.enabled).toBe(false);

      // Toggle on
      await request(app)
        .put(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: true });

      // Verify toggled on
      const getRes2 = await request(app)
        .get(`/api/tools/${tool.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getRes2.body.data.enabled).toBe(true);
    });
  });
});
