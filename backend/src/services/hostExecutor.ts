import axios from 'axios';
import { logger } from '../utils/logger';

const HOST_EXECUTOR_URL = process.env.HOST_EXECUTOR_URL || 'http://host.docker.internal:3002';
const HOST_EXECUTOR_TOKEN = process.env.HOST_EXECUTOR_TOKEN || 'clawpanel-secret-token-2026';

interface ExecResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function execOnHost(command: string, configPath?: string): Promise<ExecResult> {
  try {
    logger.info(`Executing on host: ${command}`);
    
    const response = await axios.post(`${HOST_EXECUTOR_URL}/exec`, {
      command,
      token: HOST_EXECUTOR_TOKEN,
      configPath: configPath || '/root/.openclaw/openclaw.json'
    }, {
      timeout: 3600000,  // 1 hour
      headers: { 'Content-Type': 'application/json' }
    });
    
    logger.info(`Host execution successful`);
    return response.data;
    
  } catch (error: any) {
    logger.error('Host execution failed:', error.message);
    
    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error || error.message,
        stderr: error.response.data?.stderr,
        stdout: error.response.data?.stdout
      };
    }
    
    return { success: false, error: error.message };
  }
}

export async function isHostExecutorAvailable(): Promise<boolean> {
  try {
    const response = await axios.get(`${HOST_EXECUTOR_URL}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

export async function setupTelegramChannel(
  botToken: string,
  dmPolicy: 'pairing' | 'open' | 'restricted' = 'pairing',
  allowlist: string[] = [],
  accountId: string = 'default'
): Promise<void> {
  // Enable telegram channel
  await execOnHost('openclaw config set channels.telegram.enabled true');
  await execOnHost('openclaw config set channels.telegram.dmPolicy "pairing"');
  
  // Set up account-specific configuration
  await execOnHost(`openclaw config set channels.telegram.accounts.${accountId}.botToken "${botToken}"`);
  await execOnHost(`openclaw config set channels.telegram.accounts.${accountId}.dmPolicy "${dmPolicy}"`);
  await execOnHost(`openclaw config set channels.telegram.accounts.${accountId}.groupPolicy "allowlist"`);
  await execOnHost(`openclaw config set channels.telegram.accounts.${accountId}.streaming "partial"`);
  
  if (allowlist.length > 0) {
    // Use jq to set array properly
    await execOnHost(`cat ~/.openclaw/openclaw.json | jq '.channels.telegram.accounts.${accountId}.allowFrom = ${JSON.stringify(allowlist)}' > /tmp/oc.json && mv /tmp/oc.json ~/.openclaw/openclaw.json`);
  }
  
  logger.info(`Telegram channel configured for account: ${accountId}`);
}

export async function removeTelegramChannel(): Promise<void> {
  await execOnHost('openclaw config set channels.telegram.enabled false');
  logger.info('Telegram channel disabled');
}

export async function restartGateway(): Promise<void> {
  await execOnHost('systemctl restart openclaw-gateway');
  logger.info('Gateway restarted');
}

export async function addChannelBinding(
  channelType: string,
  accountId: string,
  agentId: string
): Promise<void> {
  // Get current bindings
  const result = await execOnHost('cat ~/.openclaw/openclaw.json | jq ".bindings // []"');
  let bindings: any[] = [];
  
  try {
    if (result.stdout) {
      bindings = JSON.parse(result.stdout);
    }
  } catch (e) {
    logger.warn('Failed to parse bindings, starting fresh');
  }
  
  // Remove existing binding for this channel+account
  bindings = bindings.filter((b: any) => 
    !(b.match?.channel === channelType && b.match?.accountId === accountId)
  );
  
  // Add new binding
  bindings.push({
    type: 'route',
    agentId: agentId,
    match: {
      channel: channelType,
      accountId: accountId
    }
  });
  
  // Update config
  const bindingsJson = JSON.stringify(bindings).replace(/"/g, '\\"');
  await execOnHost(`cat ~/.openclaw/openclaw.json | jq ".bindings = ${bindingsJson}" > /tmp/oc.json && mv /tmp/oc.json ~/.openclaw/openclaw.json`);
  
  logger.info(`Binding added: ${channelType}/${accountId} -> ${agentId}`);
}

export async function removeChannelBinding(
  channelType: string,
  accountId: string
): Promise<void> {
  const result = await execOnHost('cat ~/.openclaw/openclaw.json | jq ".bindings // []"');
  let bindings: any[] = [];
  
  try {
    if (result.stdout) {
      bindings = JSON.parse(result.stdout);
    }
  } catch (e) {
    logger.warn('Failed to parse bindings');
    return;
  }
  
  // Remove binding for this channel+account
  bindings = bindings.filter((b: any) => 
    !(b.match?.channel === channelType && b.match?.accountId === accountId)
  );
  
  const bindingsJson = JSON.stringify(bindings).replace(/"/g, '\\"');
  await execOnHost(`cat ~/.openclaw/openclaw.json | jq ".bindings = ${bindingsJson}" > /tmp/oc.json && mv /tmp/oc.json ~/.openclaw/openclaw.json`);
  
  logger.info(`Binding removed: ${channelType}/${accountId}`);
}
