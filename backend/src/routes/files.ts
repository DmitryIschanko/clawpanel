import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ForbiddenError, NotFoundError } from '../utils/errors';

const router = Router();

const OPENCLAW_DIR = '/root/.openclaw';
const PROTECTED_PATHS = [
  'credentials',
  '.env',
  'config/secrets',
];

function isProtected(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return PROTECTED_PATHS.some(p => normalized.includes(p));
}

function resolvePath(relativePath: string): string {
  // Ensure path stays within OPENCLAW_DIR
  const resolved = path.resolve(OPENCLAW_DIR, relativePath.replace(/^\/+/, ''));
  if (!resolved.startsWith(OPENCLAW_DIR)) {
    throw new ForbiddenError('Invalid path');
  }
  return resolved;
}

// Get file tree
router.get('/tree', authenticateToken, asyncHandler(async (req, res) => {
  const { path: relativePath = '' } = req.query as { path?: string };
  const fullPath = resolvePath(relativePath);
  
  async function buildTree(dir: string): Promise<any[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = [];
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const entryPath = path.join(dir, entry.name);
      const relativeEntryPath = path.relative(OPENCLAW_DIR, entryPath);
      
      if (isProtected(relativeEntryPath)) continue;
      
      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          type: 'directory',
          path: relativeEntryPath,
          children: await buildTree(entryPath),
        });
      } else {
        const stats = await fs.stat(entryPath);
        result.push({
          name: entry.name,
          type: 'file',
          path: relativeEntryPath,
          size: stats.size,
          modified: stats.mtime,
        });
      }
    }
    
    return result.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
  }
  
  const tree = await buildTree(fullPath);
  
  res.json({
    success: true,
    data: tree,
  });
}));

// Get file content
router.get('/content', authenticateToken, asyncHandler(async (req, res) => {
  const { path: relativePath } = req.query as { path: string };
  
  if (!relativePath) {
    throw new ForbiddenError('Path is required');
  }
  
  if (isProtected(relativePath)) {
    throw new ForbiddenError('Access to this file is restricted');
  }
  
  const fullPath = resolvePath(relativePath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    
    res.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    throw new NotFoundError('File not found');
  }
}));

// Update file content
router.put('/content', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { path: relativePath, content } = req.body;
  
  if (!relativePath) {
    throw new ForbiddenError('Path is required');
  }
  
  if (isProtected(relativePath)) {
    throw new ForbiddenError('Cannot modify this file');
  }
  
  const fullPath = resolvePath(relativePath);
  
  await fs.writeFile(fullPath, content, 'utf-8');
  
  res.json({
    success: true,
    message: 'File updated successfully',
  });
}));

// Create file/directory
router.post('/create', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { path: relativePath, type = 'file' } = req.body;
  
  if (!relativePath) {
    throw new ForbiddenError('Path is required');
  }
  
  const fullPath = resolvePath(relativePath);
  
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
  const { path: relativePath } = req.query as { path: string };
  
  if (!relativePath) {
    throw new ForbiddenError('Path is required');
  }
  
  if (isProtected(relativePath)) {
    throw new ForbiddenError('Cannot delete this file');
  }
  
  const fullPath = resolvePath(relativePath);
  
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
