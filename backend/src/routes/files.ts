import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError, NotFoundError } from '../utils/errors';

const router = Router();

// Root directory for file manager (full VPS access)
const ROOT_DIR = '/';

// Important directories that should be color-coded
const IMPORTANT_DIRS: Record<string, { color: string; label: string }> = {
  '/root/.openclaw': { color: '#e8ff5a', label: 'OpenClaw Config' },
  '/root/.openclaw/agents': { color: '#60a5fa', label: 'Agents' },
  '/root/.openclaw/skills': { color: '#f472b6', label: 'Skills' },
  '/root/.openclaw/workspace': { color: '#a78bfa', label: 'Workspace' },
  '/root/.ssh': { color: '#f87171', label: 'SSH Keys' },
  '/root/clawpanel': { color: '#34d399', label: 'ClawPanel' },
  '/etc': { color: '#fb923c', label: 'System Config' },
  '/var/log': { color: '#94a3b8', label: 'Logs' },
  '/root/.claw': { color: '#fbbf24', label: 'Claw Memory' },
};

// Protected paths that cannot be accessed
const PROTECTED_PATHS = [
  '/proc',
  '/sys',
  '/dev',
  '/run',
  '/boot',
  '/lost+found',
];

// Max depth for tree traversal
const MAX_DEPTH = 3;

function isProtected(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return PROTECTED_PATHS.some(p => normalized === p || normalized.startsWith(p + '/'));
}

function resolvePath(relativePath: string): string {
  // Normalize the path and ensure it stays within ROOT_DIR
  const cleanPath = relativePath.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT_DIR, cleanPath);
  
  // Basic path traversal protection
  if (!resolved.startsWith(ROOT_DIR) && resolved !== ROOT_DIR) {
    throw new ForbiddenError('Invalid path');
  }
  
  return resolved;
}

function getDirectoryImportance(dirPath: string): { color: string; label: string } | null {
  const normalized = path.normalize(dirPath);
  
  // Check exact match first
  if (IMPORTANT_DIRS[normalized]) {
    return IMPORTANT_DIRS[normalized];
  }
  
  // Check if it's a subdirectory of an important directory
  for (const [importantPath, info] of Object.entries(IMPORTANT_DIRS)) {
    if (normalized.startsWith(importantPath + '/')) {
      return info;
    }
  }
  
  return null;
}

// Get file tree
router.get('/tree', authenticateToken, asyncHandler(async (req, res) => {
  const { path: relativePath = '', depth = 0 } = req.query as { path?: string; depth?: string };
  const fullPath = resolvePath(relativePath);
  const currentDepth = parseInt(depth as string, 10) || 0;
  
  if (isProtected(fullPath)) {
    throw new ForbiddenError('Access to this directory is restricted');
  }
  
  async function buildTree(dir: string, level: number): Promise<any[]> {
    if (level > MAX_DEPTH) {
      return [];
    }
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const result = [];
      
      for (const entry of entries) {
        // Skip hidden files at root level
        if (level === 0 && entry.name.startsWith('.')) continue;
        
        const entryPath = path.join(dir, entry.name);
        
        if (isProtected(entryPath)) continue;
        
        const importance = getDirectoryImportance(entryPath);
        
        if (entry.isDirectory()) {
          const children = level < MAX_DEPTH ? await buildTree(entryPath, level + 1) : [];
          result.push({
            name: entry.name,
            type: 'directory',
            path: entryPath,
            importance: importance,
            children: children.length > 0 ? children : undefined,
            hasMoreChildren: children.length === 0 && level >= MAX_DEPTH,
          });
        } else {
          try {
            const stats = await fs.stat(entryPath);
            result.push({
              name: entry.name,
              type: 'file',
              path: entryPath,
              size: stats.size,
              modified: stats.mtime,
            });
          } catch (e) {
            // Skip files we can't stat
          }
        }
      }
      
      return result.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });
    } catch (error) {
      // Return empty array if we can't read directory
      return [];
    }
  }
  
  const tree = await buildTree(fullPath, currentDepth);
  
  res.json({
    success: true,
    data: tree,
    path: fullPath,
  });
}));

