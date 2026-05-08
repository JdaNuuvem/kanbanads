import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { emitToAll } from '../lib/sse.js';
import logger from '../lib/logger.js';

const router = Router();

// ===== Helpers =====

async function addActivity(client, data) {
  const { rows } = await client.query(
    `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [data.type, data.productId, data.productName, data.byId, data.text, data.snippet || null, data.payload || null],
  );
  return rows[0].id;
}

async function addActivityTargets(client, activityId, userIds, reason) {
  for (const uid of userIds) {
    await client.query(
      `INSERT INTO activity_targets (activity_id, user_id, reason)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [activityId, uid, reason],
    );
  }
}

// ===== GET /products =====

router.get('/products', requireAuth, async (req, res, next) => {
  try {
    const { stage, assignee, label, favorite, q, limit: limitStr, offset: offsetStr } = req.query;
    const conditions = ['p.archived_at IS NULL'];
    const values = [];
    let paramCount = 0;

    if (stage) {
      paramCount++;
      conditions.push(`p.stage_id = $${paramCount}`);
      values.push(stage);
    }
    if (favorite === 'true') {
      conditions.push('p.favorite = true');
    }
    if (assignee) {
      paramCount++;
      conditions.push(`EXISTS(SELECT 1 FROM product_assignees pa WHERE pa.product_id = p.id AND pa.user_id = $${paramCount})`);
      values.push(assignee);
    }
    if (label) {
      paramCount++;
      conditions.push(`EXISTS(SELECT 1 FROM product_labels pl WHERE pl.product_id = p.id AND pl.label_id = $${paramCount})`);
      values.push(label);
    }
    if (q) {
      paramCount++;
      conditions.push(`p.name ILIKE $${paramCount}`);
      values.push(`%${q}%`);
    }

    const limit = Math.min(parseInt(limitStr) || 100, 500);
    const offset = parseInt(offsetStr) || 0;

    paramCount++;
    const limitPh = `$${paramCount}`; values.push(limit);
    paramCount++;
    const offsetPh = `$${paramCount}`; values.push(offset);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      values.slice(0, -2),
    );

    // Get products with assignee count
    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.stage_id, p.color, p.favorite, p.start_date, p.supplier,
         p.created_by, p.entered_stage_at, p.created_at, p.updated_at,
         COALESCE(
           (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'role', u.role))
            FROM product_assignees pa JOIN users u ON u.id = pa.user_id
            WHERE pa.product_id = p.id),
           '[]'::json
         ) AS assignees,
         COALESCE(
           (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
            FROM product_labels pl JOIN labels l ON l.id = pl.label_id
            WHERE pl.product_id = p.id),
           '[]'::json
         ) AS labels,
         COALESCE(
           (SELECT json_object_agg(pc.item_id, json_build_object('done', pc.done, 'done_at', pc.done_at, 'done_by', pc.done_by))
            FROM product_checklist pc WHERE pc.product_id = p.id),
           '{}'::json
         ) AS checklist
       FROM products p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ${limitPh} OFFSET ${offsetPh}`,
      values,
    );

    res.json({
      products: rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) { next(err); }
});

// ===== GET /products/:id =====

router.get('/products/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
         p.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'role', u.role))
            FROM product_assignees pa JOIN users u ON u.id = pa.user_id
            WHERE pa.product_id = p.id),
           '[]'::json
         ) AS assignees,
         COALESCE(
           (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
            FROM product_labels pl JOIN labels l ON l.id = pl.label_id
            WHERE pl.product_id = p.id),
           '[]'::json
         ) AS labels,
         COALESCE(
           (SELECT json_object_agg(pc.item_id, json_build_object('done', pc.done, 'done_at', pc.done_at, 'done_by', pc.done_by))
            FROM product_checklist pc WHERE pc.product_id = p.id),
           '{}'::json
         ) AS checklist,
         COALESCE(
           (SELECT json_agg(row_to_json(m.*) ORDER BY m.created_at DESC)
            FROM (SELECT id, product_id, date, time, cost, bid, budget, sales, revenue, cpa, note, logged_by, created_at FROM metrics WHERE product_id = p.id ORDER BY date DESC) m),
           '[]'::json
         ) AS metrics,
         COALESCE(
           (SELECT json_agg(row_to_json(c.*) ORDER BY c.created_at DESC)
            FROM (SELECT id, product_id, folder, name, type, version, status, size, body_text, link, tags, ctr, cpm, spent, added_by, added_at, updated_at FROM creatives WHERE product_id = p.id ORDER BY created_at DESC) c),
           '[]'::json
         ) AS creatives,
         COALESCE(
           (SELECT json_agg(row_to_json(h.*) ORDER BY h.at DESC)
            FROM (SELECT id, type, text, by_id, at FROM product_history WHERE product_id = p.id ORDER BY at DESC) h),
           '[]'::json
         ) AS history
       FROM products p
       WHERE p.id = $1`,
      [id],
    );

    if (rows.length === 0) throw AppError.notFound('Produto não encontrado');

    // Aggregate metrics
    const { rows: agg } = await pool.query(
      'SELECT * FROM v_product_metrics WHERE product_id = $1',
      [id],
    );

    res.json({
      product: { ...rows[0], metrics_aggregate: agg[0] || null },
    });
  } catch (err) { next(err); }
});

