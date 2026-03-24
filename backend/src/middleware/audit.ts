import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database';
import { AuthRequest } from './auth';

export function auditLog(action: string, resourceType: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json;
    
    res.json = function(body: unknown) {
      // Restore original method
      res.json = originalJson;
      
      // Log after response is sent
      res.on('finish', () => {
        try {
          const db = getDatabase();
          db.prepare(`
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            req.user?.id || null,
            action,
            resourceType,
            req.params.id || null,
            JSON.stringify({ body: req.body, params: req.params, query: req.query }),
            req.ip,
            req.get('user-agent')
          );
        } catch (error) {
          // Silent fail for audit logging
        }
      });
      
      return originalJson.call(this, body);
    };
    
    next();
  };
}
