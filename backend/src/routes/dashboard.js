import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /dashboard/funnel
router.get('/dashboard/funnel', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM v_funnel ORDER BY position');
    res.json({ funnel: rows });
  } catch (err) { next(err); }
});

// GET /dashboard/workload
router.get('/dashboard/workload', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM v_user_workload');
    res.json({ workload: rows });
  } catch (err) { next(err); }
});

// GET /dashboard/kpis
router.get('/dashboard/kpis', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(m.cost), 0) AS total_cost,
        COALESCE(SUM(m.revenue), 0) AS total_revenue,
        COALESCE(SUM(m.revenue) - SUM(m.cost), 0) AS profit,
        CASE WHEN SUM(m.cost) > 0 THEN SUM(m.revenue) / SUM(m.cost) ELSE 0 END AS roas,
        COALESCE(SUM(m.sales), 0) AS total_sales,
        COUNT(DISTINCT m.product_id) AS active_product_count
      FROM metrics m
      WHERE m.date >= date_trunc('month', current_date)
    `);
    res.json({ kpis: rows[0] });
  } catch (err) { next(err); }
});

// GET /dashboard/timeline
router.get('/dashboard/timeline', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const conditions = [];
    const values = [];
    let p = 0;

    if (from) { p++; conditions.push(`m.date >= $${p}`); values.push(from); }
    if (to) { p++; conditions.push(`m.date <= $${p}`); values.push(to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         m.date,
         SUM(m.cost) AS cost,
         SUM(m.revenue) AS revenue,
         SUM(m.sales) AS sales,
         CASE WHEN SUM(m.cost) > 0 THEN SUM(m.revenue) / SUM(m.cost) ELSE 0 END AS roas
       FROM metrics m
       ${where}
       GROUP BY m.date
       ORDER BY m.date ASC`,
      values,
    );

    res.json({ timeline: rows });
  } catch (err) { next(err); }
});

export default router;
