import { getDatabase } from '../database';
import { logger } from '../utils/logger';
import { sendMessageToAgent } from './agentRunner';
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
  
  // Create steps in database
  createStepsInDb(runId, steps);
  
  // Start execution
  processChainExecution(runId).catch(error => {
    logger.error(`Chain execution ${runId} failed:`, error);
    failExecution(runId, error.message);
  });
  
  return { runId, execution };
}

function createStepsInDb(runId: number, steps: ChainStep[]): void {
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT INTO chain_steps (run_id, step_order, agent_id, agent_name, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  steps.forEach((step, index) => {
    insert.run(
      runId,
      index,
      step.agentId,
      `Agent ${step.agentId}`,
      step.status,
      step.startedAt ? Math.floor(step.startedAt / 1000) : null
    );
  });
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
    
    // Build prompt for this step (получаем контекст из БД)
    let prompt = await buildStepPromptFromDb(runId, step, task, i);
    
    // Update step status to running in DB
    updateStepInDb(runId, i, { status: 'running', input: prompt });
    
    try {
      // Send message to agent via Host Executor
      logger.info(`Chain ${runId}: Sending message to agent ${step.agentId}...`);
      const response = await sendMessageToAgent(step.agentId, prompt);
      
      // Парсим ответ для получения чистого текста
      const cleanOutput = parseAgentOutput(response);
      
      step.output = cleanOutput;
      step.status = 'completed';
      step.completedAt = Date.now();
      
      logger.info(`Chain ${runId}: Step ${i + 1} completed successfully`);
      
      // Update step in database with clean output
      updateStepInDb(runId, i, { 
        status: 'completed', 
        output: cleanOutput,
        completedAt: Math.floor(Date.now() / 1000)
      });
      
      // Update run progress
      updateRunProgress(runId, execution);
      
    } catch (error: any) {
      step.status = 'failed';
      step.output = `Error: ${error.message}`;
      step.completedAt = Date.now();
      
      updateStepInDb(runId, i, { 
        status: 'failed', 
        error: error.message,
        completedAt: Math.floor(Date.now() / 1000)
      });
      
      logger.error(`Chain ${runId}: Step ${i + 1} failed: ${error.message}`);
      throw error;
    }
    
    // Move to next step
    if (i < steps.length - 1) {
      steps[i + 1].status = 'running';
      steps[i + 1].startedAt = Date.now();
      
      updateStepInDb(runId, i + 1, { 
        status: 'running',
        startedAt: Math.floor(Date.now() / 1000)
      });
    }
  }
  
  // Mark as completed
  execution.status = 'completed';
  execution.output = steps[steps.length - 1].output;
  completeExecution(runId, execution);
}

interface StepUpdate {
  status?: string;
  input?: string;
  output?: string;
  error?: string;
  completedAt?: number;
  startedAt?: number;
}

function updateStepInDb(runId: number, stepOrder: number, update: StepUpdate): void {
  const db = getDatabase();
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (update.status !== undefined) {
    fields.push('status = ?');
    values.push(update.status);
  }
  if (update.input !== undefined) {
    fields.push('input = ?');
    values.push(update.input);
  }
  if (update.output !== undefined) {
    fields.push('output = ?');
    values.push(update.output);
  }
  if (update.error !== undefined) {
    fields.push('error = ?');
    values.push(update.error);
  }
  if (update.completedAt !== undefined) {
    fields.push('completed_at = ?');
    values.push(update.completedAt);
  }
  if (update.startedAt !== undefined) {
    fields.push('started_at = ?');
    values.push(update.startedAt);
  }
  
  if (fields.length > 0) {
    values.push(runId, stepOrder);
    db.prepare(`
      UPDATE chain_steps 
      SET ${fields.join(', ')}
      WHERE run_id = ? AND step_order = ?
    `).run(...values);
  }
}

// Интерфейс для ответа агента
interface AgentResponse {
  payloads?: Array<{ text?: string }>;
  result?: {
    payloads?: Array<{ text?: string }>;
  };
}

// Парсим ответ агента и извлекаем чистый текст
function parseAgentOutput(output: string | null): string {
  if (!output) return '(no output)';
  
  // Если output уже чистый (не содержит Gateway ошибки), возвращаем как есть
  if (!output.includes('gateway connect failed') && !output.includes('"payloads"')) {
    return output;
  }
  
  try {
    // Ищем JSON в ответе (может быть после stderr)
    // Ищем начало JSON объекта с payloads
    const payloadsIndex = output.indexOf('"payloads"');
    if (payloadsIndex === -1) return output;
    
    // Находим начало объекта {
    let jsonStart = output.lastIndexOf('{', payloadsIndex);
    if (jsonStart === -1) return output;
    
    const jsonStr = output.substring(jsonStart);
    const response: AgentResponse = JSON.parse(jsonStr);
    
    // Извлекаем text из payloads
    const payloads = response.payloads || response.result?.payloads;
    if (payloads && payloads.length > 0 && payloads[0].text) {
      return payloads[0].text;
    }
    
    return output;
  } catch (e) {
    // Если не удалось распарсить, возвращаем как есть
    return output;
  }
}

// Получаем контекст из БД - все предыдущие шаги
async function buildStepPromptFromDb(
  runId: number,
  currentStep: ChainStep,
  task: string,
  currentIndex: number
): Promise<string> {
  const db = getDatabase();
  let prompt = '';
  
  // First step gets the original task
  if (currentIndex === 0) {
    prompt = `Task: ${task}\n\n`;
    if (currentStep.instruction) {
      prompt += `Your role: ${currentStep.instruction}\n\n`;
    }
    prompt += 'Please complete this task.';
  } else {
    // Получаем все предыдущие шаги из БД
    const previousSteps = db.prepare(`
      SELECT step_order, agent_id, output, status
      FROM chain_steps
      WHERE run_id = ? AND step_order < ?
      ORDER BY step_order ASC
    `).all(runId, currentIndex) as Array<{
      step_order: number;
      agent_id: number;
      output: string | null;
      status: string;
    }>;
    
    prompt = `You are step ${currentIndex + 1} in a workflow chain.\n\n`;
    prompt += `Original task: ${task}\n\n`;
    
    // Добавляем контекст от всех предыдущих агентов
    if (previousSteps.length > 0) {
      prompt += `Previous agents output:\n`;
      prompt += `---\n`;
      
      previousSteps.forEach(prevStep => {
        prompt += `[Step ${prevStep.step_order + 1}] Agent ${prevStep.agent_id}:\n`;
        // Парсим output чтобы получить чистый текст
        const cleanOutput = parseAgentOutput(prevStep.output);
        prompt += `${cleanOutput}\n\n`;
      });
      
      prompt += `---\n\n`;
    }
    
    if (currentStep.instruction) {
      prompt += `Your role: ${currentStep.instruction}\n\n`;
    }
    prompt += 'Continue based on the previous work.';
  }
  
  return prompt;
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

// Получить детали шагов из БД
export function getChainSteps(runId: number): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM chain_steps 
    WHERE run_id = ? 
    ORDER BY step_order ASC
  `).all(runId);
}
