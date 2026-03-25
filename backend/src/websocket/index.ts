import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { gatewayService } from '../services/gateway';
import { sendMessageToAgent } from '../services/agentRunner';
import { getChatHistory, saveMessage } from '../services/chatHistory';
import * as pty from 'node-pty';

interface Client {
  ws: WebSocket;
  user?: { id: number; username: string; role: string };
  type?: 'chat' | 'terminal' | 'events';
  terminal?: pty.IPty;
}

const clients = new Map<WebSocket, Client>();

export function setupWebSocketServer(wss: WebSocketServer): void {
  wss.on('connection', (ws, req) => {
    const client: Client = { ws };
    clients.set(ws, client);
    
    logger.info(`WebSocket client connected: ${req.url}`);
    
    // Determine connection type from URL
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    if (pathname.startsWith('/ws/chat')) {
      client.type = 'chat';
      handleChatConnection(client, url);
    } else if (pathname.startsWith('/ws/terminal')) {
      client.type = 'terminal';
      handleTerminalConnection(client);
    } else if (pathname.startsWith('/ws/events')) {
      client.type = 'events';
      handleEventsConnection(client);
    }
    
    ws.on('message', (data) => {
      handleMessage(client, data.toString());
    });
    
    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
      
      if (client.terminal) {
        client.terminal.kill();
      }
      
      // Unsubscribe from Gateway events
      if ((client as any).unsubscribeGateway) {
        (client as any).unsubscribeGateway();
      }
      
      clients.delete(ws);
    });
    
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
    
    // Setup ping/pong to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
    
    ws.on('pong', () => {
      // Client is alive
    });
    
    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });
  
  // Forward Gateway events to event subscribers
  gatewayService.on('message', (message) => {
    broadcastToType('events', {
      type: 'gateway:event',
      payload: message,
    });
  });
}

