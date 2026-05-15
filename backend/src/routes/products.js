import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { emitToAll, emitToUser } from '../lib/sse.js';
import logger from '../lib/logger.js';
import { checkWorkspaceMember, requireWorkspaceWrite, requireWorkspaceManage, requireWorkspaceMember } from '../lib/workspace.js';

const router = Router();

// Stage transition rules — only forward/backward one step + dead route
const STAGE_TRANSITIONS = {
  separados: ['coletados', 'morto'],
  coletados: ['separados', 'editados', 'morto'],
  editados: ['coletados', 'subir', 'morto'],
  subir: ['editados', 'rodando', 'morto'],
  rodando: ['subir', 'escala', 'morto'],
  escala: ['rodando', 'morto'],
  morto: ['separados'],
};

function canTransition(from, to) {
  const allowed = STAGE_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ===== Helpers =====

async function addActivity(client, data) {
  const { rows } = await client.query(
    `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, payload, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [data.type, data.productId, data.productName, data.byId, data.text, data.snippet || null, data.payload || null, data.workspaceId || null],
  );
  return rows[0].id;
}

async function addActivityTargetsBatch(client, activityId, userIds, reason) {
  if (!userIds || userIds.length === 0) return;
  const values = userIds.flatMap((uid) => [activityId, uid, reason]);
  const placeholders = userIds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
  await client.query(
    `INSERT INTO activity_targets (activity_id, user_id, reason)
     VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

async function addHistory(client, productId, type, text, byId) {
  await client.query(
    'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
    [productId, type, text, byId],
  );
}

async function insertAssigneesBatch(client, productId, userIds, assignedBy) {
  if (!userIds || userIds.length === 0) return;
  const values = userIds.flatMap((uid) => [productId, uid, assignedBy]);
  const placeholders = userIds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
  await client.query(
    `INSERT INTO product_assignees (product_id, user_id, assigned_by)
     VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

async function insertLabelsBatch(client, productId, labelIds) {
  if (!labelIds || labelIds.length === 0) return;
  const values = labelIds.flatMap((lid) => [productId, lid]);
  const placeholders = labelIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  await client.query(
    `INSERT INTO product_labels (product_id, label_id)
     VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );
}

// ===== GET /products =====

router.get('/products', requireAuth, async (req, res, next) => {
  try {
    const { stage, assignee, label, favorite, q, workspace_id, limit: limitStr, offset: offsetStr } = req.query;
    const conditions = ['p.archived_at IS NULL'];
    const values = [];
    let paramCount = 0;

    // Workspace filter — verify membership if explicit workspace_id is provided
    if (workspace_id) {
      await requireWorkspaceMember(pool, workspace_id, req.user.id);
      paramCount++;
      conditions.push(`p.workspace_id = $${paramCount}`);
      values.push(workspace_id);
    } else {
      paramCount++;
      conditions.push(`p.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $${paramCount})`);
      values.push(req.user.id);
    }

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

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      values.slice(0, -2),
    );

    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.stage_id, p.workspace_id, p.color, p.favorite, p.start_date, p.supplier,
         p.created_by, p.reserved_by, p.reserved_at, p.entered_stage_at, p.created_at, p.updated_at,
         ur.name AS reserved_by_name, ur.color AS reserved_by_color,
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
       LEFT JOIN users ur ON ur.id = p.reserved_by
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
         ur.name AS reserved_by_name, ur.color AS reserved_by_color,
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
           (SELECT json_agg(row_to_json(m.*) ORDER BY m.date DESC)
            FROM (SELECT id, product_id, date, time, cost, bid, budget, sales, revenue, cpa, note, logged_by, created_at FROM metrics WHERE product_id = p.id ORDER BY date DESC) m),
           '[]'::json
         ) AS metrics,
         COALESCE(
           (SELECT json_agg(row_to_json(c.*) ORDER BY c.added_at DESC)
            FROM (SELECT id, product_id, folder, name, type, version, status, size, body_text, link, tags, ctr, cpm, spent, added_by, added_at, updated_at FROM creatives WHERE product_id = p.id ORDER BY added_at DESC) c),
           '[]'::json
         ) AS creatives,
         COALESCE(
           (SELECT json_agg(row_to_json(h.*) ORDER BY h.at DESC)
            FROM (SELECT id, type, text, by_id, at FROM product_history WHERE product_id = p.id ORDER BY at DESC) h),
           '[]'::json
         ) AS history
       FROM products p
       LEFT JOIN users ur ON ur.id = p.reserved_by
       WHERE p.id = $1`,
      [id],
    );

    if (rows.length === 0) throw AppError.notFound('Produto não encontrado');

    await checkWorkspaceMember(pool, rows[0].workspace_id, req.user.id);

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
    workspace_id: z.string().uuid(),
    color: z.string().optional(),
    favorite: z.boolean().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    supplier: z.string().optional(),
    assignee_ids: z.array(z.string().uuid()).optional(),
    label_ids: z.array(z.string()).optional(),
  }),
});

router.post('/products', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(createProductSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { name, stage_id, workspace_id, color, favorite, start_date, supplier, assignee_ids, label_ids } = req.validated.body;

    // Verify workspace membership
    const member = await checkWorkspaceMember(client, workspace_id, req.user.id);
    if (member.role === 'viewer') throw AppError.forbidden('Viewers não podem criar produtos');

    const stageCheck = await client.query('SELECT id FROM stages WHERE id = $1', [stage_id]);
    if (stageCheck.rows.length === 0) throw AppError.validation('Estágio inválido');

    const { rows } = await client.query(
      `INSERT INTO products (name, stage_id, workspace_id, color, favorite, start_date, supplier, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, stage_id, workspace_id, color || null, favorite || false, start_date || null, supplier || null, req.user.id],
    );

    const product = rows[0];

    await insertAssigneesBatch(client, product.id, assignee_ids || [], req.user.id);
    await insertLabelsBatch(client, product.id, label_ids || []);

    await addHistory(client, product.id, 'create', 'Produto criado', req.user.id);

    const activityId = await addActivity(client, {
      type: 'create', productId: product.id, productName: product.name,
      byId: req.user.id, text: 'criou o produto', workspaceId: workspace_id,
    });

    if (assignee_ids && assignee_ids.length > 0) {
      const targets = assignee_ids.filter((uid) => uid !== req.user.id);
      await addActivityTargetsBatch(client, activityId, targets, 'assignee');
    }

    await client.query('COMMIT');

    logger.info({ productId: product.id, userId: req.user.id, workspaceId: workspace_id }, 'Product created');
    emitToAll('product.created', { product_id: product.id, workspace_id });

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
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    supplier: z.string().optional().nullable(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/products/:id', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(patchProductSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { name, color, favorite, start_date, supplier } = req.validated.body;

    const old = await client.query(
      'SELECT id, name, color, favorite, start_date, supplier, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (old.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const wsMember = await checkWorkspaceMember(client, old.rows[0].workspace_id, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    const updates = [];
    const values = [];
    const changes = [];
    let p = 0;

    if (name !== undefined && name !== old.rows[0].name) { p++; updates.push(`name = $${p}`); values.push(name); changes.push(`nome alterado`); }
    if (color !== undefined && color !== old.rows[0].color) { p++; updates.push(`color = $${p}`); values.push(color); changes.push(`cor alterada`); }
    if (favorite !== undefined && favorite !== old.rows[0].favorite) { p++; updates.push(`favorite = $${p}`); values.push(favorite); changes.push(favorite ? 'favoritado' : 'desfavoritado'); }
    if (start_date !== undefined) {
      const dateStr = start_date || null;
      if (dateStr !== old.rows[0].start_date) {
        p++; updates.push(`start_date = $${p}`); values.push(dateStr); changes.push(`data de início alterada`);
      }
    }
    if (supplier !== undefined && supplier !== old.rows[0].supplier) { p++; updates.push(`supplier = $${p}`); values.push(supplier); changes.push(`fornecedor alterado`); }

    if (updates.length === 0) {
      await client.query('COMMIT');
      return res.json({ product: old.rows[0] });
    }

    p++; values.push(id);
    const { rows } = await client.query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $${p} AND archived_at IS NULL RETURNING *`,
      values,
    );

    const changeText = changes.join(', ');
    await addHistory(client, id, 'edit', changeText, req.user.id);

    await addActivity(client, {
      type: 'edit', productId: id, productName: rows[0].name,
      byId: req.user.id, text: changeText, workspaceId: old.rows[0].workspace_id,
    });

    await client.query('COMMIT');

    emitToAll('product.updated', { product_id: id, workspace_id: old.rows[0].workspace_id });
    res.json({ product: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== PATCH /products/:id/stage =====

const moveStageSchema = z.object({
  body: z.object({
    stage_id: z.string().min(1),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/products/:id/stage', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(moveStageSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { stage_id } = req.validated.body;

    const stageCheck = await client.query('SELECT id, title FROM stages WHERE id = $1', [stage_id]);
    if (stageCheck.rows.length === 0) throw AppError.validation('Estágio inválido');

    const old = await client.query(
      'SELECT id, name, stage_id, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (old.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const oldStage = old.rows[0].stage_id;
    const wsId = old.rows[0].workspace_id;

    const wsMember = await checkWorkspaceMember(client, wsId, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    if (oldStage === stage_id) {
      await client.query('COMMIT');
      return res.json({ product: old.rows[0], message: 'Produto já está neste estágio' });
    }

    if (!canTransition(oldStage, stage_id)) {
      const allowedList = STAGE_TRANSITIONS[oldStage] || [];
      throw AppError.validation(
        `Transição inválida: de "${oldStage}" para "${stage_id}". Permitido: ${allowedList.join(', ')}`,
      );
    }

    const stageTitle = stageCheck.rows[0].title;

    const { rows } = await client.query(
      'UPDATE products SET stage_id = $1 WHERE id = $2 RETURNING *',
      [stage_id, id],
    );

    await addHistory(client, id, 'move', `Movido para ${stageTitle}`, req.user.id);

    const activityId = await addActivity(client, {
      type: 'move', productId: id, productName: old.rows[0].name,
      byId: req.user.id, text: `moveu para ${stageTitle}`,
      payload: JSON.stringify({ from_stage: oldStage, to_stage: stage_id }),
      workspaceId: wsId,
    });

    const assignees = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const targets = assignees.rows.map((r) => r.user_id).filter((uid) => uid !== req.user.id);
    await addActivityTargetsBatch(client, activityId, targets, 'assignee');

    await client.query('COMMIT');

    emitToAll('activity.new', { activity_id: activityId, product_id: id, workspace_id: wsId });
    emitToAll('product.updated', { product_id: id, workspace_id: wsId });
    res.json({ product: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== DELETE /products/:id (soft delete) =====

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

router.delete('/products/:id', requireAuth, requireRole('admin', 'gestor'), validate(idParamSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;

    // Check product and workspace permission first
    const preCheck = await client.query(
      'SELECT id, name, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (preCheck.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const wsMember = await checkWorkspaceMember(client, preCheck.rows[0].workspace_id, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    const { rows } = await client.query(
      'UPDATE products SET archived_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id, name, workspace_id',
      [id],
    );

    if (rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const activityId = await addActivity(client, {
      type: 'delete', productId: id, productName: rows[0].name,
      byId: req.user.id, text: 'excluiu', workspaceId: rows[0].workspace_id,
    });

    const assignees = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const targets = assignees.rows.map((r) => r.user_id).filter((uid) => uid !== req.user.id);
    await addActivityTargetsBatch(client, activityId, targets, 'assignee');

    await client.query('COMMIT');

    emitToAll('product.deleted', { product_id: id, workspace_id: rows[0].workspace_id });
    res.json({ product: rows[0], deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== POST /products/:id/duplicate =====

router.post('/products/:id/duplicate', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(idParamSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const original = await client.query(
      'SELECT * FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );

    if (original.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const p = original.rows[0];

    const wsMember = await checkWorkspaceMember(client, p.workspace_id, req.user.id);
    requireWorkspaceWrite(wsMember.role);
    const newName = p.name + ' (cópia)';

    const { rows } = await client.query(
      `INSERT INTO products (name, stage_id, workspace_id, color, start_date, supplier, created_by)
       VALUES ($1, 'separados', $2, $3, $4, $5, $6) RETURNING *`,
      [newName, p.workspace_id, p.color, null, p.supplier, req.user.id],
    );

    const newProduct = rows[0];

    await addHistory(client, newProduct.id, 'create', `Duplicado de "${p.name}"`, req.user.id);

    // Copy labels
    await client.query(
      `INSERT INTO product_labels (product_id, label_id)
       SELECT $1, label_id FROM product_labels WHERE product_id = $2
       ON CONFLICT DO NOTHING`,
      [newProduct.id, id],
    );

    // Copy checklist (not done items)
    await client.query(
      `INSERT INTO product_checklist (product_id, item_id, done)
       SELECT $1, item_id, false FROM product_checklist WHERE product_id = $2 AND done = true
       ON CONFLICT DO NOTHING`,
      [newProduct.id, id],
    );

    const activityId = await addActivity(client, {
      type: 'create', productId: newProduct.id, productName: newProduct.name,
      byId: req.user.id, text: 'duplicou um produto', workspaceId: p.workspace_id,
    });

    await client.query('COMMIT');

    logger.info({ productId: newProduct.id, duplicatedFrom: id }, 'Product duplicated');
    emitToAll('product.created', { product_id: newProduct.id, workspace_id: p.workspace_id });

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

router.put('/products/:id/assignees', requireAuth, requireRole('admin', 'gestor'), validate(assigneesSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { userIds } = req.validated.body;

    const product = await client.query(
      'SELECT id, name, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (product.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const wsId = product.rows[0].workspace_id;
    const wsMember = await checkWorkspaceMember(client, wsId, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    const current = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const currentSet = new Set(current.rows.map((r) => r.user_id));
    const newSet = new Set(userIds);

    const added = userIds.filter((uid) => !currentSet.has(uid));
    const removed = [...currentSet].filter((uid) => !newSet.has(uid));

    if (removed.length > 0) {
      await client.query(
        'DELETE FROM product_assignees WHERE product_id = $1 AND user_id = ANY($2)',
        [id, removed],
      );
    }

    await insertAssigneesBatch(client, id, added, req.user.id);

    if (added.length > 0) {
      const activityId = await addActivity(client, {
        type: 'assign', productId: id, productName: product.rows[0].name,
        byId: req.user.id, text: `atribuiu para ${added.length} pessoa(s)`,
        workspaceId: wsId,
      });
      const targets = added.filter((uid) => uid !== req.user.id);
      await addActivityTargetsBatch(client, activityId, targets, 'assignee');
    }

    if (removed.length > 0) {
      const activityId = await addActivity(client, {
        type: 'unassign', productId: id, productName: product.rows[0].name,
        byId: req.user.id, text: `removeu ${removed.length} pessoa(s)`,
        workspaceId: wsId,
      });
      const targets = removed.filter((uid) => uid !== req.user.id);
      await addActivityTargetsBatch(client, activityId, targets, 'assignee');
    }

    await client.query('COMMIT');

    emitToAll('product.updated', { product_id: id, workspace_id: wsId });

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

router.put('/products/:id/labels', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(labelsSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { labelIds } = req.validated.body;

    const prod = await client.query(
      'SELECT id, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (prod.rows.length === 0) throw AppError.notFound('Produto não encontrado');
    const wsId = prod.rows[0].workspace_id;

    const wsMember = await checkWorkspaceMember(client, wsId, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    await client.query('DELETE FROM product_labels WHERE product_id = $1', [id]);
    await insertLabelsBatch(client, id, labelIds);

    await addHistory(client, id, 'edit', `labels atualizadas`, req.user.id);
    await addActivity(client, {
      type: 'edit', productId: id, productName: null,
      byId: req.user.id, text: 'atualizou labels', workspaceId: wsId,
    });

    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
       FROM product_labels pl JOIN labels l ON l.id = pl.label_id
       WHERE pl.product_id = $1`,
      [id],
    );

    emitToAll('product.updated', { product_id: id, workspace_id: wsId });

    res.json({ labels: rows[0]?.json_agg || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
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

router.patch('/products/:id/checklist/:itemId', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(checklistSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id, itemId } = req.validated.params;
    const { done } = req.validated.body;

    const prod = await client.query('SELECT id, name, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL', [id]);
    if (prod.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const wsMember = await checkWorkspaceMember(client, prod.rows[0].workspace_id, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    const { rows } = await client.query(
      `INSERT INTO product_checklist (product_id, item_id, done, done_at, done_by)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END, CASE WHEN $3 THEN $4::uuid ELSE NULL END)
       ON CONFLICT (product_id, item_id)
       DO UPDATE SET done = $3, done_at = CASE WHEN $3 THEN now() ELSE NULL END,
                     done_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       RETURNING *`,
      [id, itemId, done, req.user.id],
    );

    await addHistory(client, id, 'edit', `Checklist "${itemId}" ${done ? 'concluído' : 'reaberto'}`, req.user.id);

    await client.query('COMMIT');

    res.json({ checklist_item: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== GET /products/:id/history =====

router.get('/products/:id/history', requireAuth, validate(idParamSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;

    // Verify product exist and user has access via workspace membership
    const prod = await pool.query(
      'SELECT workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (prod.rows.length === 0) throw AppError.notFound('Produto não encontrado');
    await checkWorkspaceMember(pool, prod.rows[0].workspace_id, req.user.id);

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

// ===== POST /products/:id/reserve =====

router.post('/products/:id/reserve', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(idParamSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;

    const prod = await client.query(
      'SELECT id, name, reserved_by, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (prod.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const wsMember = await checkWorkspaceMember(client, prod.rows[0].workspace_id, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    if (prod.rows[0].reserved_by) {
      // Already reserved — check if by someone else
      if (prod.rows[0].reserved_by !== req.user.id) {
        const { rows: [owner] } = await client.query('SELECT name FROM users WHERE id = $1', [prod.rows[0].reserved_by]);
        throw AppError.conflict(`Produto já está reservado por ${owner?.name || 'outra pessoa'}`);
      }
      // Already reserved by you — nothing to do
      await client.query('COMMIT');
      return res.json({ reserved_by: req.user.id, message: 'Você já reservou este produto' });
    }

    await client.query(
      'UPDATE products SET reserved_by = $1, reserved_at = now() WHERE id = $2',
      [req.user.id, id],
    );

    await addHistory(client, id, 'edit', `Reservado por ${req.user.name}`, req.user.id);
    await addActivity(client, {
      type: 'edit', productId: id, productName: prod.rows[0].name,
      byId: req.user.id, text: 'reservou o produto', workspaceId: prod.rows[0].workspace_id,
    });

    await client.query('COMMIT');

    emitToAll('product.updated', { product_id: id, workspace_id: prod.rows[0].workspace_id });

    res.json({ reserved_by: req.user.id, reserved_at: new Date().toISOString() });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== POST /products/:id/release =====

router.post('/products/:id/release', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(idParamSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;

    const prod = await client.query(
      'SELECT id, name, reserved_by, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (prod.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const wsMember = await checkWorkspaceMember(client, prod.rows[0].workspace_id, req.user.id);
    requireWorkspaceWrite(wsMember.role);

    if (!prod.rows[0].reserved_by) {
      await client.query('COMMIT');
      return res.json({ message: 'Produto não estava reservado' });
    }

    // Only the reserver, gestor, or admin can release
    if (prod.rows[0].reserved_by !== req.user.id && !['admin', 'gestor'].includes(req.user.role)) {
      throw AppError.forbidden('Apenas quem reservou, gestor ou admin pode liberar');
    }

    await client.query(
      'UPDATE products SET reserved_by = NULL, reserved_at = NULL WHERE id = $1',
      [id],
    );

    await addHistory(client, id, 'edit', `Reserva liberada por ${req.user.name}`, req.user.id);
    await addActivity(client, {
      type: 'edit', productId: id, productName: prod.rows[0].name,
      byId: req.user.id, text: 'liberou a reserva', workspaceId: prod.rows[0].workspace_id,
    });

    await client.query('COMMIT');

    emitToAll('product.updated', { product_id: id, workspace_id: prod.rows[0].workspace_id });

    res.json({ released: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;
