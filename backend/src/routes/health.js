import { Router } from 'express';
import pool from '../config/db.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const { rows: db } = await pool.query('SELECT 1 AS ok');
    const uptime = process.uptime();
    res.json({
      status: 'ok',
      uptime: Math.floor(uptime),
      db: db[0].ok === 1 ? 'connected' : 'error',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
