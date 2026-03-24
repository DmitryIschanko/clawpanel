import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import { logger } from '../utils/logger';
import https from 'https';
import AdmZip from 'adm-zip';

const router = Router();

const CLAWHUB_API = 'clawhub.ai';

// Fetch skill from ClawHub API and extract SKILL.md
async function fetchSkillFromClawHub(slug: string): Promise<{ name: string; content: string; description: string } | null> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CLAWHUB_API,
      path: `/api/v1/download?slug=${encodeURIComponent(slug)}&format=skill`,
      method: 'GET',
      headers: {
        'User-Agent': 'ClawPanel/1.0',
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        logger.warn(`ClawHub API returned ${res.statusCode} for slug: ${slug}`);
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          logger.info(`Downloaded ${buffer.length} bytes for skill: ${slug}`);
          
          // Extract ZIP using adm-zip
          const zip = new AdmZip(buffer);
          const entries = zip.getEntries();
          
          // Find SKILL.md in the archive
          const skillEntry = entries.find(entry => 
            entry.entryName.toLowerCase().endsWith('skill.md') ||
            entry.entryName.toLowerCase() === 'skill.md'
          );
          
          // Find README.md as fallback
          const readmeEntry = entries.find(entry => 
            entry.entryName.toLowerCase().endsWith('readme.md') ||
            entry.entryName.toLowerCase() === 'readme.md'
          );
          
          let content = '';
          let description = `Installed from ClawHub (${slug})`;
          
          if (skillEntry) {
            content = skillEntry.getData().toString('utf8');
            logger.info(`Extracted SKILL.md (${content.length} chars)`);
            // Extract first line as description
            const firstLine = content.split('\n')[0];
            if (firstLine && firstLine.startsWith('#')) {
              description = firstLine.replace(/^#+\s*/, '').trim();
            }
          } else if (readmeEntry) {
            content = readmeEntry.getData().toString('utf8');
            logger.info(`Extracted README.md (${content.length} chars)`);
            const firstLine = content.split('\n')[0];
            if (firstLine && firstLine.startsWith('#')) {
              description = firstLine.replace(/^#+\s*/, '').trim();
            }
          } else {
            // List available files for debugging
            const files = entries.map(e => e.entryName).join(', ');
            logger.warn(`No SKILL.md found. Available files: ${files}`);
            content = `# ${slug}\n\nDownloaded from ClawHub.\n\n[ZIP contains: ${files}]`;
          }
          
          resolve({
            name: slug,
            content,
            description,
          });
        } catch (error) {
          logger.error('Failed to extract ZIP:', error);
          resolve({
            name: slug,
            content: `# ${slug}\n\nDownloaded from ClawHub.\n\n[Failed to extract ZIP archive]`,
            description: `Installed from ClawHub (${slug}) - extraction failed`,
          });
        }
      });
    });

    req.on('error', (err) => {
      logger.error('ClawHub API error:', err);
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('ClawHub API timeout'));
    });

    req.end();
  });
}

// Search skills in ClawHub
async function searchClawHub(query: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CLAWHUB_API,
      path: `/api/v1/search?q=${encodeURIComponent(query)}&limit=10`,
      method: 'GET',
      headers: {
        'User-Agent': 'ClawPanel/1.0',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.results || []);
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

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

// Search ClawHub
router.get('/search', authenticateToken, asyncHandler(async (req, res) => {
  const { q } = req.query;
  
  if (!q || typeof q !== 'string') {
    throw new ValidationError('Query parameter q is required');
  }

  const results = await searchClawHub(q);
  
  res.json({
    success: true,
    data: results,
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

  // Try to fetch from ClawHub
  let skillData: { name: string; content: string; description: string } | null = null;
  
  try {
    skillData = await fetchSkillFromClawHub(name);
  } catch (error) {
    logger.error('Failed to fetch from ClawHub:', error);
  }

  const db = getDatabase();
  
  // Check if skill already exists
  const existing = db.prepare('SELECT id FROM skills WHERE name = ?').get(name);
  if (existing) {
    throw new ValidationError('Skill already installed');
  }

  if (skillData) {
    // Save downloaded skill
    const result = db.prepare(`
      INSERT INTO skills (name, description, source, path, content, enabled)
      VALUES (?, ?, 'clawhub', ?, ?, 1)
    `).run(
      skillData.name,
      skillData.description,
      `skills/${name}`,
      skillData.content
    );
    
    res.status(201).json({
      success: true,
      data: { 
        id: result.lastInsertRowid,
        name: skillData.name,
        description: skillData.description,
      },
    });
  } else {
    // Create placeholder if download failed
    const result = db.prepare(`
      INSERT INTO skills (name, description, source, path, enabled)
      VALUES (?, ?, 'clawhub', ?, 1)
    `).run(
      name,
      `Skill from ClawHub (${name}) - download pending`,
      `skills/${name}`
    );
    
    res.status(201).json({
      success: true,
      data: { 
        id: result.lastInsertRowid,
        name,
        warning: 'Skill metadata saved but content download may require manual setup',
      },
    });
  }
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
