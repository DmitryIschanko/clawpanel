import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';

const router = Router();

// List skills
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const skills = db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all();
  
  res.json({
    success: true,
    data: skills.map(s => ({
      ...s,
      security_flags: s.security_flags ? JSON.parse(s.security_flags) : {},
    })),
  });
}));

// Get single skill
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  
  if (!skill) {
    throw new NotFoundError('Skill not found');
  }
  
  res.json({
    success: true,
    data: {
      ...skill,
      security_flags: skill.security_flags ? JSON.parse(skill.security_flags) : {},
    },
  });
}));

// Install skill from ClawHub
router.post('/install', authenticateToken, requireAdmin, auditLog('install', 'skill'), asyncHandler(async (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    throw new ValidationError('Skill name is required');
  }
  
  // In a real implementation, this would call openclaw skills install
  
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO skills (name, description, source, path, enabled)
    VALUES (?, ?, 'clawhub', ?, 1)
  `).run(name, `Installed from ClawHub`, `skills/${name}`);
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

// Upload skill
router.post('/upload', authenticateToken, requireAdmin, auditLog('upload', 'skill'), asyncHandler(async (req, res) => {
  const { name, content } = req.body;
  
  if (!name || !content) {
    throw new ValidationError('Name and content are required');
  }
  
  // Check for security flags
  const securityFlags: Record<string, boolean> = {};
  
  if (content.includes('fetch(') || content.includes('http')) {
    securityFlags.hasExternalFetch = true;
  }
  
  if (content.includes('eval(') || content.includes('Function(')) {
    securityFlags.hasEval = true;
  }
  
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO skills (name, description, source, content, enabled, security_flags)
    VALUES (?, ?, 'upload', ?, 1, ?)
  `).run(
    name,
    'Custom uploaded skill',
    content,
    JSON.stringify(securityFlags)
  );
  
  res.status(201).json({
    success: true,
    data: { 
      id: result.lastInsertRowid,
      securityFlags,
    },
  });
}));

// Update skill
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'skill'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(req.params.id);
  
  if (!skill) {
    throw new NotFoundError('Skill not found');
  }
  
  const { enabled, content } = req.body;
  
  if (enabled !== undefined) {
    db.prepare('UPDATE skills SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, req.params.id);
  }
  
  if (content !== undefined) {
    db.prepare('UPDATE skills SET content = ? WHERE id = ?').run(content, req.params.id);
  }
  
  res.json({
    success: true,
    message: 'Skill updated successfully',
  });
}));

// Delete skill
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'skill'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM skills WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Skill not found');
  }
  
  res.json({
    success: true,
    message: 'Skill deleted successfully',
  });
}));

export default router;
