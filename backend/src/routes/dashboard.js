import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Helper: build workspace filter condition
function wsFilter(params) {
  const { workspace_id } = params;
  if (workspace_id) {
    return { clause: 'p.workspace_id = $1', values: [workspace_id], p: 1 };
  }
  return { clause: 'p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)', values: ['__user__'], p: 1 };
}

// GET /dashboard/funnel
router.get('/dashboard/funnel', requireAuth, async (req, res, next) => {
  try {
    const { workspace_id } = req.query;

    let wsClause;
    let wsValues;
    if (workspace_id) {
      wsClause = 'p.workspace_id = $1';
      wsValues = [workspace_id];
    } else {
      wsClause = 'p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)';
      wsValues = [req.user.id];
    }

    const { rows } = await pool.query(
      `SELECT
         s.id, s.title, s.position, s.color,
         COUNT(p.id) AS total,
         ROUND(AVG(EXTRACT(EPOCH FROM (now() - p.entered_stage_at))/86400))::INTEGER AS avg_days_in_stage
       FROM stages s
       LEFT JOIN products p ON p.stage_id = s.id AND p.archived_at IS NULL AND ${wsClause}
       GROUP BY s.id, s.title, s.position, s.color
       ORDER BY s.position`,
      wsValues,
    );
    res.json({ funnel: rows });
  } catch (err) { next(err); }
});

// GET /dashboard/workload
router.get('/dashboard/workload', requireAuth, async (req, res, next) => {
  try {
    const { workspace_id } = req.query;

    let wsClause;
    let wsValues;
    if (workspace_id) {
      wsClause = 'p.workspace_id = $1';
      wsValues = [workspace_id];
    } else {
      wsClause = 'p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)';
      wsValues = [req.user.id];
    }

    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.role, u.color,
         COUNT(DISTINCT pa.product_id) FILTER (
           WHERE p.stage_id != 'morto' AND p.archived_at IS NULL
         ) AS active_count,
         COUNT(DISTINCT pa.product_id) FILTER (
           WHERE p.stage_id IN ('rodando','escala')
         ) AS running_count,
         COUNT(DISTINCT pa.product_id) FILTER (
           WHERE p.stage_id = 'rodando' AND p.entered_stage_at < now() - interval '7 days'
         ) AS stale_count,
         COALESCE(SUM(pma.profit), 0) AS total_profit
       FROM users u
       LEFT JOIN product_assignees pa ON pa.user_id = u.id
       LEFT JOIN products p           ON p.id = pa.product_id AND ${wsClause}
       LEFT JOIN v_product_metrics pma ON pma.product_id = p.id
       WHERE u.active = true
       GROUP BY u.id, u.name, u.role, u.color`,
      wsValues,
    );
    res.json({ workload: rows });
  } catch (err) { next(err); }
});

// GET /dashboard/kpis
router.get('/dashboard/kpis', requireAuth, async (req, res, next) => {
  try {
    const { workspace_id } = req.query;

    let wsClause;
    let wsValues;
    if (workspace_id) {
      wsClause = 'p.workspace_id = $1';
      wsValues = [workspace_id];
    } else {
      wsClause = 'p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)';
      wsValues = [req.user.id];
    }

    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(m.cost), 0) AS total_cost,
         COALESCE(SUM(m.revenue), 0) AS total_revenue,
         COALESCE(SUM(m.revenue) - SUM(m.cost), 0) AS profit,
         CASE WHEN SUM(m.cost) > 0 THEN SUM(m.revenue) / SUM(m.cost) ELSE 0 END AS roas,
         COALESCE(SUM(m.sales), 0) AS total_sales,
         COUNT(DISTINCT m.product_id) AS active_product_count
       FROM metrics m
       JOIN products p ON p.id = m.product_id
       WHERE m.date >= current_date - interval '30 days' AND ${wsClause}`,
      wsValues,
    );
    res.json({ kpis: rows[0] });
  } catch (err) { next(err); }
});

// GET /dashboard/timeline
router.get('/dashboard/timeline', requireAuth, async (req, res, next) => {
  try {
    const { from, to, workspace_id } = req.query;

    const conditions = [];
    const values = [];
    let p = 0;

    if (workspace_id) {
      p++; conditions.push(`p.workspace_id = $${p}`); values.push(workspace_id);
    } else {
      p++; conditions.push(`p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $${p})`);
      values.push(req.user.id);
    }

    if (from) { p++; conditions.push(`m.date >= $${p}`); values.push(from); }
    else { p++; conditions.push(`m.date >= current_date - interval '30 days'`); values.push('__dummy__'); }
    if (to) { p++; conditions.push(`m.date <= $${p}`); values.push(to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const cleanValues = values.filter(v => v !== '__dummy__');

    const { rows } = await pool.query(
      `SELECT
         m.date,
         SUM(m.cost) AS cost,
         SUM(m.revenue) AS revenue,
         SUM(m.sales) AS sales,
         CASE WHEN SUM(m.cost) > 0 THEN SUM(m.revenue) / SUM(m.cost) ELSE 0 END AS roas
       FROM metrics m
       JOIN products p ON p.id = m.product_id
       ${where}
       GROUP BY m.date
       ORDER BY m.date ASC`,
      cleanValues.length > 0 ? cleanValues : undefined,
    );

    res.json({ timeline: rows });
  } catch (err) { next(err); }
});

export default router;
