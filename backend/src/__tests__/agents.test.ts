import request from 'supertest';
import express from 'express';
import agentsRoutes from '../routes/agents';
import authRoutes from '../routes/auth';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentsRoutes);
app.use(errorHandler);

describe('Agents API', () => {
  let authToken: string;

  beforeEach(async () => {
    // Login to get auth token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });
    authToken = res.body.data.accessToken;
  });

  describe('GET /api/agents', () => {
    it('should list all agents', async () => {
      const res = await request(app)
        .get('/api/agents')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject unauthorized access', async () => {
      const res = await request(app)
        .get('/api/agents');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/agents')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/agents', () => {
    it('should create a new agent and return complete data', async () => {
      const res = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Agent',
          role: 'tester',
          model: 'gpt-4o',
          temperature: 0.7,
          max_tokens: 2048,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('name');
      expect(res.body.data.name).toBe('Test Agent');
      expect(res.body.data).toHaveProperty('role');
      expect(res.body.data.role).toBe('tester');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ role: 'tester' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should create agent with minimal data and return complete data', async () => {
      const res = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Minimal Agent' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('name');
      expect(res.body.data.name).toBe('Minimal Agent');
    });
  });

  describe('GET /api/agents/:id', () => {
    it('should get agent by id', async () => {
      // Create agent first
      const createRes = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Get Test Agent' });

      const agentId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Get Test Agent');
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .get('/api/agents/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/agents/:id', () => {
    it('should update agent', async () => {
      // Create agent first
      const createRes = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Update Test Agent' });

      const agentId = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ temperature: 0.5, max_tokens: 1024 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .put('/api/agents/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ temperature: 0.5 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/agents/:id', () => {
    it('should delete agent', async () => {
      // Create agent first
      const createRes = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Delete Test Agent' });

      const agentId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const getRes = await request(app)
        .get(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .delete('/api/agents/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
