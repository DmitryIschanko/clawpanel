import { Router } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError } from '../utils/errors';
import { auditLog } from '../middleware/audit';
import type { Chain, ChainRun } from '../types/database';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Chains
 *   description: Workflow chain management
 */

/**
 * @swagger
 * /chains:
 *   get:
 *     summary: List all chains
 *     description: Get list of all workflow chains
 *     tags: [Chains]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of chains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       nodes:
 *                         type: array
 *                       edges:
 *                         type: array
 *                       triggers:
 *                         type: array
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const chains = db.prepare('SELECT * FROM chains ORDER BY created_at DESC').all() as Chain[];
  
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

/**
 * @swagger
 * /chains/{id}:
 *   get:
 *     summary: Get chain details
 *     description: Get detailed information about a chain including run history
 *     tags: [Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chain details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     nodes:
 *                       type: array
 *                     edges:
 *                       type: array
 *                     runs:
 *                       type: array
 *       404:
 *         description: Chain not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const db = getDatabase();
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(req.params.id) as Chain | undefined;
  
  if (!chain) {
    throw new NotFoundError('Chain not found');
  }
  
  // Get run history
  const runs = db.prepare('SELECT * FROM chain_runs WHERE chain_id = ? ORDER BY started_at DESC LIMIT 20')
    .all(req.params.id) as ChainRun[];
  
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

/**
 * @swagger
 * /chains:
 *   post:
 *     summary: Create chain
 *     description: Create a new workflow chain (admin only)
 *     tags: [Chains]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - nodes
 *               - edges
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               nodes:
 *                 type: array
 *                 description: Array of node objects
 *               edges:
 *                 type: array
 *                 description: Array of edge objects
 *               triggers:
 *                 type: array
 *               variables:
 *                 type: object
 *     responses:
 *       201:
 *         description: Chain created successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
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

/**
 * @swagger
 * /chains/{id}:
 *   put:
 *     summary: Update chain
 *     description: Update an existing chain (admin only)
 *     tags: [Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               nodes:
 *                 type: array
 *               edges:
 *                 type: array
 *               triggers:
 *                 type: array
 *               variables:
 *                 type: object
 *     responses:
 *       200:
 *         description: Chain updated successfully
 *       404:
 *         description: Chain not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
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

/**
 * @swagger
 * /chains/{id}:
 *   delete:
 *     summary: Delete chain
 *     description: Delete a workflow chain (admin only)
 *     tags: [Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chain deleted successfully
 *       404:
 *         description: Chain not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
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

/**
 * @swagger
 * /chains/{id}/run:
 *   post:
 *     summary: Run chain
 *     description: Execute a workflow chain
 *     tags: [Chains]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variables:
 *                 type: object
 *                 description: Input variables for the chain
 *     responses:
 *       200:
 *         description: Chain execution started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     runId:
 *                       type: integer
 *                     status:
 *                       type: string
 *       404:
 *         description: Chain not found
 *       401:
 *         description: Unauthorized
 */
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
