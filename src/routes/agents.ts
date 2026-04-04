import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';
import { execOnHost } from '../services/hostExecutor';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Agent type from database
interface Agent {
  id: number;
  name: string;
  avatar?: string;
  role?: string;
  description?: string;
  color?: string;
  model?: string;
  fallback_model?: string;
  temperature?: number;
  max_tokens?: number;
  thinking_level?: string;
  sandbox_mode?: number;
  system_prompt?: string;
  status?: string;
  skills?: string;
  tools?: string;
  delegate_to?: string;
  created_at: number;
  updated_at: number;
}

interface Skill {
  id: number;
  name: string;
}

const router = Router();

// Get agents directory (similar to OpenClaw structure)
function getAgentsDir(): string {
  // Try OpenClaw agents dir first
  const openclawAgents = path.join(os.homedir(), '.openclaw', 'agents');
  if (fs.existsSync(path.dirname(openclawAgents))) {
    return openclawAgents;
  }
  // Fallback to ClawPanel agents dir
  return path.join(os.homedir(), '.clawpanel', 'agents');
}

// Create agent memory structure similar to OpenClaw
function createAgentMemory(agentId: string, agentName: string): { created: boolean; path: string } {
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${agentId}`);
    
    // Create directory structure
    const dirs = [
      agentDir,
      path.join(agentDir, 'agent'),
      path.join(agentDir, 'sessions'),
      path.join(agentDir, 'workspace'),
      path.join(agentDir, 'memory'),
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    // Create default config files
    const configPath = path.join(agentDir, 'agent', 'config.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({
        name: agentName,
        version: 1,
        createdAt: new Date().toISOString(),
        source: 'clawpanel',
      }, null, 2));
    }
    
    // Create AGENTS.md
    const agentsMdPath = path.join(agentDir, 'AGENTS.md');
    if (!fs.existsSync(agentsMdPath)) {
      fs.writeFileSync(agentsMdPath, `# ${agentName}

Agent created via ClawPanel.

## System Prompt

Add system prompt here.

## Capabilities

- Tool usage
- Skill execution
- Memory management
`);
    }
    
    // Create SOUL.md
    const soulMdPath = path.join(agentDir, 'SOUL.md');
    if (!fs.existsSync(soulMdPath)) {
      fs.writeFileSync(soulMdPath, `# ${agentName} - Soul

Personality and values configuration.

## Core Values

- Helpfulness
- Accuracy
- Efficiency

## Communication Style

Professional and friendly.
`);
    }
    
    // Create memory index
    const memoryIndexPath = path.join(agentDir, 'memory', 'index.md');
    if (!fs.existsSync(memoryIndexPath)) {
      fs.writeFileSync(memoryIndexPath, `# Memory Index

Agent: ${agentName}
Created: ${new Date().toISOString()}

## Topics

`);
    }
    
    logger.info(`Created agent memory structure at: ${agentDir}`);
    return { created: true, path: agentDir };
  } catch (error) {
    logger.error(`Failed to create agent memory: ${error}`);
    return { created: false, path: '' };
  }
}

// Get agent memory info
function getAgentMemory(agentId: string): { exists: boolean; path?: string; files?: string[] } {
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${agentId}`);
    
    if (!fs.existsSync(agentDir)) {
      return { exists: false };
    }
    
    const files: string[] = [];
    function scanDir(dir: string, prefix = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          scanDir(path.join(dir, entry.name), relativePath);
        } else {
          files.push(relativePath);
        }
      }
    }
    scanDir(agentDir);
    
    return { exists: true, path: agentDir, files };
  } catch (error) {
    logger.error(`Failed to get agent memory: ${error}`);
    return { exists: false };
  }
}

