#!/usr/bin/env node
/**
 * Host Command Executor for ClawPanel
 * Runs on the host (VPS) and executes OpenClaw commands
 * via HTTP API from the Docker container
 */

const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = process.env.HOST_EXECUTOR_PORT || 3002;
const TOKEN = process.env.HOST_EXECUTOR_TOKEN || 'clawpanel-secret-token-2026';

// CORS headers for Docker container access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // Health check endpoint
  if (url.pathname === '/health') {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Command execution endpoint
  if (url.pathname === '/exec') {
    try {
      // Parse body
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { command, token, configPath } = JSON.parse(body);
      
      // Validate token
      if (token !== TOKEN) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      // Validate command
      if (!command) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Command is required' }));
        return;
      }
      
      // Only allow openclaw commands for security
      if (!command.startsWith('openclaw ')) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Only openclaw commands are allowed' }));
        return;
      }
      
      console.log(`[${new Date().toISOString()}] Executing: ${command}`);
      
      // Execute command with proper environment
      const env = {
        ...process.env,
        OPENCLAW_CONFIG_PATH: configPath || '/root/.openclaw/openclaw.json',
        HOME: '/root',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      };
      
      const { stdout, stderr } = await execAsync(command, { 
        env,
        timeout: 3600000, // 1 hour
        maxBuffer: 1024 * 1024 // 1MB
      });
      
      console.log(`[${new Date().toISOString()}] Success`);
      
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ 
        success: true, 
        stdout: stdout.trim(),
        stderr: stderr.trim()
      }));
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error:`, error.message);
      
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message,
        stderr: error.stderr,
        stdout: error.stdout
      }));
    }
    return;
  }

  // Unknown endpoint
  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Host Executor listening on port ${PORT}`);
  console.log(`Token: ${TOKEN.substring(0, 10)}...`);
  console.log('Ready to accept commands from ClawPanel');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
