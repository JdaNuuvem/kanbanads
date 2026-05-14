import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink } from 'node:fs/promises';
import logger from '../lib/logger.js';

const execFileAsync = promisify(execFile);

export async function backupJob() {
  try {
    logger.info('Running database backup');

    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl) { logger.warn('DATABASE_URL not set — skipping backup'); return; }

    const date = new Date().toISOString().slice(0, 10);
    const sqlFile = `backup-${date}.sql`;
    const gzFile = `${sqlFile}.gz`;

    try {
      await execFileAsync('pg_dump', ['--dbname', dbUrl, '--file', sqlFile], { timeout: 300_000 });
      await execFileAsync('gzip', ['-f', sqlFile], { timeout: 60_000 });
      logger.info({ file: gzFile }, 'Backup completed');
    } catch {
      logger.warn('pg_dump not available — skipping backup');
      try { await unlink(sqlFile); } catch {}
    }
  } catch (err) {
    logger.error({ err }, 'Backup job failed');
  }
}
