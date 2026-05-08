import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import logger from '../lib/logger.js';

const execAsync = promisify(exec);

export async function backupJob() {
  try {
    logger.info('Running database backup');

    const url = new URL(process.env.DATABASE_URL || '');
    const dbName = url.pathname.slice(1) || 'kanban_ads';
    const date = new Date().toISOString().slice(0, 10);
    const file = `backup-${date}.sql.gz`;

    // Simple pg_dump
    try {
      await execAsync(
        `pg_dump "${process.env.DATABASE_URL}" | gzip > "${file}"`,
        { timeout: 300_000 },
      );
      logger.info({ file }, 'Backup completed');
    } catch {
      logger.warn('pg_dump not available — skipping backup');
    }
  } catch (err) {
    logger.error({ err }, 'Backup job failed');
  }
}
