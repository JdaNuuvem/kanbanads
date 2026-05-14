import jwt from 'jsonwebtoken';
import { AppError } from '../lib/errors.js';
import pool from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
  console.warn('[auth] WARNING: Using default JWT_SECRET. Set JWT_SECRET in environment for production.');
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('Token não fornecido');
    }

    const token = header.slice(7);
    const payload = verifyToken(token);

    const { rows } = await pool.query(
      'SELECT id, name, email, color, role, active FROM users WHERE id = $1',
      [payload.sub],
    );

    if (rows.length === 0 || !rows[0].active) {
      throw AppError.unauthorized('Usuário não encontrado ou inativo');
    }

    req.user = rows[0];

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(AppError.unauthorized('Token inválido ou expirado'));
    }
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('Cargo sem permissão para esta ação'));
    }
    next();
  };
}
