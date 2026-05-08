import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// GET /me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /me
const patchMeSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().optional(),
    password: z.string().min(6).optional(),
  }),
});

router.patch('/me', requireAuth, validate(patchMeSchema), async (req, res, next) => {
  try {
    const { name, color, password } = req.validated.body;
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(name);
    }
    if (color !== undefined) {
      paramCount++;
      updates.push(`color = $${paramCount}`);
      values.push(color);
    }
    if (password !== undefined) {
      paramCount++;
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramCount}`);
      values.push(hash);
    }

    if (updates.length === 0) return res.json({ user: req.user });

    paramCount++;
    values.push(req.user.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, name, email, color, role, active`,
      values,
    );

    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// GET /users
router.get('/users', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, color, role, active, last_seen_at, created_at FROM users WHERE active = true ORDER BY name',
    );
    res.json({ users: rows });
  } catch (err) { next(err); }
});

// POST /users (admin only)
const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['admin', 'gestor', 'editor', 'viewer']).default('editor'),
    color: z.string().default('oklch(0.78 0.16 135)'),
  }),
});

router.post('/users', requireAuth, requireRole('admin'), validate(createUserSchema), async (req, res, next) => {
  try {
    const { name, email, password, role, color } = req.validated.body;

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw AppError.conflict('Email já cadastrado');
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, color, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, color, role, active, created_at`,
      [name, email, password_hash, color, role],
    );

    res.status(201).json({ user: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /users/:id (admin only)
const patchUserSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'gestor', 'editor', 'viewer']).optional(),
    color: z.string().optional(),
    active: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

router.patch('/users/:id', requireAuth, requireRole('admin'), validate(patchUserSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const { name, email, role, color, active } = req.validated.body;
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++; updates.push(`name = $${paramCount}`); values.push(name);
    }
    if (email !== undefined) {
      paramCount++; updates.push(`email = $${paramCount}`); values.push(email);
    }
    if (role !== undefined) {
      paramCount++; updates.push(`role = $${paramCount}`); values.push(role);
    }
    if (color !== undefined) {
      paramCount++; updates.push(`color = $${paramCount}`); values.push(color);
    }
    if (active !== undefined) {
      paramCount++; updates.push(`active = $${paramCount}`); values.push(active);
    }

    if (updates.length === 0) {
      const { rows } = await pool.query('SELECT id, name, email, color, role, active FROM users WHERE id = $1', [id]);
      if (rows.length === 0) throw AppError.notFound('Usuário não encontrado');
      return res.json({ user: rows[0] });
    }

    paramCount++; values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, name, email, color, role, active`,
      values,
    );

    if (rows.length === 0) throw AppError.notFound('Usuário não encontrado');
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /users/:id (admin only, soft delete)
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      throw AppError.validation('Não pode remover a si mesmo');
    }

    const { rows } = await pool.query(
      `UPDATE users SET active = false WHERE id = $1 AND active = true
       RETURNING id, name`,
      [id],
    );

    if (rows.length === 0) throw AppError.notFound('Usuário não encontrado');
    res.json({ user: rows[0], deleted: true });
  } catch (err) { next(err); }
});

export default router;