function handleChatConnection(client: Client, url: URL): void {
  logger.info(`handleChatConnection called: ${url.toString()}`);
  
  // Extract agent ID from URL
  const agentIdParam = url.searchParams.get('agent');
  
  if (!agentIdParam) {
    client.ws.close(1008, 'Agent ID required');
    return;
  }
  
  // Parse agent ID as number
  const agentId = parseInt(agentIdParam, 10);
  if (isNaN(agentId)) {
    client.ws.close(1008, 'Invalid agent ID');
    return;
  }
  
  // Store agentId on client for later use
  (client as any).agentId = agentId;
  
  // Authenticate
  const token = url.searchParams.get('token');
  
  if (!token) {
    client.ws.close(1008, 'Authentication required');
    return;
  }
  
  try {
    client.user = jwt.verify(token, config.jwt.secret) as any;
  } catch (error) {
    client.ws.close(1008, 'Invalid token');
    return;
  }
  
  // Load and send chat history
  try {
    const history = getChatHistory(agentId, 50);
    logger.info(`Loaded ${history.length} messages from history for agent ${agentId}`);
    
    // Send history to client
    client.ws.send(JSON.stringify({
      type: 'history',
      payload: {
        messages: history.map(msg => ({
          id: msg.id.toString(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.created_at * 1000, // Convert to milliseconds
        }))
      }
    }));
  } catch (error) {
    logger.error('Failed to load chat history:', error);
    // Continue without history - not fatal
  }
  
  // Note: We don't subscribe to Gateway events anymore because token auth
  // doesn't have permissions. Instead, we use CLI to get responses directly.
  const unsubscribe = () => {};
  (client as any).unsubscribeGateway = unsubscribe;
  
  client.ws.send(JSON.stringify({
    type: 'connected',
    payload: { agentId },
  }));
}

function handleTerminalConnection(client: Client): void {
  // Terminal connections require authentication via first message
  client.ws.send(JSON.stringify({
    type: 'status',
    payload: { message: 'Waiting for authentication...' },
  }));
}

function handleEventsConnection(client: Client): void {
  // Events connections require authentication via first message
  client.ws.send(JSON.stringify({
    type: 'status',
    payload: { message: 'Waiting for authentication...' },
  }));
}

function handleMessage(client: Client, message: string): void {
  try {
    const data = JSON.parse(message);
    
    // Handle authentication
    if (data.type === 'auth') {
      try {
        client.user = jwt.verify(data.token, config.jwt.secret) as any;
        
        if (client.type === 'terminal' && client.user) {
          setupTerminal(client);
        }
        
        client.ws.send(JSON.stringify({
          type: 'auth:success',
          payload: { user: client.user },
        }));
      } catch (error) {
        client.ws.send(JSON.stringify({
          type: 'auth:error',
          payload: { message: 'Invalid token' },
        }));
      }
      return;
    }
    
    // Handle chat messages
    if (client.type === 'chat' && data.type === 'message') {
      const agentId = data.agentId;
      const content = data.content;
      
      logger.info(`Received chat message for agent ${agentId}: ${content.substring(0, 50)}...`);
      
      if (agentId && content) {
        // Save user message to database first
        let numericAgentId: number;
        try {
          numericAgentId = parseInt(agentId, 10);
          if (!isNaN(numericAgentId)) {
            const saved = saveMessage({
              agentId: numericAgentId,
              role: 'user',
              content: content,
            });
            logger.info(`Saved user message to history: ${saved.id}`);
          }
        } catch (error) {
          logger.error('Failed to save user message:', error);
          numericAgentId = parseInt(agentId, 10);
        }
        
        // Use CLI to send message and get response
        sendMessageToAgent(agentId, content).then((response) => {
          logger.info(`Received response from agent ${agentId}: "${response.substring(0, 50)}..." (length: ${response.length})`);
          
          if (response && response.trim()) {
            // Save assistant response to database
            try {
              if (!isNaN(numericAgentId)) {
                const saved = saveMessage({
                  agentId: numericAgentId,
                  role: 'assistant',
                  content: response,
                });
                logger.info(`Saved assistant message to history: ${saved.id}`);
              }
            } catch (error) {
              logger.error('Failed to save assistant message:', error);
            }
            
            // Send response to client
            logger.info(`WebSocket state for agent ${agentId}: ${client.ws.readyState} (OPEN=${WebSocket.OPEN}, CLOSED=${WebSocket.CLOSED})`);
            if (client.ws.readyState === WebSocket.OPEN) {
              try {
                client.ws.send(JSON.stringify({
                  type: 'message',
                  payload: {
                    role: 'assistant',
                    content: response,
                  },
                }));
                logger.info(`Sent response to client for agent ${agentId}`);
              } catch (sendError) {
                logger.error(`Failed to send WebSocket message: ${sendError}`);
              }
            } else {
              logger.warn(`Cannot send response: WebSocket not open (state: ${client.ws.readyState})`);
            }
          }
        }).catch((error) => {
          logger.error('Failed to send message via CLI:', error);
          client.ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Failed to send message: ' + error.message }
          }));
        });
      } else {
        logger.warn('Missing agentId or content in chat message');
      }
      return;
    }
    
    // Handle terminal input
    if (client.type === 'terminal' && client.terminal && data.type === 'input') {
      client.terminal.write(data.data);
      return;
    }
    
    // Handle terminal resize
    if (client.type === 'terminal' && client.terminal && data.type === 'resize') {
      client.terminal.resize(data.cols, data.rows);
      return;
    }
    
  } catch (error) {
    logger.warn('Failed to parse WebSocket message:', error);
  }
}

function setupTerminal(client: Client): void {
  // Connect to host server via SSH for real OpenClaw CLI access
  const sshHost = process.env.SSH_HOST || 'host.docker.internal';
  const sshUser = process.env.SSH_USER || 'root';
  const sshPort = process.env.SSH_PORT || '22';
  const sshKeyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_ed25519';
  
  logger.info(`Starting SSH terminal to ${sshUser}@${sshHost}:${sshPort}`);
  
  try {
    // Spawn SSH connection to host
    client.terminal = pty.spawn('ssh', [
      '-i', sshKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-p', sshPort,
      `${sshUser}@${sshHost}`
    ], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      env: process.env as { [key: string]: string },
    });
    
    logger.info(`SSH terminal spawned with PID: ${client.terminal.pid}`);
    
    client.terminal.onData((data) => {
      // Send terminal output to WebSocket
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'output',
          data,
        }));
      }
    });
    
    client.terminal.onExit((exitData: any) => {
      const code = typeof exitData === 'object' ? exitData.exitCode : exitData;
      logger.info(`SSH terminal exited with code: ${code}`);
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
    });
    
    // Send ready message after a short delay to allow SSH to connect
    setTimeout(() => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'terminal:ready',
        }));
        logger.info('Terminal ready message sent');
      }
    }, 500);
    
  } catch (error) {
    logger.error('Failed to spawn SSH terminal:', error);
    client.ws.send(JSON.stringify({
      type: 'output',
      data: `\r\nError starting terminal: ${error}\r\n`,
    }));
    client.ws.close();
  }
}

function broadcastToType(type: string, message: any): void {
  const data = JSON.stringify(message);
  
  for (const client of clients.values()) {
    if (client.type === type && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}
