import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import logger from '../lib/logger.js';

const router = Router();

// ===== Helpers =====

async function ensureMember(workspaceId, userId) {
  const { rows } = await pool.query(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  if (rows.length === 0) throw AppError.forbidden('Você não pertence a este workspace');
  return rows[0];
}

async function ensureOwnerOrAdmin(workspaceId, userId) {
  const member = await ensureMember(workspaceId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw AppError.forbidden('Apenas owner/admin podem gerenciar o workspace');
  }
  return member;
}

// ===== GET /workspaces =====

router.get('/workspaces', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.id, w.name, w.description, w.color, w.created_by, w.is_default, w.created_at,
              wm.role AS my_role,
              COALESCE(
                (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'role', u.role, 'member_role', wm2.role))
                 FROM workspace_members wm2 JOIN users u ON u.id = wm2.user_id
                 WHERE wm2.workspace_id = w.id),
                '[]'::json
              ) AS members,
              COALESCE(
                (SELECT COUNT(*) FROM products p WHERE p.workspace_id = w.id AND p.archived_at IS NULL),
                0
              )::INTEGER AS product_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
       ORDER BY w.is_default DESC, w.created_at DESC`,
      [req.user.id],
    );

    res.json({ workspaces: rows });
  } catch (err) { next(err); }
});

// ===== GET /workspaces/:id =====

router.get('/workspaces/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await ensureMember(id, req.user.id);

    const { rows } = await pool.query(
      `SELECT w.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'role', u.role, 'member_role', wm.role))
                 FROM workspace_members wm JOIN users u ON u.id = wm.user_id
                 WHERE wm.workspace_id = w.id),
                '[]'::json
              ) AS members,
              COALESCE(
                (SELECT COUNT(*) FROM products p WHERE p.workspace_id = w.id AND p.archived_at IS NULL),
                0
              )::INTEGER AS product_count
       FROM workspaces w
       WHERE w.id = $1`,
      [id],
    );

    if (rows.length === 0) throw AppError.notFound('Workspace não encontrado');
    res.json({ workspace: rows[0] });
  } catch (err) { next(err); }
});

// ===== POST /workspaces =====

const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    color: z.string().optional(),
  }),
});

router.post('/workspaces', requireAuth, validate(createWorkspaceSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { name, description, color } = req.validated.body;

    const { rows } = await client.query(
      `INSERT INTO workspaces (name, description, color, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, color || 'oklch(0.72 0.12 240)', req.user.id],
    );

    const workspace = rows[0];

    // Criador é owner
    await client.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [workspace.id, req.user.id, 'owner'],
    );

    await client.query('COMMIT');

    logger.info({ workspaceId: workspace.id, userId: req.user.id }, 'Workspace created');

    res.status(201).json({
      workspace: { ...workspace, my_role: 'owner', members: [], product_count: 0 },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== PATCH /workspaces/:id =====

const patchWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().optional().nullable(),
    color: z.string().optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/workspaces/:id', requireAuth, validate(patchWorkspaceSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    await ensureOwnerOrAdmin(id, req.user.id);

    const { name, description, color } = req.validated.body;

    const updates = [];
    const values = [];
    let p = 0;

    if (name !== undefined) { p++; updates.push(`name = $${p}`); values.push(name); }
    if (description !== undefined) { p++; updates.push(`description = $${p}`); values.push(description); }
    if (color !== undefined) { p++; updates.push(`color = $${p}`); values.push(color); }

    if (updates.length === 0) throw AppError.validation('Nada para atualizar');

    p++; values.push(id);
    const { rows } = await pool.query(
      `UPDATE workspaces SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Workspace não encontrado');
    res.json({ workspace: rows[0] });
  } catch (err) { next(err); }
});

// ===== DELETE /workspaces/:id =====

router.delete('/workspaces/:id', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    await ensureOwnerOrAdmin(id, req.user.id);

    const ws = await client.query('SELECT is_default FROM workspaces WHERE id = $1', [id]);
    if (ws.rows.length === 0) throw AppError.notFound('Workspace não encontrado');
    if (ws.rows[0].is_default) throw AppError.validation('Não é possível excluir o workspace padrão');

    // Soft-delete products first (they have FK ON DELETE CASCADE but we do it explicitly)
    await client.query(
      'UPDATE products SET archived_at = now() WHERE workspace_id = $1 AND archived_at IS NULL',
      [id],
    );

    await client.query('DELETE FROM workspaces WHERE id = $1', [id]);

    await client.query('COMMIT');

    logger.info({ workspaceId: id, userId: req.user.id }, 'Workspace deleted');

    res.json({ id, deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== POST /workspaces/:id/members =====

const addMemberSchema = z.object({
  body: z.object({
    user_id: z.string().uuid(),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.post('/workspaces/:id/members', requireAuth, validate(addMemberSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { user_id, role } = req.validated.body;
    await ensureOwnerOrAdmin(id, req.user.id);

    const userCheck = await pool.query('SELECT id, name, color, role FROM users WHERE id = $1 AND active = true', [user_id]);
    if (userCheck.rows.length === 0) throw AppError.notFound('Usuário não encontrado');

    await pool.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3',
      [id, user_id, role],
    );

    logger.info({ workspaceId: id, userId: user_id, role, byId: req.user.id }, 'Member added to workspace');

    res.json({ member: { user_id, role, user: userCheck.rows[0] } });
  } catch (err) { next(err); }
});

// ===== DELETE /workspaces/:id/members/:userId =====

router.delete('/workspaces/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    await ensureOwnerOrAdmin(id, req.user.id);

    if (userId === req.user.id) throw AppError.validation('Não pode remover a si mesmo. Use a opção de sair do workspace.');

    const { rowCount } = await pool.query(
      'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [id, userId],
    );

    if (rowCount === 0) throw AppError.notFound('Membro não encontrado no workspace');

    res.json({ workspace_id: id, user_id: userId, removed: true });
  } catch (err) { next(err); }
});

// ===== PATCH /workspaces/:id/members/:userId =====

const patchMemberSchema = z.object({
  body: z.object({
    role: z.enum(['admin', 'member', 'viewer']),
  }),
  params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
});

router.patch('/workspaces/:id/members/:userId', requireAuth, validate(patchMemberSchema), async (req, res, next) => {
  try {
    const { id, userId } = req.validated.params;
    const { role } = req.validated.body;
    await ensureOwnerOrAdmin(id, req.user.id);

    const { rows } = await pool.query(
      'UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3 RETURNING *',
      [role, id, userId],
    );

    if (rows.length === 0) throw AppError.notFound('Membro não encontrado no workspace');

    res.json({ member: rows[0] });
  } catch (err) { next(err); }
});

// ===== POST /workspaces/:id/leave =====

router.post('/workspaces/:id/leave', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const member = await ensureMember(id, req.user.id);
    if (member.role === 'owner') {
      // Check if there are other owners
      const { rows } = await pool.query(
        "SELECT COUNT(*) AS cnt FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND user_id != $2",
        [id, req.user.id],
      );
      if (parseInt(rows[0].cnt) === 0) {
        throw AppError.validation('Você é o único owner. Transfira ownership antes de sair.');
      }
    }

    await pool.query(
      'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [id, req.user.id],
    );

    res.json({ workspace_id: id, left: true });
  } catch (err) { next(err); }
});

export default router;
