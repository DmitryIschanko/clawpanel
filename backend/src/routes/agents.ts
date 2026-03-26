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

// Delete agent memory
function deleteAgentMemory(agentId: string): boolean {
  try {
    const agentsDir = getAgentsDir();
    const agentDir = path.join(agentsDir, `clawpanel-${agentId}`);
    
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true });
      logger.info(`Deleted agent memory: ${agentDir}`);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to delete agent memory: ${error}`);
    return false;
  }
}

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

// Get single agent
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
  
  res.status(201).json({
    success: true,
    data: { 
      id: result.lastInsertRowid,
      memoryCreated: memoryResult.created,
      memoryPath: memoryResult.path,
      openclawRegistered,
    },
  });
}));

// Update agent
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

// Delete agent
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'agent'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Agent not found');
  }
  
  // Delete agent memory
  deleteAgentMemory(req.params.id);
  
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

export default router;
