import { getDatabase } from '../database';
import { logger } from '../utils/logger';
import { gatewayService } from './gateway';
import type { Chain, ChainRun } from '../types/database';

interface ChainStep {
  id: string;
  agentId: number;
  instruction: string;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
}

interface ChainExecution {
  runId: number;
  chainId: number;
  task: string;
  steps: ChainStep[];
  currentStep: number;
  status: 'running' | 'completed' | 'failed';
  output?: string;
  startedAt: number;
}

// Active executions store
const executions = new Map<number, ChainExecution>();

export async function startChainExecution(
  chainId: number,
  task: string
): Promise<{ runId: number; execution: ChainExecution }> {
  const db = getDatabase();
  
  // Get chain details
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(chainId) as Chain | undefined;
  if (!chain) {
    throw new Error('Chain not found');
  }
  
  // Parse nodes (steps)
  const nodes: Array<{
    id: string;
    data?: {
      agentId?: number;
      instruction?: string;
    };
  }> = JSON.parse(chain.nodes);
  
  // Create run record
  const result = db.prepare(`
    INSERT INTO chain_runs (chain_id, status, started_at, output)
    VALUES (?, 'running', unixepoch(), ?)
  `).run(chainId, JSON.stringify({ task, steps: [] }));
  
  const runId = result.lastInsertRowid as number;
  
  // Prepare steps
  const steps: ChainStep[] = nodes.map((node, index) => ({
    id: node.id,
    agentId: node.data?.agentId || 0,
    instruction: node.data?.instruction || '',
    status: index === 0 ? 'running' : 'pending',
    startedAt: index === 0 ? Date.now() : undefined,
  }));
  
  // Create execution
  const execution: ChainExecution = {
    runId,
    chainId,
    task,
    steps,
    currentStep: 0,
    status: 'running',
    startedAt: Date.now(),
  };
  
  executions.set(runId, execution);
  
  // Start execution
  processChainExecution(runId).catch(error => {
    logger.error(`Chain execution ${runId} failed:`, error);
    failExecution(runId, error.message);
  });
  
  return { runId, execution };
}

async function processChainExecution(runId: number): Promise<void> {
  const execution = executions.get(runId);
  if (!execution) {
    throw new Error('Execution not found');
  }
  
  const { task, steps } = execution;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    execution.currentStep = i;
    
    logger.info(`Chain ${runId}: Executing step ${i + 1}/${steps.length} with agent ${step.agentId}`);
    
    // Build prompt for this step
    let prompt = buildStepPrompt(step, task, steps, i);
    
    try {
      // Send message to agent via Gateway
      const response = await sendMessageToAgent(step.agentId, prompt);
      
      step.output = response;
      step.status = 'completed';
      step.completedAt = Date.now();
      
      // Update database
      updateRunProgress(runId, execution);
      
    } catch (error: any) {
      step.status = 'failed';
      step.output = `Error: ${error.message}`;
      throw error;
    }
    
    // Move to next step
    if (i < steps.length - 1) {
      steps[i + 1].status = 'running';
      steps[i + 1].startedAt = Date.now();
    }
  }
  
  // Mark as completed
  execution.status = 'completed';
  execution.output = steps[steps.length - 1].output;
  completeExecution(runId, execution);
}

function buildStepPrompt(
  step: ChainStep,
  task: string,
  steps: ChainStep[],
  currentIndex: number
): string {
  let prompt = '';
  
  // First step gets the original task
  if (currentIndex === 0) {
    prompt = `Task: ${task}\n\n`;
    if (step.instruction) {
      prompt += `Your role: ${step.instruction}\n\n`;
    }
    prompt += 'Please complete this task.';
  } else {
    // Subsequent steps get previous outputs
    const previousStep = steps[currentIndex - 1];
    prompt = `You are step ${currentIndex + 1} in a workflow chain.\n\n`;
    prompt += `Original task: ${task}\n\n`;
    prompt += `Previous agent (${previousStep.agentId}) produced:\n`;
    prompt += `---\n${previousStep.output || '(no output)'}\n---\n\n`;
    if (step.instruction) {
      prompt += `Your role: ${step.instruction}\n\n`;
    }
    prompt += 'Continue based on the previous work.';
  }
  
  return prompt;
}

async function sendMessageToAgent(agentId: number, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const agentName = `clawpanel-${agentId}`;
    const timeout = setTimeout(() => {
      reject(new Error('Agent response timeout (60s)'));
    }, 60000);
    
    // Subscribe to response
    const unsubscribe = gatewayService.subscribe('message', (data: any) => {
      if (data.agentId === agentName || data.payload?.agentId === agentName) {
        clearTimeout(timeout);
        unsubscribe();
        const text = data.payload?.text || data.text || JSON.stringify(data);
        resolve(text);
      }
    });
    
    // Send message
    try {
      gatewayService.sendMessage(agentName, message);
    } catch (error) {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    }
  });
}

function updateRunProgress(runId: number, execution: ChainExecution): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE chain_runs 
    SET output = ?
    WHERE id = ?
  `).run(JSON.stringify({
    task: execution.task,
    steps: execution.steps.map(s => ({
      agentId: s.agentId,
      status: s.status,
      output: s.output,
    })),
  }), runId);
}

function completeExecution(runId: number, execution: ChainExecution): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE chain_runs 
    SET status = 'completed', 
        completed_at = unixepoch(),
        output = ?
    WHERE id = ?
  `).run(JSON.stringify({
    task: execution.task,
    result: execution.output,
    steps: execution.steps.map(s => ({
      agentId: s.agentId,
      status: s.status,
      output: s.output,
    })),
  }), runId);
  
  executions.delete(runId);
  logger.info(`Chain execution ${runId} completed`);
}

function failExecution(runId: number, error: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE chain_runs 
    SET status = 'failed', 
        completed_at = unixepoch(),
        error = ?
    WHERE id = ?
  `).run(error, runId);
  
  executions.delete(runId);
  logger.error(`Chain execution ${runId} failed: ${error}`);
}

export function getExecutionStatus(runId: number): ChainExecution | undefined {
  return executions.get(runId);
}

export function getChainRunHistory(chainId: number): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM chain_runs 
    WHERE chain_id = ? 
    ORDER BY started_at DESC 
    LIMIT 20
  `).all(chainId);
}
