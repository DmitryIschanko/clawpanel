import { execOnHost } from './hostExecutor';
import { logger } from '../utils/logger';

interface AgentResponse {
  result?: {
    payloads?: Array<{ text?: string }>;
  };
}

export async function sendMessageToAgent(agentName: string | number, content: string): Promise<string> {
  const agentNameStr = String(agentName);
  const fullAgentName = agentNameStr.startsWith('clawpanel-') ? agentNameStr : `clawpanel-${agentNameStr}`;
  
  logger.info(`Sending message to ${fullAgentName}`);
  
  const escapedContent = content.replace(/"/g, '\\"');
  const command = `openclaw agent --agent ${fullAgentName} --message "${escapedContent}" --json`;
  
  const result = await execOnHost(command);
  
  logger.info(`Host executor result: success=${result.success}, stdout length=${result.stdout?.length || 0}, stderr length=${result.stderr?.length || 0}`);
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to send message');
  }
  
  // Try stdout first, then stderr (openclaw may output to stderr in fallback mode)
  const stdout = result.stdout?.trim() || '';
  const stderr = result.stderr?.trim() || '';
  
  // Try stdout first
  if (stdout) {
    try {
      const response: AgentResponse = JSON.parse(stdout);
      return response.result?.payloads?.[0]?.text || '';
    } catch (e) {
      // Not valid JSON, return raw
      return stdout;
    }
  }
  
  // If stdout is empty, try to extract JSON from stderr
  // OpenClaw may output error messages before JSON in stderr
  if (stderr) {
    // Find JSON by looking for the last { ... } block that contains "payloads"
    // Start from the first occurrence of "{"
    let jsonStart = stderr.indexOf('{');
    while (jsonStart !== -1) {
      const jsonCandidate = stderr.substring(jsonStart);
      try {
        const response: AgentResponse = JSON.parse(jsonCandidate);
        if (response.payloads) {
          return response.payloads[0]?.text || '';
        }
      } catch (e) {
        // Not valid JSON or doesn't have payloads, try next
      }
      // Find next {
      jsonStart = stderr.indexOf('{', jsonStart + 1);
    }
    // No JSON found, return raw stderr
    return stderr;
  }
  
  return '';
}
