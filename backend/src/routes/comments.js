import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { emitToUser, emitToAll } from '../lib/sse.js';
import logger from '../lib/logger.js';

const router = Router();

// @mention parser
function parseMentions(text) {
  const re = /@([\w\u00C0-\u00FF-]+)/g;
  const names = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    names.push(m[1].toLowerCase());
  }
  return [...new Set(names)];
}

// ===== GET /products/:id/comments =====

router.get('/products/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
         c.id, c.product_id, c.author_id, c.body, c.edited_at, c.created_at,
         u.name AS author_name, u.color AS author_color,
         COALESCE(
           (SELECT json_agg(json_build_object('user_id', cm.user_id, 'name', mu.name))
            FROM comment_mentions cm JOIN users mu ON mu.id = cm.user_id
            WHERE cm.comment_id = c.id),
           '[]'::json
         ) AS mentions
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.product_id = $1
       ORDER BY c.created_at DESC`,
      [id],
    );

    res.json({ comments: rows });
  } catch (err) { next(err); }
});

// ===== POST /products/:id/comments =====

const createCommentSchema = z.object({
  body: z.object({
    text: z.string().min(1),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.post('/products/:id/comments', requireAuth, validate(createCommentSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { text } = req.validated.body;

    // Verify product
    const product = await client.query(
      'SELECT id, name FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (product.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    // Insert comment
    const { rows: commentRows } = await client.query(
      'INSERT INTO comments (product_id, author_id, body) VALUES ($1, $2, $3) RETURNING *',
      [id, req.user.id, text],
    );

    const comment = commentRows[0];

    // Parse @mentions
    const mentionedNames = parseMentions(text);
    const mentionedIds = [];

    if (mentionedNames.length > 0) {
      const { rows: userRows } = await client.query(
        'SELECT id, name FROM users WHERE LOWER(name) = ANY($1) AND active = true',
        [mentionedNames],
      );

      if (userRows.length > 0) {
        mentionedIds.push(...userRows.map((u) => u.id));

        // Insert comment_mentions
        for (const uid of mentionedIds) {
          await client.query(
            'INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [comment.id, uid],
          );
        }
      }
    }

    // Create comment activity
    const { rows: actRows } = await client.query(
      `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['comment', id, product.rows[0].name, req.user.id, 'comentou em', text.length > 100 ? text.slice(0, 100) + '...' : text],
    );

    const commentActivityId = actRows[0].id;

    // Create mention activities + targets (one per mentioned user)
    for (const uid of mentionedIds) {
      if (uid === req.user.id) continue;

      const { rows: mentionAct } = await client.query(
        `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        ['mention', id, product.rows[0].name, req.user.id, 'mencionou em', text.length > 100 ? text.slice(0, 100) + '...' : text],
      );

      await client.query(
        'INSERT INTO activity_targets (activity_id, user_id, reason) VALUES ($1, $2, $3)',
        [mentionAct.rows[0].id, uid, 'mention'],
      );

      emitToUser(uid, 'notification.new', {
        activity_id: mentionAct.rows[0].id,
        type: 'mention',
        product_id: id,
        product_name: product.rows[0].name,
        by_name: req.user.name,
      });
    }

    // Add product_history for the comment
    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [id, 'comment', text.length > 200 ? text.slice(0, 200) + '...' : text, req.user.id],
    );

    await client.query('COMMIT');

    emitToAll('activity.new', { activity_id: commentActivityId, product_id: id });

    res.status(201).json({ comment: { ...comment, mentions: mentionedIds } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== PATCH /comments/:id =====

const patchCommentSchema = z.object({
  body: z.object({
    text: z.string().min(1),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/comments/:id', requireAuth, validate(patchCommentSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { text } = req.validated.body;

    // Only author can edit
    const comment = await pool.query(
      'SELECT id, author_id FROM comments WHERE id = $1',
      [id],
    );

    if (comment.rows.length === 0) throw AppError.notFound('Comentário não encontrado');
    if (comment.rows[0].author_id !== req.user.id) {
      throw AppError.forbidden('Só o autor pode editar o comentário');
    }

    const { rows } = await pool.query(
      'UPDATE comments SET body = $1, edited_at = now() WHERE id = $2 RETURNING *',
      [text, id],
    );

    res.json({ comment: rows[0] });
  } catch (err) { next(err); }
});

// ===== DELETE /comments/:id =====

router.delete('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const comment = await pool.query(
      'SELECT id, author_id FROM comments WHERE id = $1',
      [id],
    );

    if (comment.rows.length === 0) throw AppError.notFound('Comentário não encontrado');

    // Author or admin can delete
    if (comment.rows[0].author_id !== req.user.id && req.user.role !== 'admin') {
      throw AppError.forbidden('Sem permissão para excluir');
    }

    await pool.query('DELETE FROM comments WHERE id = $1', [id]);
    res.json({ id, deleted: true });
  } catch (err) { next(err); }
});

export default router;
