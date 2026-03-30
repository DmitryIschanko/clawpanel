import request from 'supertest';
import express from 'express';
import mcpRoutes from '../routes/mcp';
import authRoutes from '../routes/auth';
import { errorHandler } from '../middleware/errorHandler';

// Mock the mcporter service
jest.mock('../services/mcporter', () => ({
  syncServerToMcporter: jest.fn().mockResolvedValue(true),
  removeServerFromMcporter: jest.fn().mockResolvedValue(true),
  syncAllServersToMcporter: jest.fn().mockResolvedValue(true),
  getBuiltinMcpServers: jest.fn().mockReturnValue([
    {
      name: 'filesystem',
      description: 'Read and write local files',
      transport_type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
    },
  ]),
  isMcpRemoteInstalled: jest.fn().mockResolvedValue(true),
  installMcpRemote: jest.fn().mockResolvedValue(true),
}));

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

  describe('GET /api/mcp/builtin', () => {
    it('should list built-in MCP servers', async () => {
      const res = await request(app)
        .get('/api/mcp/builtin')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'filesystem',
            command: 'npx',
          }),
        ])
      );
    });
  });

  describe('POST /api/mcp', () => {
    it('should create stdio MCP server', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Stdio MCP',
          description: 'Test stdio transport',
          transportType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.transportType).toBe('stdio');
      expect(res.body.data.command).toBe('npx');
      expect(res.body.mcporterSync).toBe(true);
    });

    it('should create http MCP server', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test HTTP MCP',
          description: 'Test http transport',
          transportType: 'http',
          url: 'https://api.example.com/mcp',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transportType).toBe('http');
      expect(res.body.data.url).toBe('https://api.example.com/mcp');
    });

    it('should reject stdio without command', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Stdio MCP',
          transportType: 'stdio',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Command is required');
    });

    it('should reject http without url', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid HTTP MCP',
          transportType: 'http',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('URL is required');
    });

    it('should reject invalid URL format', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid URL MCP',
          transportType: 'http',
          url: 'not-a-valid-url',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid URL');
    });

    it('should reject duplicate names', async () => {
      // First create
      await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Duplicate MCP',
          transportType: 'stdio',
          command: 'npx',
        });

      // Try duplicate
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Duplicate MCP',
          transportType: 'stdio',
          command: 'npx',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already exists');
    });
  });

  describe('POST /api/mcp/import-json', () => {
    it('should import stdio MCP from JSON', async () => {
      const configJson = JSON.stringify({
        name: 'Imported Stdio MCP',
        command: 'python',
        args: ['-m', 'mcp_server'],
        description: 'Test imported server',
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.transportType).toBe('stdio');
    });

    it('should import http MCP from JSON', async () => {
      const configJson = JSON.stringify({
        name: 'Imported HTTP MCP',
        url: 'https://api.example.com/mcp',
        auth: { type: 'api_key', apiKey: 'test-key' },
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transportType).toBe('http');
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

    it('should reject missing name', async () => {
      const configJson = JSON.stringify({
        command: 'npx',
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Name is required');
    });

    it('should reject missing both command and url', async () => {
      const configJson = JSON.stringify({
        name: 'Invalid MCP',
      });

      const res = await request(app)
        .post('/api/mcp/import-json')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ configJson });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('command or url is required');
    });
  });

  describe('PUT /api/mcp/:id', () => {
    it('should update MCP server', async () => {
      // Create first
      const createRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Update Test MCP',
          transportType: 'stdio',
          command: 'npx',
        });

      const mcpId = createRes.body.data.id;

      // Update
      const res = await request(app)
        .put(`/api/mcp/${mcpId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Updated description',
          enabled: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mcporterSync).toBeDefined();
    });

    it('should return 404 for non-existent MCP', async () => {
      const res = await request(app)
        .put('/api/mcp/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Test' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/mcp/:id', () => {
    it('should delete MCP server and remove from mcporter', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Delete Test MCP',
          transportType: 'stdio',
          command: 'npx',
        });

      const mcpId = createRes.body.data.id;

      // Delete
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

  describe('POST /api/mcp/sync', () => {
    it('should sync all MCP servers to mcporter', async () => {
      const res = await request(app)
        .post('/api/mcp/sync')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('synced');
      expect(res.body.mcporterSync).toBe(true);
    });
  });

  describe('POST /api/mcp/:id/test', () => {
    it('should test stdio MCP server', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Connection MCP',
          transportType: 'stdio',
          command: 'echo',
        });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/mcp/${mcpId}/test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('reachable');
      expect(res.body.data.transport).toBe('stdio');
    });

    it('should test http MCP server', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test HTTP MCP',
          transportType: 'http',
          url: 'https://example.com',
        });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/mcp/${mcpId}/test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('reachable');
      expect(res.body.data.transport).toBe('http');
    });

    it('should handle stdio without command', async () => {
      // Create without command (should not happen normally, but test edge case)
      const createRes = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'No Command MCP',
          transportType: 'stdio',
          command: 'echo',
        });

      const mcpId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/mcp/${mcpId}/test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
