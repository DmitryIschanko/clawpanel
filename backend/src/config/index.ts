import dotenv from 'dotenv';

dotenv.config();

// Determine Gateway URL - prefer host IP for Docker -> host connectivity
const getGatewayUrl = (): string => {
  // If explicit URL is set, use it
  if (process.env.GATEWAY_URL) {
    return process.env.GATEWAY_URL;
  }
  
  // Default for Docker connecting to host
  return 'ws://172.17.0.1:18789';
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  gateway: {
    url: getGatewayUrl(),
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'clawpanel-secret-change-in-production',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  
  database: {
    path: process.env.SQLITE_PATH || './data/clawpanel.db',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};
