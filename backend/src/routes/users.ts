import { Router } from 'express';
import { authService } from '../services/auth';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';

const router = Router();

// List users (admin only)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const users = db.prepare('SELECT id, username, role, totp_enabled, created_at FROM users').all();
  
  res.json({
    success: true,
    data: users,
  });
}));

// Get current user
router.get('/me', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT id, username, role, totp_enabled FROM users WHERE id = ?')
    .get(req.user!.id);
  
  res.json({
    success: true,
    data: user,
  });
}));

// Create user (admin only)
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'user'), asyncHandler(async (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
    throw new ValidationError('Username, password, and role are required');
  }
  
  const validRoles = ['admin', 'operator', 'viewer'];
  if (!validRoles.includes(role)) {
    throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);
  }
  
  await authService.createUser({ username, password, role });
  
  res.status(201).json({
    success: true,
    message: 'User created successfully',
  });
}));

// Update user (admin only)
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'user'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const { role, password } = req.body;
  
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  if (role) {
    const validRoles = ['admin', 'operator', 'viewer'];
    if (!validRoles.includes(role)) {
      throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);
    }
    
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  }
  
  if (password) {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }
  
  res.json({
    success: true,
    message: 'User updated successfully',
  });
}));

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'user'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  
  // Prevent self-deletion
  if (req.user!.id.toString() === req.params.id) {
    throw new ValidationError('Cannot delete your own account');
  }
  
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('User not found');
  }
  
  res.json({
    success: true,
    message: 'User deleted successfully',
  });
}));

export default router;
