import cron from 'node-cron';
import logger from '../lib/logger.js';
import { staleAlertsJob } from './staleAlerts.js';
import { cleanupJob } from './cleanup.js';
import { backupJob } from './backup.js';

export function startScheduler() {
  // Stale alerts — diário às 9h
  cron.schedule('0 9 * * *', () => {
    staleAlertsJob().catch(() => {});
  });

  // Cleanup — diário às 3h
  cron.schedule('0 3 * * *', () => {
    cleanupJob().catch(() => {});
  });

  // Backup — diário às 2h
  cron.schedule('0 2 * * *', () => {
    backupJob().catch(() => {});
  });

  logger.info('Scheduler started');
}
