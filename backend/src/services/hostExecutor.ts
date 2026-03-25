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
      timeout: 30000,
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
  allowlist: string[] = []
): Promise<void> {
  await execOnHost('openclaw config set channels.telegram.enabled true');
  await execOnHost(`openclaw config set channels.telegram.botToken "${botToken}"`);
  await execOnHost(`openclaw config set channels.telegram.dmPolicy "${dmPolicy}"`);
  
  if (allowlist.length > 0) {
    await execOnHost(`openclaw config set channels.telegram.allowFrom '${JSON.stringify(allowlist)}'`);
  }
  
  logger.info('Telegram channel configured');
}

export async function removeTelegramChannel(): Promise<void> {
  await execOnHost('openclaw config set channels.telegram.enabled false');
  logger.info('Telegram channel disabled');
}

export async function restartGateway(): Promise<void> {
  await execOnHost('systemctl restart openclaw-gateway');
  logger.info('Gateway restarted');
}
