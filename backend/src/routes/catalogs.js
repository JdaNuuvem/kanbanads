import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// GET /stages
router.get('/stages', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, position, color, icon FROM stages ORDER BY position',
    );
    res.json({ stages: rows });
  } catch (err) { next(err); }
});

// GET /labels
router.get('/labels', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, color FROM labels ORDER BY name',
    );
    res.json({ labels: rows });
  } catch (err) { next(err); }
});

// POST /labels (admin)
const createLabelSchema = z.object({
  body: z.object({
    id: z.string().min(1).max(50),
    name: z.string().min(1).max(100),
    color: z.string().default('oklch(0.72 0.12 240)'),
  }),
});

router.post('/labels', requireAuth, requireRole('admin'), validate(createLabelSchema), async (req, res, next) => {
  try {
    const { id, name, color } = req.validated.body;

    const existing = await pool.query('SELECT id FROM labels WHERE id = $1', [id]);
    if (existing.rows.length > 0) throw AppError.conflict('Label já existe');

    const { rows } = await pool.query(
      'INSERT INTO labels (id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color',
      [id, name, color],
    );

    res.status(201).json({ label: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /labels/:id (admin)
const patchLabelSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().optional(),
  }),
  params: z.object({ id: z.string().min(1) }),
});

router.patch('/labels/:id', requireAuth, requireRole('admin'), validate(patchLabelSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { name, color } = req.validated.body;
    const updates = [];
    const values = [];
    let p = 0;

    if (name !== undefined) { p++; updates.push(`name = $${p}`); values.push(name); }
    if (color !== undefined) { p++; updates.push(`color = $${p}`); values.push(color); }

    if (updates.length === 0) throw AppError.validation('Nada para atualizar');

    p++; values.push(id);
    const { rows } = await pool.query(
      `UPDATE labels SET ${updates.join(', ')} WHERE id = $${p} RETURNING id, name, color`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Label não encontrado');
    res.json({ label: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /labels/:id (admin)
router.delete('/labels/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM labels WHERE id = $1 RETURNING id, name',
      [id],
    );
    if (rows.length === 0) throw AppError.notFound('Label não encontrado');
    res.json({ label: rows[0], deleted: true });
  } catch (err) { next(err); }
});

// GET /checklists/:stageId
router.get('/checklists/:stageId', async (req, res, next) => {
  try {
    const { stageId } = req.params;
    const { rows } = await pool.query(
      'SELECT item_id, text, position FROM stage_checklist_templates WHERE stage_id = $1 ORDER BY position',
      [stageId],
    );
    res.json({ items: rows });
  } catch (err) { next(err); }
});

export default router;
