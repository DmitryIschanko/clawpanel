import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';

const router = Router();

// List agents
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const { search, role } = req.query;
  
  let sql = 'SELECT * FROM agents WHERE 1=1';
  const params: any[] = [];
  
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const agents = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: agents.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      role: agent.role,
      description: agent.description,
      color: agent.color,
      model: agent.model,
      fallbackModel: agent.fallback_model,
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
      thinkingLevel: agent.thinking_level,
      sandboxMode: agent.sandbox_mode === 1,
      systemPrompt: agent.system_prompt,
      status: agent.status,
      skills: agent.skills ? JSON.parse(agent.skills) : [],
      tools: agent.tools ? JSON.parse(agent.tools) : [],
      delegateTo: agent.delegate_to ? JSON.parse(agent.delegate_to) : [],
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    })),
  });
}));

// Get single agent
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  res.json({
    success: true,
    data: {
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      role: agent.role,
      description: agent.description,
      color: agent.color,
      model: agent.model,
      fallbackModel: agent.fallback_model,
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
      thinkingLevel: agent.thinking_level,
      sandboxMode: agent.sandbox_mode === 1,
      systemPrompt: agent.system_prompt,
      status: agent.status,
      skills: agent.skills ? JSON.parse(agent.skills) : [],
      tools: agent.tools ? JSON.parse(agent.tools) : [],
      delegateTo: agent.delegate_to ? JSON.parse(agent.delegate_to) : [],
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    },
  });
}));

// Create agent
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'agent'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const b = req.body;
  
  // Support both camelCase and snake_case field names
  const name = b.name;
  const avatar = b.avatar;
  const role = b.role;
  const description = b.description;
  const color = b.color;
  const model = b.model;
  const fallback_model = b.fallback_model || b.fallbackModel;
  const temperature = b.temperature;
  const max_tokens = b.max_tokens || b.maxTokens;
  const thinking_level = b.thinking_level || b.thinkingLevel;
  const sandbox_mode = b.sandbox_mode !== undefined ? b.sandbox_mode : b.sandboxMode;
  const system_prompt = b.system_prompt || b.systemPrompt;
  const status = b.status;
  const skills = b.skills;
  const tools = b.tools;
  const delegate_to = b.delegate_to || b.delegateTo;
  
  if (!name) {
    throw new ValidationError('Name is required');
  }
  
  const result = db.prepare(`
    INSERT INTO agents (name, avatar, role, description, color, model, fallback_model, 
      temperature, max_tokens, thinking_level, sandbox_mode, system_prompt, status, skills, tools, delegate_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    avatar || null,
    role || null,
    description || null,
    color || '#e8ff5a',
    model || null,
    fallback_model || null,
    temperature || 0.7,
    max_tokens || 4096,
    thinking_level || 'medium',
    sandbox_mode ? 1 : 0,
    system_prompt || null,
    status || 'idle',
    skills ? JSON.stringify(skills) : '[]',
    tools ? JSON.stringify(tools) : '[]',
    delegate_to ? JSON.stringify(delegate_to) : '[]'
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

// Update agent
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'agent'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
  
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  const updates = req.body;
  const fields: string[] = [];
  const values: any[] = [];
  
  // Map camelCase API fields to snake_case DB columns
  const fieldNameMapping: Record<string, string> = {
    systemPrompt: 'system_prompt',
    maxTokens: 'max_tokens',
    thinkingLevel: 'thinking_level',
    fallbackModel: 'fallback_model',
    sandboxMode: 'sandbox_mode',
    delegateTo: 'delegate_to',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  };
  
  const fieldMapping: Record<string, (val: any) => any> = {
    skills: JSON.stringify,
    tools: JSON.stringify,
    delegate_to: JSON.stringify,
    delegateTo: JSON.stringify,
    sandbox_mode: (v: boolean) => v ? 1 : 0,
    sandboxMode: (v: boolean) => v ? 1 : 0,
  };
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const dbField = fieldNameMapping[key] || key;
      fields.push(`${dbField} = ?`);
      const transformFn = fieldMapping[key] || fieldMapping[dbField];
      values.push(transformFn ? transformFn(value) : value);
    }
  }
  
  if (fields.length > 0) {
    values.push(req.params.id);
    db.prepare(`UPDATE agents SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`)
      .run(...values);
  }
  
  res.json({
    success: true,
    message: 'Agent updated successfully',
  });
}));

// Delete agent
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'agent'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Agent not found');
  }
  
  res.json({
    success: true,
    message: 'Agent deleted successfully',
  });
}));

// Get AGENTS.md content
router.get('/:id/agents-md', authenticateToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      content: '# Agent System Prompt\n\nThis is the AGENTS.md file for this agent.',
    },
  });
}));

// Update AGENTS.md content
router.put('/:id/agents-md', authenticateToken, requireAdmin, auditLog('update', 'agents-md'), asyncHandler(async (req, res) => {
  const { content } = req.body;
  res.json({
    success: true,
    message: 'AGENTS.md updated successfully',
  });
}));

// Get SOUL.md content
router.get('/:id/soul-md', authenticateToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      content: '# Agent Soul\n\nPersonality and values.',
    },
  });
}));

// Update SOUL.md content
router.put('/:id/soul-md', authenticateToken, requireAdmin, auditLog('update', 'soul-md'), asyncHandler(async (req, res) => {
  const { content } = req.body;
  res.json({
    success: true,
    message: 'SOUL.md updated successfully',
  });
}));

export default router;
