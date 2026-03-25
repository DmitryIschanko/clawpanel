import { execOnHost } from './hostExecutor';
import { logger } from '../utils/logger';

interface AgentResponse {
  result?: {
    payloads?: Array<{ text?: string }>;
  };
}

export async function sendMessageToAgent(agentName: string, content: string): Promise<string> {
  const fullAgentName = agentName.startsWith('clawpanel-') ? agentName : `clawpanel-${agentName}`;
  
  logger.info(`Sending message to ${fullAgentName}`);
  
  const escapedContent = content.replace(/"/g, '\\"');
  const command = `openclaw agent --agent ${fullAgentName} --message "${escapedContent}" --json`;
  
  const result = await execOnHost(command);
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to send message');
  }
  
  try {
    const response: AgentResponse = JSON.parse(result.stdout || '{}');
    return response.result?.payloads?.[0]?.text || '';
  } catch (e) {
    return result.stdout || '';
  }
}
