import { spawn } from 'child_process';
import { logger } from '../utils/logger';

interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  dmPolicy: 'pairing' | 'open' | 'restricted';
  allowlist?: string[];
}

interface ChannelConfig {
  telegram?: TelegramConfig;
}

const SSH_HOST = process.env.SSH_HOST || '173.212.243.229';
const SSH_USER = process.env.SSH_USER || 'root';
const SSH_PORT = process.env.SSH_PORT || '22';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '/root/.ssh/id_ed25519';

function runOpenClawCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', [
      '-i', SSH_KEY_PATH,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-p', SSH_PORT,
      `${SSH_USER}@${SSH_HOST}`,
      `OPENCLAW_CONFIG_PATH=/root/.openclaw/openclaw.json openclaw ${command}`
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`OpenClaw command failed: ${stderr || stdout}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

export async function getChannelConfig(): Promise<ChannelConfig> {
  try {
    const output = await runOpenClawCommand('config get channels --json');
    return JSON.parse(output);
  } catch (error) {
    logger.error('Failed to get channel config:', error);
    return {};
  }
}

export async function setupTelegramChannel(
  botToken: string,
  dmPolicy: 'pairing' | 'open' | 'restricted' = 'pairing',
  allowlist: string[] = []
): Promise<void> {
  try {
    // Configure Telegram in OpenClaw
    await runOpenClawCommand(`config set channels.telegram.enabled true`);
    await runOpenClawCommand(`config set channels.telegram.botToken "${botToken}"`);
    await runOpenClawCommand(`config set channels.telegram.dmPolicy "${dmPolicy}"`);
    
    if (allowlist.length > 0) {
      await runOpenClawCommand(`config set channels.telegram.allowlist '${JSON.stringify(allowlist)}'`);
    }

    logger.info('Telegram channel configured in OpenClaw');
  } catch (error) {
    logger.error('Failed to setup Telegram channel:', error);
    throw error;
  }
}

export async function removeTelegramChannel(): Promise<void> {
  try {
    await runOpenClawCommand('config set channels.telegram.enabled false');
    logger.info('Telegram channel disabled in OpenClaw');
  } catch (error) {
    logger.error('Failed to remove Telegram channel:', error);
    throw error;
  }
}

export async function getChannelStatus(): Promise<{ telegram: boolean }> {
  try {
    const config = await getChannelConfig();
    return {
      telegram: config.telegram?.enabled === true,
    };
  } catch (error) {
    logger.error('Failed to get channel status:', error);
    return { telegram: false };
  }
}

export async function restartGateway(): Promise<void> {
  try {
    // Use systemd to restart OpenClaw Gateway
    await runOpenClawCommand('gateway restart');
    logger.info('OpenClaw Gateway restarted');
  } catch (error) {
    logger.error('Failed to restart Gateway:', error);
    throw error;
  }
}
