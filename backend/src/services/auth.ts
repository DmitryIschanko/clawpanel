import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { getDatabase } from '../database';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors';

const SALT_ROUNDS = 10;

export interface LoginInput {
  username: string;
  password: string;
  totpCode?: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: 'admin' | 'operator' | 'viewer';
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserInfo {
  id: number;
  username: string;
  role: string;
}

export class AuthService {
  async login(input: LoginInput): Promise<Tokens & { requires2FA: boolean; user?: UserInfo }> {
    const db = getDatabase();
    
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(input.username) as any;
    
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // Check if account is locked
    if (user.locked_until && user.locked_until > Date.now() / 1000) {
      throw new ForbiddenError('Account is temporarily locked');
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(input.password, user.password_hash);
    
    if (!isValidPassword) {
      // Increment login attempts
      const attempts = (user.login_attempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? Math.floor(Date.now() / 1000) + 3600 : null;
      
      db.prepare('UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?')
        .run(attempts, lockedUntil, user.id);
      
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // Check if 2FA is required
    if (user.totp_enabled && !input.totpCode) {
      return { accessToken: '', refreshToken: '', requires2FA: true };
    }
    
    // Verify TOTP if enabled
    if (user.totp_enabled && input.totpCode) {
      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: input.totpCode,
        window: 2,
      });
      
      if (!verified) {
        throw new UnauthorizedError('Invalid 2FA code');
      }
    }
    
    // Reset login attempts
    db.prepare('UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(user.id);
    
    // Generate tokens
    const tokens = await this.generateTokens(user);
    
    return { 
      ...tokens, 
      requires2FA: false,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      }
    };
  }
  
  async generateTokens(user: any): Promise<Tokens> {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessTtl as any,
    });
    
    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshTtl as any }
    );
    
    // Store refresh token
    const db = getDatabase();
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
    
    // Delete old tokens for this user to avoid UNIQUE constraint conflicts
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
    
    db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
      .run(user.id, refreshToken, expiresAt);
    
    return { accessToken, refreshToken };
  }
  
  async refreshToken(refreshToken: string): Promise<Tokens> {
    const db = getDatabase();
    
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.secret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }
      
      // Check if token exists in database
      const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(refreshToken) as any;
      
      if (!stored || stored.expires_at < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedError('Refresh token expired');
      }
      
      // Get user
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id) as any;
      
      if (!user) {
        throw new UnauthorizedError('User not found');
      }
      
      // Delete old refresh token
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
      
      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }
  
  async setup2FA(userId: number): Promise<{ secret: string; qrCode: string }> {
    const db = getDatabase();
    
    const secret = speakeasy.generateSecret({
      name: `ClawPanel:${userId}`,
      length: 32,
    });
    
    // Store secret temporarily (not enabled yet)
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?')
      .run(secret.base32, userId);
    
    const qrCode = `otpauth://totp/ClawPanel:${userId}?secret=${secret.base32}&issuer=ClawPanel`;
    
    return { secret: secret.base32, qrCode };
  }
  
  async verifyAndEnable2FA(userId: number, code: string): Promise<void> {
    const db = getDatabase();
    
    const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as any;
    
    if (!user?.totp_secret) {
      throw new ValidationError('2FA not set up');
    }
    
    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: code,
      window: 2,
    });
    
    if (!verified) {
      throw new ValidationError('Invalid verification code');
    }
    
    db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(userId);
  }
  
  async createUser(input: CreateUserInput): Promise<void> {
    const db = getDatabase();
    
    // Check if username exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(input.username);
    
    if (existing) {
      throw new ConflictError('Username already exists');
    }
    
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(input.username, passwordHash, input.role);
  }
  
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const db = getDatabase();
    
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
    
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(newHash, userId);
  }
  
  async logout(refreshToken: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  }
  
  async logoutAll(userId: number): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
  }
}

export const authService = new AuthService();