// Delete agent memory from host via Host Executor
async function deleteAgentFromHost(agentId: string): Promise<boolean> {
  try {
    const agentName = `clawpanel-${agentId}`;
    
    // 1. Remove agent from OpenClaw (ignore errors if not registered)
    try {
      await execOnHost(`openclaw agents remove ${agentName}`);
      logger.info(`Removed agent from OpenClaw: ${agentName}`);
    } catch (error) {
      // Agent might not be registered, continue
      logger.warn(`Agent ${agentName} not found in OpenClaw or removal failed`);
    }
    
    // 2. Remove agent directory from filesystem
    const agentDir = `/root/.openclaw/agents/${agentName}`;
    try {
      await execOnHost(`rm -rf ${agentDir}`);
      logger.info(`Deleted agent directory: ${agentDir}`);
    } catch (error) {
      logger.warn(`Failed to delete agent directory: ${error}`);
    }
    
    // 3. Restart Gateway to apply changes
    try {
      await execOnHost('systemctl restart openclaw-gateway');
      logger.info('Gateway restarted after agent removal');
    } catch (error) {
      logger.warn(`Failed to restart gateway: ${error}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed to delete agent from host: ${error}`);
    return false;
  }
}

/**
 * @swagger
 * /agents:
 *   get:
 *     summary: List all agents
 *     description: Get list of all agents with optional filtering
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by role
 *     responses:
 *       200:
 *         description: List of agents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       role:
 *                         type: string
 *                       model:
 *                         type: string
 *                       status:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
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
    data: agents.map((agent: any) => {
      const memory = getAgentMemory(agent.id.toString());
      return {
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
        memory: memory,
      };
    }),
  });
}));

/**
 * @swagger
 * /agents/{id}:
 *   get:
 *     summary: Get agent by ID
 *     description: Get detailed information about a specific agent
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Agent ID
 *     responses:
 *       200:
 *         description: Agent details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     avatar:
 *                       type: string
 *                     role:
 *                       type: string
 *                     description:
 *                       type: string
 *                     color:
 *                       type: string
 *                     model:
 *                       type: string
 *                     temperature:
 *                       type: number
 *                     maxTokens:
 *                       type: integer
 *                     status:
 *                       type: string
 *       404:
 *         description: Agent not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Agent | undefined;
  
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

/**
 * @swagger
 * /agents:
 *   post:
 *     summary: Create new agent
 *     description: Create a new agent with specified configuration
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Agent name
 *               role:
 *                 type: string
 *                 description: Agent role
 *               description:
 *                 type: string
 *               model:
 *                 type: string
 *                 description: LLM model (e.g., gpt-4o)
 *               temperature:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 2
 *               maxTokens:
 *                 type: integer
 *               skills:
 *                 type: array
 *                 items:
 *                   type: integer
 *               tools:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Agent created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
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
  
  // Create agent memory structure
  const agentId = result.lastInsertRowid.toString();
  const memoryResult = createAgentMemory(agentId, name);
  
  // Register agent in OpenClaw
  let openclawRegistered = false;
  try {
    const agentName = `clawpanel-${agentId}`;
    const workspace = path.join(getAgentsDir(), agentName);
    const modelStr = model || 'kimi/kimi-k2.5';
    
    const result = await execOnHost(
      `openclaw agents add ${agentName} --model ${modelStr} --workspace ${workspace}`
    );
    
    if (result.success) {
      openclawRegistered = true;
      logger.info(`Agent ${agentName} registered in OpenClaw`);
      
      // Restart Gateway to pick up new agent (async, don't wait)
      execOnHost('systemctl restart openclaw-gateway').then(() => {
        logger.info('Gateway restarted to pick up new agent');
      }).catch((err) => {
        logger.error('Failed to restart Gateway:', err);
      });
    } else {
      logger.error(`Failed to register agent in OpenClaw: ${result.stderr}`);
    }
  } catch (error) {
    logger.error(`Error registering agent in OpenClaw: ${error}`);
  }
  
  // Get the created agent to return complete data
  const createdAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid) as Agent;
  
  res.status(201).json({
    success: true,
    data: { 
      id: createdAgent.id,
      name: createdAgent.name,
      avatar: createdAgent.avatar,
      role: createdAgent.role,
      description: createdAgent.description,
      color: createdAgent.color,
      model: createdAgent.model,
      fallbackModel: createdAgent.fallback_model,
      temperature: createdAgent.temperature,
      maxTokens: createdAgent.max_tokens,
      thinkingLevel: createdAgent.thinking_level,
      sandboxMode: createdAgent.sandbox_mode === 1,
      systemPrompt: createdAgent.system_prompt,
      status: createdAgent.status,
      skills: createdAgent.skills ? JSON.parse(createdAgent.skills) : [],
      tools: createdAgent.tools ? JSON.parse(createdAgent.tools) : [],
      delegateTo: createdAgent.delegate_to ? JSON.parse(createdAgent.delegate_to) : [],
      createdAt: createdAgent.created_at,
      updatedAt: createdAgent.updated_at,
      memoryCreated: memoryResult.created,
      memoryPath: memoryResult.path,
      openclawRegistered,
    },
  });
}));

/**
 * @swagger
 * /agents/{id}:
 *   put:
 *     summary: Update agent
 *     description: Update agent configuration
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Agent ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *               model:
 *                 type: string
 *               temperature:
 *                 type: number
 *               maxTokens:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Agent updated successfully
 *       404:
 *         description: Agent not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'agent'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id) as { id: number } | undefined;
  
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

/**
 * @swagger
 * /agents/{id}:
 *   delete:
 *     summary: Delete agent
 *     description: Delete agent and associated memory
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Agent ID
 *     responses:
 *       200:
 *         description: Agent deleted successfully
 *       404:
 *         description: Agent not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'agent'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  // Get agent name before deletion for logging
  const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(req.params.id) as Agent | undefined;
  
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Agent not found');
  }
  
  // Delete agent from host (OpenClaw + filesystem)
  await deleteAgentFromHost(req.params.id);
  
  res.json({
    success: true,
    message: 'Agent deleted successfully',
  });
}));

// Get AGENTS.md content
router.get('/:id/agents-md', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${req.params.id}`);
    const agentsMdPath = path.join(agentDir, 'AGENTS.md');
    
    let content: string;
    if (fs.existsSync(agentsMdPath)) {
      content = fs.readFileSync(agentsMdPath, 'utf8');
    } else {
      content = '# Agent System Prompt\n\nThis is the AGENTS.md file for this agent.';
    }
    
    res.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        content: '# Agent System Prompt\n\nThis is the AGENTS.md file for this agent.',
      },
    });
  }
}));

// Update AGENTS.md content
router.put('/:id/agents-md', authenticateToken, requireAdmin, auditLog('update', 'agents-md'), asyncHandler(async (req, res) => {
  const { content } = req.body;
  
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${req.params.id}`);
    const agentsMdPath = path.join(agentDir, 'AGENTS.md');
    
    // Ensure directory exists
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    
    fs.writeFileSync(agentsMdPath, content);
    
    res.json({
      success: true,
      message: 'AGENTS.md updated successfully',
    });
  } catch (error) {
    logger.error(`Failed to update AGENTS.md: ${error}`);
    throw new Error('Failed to update AGENTS.md');
  }
}));

// Get SOUL.md content
router.get('/:id/soul-md', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${req.params.id}`);
    const soulMdPath = path.join(agentDir, 'SOUL.md');
    
    let content: string;
    if (fs.existsSync(soulMdPath)) {
      content = fs.readFileSync(soulMdPath, 'utf8');
    } else {
      content = '# Agent Soul\n\nPersonality and values.';
    }
    
    res.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        content: '# Agent Soul\n\nPersonality and values.',
      },
    });
  }
}));

// Update SOUL.md content
router.put('/:id/soul-md', authenticateToken, requireAdmin, auditLog('update', 'soul-md'), asyncHandler(async (req, res) => {
  const { content } = req.body;
  
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${req.params.id}`);
    const soulMdPath = path.join(agentDir, 'SOUL.md');
    
    // Ensure directory exists
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    
    fs.writeFileSync(soulMdPath, content);
    
    res.json({
      success: true,
      message: 'SOUL.md updated successfully',
    });
  } catch (error) {
    logger.error(`Failed to update SOUL.md: ${error}`);
    throw new Error('Failed to update SOUL.md');
  }
}));

// Get agent skills + available skills
router.get('/:id/skills', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  // Get agent
  const agent = db.prepare('SELECT id, name, skills FROM agents WHERE id = ?').get(req.params.id) as { id: number; name: string; skills?: string } | undefined;
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  // Get all available skills
  const allSkills = db.prepare('SELECT id, name, description, source, enabled FROM skills ORDER BY name').all();
  
  // Get agent's assigned skills
  const assignedSkillIds: number[] = agent.skills ? JSON.parse(agent.skills) : [];
  
  res.json({
    success: true,
    data: {
      agentId: agent.id,
      agentName: agent.name,
      assignedSkillIds,
      availableSkills: allSkills.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        source: s.source,
        enabled: s.enabled === 1,
        assigned: assignedSkillIds.includes(s.id),
      })),
    },
  });
}));

// Update agent skills
router.put('/:id/skills', authenticateToken, requireAdmin, auditLog('update', 'agent-skills'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agent = db.prepare('SELECT id, name, skills FROM agents WHERE id = ?').get(req.params.id) as { id: number; name: string; skills?: string } | undefined;
  
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  const { skillIds } = req.body;
  if (!Array.isArray(skillIds)) {
    throw new ValidationError('skillIds must be an array');
  }
  
  // Update database
  db.prepare('UPDATE agents SET skills = ?, updated_at = unixepoch() WHERE id = ?')
    .run(JSON.stringify(skillIds), req.params.id);
  
  // Sync skills to agent's filesystem
  const agentsDir = getAgentsDir();
  const agentDir = path.join(agentsDir, `clawpanel-${req.params.id}`);
  const agentSkillsDir = path.join(agentDir, 'skills');
  
  // Ensure skills directory exists
  if (!fs.existsSync(agentSkillsDir)) {
    fs.mkdirSync(agentSkillsDir, { recursive: true });
  }
  
  // Get skill names
  const skillNames: string[] = [];
  for (const skillId of skillIds) {
    const skill = db.prepare('SELECT name FROM skills WHERE id = ?').get(skillId) as Skill | undefined;
    if (skill) {
      skillNames.push(skill.name);
    }
  }
  
  // Create skills index file
  const skillsIndexPath = path.join(agentSkillsDir, 'index.json');
  fs.writeFileSync(skillsIndexPath, JSON.stringify({
    agentId: req.params.id,
    skills: skillNames,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  
  // Copy SKILL.md files to agent's directory
  const skillsDir = getOpenClawSkillsDir();
  if (skillsDir) {
    for (const skillName of skillNames) {
      const sourcePath = path.join(skillsDir, skillName, 'SKILL.md');
      const targetPath = path.join(agentSkillsDir, `${skillName}.md`);
      
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        logger.info(`Copied skill ${skillName} to agent ${req.params.id}`);
      }
    }
    
    // Remove skills that are no longer assigned
    const existingFiles = fs.readdirSync(agentSkillsDir);
    for (const file of existingFiles) {
      if (file.endsWith('.md') && file !== 'index.json') {
        const skillName = file.replace('.md', '');
        if (!skillNames.includes(skillName)) {
          fs.unlinkSync(path.join(agentSkillsDir, file));
          logger.info(`Removed skill ${skillName} from agent ${req.params.id}`);
        }
      }
    }
  }
  
  res.json({
    success: true,
    data: { assignedSkillIds: skillIds, skillNames },
    message: 'Agent skills updated successfully',
  });
}));

// Helper function to get OpenClaw skills directory
function getOpenClawSkillsDir(): string | null {
  const candidates = [
    path.join(os.homedir(), '.openclaw', 'skills'),
    '/root/.openclaw/skills',
  ];
  
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

/**
 * GET /api/agents/:id/tools
 * Get tools assigned to an agent
 */
router.get('/:id/tools', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agentId = req.params.id;
  
  // Check agent exists
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  // Get assigned tools via agent_tools table + direct agent_id assignment
  const tools = db.prepare(`
    SELECT t.*, m.name as mcp_server_name, c.display_name as composio_app_name,
           CASE WHEN at.id IS NOT NULL THEN 1 ELSE 0 END as is_assigned
    FROM tools t
    LEFT JOIN mcp_servers m ON t.mcp_server_id = m.id
    LEFT JOIN composio_apps c ON t.composio_app_id = c.id
    LEFT JOIN agent_tools at ON at.tool_id = t.id AND at.agent_id = ?
    WHERE t.enabled = 1
    ORDER BY t.source, t.name
  `).all(agentId);
  
  res.json({
    success: true,
    data: tools.map((t: any) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      source: t.source || 'native',
      description: t.description,
      enabled: t.enabled === 1,
      isAssigned: t.is_assigned === 1 || t.agent_id === parseInt(agentId),
      mcpServerName: t.mcp_server_name,
      composioAppName: t.composio_app_name,
    })),
  });
}));