// ===== POST /products =====

const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    stage_id: z.string().min(1),
    color: z.string().optional(),
    favorite: z.boolean().optional(),
    start_date: z.string().optional(),
    supplier: z.string().optional(),
    assignee_ids: z.array(z.string().uuid()).optional(),
    label_ids: z.array(z.string()).optional(),
  }),
});

router.post('/products', requireAuth, validate(createProductSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { name, stage_id, color, favorite, start_date, supplier, assignee_ids, label_ids } = req.validated.body;

    const stageCheck = await client.query('SELECT id FROM stages WHERE id = $1', [stage_id]);
    if (stageCheck.rows.length === 0) throw AppError.validation('Estágio inválido');

    const { rows } = await client.query(
      `INSERT INTO products (name, stage_id, color, favorite, start_date, supplier, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, stage_id, color || null, favorite || false, start_date ? new Date(start_date).toISOString().slice(0, 10) : null, supplier || null, req.user.id],
    );

    const product = rows[0];

    // Add assignees
    if (assignee_ids && assignee_ids.length > 0) {
      for (const uid of assignee_ids) {
        await client.query(
          'INSERT INTO product_assignees (product_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [product.id, uid, req.user.id],
        );
      }
    }

    // Add labels
    if (label_ids && label_ids.length > 0) {
      for (const lid of label_ids) {
        await client.query(
          'INSERT INTO product_labels (product_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [product.id, lid],
        );
      }
    }

    // Add history
    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [product.id, 'create', 'Produto criado', req.user.id],
    );

    // Activity
    const activityId = await addActivity(client, {
      type: 'create', productId: product.id, productName: product.name,
      byId: req.user.id, text: 'criou o produto',
    });

    if (assignee_ids && assignee_ids.length > 0) {
      const targets = assignee_ids.filter((uid) => uid !== req.user.id);
      await addActivityTargets(client, activityId, targets, 'assignee');
    }

    await client.query('COMMIT');

    logger.info({ productId: product.id, userId: req.user.id }, 'Product created');
    emitToAll('product.created', { product_id: product.id });

    res.status(201).json({ product });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== PATCH /products/:id =====

const patchProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    color: z.string().optional(),
    favorite: z.boolean().optional(),
    start_date: z.string().optional().nullable(),
    supplier: z.string().optional().nullable(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/products/:id', requireAuth, validate(patchProductSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { name, color, favorite, start_date, supplier } = req.validated.body;

    const updates = [];
    const values = [];
    let p = 0;

    if (name !== undefined) { p++; updates.push(`name = $${p}`); values.push(name); }
    if (color !== undefined) { p++; updates.push(`color = $${p}`); values.push(color); }
    if (favorite !== undefined) { p++; updates.push(`favorite = $${p}`); values.push(favorite); }
    if (start_date !== undefined) {
      p++;
      updates.push(`start_date = $${p}`);
      values.push(start_date ? new Date(start_date).toISOString().slice(0, 10) : null);
    }
    if (supplier !== undefined) { p++; updates.push(`supplier = $${p}`); values.push(supplier); }

    if (updates.length === 0) throw AppError.validation('Nada para atualizar');

    p++; values.push(id);
    const { rows } = await pool.query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${p} AND archived_at IS NULL RETURNING *`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Produto não encontrado');

    emitToAll('product.updated', { product_id: id });
    res.json({ product: rows[0] });
  } catch (err) { next(err); }
});

