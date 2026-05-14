import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// GET /
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { unreadOnly, limit: limitStr, offset: offsetStr } = req.query;

    const conditions = ['n.user_id = $1'];
    const values = [req.user.id];
    let p = 1;

    if (unreadOnly === 'true') {
      conditions.push('n.read = false');
    }

    const limit = Math.min(parseInt(limitStr) || 100, 500);
    const offset = parseInt(offsetStr) || 0;

    p++; const limitPh = `$${p}`; values.push(limit);
    p++; const offsetPh = `$${p}`; values.push(offset);

    const { rows } = await pool.query(
      `SELECT
         n.id, n.user_id, n.activity_id, n.reason, n.read, n.read_at, n.created_at,
         a.type AS activity_type, a.text, a.snippet, a.product_id, a.product_name, a.at AS activity_at,
         u.name AS by_name, u.color AS by_color
       FROM notifications n
       JOIN activity a ON a.id = n.activity_id
       LEFT JOIN users u ON u.id = a.by_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY n.created_at DESC
       LIMIT ${limitPh} OFFSET ${offsetPh}`,
      values,
    );

    // Total count
    const countWhere = conditions.join(' AND ');
    const countValues = values.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM notifications n WHERE ${countWhere}`,
      countValues,
    );

    res.json({
      notifications: rows,
      total: parseInt(countRows[0].count),
    });
  } catch (err) { next(err); }
});

// GET /count
router.get('/count', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT unread FROM v_unread_counts WHERE user_id = $1',
      [req.user.id],
    );
    res.json({ unread: rows.length > 0 ? parseInt(rows[0].unread) : 0 });
  } catch (err) { next(err); }
});

// PATCH /:id/read
router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE notifications SET read = true, read_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, read, read_at`,
      [id, req.user.id],
    );

    if (rows.length === 0) throw AppError.notFound('Notificação não encontrada');
    res.json({ notification: rows[0] });
  } catch (err) { next(err); }
});

// POST /read-all
router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET read = true, read_at = now()
       WHERE user_id = $1 AND read = false`,
      [req.user.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id],
    );

    if (rows.length === 0) throw AppError.notFound('Notificação não encontrada');
    res.json({ id: rows[0].id, deleted: true });
  } catch (err) { next(err); }
});

export default router;
