import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// GET /export
router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const { workspace_id } = req.query;
    let wsFilter;
    let wsValues;
    if (workspace_id) {
      const memberCheck = await pool.query(
        'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspace_id, req.user.id],
      );
      if (memberCheck.rows.length === 0) throw AppError.forbidden('Você não pertence a este workspace');
      wsFilter = 'AND p.workspace_id = $1';
      wsValues = [workspace_id];
    } else {
      wsFilter = 'AND p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)';
      wsValues = [req.user.id];
    }
    const { rows: products } = await pool.query(
      `SELECT
         p.*,
         COALESCE(
           (SELECT json_agg(pa.user_id) FROM product_assignees pa WHERE pa.product_id = p.id),
           '[]'::json
         ) AS assignee_ids,
         COALESCE(
           (SELECT json_agg(pl.label_id) FROM product_labels pl WHERE pl.product_id = p.id),
           '[]'::json
         ) AS label_ids,
         COALESCE(
           (SELECT json_object_agg(pc.item_id, pc.done) FROM product_checklist pc WHERE pc.product_id = p.id),
           '{}'::json
         ) AS checklist
       FROM products p
       WHERE p.archived_at IS NULL ${wsFilter}
       ORDER BY p.created_at DESC`,
      wsValues,
    );

    const { rows: users } = await pool.query(
      'SELECT id, name, email, color, role, active FROM users WHERE active = true',
    );

    const { rows: stages } = await pool.query('SELECT * FROM stages ORDER BY position');
    const { rows: labels } = await pool.query('SELECT * FROM labels ORDER BY name');

    res.json({
      exportedAt: new Date().toISOString(),
      version: '1.0',
      products,
      users,
      stages,
      labels,
    });
  } catch (err) { next(err); }
});

// GET /export/csv
router.get('/export/csv', requireAuth, async (req, res, next) => {
  try {
    const { type, workspace_id } = req.query;

    let wsFilter;
    let wsValues;
    if (workspace_id) {
      const memberCheck = await pool.query(
        'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspace_id, req.user.id],
      );
      if (memberCheck.rows.length === 0) throw AppError.forbidden('Você não pertence a este workspace');
      wsFilter = 'AND p.workspace_id = $1';
      wsValues = [workspace_id];
    } else {
      wsFilter = 'AND p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)';
      wsValues = [req.user.id];
    }

    if (type === 'products') {
      const { rows } = await pool.query(`
        SELECT p.name, s.title AS stage, p.favorite, p.start_date, p.supplier, p.created_at
        FROM products p
        JOIN stages s ON s.id = p.stage_id
        WHERE p.archived_at IS NULL ${wsFilter}
        ORDER BY p.created_at DESC
      `, wsValues);

      const headers = ['Nome', 'Estágio', 'Favorito', 'Data Início', 'Fornecedor', 'Criado Em'];
      const csv = [
        headers.join(','),
        ...rows.map((r) => [
          `"${(r.name || '').replace(/"/g, '""')}"`,
          `"${r.stage}"`,
          r.favorite ? 'Sim' : 'Não',
          r.start_date || '',
          `"${(r.supplier || '').replace(/"/g, '""')}"`,
          r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
        ].join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=products-${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send(csv);
    }

    if (type === 'metrics') {
      const { rows } = await pool.query(`
        SELECT p.name AS product, m.date, m.cost, m.revenue, m.sales, m.cpa, m.note
        FROM metrics m
        JOIN products p ON p.id = m.product_id
        WHERE p.archived_at IS NULL ${wsFilter}
        ORDER BY m.date DESC
      `, wsValues);

      const headers = ['Produto', 'Data', 'Custo', 'Receita', 'Vendas', 'CPA', 'Nota'];
      const csv = [
        headers.join(','),
        ...rows.map((r) => [
          `"${(r.product || '').replace(/"/g, '""')}"`,
          r.date || '',
          r.cost || 0,
          r.revenue || 0,
          r.sales || 0,
          r.cpa || 0,
          `"${(r.note || '').replace(/"/g, '""')}"`,
        ].join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=metrics-${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send(csv);
    }

    throw AppError.validation('Tipo de export inválido. Use ?type=products ou ?type=metrics');
  } catch (err) { next(err); }
});

// POST /import — upsert via transaction
router.post('/import', requireAuth, requireRole('admin', 'gestor'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const data = req.body;

    if (!data.products || !Array.isArray(data.products)) {
      throw AppError.validation('Formato inválido: esperado { products: [...], workspace_id: "..." }');
    }

    if (!data.workspace_id) {
      throw AppError.validation('workspace_id é obrigatório');
    }

    const wsMember = await client.query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [data.workspace_id, req.user.id],
    );
    if (wsMember.rows.length === 0) throw AppError.forbidden('Você não pertence a este workspace');
    if (wsMember.rows[0].role === 'viewer') throw AppError.forbidden('Viewers não podem importar');

    await client.query('BEGIN');

    let imported = 0;
    let created = 0;

    for (const p of data.products) {
      if (!p.name || !p.stage_id) continue;

      const stageCheck = await client.query('SELECT id FROM stages WHERE id = $1', [p.stage_id]);
      if (stageCheck.rows.length === 0) continue;

      const { rows } = await client.query(
        `INSERT INTO products (name, stage_id, workspace_id, color, favorite, start_date, supplier, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           stage_id = EXCLUDED.stage_id,
           workspace_id = EXCLUDED.workspace_id,
           color = EXCLUDED.color,
           favorite = EXCLUDED.favorite,
           start_date = EXCLUDED.start_date,
           supplier = EXCLUDED.supplier
         RETURNING id, (xmax = 0) AS is_insert`,
        [p.name, p.stage_id, data.workspace_id, p.color || null, p.favorite || false, p.start_date || null, p.supplier || null, req.user.id],
      );

      const productId = rows[0].id;
      if (rows[0].is_insert) created++; else imported++;

      // Assignees
      if (p.assignee_ids && p.assignee_ids.length > 0) {
        await client.query('DELETE FROM product_assignees WHERE product_id = $1', [productId]);
        for (const uid of p.assignee_ids) {
          await client.query(
            'INSERT INTO product_assignees (product_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [productId, uid, req.user.id],
          );
        }
      }

      // Labels
      if (p.label_ids && p.label_ids.length > 0) {
        await client.query('DELETE FROM product_labels WHERE product_id = $1', [productId]);
        for (const lid of p.label_ids) {
          await client.query(
            'INSERT INTO product_labels (product_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [productId, lid],
          );
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      imported,
      created,
      total: imported + created,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;
