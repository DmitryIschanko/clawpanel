/**
 * Chat History Service
 * Manages persistent chat messages for agents
 * Keeps last N messages per agent (default: 50)
 */

import { getDatabase } from '../database';

export interface ChatMessage {
  id: number;
  agent_id: number;
  role: 'user' | 'assistant';
  content: string;
  tokens_used?: number;
  model?: string;
  session_id?: string;
  created_at: number;
}

export interface SaveMessageInput {
  agentId: number;
  role: 'user' | 'assistant';
  content: string;
  tokensUsed?: number;
  model?: string;
  sessionId?: string;
}

const DEFAULT_HISTORY_LIMIT = 50;

/**
 * Get chat history for an agent
 * Returns last N messages sorted by timestamp (oldest first)
 */
export function getChatHistory(
  agentId: number, 
  limit: number = DEFAULT_HISTORY_LIMIT
): ChatMessage[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT 
      id,
      agent_id,
      role,
      content,
      tokens_used,
      model,
      session_id,
      created_at
    FROM chat_messages
    WHERE agent_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `);
  
  const messages = stmt.all(agentId, limit) as ChatMessage[];
  return messages;
}

/**
 * Get last N messages for context (newest first, then reversed)
 * Useful for sending context to LLM
 */
export function getRecentMessages(
  agentId: number,
  limit: number = DEFAULT_HISTORY_LIMIT
): ChatMessage[] {
  const db = getDatabase();
  
  // Get last N messages ordered by time DESC
  const stmt = db.prepare(`
    SELECT 
      id,
      agent_id,
      role,
      content,
      tokens_used,
      model,
      session_id,
      created_at
    FROM chat_messages
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  const messages = stmt.all(agentId, limit) as ChatMessage[];
  
  // Reverse to get chronological order (oldest first)
  return messages.reverse();
}

/**
 * Save a new message to the database
 */
export function saveMessage(input: SaveMessageInput): ChatMessage {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO chat_messages (
      agent_id, role, content, tokens_used, model, session_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `);
  
  const result = stmt.run(
    input.agentId,
    input.role,
    input.content,
    input.tokensUsed || 0,
    input.model || null,
    input.sessionId || null
  );
  
  // Clean up old messages to keep only last N
  cleanupOldMessages(input.agentId, DEFAULT_HISTORY_LIMIT);
  
  return {
    id: result.lastInsertRowid as number,
    agent_id: input.agentId,
    role: input.role,
    content: input.content,
    tokens_used: input.tokensUsed || 0,
    model: input.model,
    session_id: input.sessionId,
    created_at: Math.floor(Date.now() / 1000)
  };
}

/**
 * Delete old messages, keeping only the last N
 */
function cleanupOldMessages(agentId: number, keepCount: number): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    DELETE FROM chat_messages
    WHERE id NOT IN (
      SELECT id FROM chat_messages
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    )
    AND agent_id = ?
  `);
  
  stmt.run(agentId, keepCount, agentId);
}

/**
 * Clear all chat history for an agent
 */
export function clearChatHistory(agentId: number): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    DELETE FROM chat_messages WHERE agent_id = ?
  `);
  
  stmt.run(agentId);
}

/**
 * Get message count for an agent
 */
export function getMessageCount(agentId: number): number {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM chat_messages WHERE agent_id = ?
  `);
  
  const result = stmt.get(agentId) as { count: number };
  return result.count;
}

/**
 * Delete a specific message
 */
export function deleteMessage(messageId: number): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    DELETE FROM chat_messages WHERE id = ?
  `);
  
  stmt.run(messageId);
}
