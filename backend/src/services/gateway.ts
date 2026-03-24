import WebSocket from 'ws';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// Generate UUID v4 using crypto
function generateUUID(): string {
  return crypto.randomUUID();
}

// Message types
interface GatewayMessage {
  type: string;
  [key: string]: any;
}

interface ConnectChallengePayload {
  nonce: string;
  ts: number;
}

class GatewayService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectNonce: string | null = null;
  private gatewayUrl: string;
  private gatewayPassword: string;
  private isAuthenticated: boolean = false;

  constructor() {
    this.gatewayUrl = process.env.GATEWAY_URL || 'ws://172.17.0.1:18789';
    this.gatewayPassword = process.env.GATEWAY_PASSWORD || '';
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      logger.info(`Connecting to Gateway at ${this.gatewayUrl}`);
      
      this.ws = new WebSocket(this.gatewayUrl);
      
      this.ws.on('open', () => {
        logger.info('Gateway WebSocket connected, waiting for challenge...');
        this.isAuthenticated = false;
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const rawMessage = data.toString();
          logger.debug('Gateway message received:', rawMessage);
          
          const message: GatewayMessage = JSON.parse(rawMessage);
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse gateway message:', error);
        }
      });
      
      this.ws.on('error', (error: Error) => {
        logger.error('Gateway WebSocket error:', error.message);
        this.scheduleReconnect();
      });
      
      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || 'unknown';
        logger.warn(`Gateway WebSocket closed: code=${code}, reason=${reasonStr}`);
        this.isAuthenticated = false;
        this.scheduleReconnect();
      });
      
    } catch (error) {
      logger.error('Failed to connect to Gateway:', error);
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: GatewayMessage): void {
    // Handle connect challenge
    if (message.type === 'event' && message.event === 'connect.challenge') {
      const payload = message.payload as ConnectChallengePayload;
      logger.info('Received connect challenge');
      
      if (payload?.nonce) {
        this.connectNonce = payload.nonce;
        this.sendConnect();
      } else {
        logger.error('Challenge missing nonce');
        this.ws?.close(1008, 'challenge missing nonce');
      }
      return;
    }
    
    // Handle hello-ok response (successful connection)
    if (message.type === 'res' && message.ok === true && message.payload?.type === 'hello-ok') {
      logger.info('Gateway authentication successful');
      this.isAuthenticated = true;
      return;
    }
    
    // Handle connection errors
    if (message.type === 'res' && message.ok === false) {
      logger.error('Gateway connection error:', message.error);
      return;
    }
    
    // Forward events to registered handlers
    if (message.type === 'event' && message.event) {
      const handlers = this.eventHandlers.get(message.event);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message.payload);
          } catch (error) {
            logger.error(`Error in event handler for ${message.event}:`, error);
          }
        });
      }
    }
    
    // Handle generic messages
    const handlers = this.messageHandlers.get('message');
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          logger.error('Error in message handler:', error);
        }
      });
    }
  }

  private sendConnect(): void {
    if (!this.connectNonce) {
      logger.error('Cannot send connect: missing nonce');
      return;
    }
    
    if (!this.gatewayPassword) {
      logger.error('Cannot send connect: missing GATEWAY_PASSWORD env var');
      return;
    }

    const requestId = generateUUID();
    
    const connectMessage = {
      type: 'req',
      id: requestId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'gateway-client',
          version: '1.0.0',
          platform: 'linux',
          mode: 'backend'
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        caps: [],
        commands: [],
        permissions: {},
        auth: {
          password: this.gatewayPassword
        },
        locale: 'en-US',
        userAgent: 'clawpanel/1.0.0'
      }
    };

    logger.info('Sending connect request...');
    this.send(connectMessage);
  }

  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('Cannot send message: WebSocket not open');
    }
  }

  // Subscribe to Gateway events
  on(event: string, handler: (data: any) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  // Send message to agent via Gateway
  sendMessage(agentId: string, content: string): void {
    this.send({
      type: 'req',
      id: generateUUID(),
      method: 'chat.send',
      params: {
        agentId,
        message: content
      }
    });
  }

  // Subscribe to specific message types
  subscribe(eventType: string, handler: (data: any) => void): () => void {
    if (!this.messageHandlers.has(eventType)) {
      this.messageHandlers.set(eventType, []);
    }
    this.messageHandlers.get(eventType)!.push(handler);
    
    return () => {
      const handlers = this.messageHandlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      logger.info('Attempting to reconnect to Gateway...');
      this.connect();
    }, 5000);
  }

  getStatus(): { connected: boolean; authenticated: boolean; url: string } {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      authenticated: this.isAuthenticated,
      url: this.gatewayUrl
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isAuthenticated = false;
  }
}

export const gatewayService = new GatewayService();
export default gatewayService;
