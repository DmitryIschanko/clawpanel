import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';

const router = Router();

// List chains
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const chains = db.prepare('SELECT * FROM chains ORDER BY created_at DESC').all();
  
  res.json({
    success: true,
    data: chains.map(c => ({
      ...c,
      nodes: c.nodes ? JSON.parse(c.nodes) : [],
      edges: c.edges ? JSON.parse(c.edges) : [],
      triggers: c.triggers ? JSON.parse(c.triggers) : [],
      variables: c.variables ? JSON.parse(c.variables) : {},
    })),
  });
}));

// Get single chain
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(req.params.id);
  
  if (!chain) {
    throw new NotFoundError('Chain not found');
  }
  
  // Get run history
  const runs = db.prepare('SELECT * FROM chain_runs WHERE chain_id = ? ORDER BY started_at DESC LIMIT 20')
    .all(req.params.id);
  
  res.json({
    success: true,
    data: {
      ...chain,
      nodes: chain.nodes ? JSON.parse(chain.nodes) : [],
      edges: chain.edges ? JSON.parse(chain.edges) : [],
      triggers: chain.triggers ? JSON.parse(chain.triggers) : [],
      variables: chain.variables ? JSON.parse(chain.variables) : {},
      runs: runs.map(r => ({
        ...r,
        output: r.output ? JSON.parse(r.output) : null,
      })),
    },
  });
}));

// Create chain
router.post('/', authenticateToken, requireAdmin, auditLog('create', 'chain'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const {
    name,
    description,
    nodes,
    edges,
    triggers,
    variables,
  } = req.body;
  
  if (!name) {
    throw new ValidationError('Name is required');
  }
  
  if (!nodes || !Array.isArray(nodes)) {
    throw new ValidationError('Nodes array is required');
  }
  
  if (!edges || !Array.isArray(edges)) {
    throw new ValidationError('Edges array is required');
  }
  
  const result = db.prepare(`
    INSERT INTO chains (name, description, nodes, edges, triggers, variables)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name,
    description || null,
    JSON.stringify(nodes),
    JSON.stringify(edges),
    triggers ? JSON.stringify(triggers) : '[]',
    variables ? JSON.stringify(variables) : '{}'
  );
  
  res.status(201).json({
    success: true,
    data: { id: result.lastInsertRowid },
  });
}));

// Update chain
router.put('/:id', authenticateToken, requireAdmin, auditLog('update', 'chain'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const chain = db.prepare('SELECT id FROM chains WHERE id = ?').get(req.params.id);
  
  if (!chain) {
    throw new NotFoundError('Chain not found');
  }
  
  const updates = req.body;
  const fields: string[] = [];
  const values: any[] = [];
  
  const jsonFields = ['nodes', 'edges', 'triggers', 'variables'];
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(jsonFields.includes(key) ? JSON.stringify(value) : value);
    }
  }
  
  if (fields.length > 0) {
    values.push(req.params.id);
    db.prepare(`UPDATE chains SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`)
      .run(...values);
  }
  
  res.json({
    success: true,
    message: 'Chain updated successfully',
  });
}));

// Delete chain
router.delete('/:id', authenticateToken, requireAdmin, auditLog('delete', 'chain'), asyncHandler(async (req, res) => {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM chains WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new NotFoundError('Chain not found');
  }
  
  res.json({
    success: true,
    message: 'Chain deleted successfully',
  });
}));

// Run chain
router.post('/:id/run', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(req.params.id);
  
  if (!chain) {
    throw new NotFoundError('Chain not found');
  }
  
  // Create run record
  const result = db.prepare(`
    INSERT INTO chain_runs (chain_id, status, started_at)
    VALUES (?, 'running', unixepoch())
  `).run(req.params.id);
  
  // In a real implementation, this would trigger the chain execution
  
  res.json({
    success: true,
    data: { runId: result.lastInsertRowid },
  });
}));

export default router;