// ===== PATCH /products/:id/stage =====

const moveStageSchema = z.object({
  body: z.object({
    stage_id: z.string().min(1),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/products/:id/stage', requireAuth, validate(moveStageSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { stage_id } = req.validated.body;

    const stageCheck = await client.query('SELECT id, title FROM stages WHERE id = $1', [stage_id]);
    if (stageCheck.rows.length === 0) throw AppError.validation('Estágio inválido');

    const old = await client.query(
      'SELECT id, name, stage_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (old.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const oldStage = old.rows[0].stage_id;
    const stageTitle = stageCheck.rows[0].title;

    // The trigger handles entered_stage_at
    const { rows } = await client.query(
      'UPDATE products SET stage_id = $1 WHERE id = $2 RETURNING *',
      [stage_id, id],
    );

    // History
    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [id, 'move', `Movido para ${stageTitle}`, req.user.id],
    );

    // Activity
    const activityId = await addActivity(client, {
      type: 'move', productId: id, productName: old.rows[0].name,
      byId: req.user.id, text: `moveu para ${stageTitle}`,
      payload: JSON.stringify({ from_stage: oldStage, to_stage: stage_id }),
    });

    // Notify assignees
    const assignees = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const targets = assignees.rows.map((r) => r.user_id).filter((uid) => uid !== req.user.id);
    if (targets.length > 0) {
      await addActivityTargets(client, activityId, targets, 'watcher');
    }

    await client.query('COMMIT');

    emitToAll('activity.new', { activity_id: activityId, product_id: id });
    res.json({ product: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== DELETE /products/:id (soft delete) =====

router.delete('/products/:id', requireAuth, requireRole('admin', 'gestor'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { rows } = await client.query(
      'UPDATE products SET archived_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id, name',
      [id],
    );

    if (rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const activityId = await addActivity(client, {
      type: 'delete', productId: null, productName: rows[0].name,
      byId: req.user.id, text: 'excluiu',
    });

    const assignees = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const targets = assignees.rows.map((r) => r.user_id).filter((uid) => uid !== req.user.id);
    if (targets.length > 0) {
      await addActivityTargets(client, activityId, targets, 'watcher');
    }

    await client.query('COMMIT');

    emitToAll('product.deleted', { product_id: id });
    res.json({ product: rows[0], deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== POST /products/:id/duplicate =====

router.post('/products/:id/duplicate', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const original = await client.query(
      'SELECT * FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );

    if (original.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const p = original.rows[0];
    const newName = p.name + ' (cópia)';

    const { rows } = await client.query(
      `INSERT INTO products (name, stage_id, color, favorite, start_date, supplier, created_by)
       VALUES ($1, 'separados', $2, false, $3, $4, $5) RETURNING *`,
      [newName, p.color, p.start_date, p.supplier, req.user.id],
    );

    const newProduct = rows[0];

    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [newProduct.id, 'create', `Duplicado de "${p.name}"`, req.user.id],
    );

    // Copy labels
    await client.query(
      `INSERT INTO product_labels (product_id, label_id)
       SELECT $1, label_id FROM product_labels WHERE product_id = $2
       ON CONFLICT DO NOTHING`,
      [newProduct.id, id],
    );

    const activityId = await addActivity(client, {
      type: 'create', productId: newProduct.id, productName: newProduct.name,
      byId: req.user.id, text: 'duplicou um produto',
    });

    await client.query('COMMIT');

    logger.info({ productId: newProduct.id, duplicatedFrom: id }, 'Product duplicated');
    emitToAll('product.created', { product_id: newProduct.id });

    res.status(201).json({ product: newProduct });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== PUT /products/:id/assignees =====

const assigneesSchema = z.object({
  body: z.object({
    userIds: z.array(z.string().uuid()),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.put('/products/:id/assignees', requireAuth, validate(assigneesSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { userIds } = req.validated.body;

    // Verify product exists
    const product = await client.query(
      'SELECT id, name FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (product.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    // Get current assignees
    const current = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const currentSet = new Set(current.rows.map((r) => r.user_id));
    const newSet = new Set(userIds);

    const added = userIds.filter((uid) => !currentSet.has(uid));
    const removed = [...currentSet].filter((uid) => !newSet.has(uid));

    // Remove
    if (removed.length > 0) {
      await client.query(
        'DELETE FROM product_assignees WHERE product_id = $1 AND user_id = ANY($2)',
        [id, removed],
      );
    }

    // Add
    for (const uid of added) {
      await client.query(
        'INSERT INTO product_assignees (product_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [id, uid, req.user.id],
      );
    }

    // Activity for additions
    if (added.length > 0) {
      const activityId = await addActivity(client, {
        type: 'assign', productId: id, productName: product.rows[0].name,
        byId: req.user.id, text: `atribuiu para ${added.length} pessoa(s)`,
      });
      const targets = added.filter((uid) => uid !== req.user.id);
      if (targets.length > 0) {
        await addActivityTargets(client, activityId, targets, 'assignee');
      }
    }

    // Activity for removals
    if (removed.length > 0) {
      const activityId = await addActivity(client, {
        type: 'unassign', productId: id, productName: product.rows[0].name,
        byId: req.user.id, text: `removeu ${removed.length} pessoa(s)`,
      });
      const targets = removed.filter((uid) => uid !== req.user.id);
      if (targets.length > 0) {
        await addActivityTargets(client, activityId, targets, 'assignee');
      }
    }

    await client.query('COMMIT');

    emitToAll('product.updated', { product_id: id });

    // Return updated list
    const final = await pool.query(
      `SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'role', u.role))
       FROM product_assignees pa JOIN users u ON u.id = pa.user_id
       WHERE pa.product_id = $1`,
      [id],
    );

    res.json({ assignees: final.rows[0]?.json_agg || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== PUT /products/:id/labels =====

const labelsSchema = z.object({
  body: z.object({
    labelIds: z.array(z.string()),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.put('/products/:id/labels', requireAuth, validate(labelsSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { labelIds } = req.validated.body;

    await pool.query('DELETE FROM product_labels WHERE product_id = $1', [id]);

    for (const lid of labelIds) {
      await pool.query(
        'INSERT INTO product_labels (product_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, lid],
      );
    }

    const { rows } = await pool.query(
      `SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
       FROM product_labels pl JOIN labels l ON l.id = pl.label_id
       WHERE pl.product_id = $1`,
      [id],
    );

    emitToAll('product.updated', { product_id: id });

    res.json({ labels: rows[0]?.json_agg || [] });
  } catch (err) { next(err); }
});

// ===== PATCH /products/:id/checklist/:itemId =====

const checklistSchema = z.object({
  body: z.object({
    done: z.boolean(),
  }),
  params: z.object({
    id: z.string().uuid(),
    itemId: z.string().min(1),
  }),
});

router.patch('/products/:id/checklist/:itemId', requireAuth, validate(checklistSchema), async (req, res, next) => {
  try {
    const { id, itemId } = req.validated.params;
    const { done } = req.validated.body;

    const { rows } = await pool.query(
      `INSERT INTO product_checklist (product_id, item_id, done, done_at, done_by)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END, CASE WHEN $3 THEN $4 ELSE NULL END)
       ON CONFLICT (product_id, item_id)
       DO UPDATE SET done = $3, done_at = CASE WHEN $3 THEN now() ELSE NULL END,
                     done_by = CASE WHEN $3 THEN $4 ELSE NULL END
       RETURNING *`,
      [id, itemId, done, req.user.id],
    );

    res.json({ checklist_item: rows[0] });
  } catch (err) { next(err); }
});

// ===== GET /products/:id/history =====

router.get('/products/:id/history', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT h.id, h.type, h.text, h.by_id, h.at,
              u.name AS by_name, u.color AS by_color
       FROM product_history h
       LEFT JOIN users u ON u.id = h.by_id
       WHERE h.product_id = $1
       ORDER BY h.at DESC`,
      [id],
    );

    res.json({ history: rows });
  } catch (err) { next(err); }
});

export default router;
