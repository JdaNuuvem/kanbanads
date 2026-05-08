import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import pool from '../config/db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { AppError } from '../lib/errors.js';
import logger from '../lib/logger.js';

const router = Router();

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

const signupSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated.body;

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, color, role, active FROM users WHERE email = $1',
      [email],
    );

    if (rows.length === 0 || !rows[0].active) {
      throw AppError.unauthorized('Email ou senha inválidos');
    }

    const user = rows[0];

    if (!user.password_hash) {
      throw AppError.unauthorized('Esta conta não tem senha definida');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw AppError.unauthorized('Email ou senha inválidos');
    }

    const token = signToken(user);

    await pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id]);

    logger.info({ userId: user.id }, 'User logged in');

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        color: user.color,
        role: user.role,
      },
    });
  } catch (err) { next(err); }
});

router.post('/signup', authLimiter, validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.validated.body;

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw AppError.conflict('Email já cadastrado');
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, color, role)
       VALUES ($1, $2, $3, 'oklch(0.78 0.16 135)', 'editor')
       RETURNING id, name, email, color, role`,
      [name, email, password_hash],
    );

    const user = rows[0];
    const token = signToken(user);

    logger.info({ userId: user.id }, 'User signed up');

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        color: user.color,
        role: user.role,
      },
    });
  } catch (err) { next(err); }
});

router.post('/refresh', requireAuth, async (req, res, next) => {
  try {
    const token = signToken(req.user);
    res.json({ token });
  } catch (err) { next(err); }
});

router.post('/logout', requireAuth, async (_req, res) => {
  res.json({ ok: true });
});

export default router;
