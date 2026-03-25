import { spawn } from 'child_process';
import { logger } from '../utils/logger';

interface AgentResponse {
  runId?: string;
  status?: string;
  summary?: string;
  result?: {
    payloads?: Array<{
      text?: string;
      mediaUrl?: string | null;
    }>;
    meta?: {
      durationMs?: number;
      agentMeta?: {
        sessionId?: string;
        provider?: string;
        model?: string;
        usage?: {
          input?: number;
          output?: number;
          cacheRead?: number;
          total?: number;
        };
      };
      aborted?: boolean;
    };
  };
  error?: string;
}

/**
 * Send a message to an agent using OpenClaw CLI via SSH
 * Returns the agent's response
 */
export function sendMessageToAgent(agentName: string, content: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Map agent IDs to agent names in OpenClaw
    const agentId = String(agentName);
    const fullAgentName = agentId.startsWith('clawpanel-') 
      ? agentId 
      : `clawpanel-${agentId}`;
    
    logger.info(`Sending message to agent ${fullAgentName} via SSH/CLI`);
    
    // SSH to host and run openclaw command
    const sshHost = process.env.SSH_HOST || 'host.docker.internal';
    const sshUser = process.env.SSH_USER || 'root';
    const sshPort = process.env.SSH_PORT || '22';
    const sshKeyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_ed25519';
    
    // Escape the content for shell safety
    const escapedContent = content.replace(/"/g, '\\"');
    
    // Use --message flag which returns the response
    const proc = spawn('ssh', [
      '-i', sshKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-p', sshPort,
      `${sshUser}@${sshHost}`,
      `OPENCLAW_CONFIG_PATH=/root/.openclaw/openclaw.json openclaw agent --agent ${fullAgentName} --message "${escapedContent}" --json`
    ]);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      logger.debug(`OpenClaw SSH stderr: ${data}`);
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Message sent to agent ${fullAgentName} successfully`);
        logger.debug(`OpenClaw stdout: ${stdout}`);
        
        // Parse the JSON response
        try {
          const response: AgentResponse = JSON.parse(stdout);
          // Extract the response text from OpenClaw JSON format
          // Format: { result: { payloads: [{ text: "..." }] } }
          let responseText = '';
          if (response.result?.payloads && response.result.payloads.length > 0) {
            responseText = response.result.payloads[0].text || '';
          }
          resolve(responseText);
        } catch (e) {
          // If not JSON, return raw stdout
          resolve(stdout.trim());
        }
      } else {
        logger.error(`OpenClaw SSH exited with code ${code}: ${stderr}`);
        reject(new Error(`Failed to send message: ${stderr || `Exit code ${code}`}`));
      }
    });
    
    proc.on('error', (error) => {
      logger.error(`Failed to spawn SSH for OpenClaw:`, error);
      reject(error);
    });
  });
}

/**
 * Check if SSH to host is available
 */
export async function isSshAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const sshHost = process.env.SSH_HOST || 'host.docker.internal';
    const sshUser = process.env.SSH_USER || 'root';
    const sshPort = process.env.SSH_PORT || '22';
    const sshKeyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_ed25519';
    
    const proc = spawn('ssh', [
      '-i', sshKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=5',
      '-p', sshPort,
      `${sshUser}@${sshHost}`,
      'echo ok'
    ]);
    
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}
