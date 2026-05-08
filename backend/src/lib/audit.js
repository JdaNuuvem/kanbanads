import pool from '../config/db.js';

export function auditLog(action, actorId, targetType, targetId, details = null) {
  // Non-blocking — fire and forget
  pool.query(
    `INSERT INTO activity (type, by_id, text, snippet, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'edit',
      actorId,
      action,
      `${targetType}:${targetId}`,
      details ? JSON.stringify(details) : null,
    ],
  ).catch(() => {});
}