/**
 * POST /api/agents/:id/tools
 * Assign tools to an agent (bulk)
 */
router.post('/:id/tools', authenticateToken, requireAdmin, auditLog('update', 'agent_tools'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const agentId = req.params.id;
  const { toolIds } = req.body;
  
  if (!Array.isArray(toolIds)) {
    throw new ValidationError('toolIds must be an array');
  }
  
  // Check agent exists
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentId);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  
  // Start transaction
  db.prepare('BEGIN TRANSACTION').run();
  
  try {
    // Remove existing assignments
    db.prepare('DELETE FROM agent_tools WHERE agent_id = ?').run(agentId);
    
    // Add new assignments
    for (const toolId of toolIds) {
      // Verify tool exists
      const tool = db.prepare('SELECT id FROM tools WHERE id = ?').get(toolId);
      if (!tool) {
        throw new ValidationError(`Tool ${toolId} not found`);
      }
      
      db.prepare(`
        INSERT INTO agent_tools (agent_id, tool_id, enabled)
        VALUES (?, ?, 1)
      `).run(agentId, toolId);
    }
    
    db.prepare('COMMIT').run();
    
    res.json({
      success: true,
      data: { assignedToolIds: toolIds },
      message: 'Agent tools updated successfully',
    });
  } catch (error) {
    db.prepare('ROLLBACK').run();
    throw error;
  }
}));

/**
 * DELETE /api/agents/:id/tools/:toolId
 * Remove a tool from an agent
 */
router.delete('/:id/tools/:toolId', authenticateToken, requireAdmin, auditLog('delete', 'agent_tool'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const { id: agentId, toolId } = req.params;
  
  const result = db.prepare('DELETE FROM agent_tools WHERE agent_id = ? AND tool_id = ?').run(agentId, toolId);
  
  if (result.changes === 0) {
    throw new NotFoundError('Tool assignment not found');
  }
  
  res.json({
    success: true,
    message: 'Tool removed from agent successfully',
  });
}));

export default router;
