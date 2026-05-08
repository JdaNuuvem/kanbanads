import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /activity — cursor pagination
router.get('/activity', requireAuth, async (req, res, next) => {
  try {
    const { type, user, product, from, to, limit: limitStr, cursor } = req.query;
    const conditions = [];
    const values = [];
    let p = 0;

    if (type) { p++; conditions.push(`a.type = $${p}`); values.push(type); }
    if (user) { p++; conditions.push(`a.by_id = $${p}`); values.push(user); }
    if (product) { p++; conditions.push(`a.product_id = $${p}`); values.push(product); }
    if (from) { p++; conditions.push(`a.at >= $${p}`); values.push(from); }
    if (to) { p++; conditions.push(`a.at <= $${p}`); values.push(to); }

    // Cursor: format is "timestamp;id"
    if (cursor) {
      const [cursorAt, cursorId] = cursor.split(';');
      if (cursorAt && cursorId) {
        p++; p++;
        conditions.push(`(a.at, a.id) < ($${p - 1}::timestamptz, $${p}::uuid)`);
        values.push(cursorAt, cursorId);
      }
    }

    const limit = Math.min(parseInt(limitStr) || 50, 200);

    p++; const limitPh = `$${p}`; values.push(limit + 1);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         a.id, a.type, a.product_id, a.product_name, a.by_id, a.text, a.snippet, a.payload, a.at,
         u.name AS by_name, u.color AS by_color
       FROM activity a
       LEFT JOIN users u ON u.id = a.by_id
       ${where}
       ORDER BY a.at DESC, a.id DESC
       LIMIT ${limitPh}`,
      values,
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor = items.length > 0 && hasMore
      ? `${items[items.length - 1].at.toISOString()};${items[items.length - 1].id}`
      : null;

    res.json({
      activity: items,
      nextCursor,
      hasMore,
    });
  } catch (err) { next(err); }
});

// GET /activity/me — personal feed
router.get('/activity/me', requireAuth, async (req, res, next) => {
  try {
    const { limit: limitStr, cursor } = req.query;
    const limit = Math.min(parseInt(limitStr) || 50, 200);
    const values = [req.user.id];

    let cursorCondition = '';
    if (cursor) {
      const [cursorAt, cursorId] = cursor.split(';');
      if (cursorAt && cursorId) {
        cursorCondition = 'AND (a.at, a.id) < ($2::timestamptz, $3::uuid)';
        values.push(cursorAt, cursorId);
      }
    }

    values.push(limit + 1);
    const limitPh = `$${values.length}`;

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (a.id)
         a.id, a.type, a.product_id, a.product_name, a.by_id, a.text, a.snippet, a.payload, a.at,
         u.name AS by_name, u.color AS by_color
       FROM activity a
       JOIN activity_targets at ON at.activity_id = a.id
       LEFT JOIN users u ON u.id = a.by_id
       WHERE at.user_id = $1 ${cursorCondition}
       ORDER BY a.at DESC, a.id DESC
       LIMIT ${limitPh}`,
      values,
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor = items.length > 0 && hasMore
      ? `${items[items.length - 1].at.toISOString()};${items[items.length - 1].id}`
      : null;

    res.json({
      activity: items,
      nextCursor,
      hasMore,
    });
  } catch (err) { next(err); }
});

export default router;
