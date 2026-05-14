import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { emitToUser, emitToAll } from '../lib/sse.js';

const router = Router();

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
    text: z.string().min(1).max(5000),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.post('/products/:id/comments', requireAuth, requireRole('admin', 'gestor', 'editor'), validate(createCommentSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { text } = req.validated.body;

    const product = await client.query(
      'SELECT id, name, workspace_id FROM products WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    if (product.rows.length === 0) throw AppError.notFound('Produto não encontrado');

    const { rows: commentRows } = await client.query(
      'INSERT INTO comments (product_id, author_id, body) VALUES ($1, $2, $3) RETURNING *',
      [id, req.user.id, text],
    );

    const comment = commentRows[0];

    const mentionedNames = parseMentions(text);
    const mentionedIds = [];

    if (mentionedNames.length > 0) {
      const { rows: userRows } = await client.query(
        'SELECT id, name FROM users WHERE LOWER(name) = ANY($1) AND active = true',
        [mentionedNames],
      );

      if (userRows.length > 0) {
        mentionedIds.push(...userRows.map((u) => u.id));

        for (const uid of mentionedIds) {
          await client.query(
            'INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [comment.id, uid],
          );
        }
      }
    }

    // Comment activity (for the feed)
    const { rows: actRows } = await client.query(
      `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      ['comment', id, product.rows[0].name, req.user.id, 'comentou em', text.length > 100 ? text.slice(0, 100) + '...' : text, product.rows[0].workspace_id],
    );

    const commentActivityId = actRows[0].id;

    // Create activity_targets for watchers (assignees who are not the commenter)
    // This makes the comment appear in personal feeds of product assignees
    const assignees = await client.query(
      'SELECT user_id FROM product_assignees WHERE product_id = $1',
      [id],
    );
    const watchers = assignees.rows.map((r) => r.user_id).filter((uid) => uid !== req.user.id);
    if (watchers.length > 0) {
      for (const uid of watchers) {
        await client.query(
          'INSERT INTO activity_targets (activity_id, user_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [commentActivityId, uid, 'comment_on_mine'],
        );
      }
    }

    // Mention activities + targets (one per mentioned user)
    const mentionEvents = [];
    for (const uid of mentionedIds) {
      if (uid === req.user.id) continue;

      const { rows: mentionAct } = await client.query(
        `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        ['mention', id, product.rows[0].name, req.user.id, 'mencionou em', text.length > 100 ? text.slice(0, 100) + '...' : text, product.rows[0].workspace_id],
      );

      await client.query(
        'INSERT INTO activity_targets (activity_id, user_id, reason) VALUES ($1, $2, $3)',
        [mentionAct.rows[0].id, uid, 'mention'],
      );

      mentionEvents.push({ uid, activity_id: mentionAct.rows[0].id });
    }

    await client.query(
      'INSERT INTO product_history (product_id, type, text, by_id) VALUES ($1, $2, $3, $4)',
      [id, 'comment', text.length > 200 ? text.slice(0, 200) + '...' : text, req.user.id],
    );

    await client.query('COMMIT');

    for (const evt of mentionEvents) {
      emitToUser(evt.uid, 'notification.new', {
        activity_id: evt.activity_id,
        type: 'mention',
        product_id: id,
        product_name: product.rows[0].name,
        by_name: req.user.name,
        workspace_id: product.rows[0].workspace_id,
      });
    }

    emitToAll('activity.new', { activity_id: commentActivityId, product_id: id, workspace_id: product.rows[0].workspace_id });

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
    text: z.string().min(1).max(5000),
  }),
  params: z.object({ id: z.string().uuid() }),
});

router.patch('/comments/:id', requireAuth, validate(patchCommentSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.validated.params;
    const { text } = req.validated.body;

    const comment = await client.query(
      'SELECT id, author_id FROM comments WHERE id = $1',
      [id],
    );

    if (comment.rows.length === 0) throw AppError.notFound('Comentário não encontrado');
    if (comment.rows[0].author_id !== req.user.id) {
      throw AppError.forbidden('Só o autor pode editar o comentário');
    }

    const { rows } = await client.query(
      'UPDATE comments SET body = $1, edited_at = now() WHERE id = $2 RETURNING *',
      [text, id],
    );

    // Re-parse mentions on edit — clear old, insert new
    await client.query('DELETE FROM comment_mentions WHERE comment_id = $1', [id]);

    const mentionedNames = parseMentions(text);
    if (mentionedNames.length > 0) {
      const { rows: userRows } = await client.query(
        'SELECT id FROM users WHERE LOWER(name) = ANY($1) AND active = true',
        [mentionedNames],
      );
      if (userRows.length > 0) {
        for (const uid of userRows.map((u) => u.id)) {
          await client.query(
            'INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, uid],
          );
        }
      }
    }

    await client.query('COMMIT');

    res.json({ comment: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ===== DELETE /comments/:id =====

router.delete('/comments/:id', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    const comment = await client.query(
      'SELECT c.id, c.author_id, c.product_id, p.name AS product_name, p.workspace_id FROM comments c LEFT JOIN products p ON p.id = c.product_id WHERE c.id = $1',
      [id],
    );

    if (comment.rows.length === 0) throw AppError.notFound('Comentário não encontrado');

    // Author, gestor, or admin can delete
    if (comment.rows[0].author_id !== req.user.id && !['admin', 'gestor'].includes(req.user.role)) {
      throw AppError.forbidden('Sem permissão para excluir');
    }

    await client.query('DELETE FROM comments WHERE id = $1', [id]);

    // Log activity
    if (comment.rows[0].product_id) {
      await client.query(
        `INSERT INTO activity (type, product_id, product_name, by_id, text, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['delete', comment.rows[0].product_id, comment.rows[0].product_name, req.user.id, 'comentário excluído', comment.rows[0].workspace_id],
      );
    }

    await client.query('COMMIT');

    res.json({ id, deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;
