import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { checkProductWorkspace } from '../lib/workspace.js';

const router = Router();

// GET /products/:id/metrics
router.get('/products/:id/metrics', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    await checkProductWorkspace(pool, id, req.user.id);

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
    await checkProductWorkspace(pool, id, req.user.id);
    const { rows } = await pool.query(
      'SELECT * FROM v_product_metrics WHERE product_id = $1',
      [id],
    );
    res.json({ aggregate: rows[0] || null });
  } catch (err) { next(err); }
});

// POST /products/:id/metrics — upsert on (product_id, date)
const createMetricSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
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

router.post('/products/:id/metrics', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(createMetricSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { date, time, cost, bid, budget, sales, revenue, note } = req.validated.body;

    const prod = await checkProductWorkspace(client, id, req.user.id);
    if (prod.role === 'viewer') throw AppError.forbidden('Visualizadores não podem modificar métricas');

    // Upsert — replaces existing entry for same product+date
    const { rows } = await client.query(
      `INSERT INTO metrics (product_id, date, time, cost, bid, budget, sales, revenue, note, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (product_id, date) DO UPDATE SET
         time = EXCLUDED.time,
         cost = EXCLUDED.cost,
         bid = EXCLUDED.bid,
         budget = EXCLUDED.budget,
         sales = EXCLUDED.sales,
         revenue = EXCLUDED.revenue,
         note = EXCLUDED.note,
         logged_by = EXCLUDED.logged_by
       RETURNING *`,
      [id, date, time || null, cost, bid || null, budget || null, sales, revenue, note || null, req.user.id],
    );

    // History + activity
    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [id, 'metric', `Métrica registrada em ${date}`, req.user.id],
    );

    await client.query(
      `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['metric', id, prod.name, req.user.id, 'atualizou métricas', date, prod.workspace_id],
    );

    await client.query('COMMIT');

    res.status(201).json({ metric: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /metrics/:id
const patchMetricSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)').optional(),
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

router.patch('/metrics/:id', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(patchMetricSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.validated.params;
    const { date, time, cost, bid, budget, sales, revenue, note } = req.validated.body;

    const metric = await client.query(
      `SELECT m.id, p.workspace_id, wm.role
       FROM metrics m
       JOIN products p ON p.id = m.product_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE m.id = $1`,
      [id, req.user.id],
    );
    if (metric.rows.length === 0) throw AppError.notFound('Métrica não encontrada ou sem acesso');
    if (metric.rows[0].role === 'viewer') throw AppError.forbidden('Visualizadores não podem modificar métricas');

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
    const { rows } = await client.query(
      `UPDATE metrics SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Métrica não encontrada');
    res.json({ metric: rows[0] });
  } catch (err) { next(err); } finally { client.release(); }
});

// DELETE /metrics/:id
const deleteMetricSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

router.delete('/metrics/:id', requireAuth, requireRole('admin', 'gestor'), validate(deleteMetricSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.validated.params;

    const metric = await client.query(
      `SELECT m.id, p.workspace_id, wm.role
       FROM metrics m
       JOIN products p ON p.id = m.product_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE m.id = $1`,
      [id, req.user.id],
    );
    if (metric.rows.length === 0) throw AppError.notFound('Métrica não encontrada ou sem acesso');

    const { rows } = await client.query(
      'DELETE FROM metrics WHERE id = $1 RETURNING id',
      [id],
    );
    if (rows.length === 0) throw AppError.notFound('Métrica não encontrada');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) { next(err); } finally { client.release(); }
});

export default router;
