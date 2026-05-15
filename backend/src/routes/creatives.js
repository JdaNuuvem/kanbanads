import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { checkProductWorkspace } from '../lib/workspace.js';

const router = Router();

// GET /products/:id/creatives
router.get('/products/:id/creatives', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { folder } = req.query;

    await checkProductWorkspace(pool, id, req.user.id);

    let query = 'SELECT * FROM creatives WHERE product_id = $1';
    const values = [id];
    let p = 1;

    if (folder) { p++; query += ` AND folder = $${p}`; values.push(folder); }

    query += ' ORDER BY added_at DESC';

    const { rows } = await pool.query(query, values);
    res.json({ creatives: rows });
  } catch (err) { next(err); }
});

// POST /products/:id/creatives
const createCreativeSchema = z.object({
  body: z.object({
    folder: z.string().min(1).max(30).default('CA1'),
    name: z.string().min(1).max(200),
    type: z.enum(['video', 'image', 'copy']),
    version: z.number().int().min(1).default(1),
    status: z.enum(['rascunho', 'aprovado', 'rodando', 'pausado', 'morto']).default('rascunho'),
    size: z.string().optional(),
    body_text: z.string().optional(),
    link: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.post('/products/:id/creatives', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(createCreativeSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { folder, name, type, version, status, size, body_text, link, tags } = req.validated.body;

    const prod = await checkProductWorkspace(client, id, req.user.id);
    if (prod.role === 'viewer') throw AppError.forbidden('Visualizadores não podem adicionar criativos');

    const { rows } = await client.query(
      `INSERT INTO creatives (product_id, folder, name, type, version, status, size, body_text, link, tags, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, folder, name, type, version, status, size || null, body_text || null, link || null, tags || [], req.user.id],
    );

    // History + activity
    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [id, 'creative', `Criativo "${name}" adicionado em ${folder}`, req.user.id],
    );

    await client.query(
      `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['edit', id, prod.name, req.user.id, 'adicionou criativo', `${folder}: ${name}`, prod.workspace_id],
    );

    await client.query('COMMIT');

    res.status(201).json({ creative: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /creatives/:id
const patchCreativeSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    status: z.enum(['rascunho', 'aprovado', 'rodando', 'pausado', 'morto']).optional(),
    ctr: z.number().min(0).optional(),
    cpm: z.number().min(0).optional(),
    spent: z.number().min(0).optional(),
    body_text: z.string().optional().nullable(),
    link: z.string().optional().nullable(),
    size: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    version: z.number().int().min(1).optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/creatives/:id', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(patchCreativeSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const body = req.validated.body;

    const creative = await pool.query(
      `SELECT c.id, p.workspace_id, wm.role FROM creatives c
       JOIN products p ON p.id = c.product_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE c.id = $1`,
      [id, req.user.id],
    );
    if (creative.rows.length === 0) throw AppError.notFound('Criativo não encontrado ou sem acesso');
    if (creative.rows[0].role === 'viewer') throw AppError.forbidden('Visualizadores não podem modificar criativos');

    const columnMap = {
      body_text: 'body_text',
      name: 'name',
      status: 'status',
      ctr: 'ctr',
      cpm: 'cpm',
      spent: 'spent',
      link: 'link',
      size: 'size',
      tags: 'tags',
      version: 'version',
    };

    const updates = [];
    const values = [];
    let p = 0;

    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined && columnMap[key]) {
        p++;
        updates.push(`${columnMap[key]} = $${p}`);
        values.push(val);
      }
    }

    if (updates.length === 0) throw AppError.validation('Nada para atualizar');

    p++; values.push(id);
    const { rows } = await pool.query(
      `UPDATE creatives SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Criativo não encontrado');
    res.json({ creative: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /creatives/:id
router.delete('/creatives/:id', requireAuth, requireRole('admin', 'gestor'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const creative = await pool.query(
      `SELECT c.id, p.workspace_id, wm.role FROM creatives c
       JOIN products p ON p.id = c.product_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE c.id = $1`,
      [id, req.user.id],
    );
    if (creative.rows.length === 0) throw AppError.notFound('Criativo não encontrado ou sem acesso');

    const { rows } = await pool.query(
      'DELETE FROM creatives WHERE id = $1 RETURNING id',
      [id],
    );
    if (rows.length === 0) throw AppError.notFound('Criativo não encontrado');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) { next(err); }
});

// PATCH /creatives/:id/folder
const moveFolderSchema = z.object({
  body: z.object({
    folder: z.string().min(1).max(30),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/creatives/:id/folder', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(moveFolderSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { folder } = req.validated.body;

    const creative = await pool.query(
      `SELECT c.id, p.workspace_id, wm.role FROM creatives c
       JOIN products p ON p.id = c.product_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE c.id = $1`,
      [id, req.user.id],
    );
    if (creative.rows.length === 0) throw AppError.notFound('Criativo não encontrado ou sem acesso');
    if (creative.rows[0].role === 'viewer') throw AppError.forbidden('Visualizadores não podem modificar criativos');

    const { rows } = await pool.query(
      'UPDATE creatives SET folder = $1 WHERE id = $2 RETURNING *',
      [folder, id],
    );

    if (rows.length === 0) throw AppError.notFound('Criativo não encontrado');
    res.json({ creative: rows[0] });
  } catch (err) { next(err); }
});

// POST /creatives/:id/duplicate
router.post('/creatives/:id/duplicate', requireAuth, requireRole('admin', 'gestor', 'editor'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const creative = await pool.query(
      `SELECT c.*, p.workspace_id, wm.role FROM creatives c
       JOIN products p ON p.id = c.product_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE c.id = $1`,
      [id, req.user.id],
    );
    if (creative.rows.length === 0) throw AppError.notFound('Criativo não encontrado ou sem acesso');
    if (creative.rows[0].role === 'viewer') throw AppError.forbidden('Visualizadores não podem duplicar criativos');

    const c = creative.rows[0];
    const { rows } = await pool.query(
      `INSERT INTO creatives (product_id, folder, name, type, version, status, size, body_text, link, tags, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [c.product_id, c.folder, c.name + ' (cópia)', c.type, c.version + 1, 'rascunho', c.size, c.body_text, c.link, c.tags, req.user.id],
    );

    res.status(201).json({ creative: rows[0] });
  } catch (err) { next(err); }
});

export default router;
