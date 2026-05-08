import pool from '../config/db.js';
import logger from '../lib/logger.js';

export async function cleanupJob() {
  try {
    logger.info('Running cleanup job');

    // Deletar notificações lidas há mais de 30 dias
    const { rows } = await pool.query(
      `DELETE FROM notifications
       WHERE read = true AND read_at < now() - interval '30 days'
       RETURNING id`,
    );

    logger.info({ deleted: rows.length }, 'Cleanup completed');
  } catch (err) {
    logger.error({ err }, 'Cleanup job failed');
  }
}