/**
 * @swagger
 * /files/list:
 *   get:
 *     summary: List directory contents
 *     description: Get files and directories at specified path
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: Directory path (relative to workspace)
 *     responses:
 *       200:
 *         description: Directory listing
 *       403:
 *         description: Access to directory restricted
 *       401:
 *         description: Unauthorized
 */
router.get('/list', authenticateToken, asyncHandler(async (req, res) => {
  const { path: relativePath = '' } = req.query as { path?: string };
  const fullPath = resolvePath(relativePath);
  
  if (isProtected(fullPath)) {
    throw new ForbiddenError('Access to this directory is restricted');
  }
  
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const result = [];
  
  for (const entry of entries) {
    const entryPath = path.join(fullPath, entry.name);
    
    if (isProtected(entryPath)) continue;
    
    const importance = getDirectoryImportance(entryPath);
    
    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        type: 'directory',
        path: entryPath,
        importance: importance,
      });
    } else {
      try {
        const stats = await fs.stat(entryPath);
        result.push({
          name: entry.name,
          type: 'file',
          path: entryPath,
          size: stats.size,
          modified: stats.mtime,
        });
      } catch (e) {
        // Skip files we can't stat
      }
    }
  }
  
  res.json({
    success: true,
    data: result.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    }),
  });
}));

// Get file content
router.get('/content', authenticateToken, asyncHandler(async (req, res) => {
  const { path: filePath } = req.query as { path: string };
  
  if (!filePath) {
    throw new ForbiddenError('Path is required');
  }
  
  const fullPath = path.normalize(filePath);
  
  if (isProtected(fullPath)) {
    throw new ForbiddenError('Access to this file is restricted');
  }
  
  // Check file size limit (10MB)
  try {
    const stats = await fs.stat(fullPath);
    if (stats.size > 10 * 1024 * 1024) {
      throw new ForbiddenError('File too large (max 10MB)');
    }
  } catch (error: any) {
    if (error.message === 'File too large (max 10MB)') throw error;
    throw new NotFoundError('File not found');
  }
  
  const content = await fs.readFile(fullPath, 'utf-8');
  
  res.json({
    success: true,
    data: { content },
  });
}));

// Update file content
router.put('/content', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { path: filePath, content } = req.body;
  
  if (!filePath) {
    throw new ForbiddenError('Path is required');
  }
  
  const fullPath = path.normalize(filePath);
  
  if (isProtected(fullPath)) {
    throw new ForbiddenError('Cannot modify this file');
  }
  
  await fs.writeFile(fullPath, content, 'utf-8');
  
  res.json({
    success: true,
    message: 'File updated successfully',
  });
}));

// Create file/directory
router.post('/create', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { path: filePath, type = 'file' } = req.body;
  
  if (!filePath) {
    throw new ForbiddenError('Path is required');
  }
  
  const fullPath = path.normalize(filePath);
  
  if (isProtected(fullPath)) {
    throw new ForbiddenError('Cannot create in this location');
  }
  
  if (type === 'directory') {
    await fs.mkdir(fullPath, { recursive: true });
  } else {
    await fs.writeFile(fullPath, '', 'utf-8');
  }
  
  res.json({
    success: true,
    message: 'Created successfully',
  });
}));

// Delete file/directory
router.delete('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { path: filePath } = req.query as { path: string };
  
  if (!filePath) {
    throw new ForbiddenError('Path is required');
  }
  
  const fullPath = path.normalize(filePath);
  
  if (isProtected(fullPath)) {
    throw new ForbiddenError('Cannot delete this file');
  }
  
  const stats = await fs.stat(fullPath);
  
  if (stats.isDirectory()) {
    await fs.rmdir(fullPath, { recursive: true });
  } else {
    await fs.unlink(fullPath);
  }
  
  res.json({
    success: true,
    message: 'Deleted successfully',
  });
}));

export default router;
