import { Router } from 'express';
import { authService } from '../services/auth';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';

const router = Router();

// Login
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password, totpCode } = req.body;
  
  // Validation
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required');
  }
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required');
  }
  
  const result = await authService.login({ username, password, totpCode });
  
  res.json({
    success: true,
    data: result,
  });
}));

// Refresh token
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  // Validation
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new ValidationError('Refresh token is required');
  }
  
  const tokens = await authService.refreshToken(refreshToken);
  
  res.json({
    success: true,
    data: tokens,
  });
}));

// Setup 2FA
router.post('/2fa/setup', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const result = await authService.setup2FA(req.user!.id);
  
  res.json({
    success: true,
    data: result,
  });
}));

// Verify and enable 2FA
router.post('/2fa/verify', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { code } = req.body;
  
  await authService.verifyAndEnable2FA(req.user!.id, code);
  
  res.json({
    success: true,
    message: '2FA enabled successfully',
  });
}));

// Change password
router.post('/change-password', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  
  res.json({
    success: true,
    message: 'Password changed successfully',
  });
}));

// Logout
router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  await authService.logout(refreshToken);
  
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}));

// Logout all devices
router.post('/logout-all', authenticateToken, asyncHandler(async (req: AuthRequest, res) => {
  await authService.logoutAll(req.user!.id);
  
  res.json({
    success: true,
    message: 'Logged out from all devices',
  });
}));

export default router;
