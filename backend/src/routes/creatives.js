import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { emitToAll } from '../lib/sse.js';

const router = Router();

// GET /products/:id/creatives
router.get('/products/:id/creatives', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { folder } = req.query;

    let query = 'SELECT * FROM creatives WHERE product_id = $1';
    const values = [id];
    let p = 1;

    if (folder) { p++; query += ` AND folder = $${p}`; values.push(folder); }

    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, values);
    res.json({ creatives: rows });
  } catch (err) { next(err); }
});

// POST /products/:id/creatives
const createCreativeSchema = z.object({
  body: z.object({
    folder: z.enum(['CA1', 'CA2', 'CA3', 'CA4', 'UPSELLS', 'SOURCES', 'VARIAÇÕES']).default('CA1'),
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

router.post('/products/:id/creatives', requireAuth, validate(createCreativeSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { folder, name, type, version, status, size, body_text, link, tags } = req.validated.body;

    const { rows } = await pool.query(
      `INSERT INTO creatives (product_id, folder, name, type, version, status, size, body_text, link, tags, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, folder, name, type, version, status, size || null, body_text || null, link || null, tags || [], req.user.id],
    );

    res.status(201).json({ creative: rows[0] });
  } catch (err) { next(err); }
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

router.patch('/creatives/:id', requireAuth, validate(patchCreativeSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const body = req.validated.body;

    const updates = [];
    const values = [];
    let p = 0;

    for (const [key, val] of Object.entries(body)) {
      if (val !== undefined) {
        p++;
        const dbKey = key === 'body_text' ? 'body_text' : key;
        updates.push(`${dbKey} = $${p}`);
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
router.delete('/creatives/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
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
    folder: z.enum(['CA1', 'CA2', 'CA3', 'CA4', 'UPSELLS', 'SOURCES', 'VARIAÇÕES']),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/creatives/:id/folder', requireAuth, validate(moveFolderSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { folder } = req.validated.body;

    const { rows } = await pool.query(
      'UPDATE creatives SET folder = $1 WHERE id = $2 RETURNING *',
      [folder, id],
    );

    if (rows.length === 0) throw AppError.notFound('Criativo não encontrado');
    res.json({ creative: rows[0] });
  } catch (err) { next(err); }
});

// POST /creatives/:id/duplicate
router.post('/creatives/:id/duplicate', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const original = await pool.query('SELECT * FROM creatives WHERE id = $1', [id]);
    if (original.rows.length === 0) throw AppError.notFound('Criativo não encontrado');

    const c = original.rows[0];
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
