import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// GET /products/:id/metrics
router.get('/products/:id/metrics', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    let query = 'SELECT * FROM metrics WHERE product_id = $1';
    const values = [id];
    let p = 1;

    if (from) { p++; query += ` AND date >= $${p}`; values.push(from); }
    if (to) { p++; query += ` AND date <= $${p}`; values.push(to); }

    query += ' ORDER BY date DESC';

    const { rows } = await pool.query(query, values);
    res.json({ metrics: rows });
  } catch (err) { next(err); }
});

// GET /products/:id/metrics/aggregate
router.get('/products/:id/metrics/aggregate', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM v_product_metrics WHERE product_id = $1',
      [id],
    );
    res.json({ aggregate: rows[0] || null });
  } catch (err) { next(err); }
});

// POST /products/:id/metrics
const createMetricSchema = z.object({
  body: z.object({
    date: z.string(),
    time: z.string().optional(),
    cost: z.number().min(0).default(0),
    bid: z.number().min(0).optional(),
    budget: z.number().min(0).optional(),
    sales: z.number().int().min(0).default(0),
    revenue: z.number().min(0).default(0),
    note: z.string().optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.post('/products/:id/metrics', requireAuth, validate(createMetricSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { date, time, cost, bid, budget, sales, revenue, note } = req.validated.body;

    const { rows } = await pool.query(
      `INSERT INTO metrics (product_id, date, time, cost, bid, budget, sales, revenue, note, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, date, time || null, cost, bid || null, budget || null, sales, revenue, note || null, req.user.id],
    );

    res.status(201).json({ metric: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /metrics/:id
const patchMetricSchema = z.object({
  body: z.object({
    date: z.string().optional(),
    time: z.string().optional().nullable(),
    cost: z.number().min(0).optional(),
    bid: z.number().min(0).optional().nullable(),
    budget: z.number().min(0).optional().nullable(),
    sales: z.number().int().min(0).optional(),
    revenue: z.number().min(0).optional(),
    note: z.string().optional().nullable(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/metrics/:id', requireAuth, validate(patchMetricSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { date, time, cost, bid, budget, sales, revenue, note } = req.validated.body;

    const updates = [];
    const values = [];
    let p = 0;

    const setField = (field, val) => { p++; updates.push(`${field} = $${p}`); values.push(val); };

    if (date !== undefined) setField('date', date);
    if (time !== undefined) setField('time', time);
    if (cost !== undefined) setField('cost', cost);
    if (bid !== undefined) setField('bid', bid);
    if (budget !== undefined) setField('budget', budget);
    if (sales !== undefined) setField('sales', sales);
    if (revenue !== undefined) setField('revenue', revenue);
    if (note !== undefined) setField('note', note);

    if (updates.length === 0) throw AppError.validation('Nada para atualizar');

    p++; values.push(id);
    const { rows } = await pool.query(
      `UPDATE metrics SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Métrica não encontrada');
    res.json({ metric: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /metrics/:id
router.delete('/metrics/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM metrics WHERE id = $1 RETURNING id',
      [id],
    );
    if (rows.length === 0) throw AppError.notFound('Métrica não encontrada');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) { next(err); }
});

export default router;
