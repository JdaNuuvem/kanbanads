import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { addSSEClient } from '../lib/sse.js';
import { AppError } from '../lib/errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const router = Router();

async function optionalAuth(req, _res, next) {
  try {
    let token = null;

    // Check query param first (for EventSource)
    if (req.query.token) {
      token = req.query.token;
    }
    // Then check Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }

    if (!token) {
      return next(AppError.unauthorized('Token não fornecido'));
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, name, email, color, role, active FROM users WHERE id = $1',
      [payload.sub],
    );

    if (rows.length === 0 || !rows[0].active) {
      return next(AppError.unauthorized('Usuário não encontrado'));
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(AppError.unauthorized('Token inválido'));
    }
    next(err);
  }
}

router.get('/events', optionalAuth, (req, res) => {
  addSSEClient(req.user.id, res);
});

export default router;
