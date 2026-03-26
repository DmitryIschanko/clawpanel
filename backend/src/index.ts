import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { gatewayService } from './services/gateway';
import { setupWebSocketServer } from './websocket';
import { runMigrations } from './database/migrate';

async function main() {
  // Run database migrations first
  await runMigrations();
  const app = express();
  const server = createServer(app);
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "blob:"],
      },
    },
  }));
  
  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
  }));
  
  // Rate limiting
  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT' } },
  }));
  
  app.use(compression());
  app.set('trust proxy', 1);
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // API routes
  app.use('/api', routes);
  
  // Error handling
  app.use(errorHandler);
  
  // WebSocket server - handle all WebSocket connections
  const wss = new WebSocketServer({ 
    server,
    verifyClient: (info: any) => {
      // Accept WebSocket connections to /ws/* paths
      const pathname = info.req.url?.split('?')[0];
      return pathname?.startsWith('/ws/') || false;
    }
  });
  setupWebSocketServer(wss);
  
  // Connect to OpenClaw Gateway
  gatewayService.connect();
  
  // Start server
  server.listen(config.port, () => {
    logger.info(`ClawPanel API server running on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      gatewayService.disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      gatewayService.disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
