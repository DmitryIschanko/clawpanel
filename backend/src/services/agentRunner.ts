import { spawn } from 'child_process';
import { logger } from '../utils/logger';

/**
 * Send a message to an agent using OpenClaw CLI via SSH
 * This is a fallback when Gateway WebSocket doesn't have write permissions
 */
export function sendMessageToAgent(agentName: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Map agent IDs to agent names in OpenClaw
    // ClawPanel agents are named clawpanel-{id} in OpenClaw
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
    
    const proc = spawn('ssh', [
      '-i', sshKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-p', sshPort,
      `${sshUser}@${sshHost}`,
      `OPENCLAW_CONFIG_PATH=/root/.openclaw/openclaw.json openclaw agent --agent ${fullAgentName} --message "${escapedContent}"`
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
        resolve();
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
