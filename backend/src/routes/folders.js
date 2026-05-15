import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { requireWorkspaceMember } from '../lib/workspace.js';
import { emitToAll } from '../lib/sse.js';

const router = Router();

const createFolderSchema = z.object({
  body: z.object({
    workspace_id: z.string().uuid(),
    name: z.string().min(1).max(30).regex(/^[A-Z0-9\u00C0-\u00FF _-]+$/i, 'Nome inválido'),
  }),
});

const deleteFolderSchema = z.object({
  params: z.object({ name: z.string().min(1) }),
  query: z.object({ workspace_id: z.string().uuid() }),
});

// GET /folders?workspace_id=
router.get('/folders', requireAuth, async (req, res, next) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) throw AppError.validation('workspace_id é obrigatório');
    await requireWorkspaceMember(pool, workspace_id, req.user.id);

    let { rows } = await pool.query(
      'SELECT name, position FROM folders WHERE workspace_id = $1 ORDER BY position, name',
      [workspace_id],
    );

    // Auto-seed default folders if none exist for this workspace
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO folders (workspace_id, name, position)
         VALUES ($1, 'CA1', 1), ($1, 'CA2', 2), ($1, 'CA3', 3), ($1, 'CA4', 4),
                ($1, 'UPSELLS', 5), ($1, 'SOURCES', 6), ($1, 'VARIAÇÕES', 7)
         ON CONFLICT (workspace_id, name) DO NOTHING`,
        [workspace_id],
      );
      ({ rows } = await pool.query(
        'SELECT name, position FROM folders WHERE workspace_id = $1 ORDER BY position, name',
        [workspace_id],
      ));
    }

    res.json({ folders: rows });
  } catch (err) { next(err); }
});

// POST /folders
router.post('/folders', requireAuth, requireRole('admin', 'gestor'), validate(createFolderSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { workspace_id, name } = req.validated.body;
    await requireWorkspaceMember(client, workspace_id, req.user.id);

    const upperName = name.toUpperCase();

    const { rows } = await client.query(
      `INSERT INTO folders (workspace_id, name, position)
       VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM folders WHERE workspace_id = $1), 1))
       ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING name, position`,
      [workspace_id, upperName],
    );

    emitToAll('folders.updated', { workspace_id });
    res.status(201).json({ folder: rows[0] });
  } catch (err) { next(err); } finally { client.release(); }
});

// DELETE /folders/:name?workspace_id=
router.delete('/folders/:name', requireAuth, requireRole('admin', 'gestor'), validate(deleteFolderSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name } = req.validated.params;
    const { workspace_id } = req.validated.query;
    await requireWorkspaceMember(client, workspace_id, req.user.id);

    await client.query('BEGIN');

    const folderCheck = await client.query(
      'SELECT 1 FROM folders WHERE workspace_id = $1 AND name = $2',
      [workspace_id, name],
    );
    if (folderCheck.rows.length === 0) throw AppError.notFound('Pasta não encontrada');

    await client.query(
      'DELETE FROM creatives WHERE product_id IN (SELECT id FROM products WHERE workspace_id = $1) AND folder = $2',
      [workspace_id, name],
    );

    await client.query(
      'DELETE FROM folders WHERE workspace_id = $1 AND name = $2',
      [workspace_id, name],
    );

    await client.query('COMMIT');

    emitToAll('folders.updated', { workspace_id });
    res.json({ deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

export default router;
