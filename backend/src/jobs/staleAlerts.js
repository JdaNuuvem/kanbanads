import pool from '../config/db.js';
import { emitToUser } from '../lib/sse.js';
import logger from '../lib/logger.js';

export async function staleAlertsJob() {
  const client = await pool.connect();
  try {
    logger.info('Running stale alerts job');

    // Find products in "rodando" for > 7 days
    const { rows: staleProducts } = await client.query(`
      SELECT p.id, p.name, p.entered_stage_at, p.workspace_id
      FROM products p
      WHERE p.stage_id = 'rodando'
        AND p.archived_at IS NULL
        AND p.entered_stage_at < now() - interval '7 days'
    `);

    if (staleProducts.length === 0) {
      logger.info('No stale products found');
      return;
    }

    for (const product of staleProducts) {
      // Find gestores assigned to this product
      const { rows: gestores } = await client.query(`
        SELECT u.id, u.name
        FROM product_assignees pa
        JOIN users u ON u.id = pa.user_id
        WHERE pa.product_id = $1 AND u.role IN ('admin', 'gestor') AND u.active = true
      `, [product.id]);

      if (gestores.length === 0) continue;

      const daysStale = Math.floor(
        (Date.now() - new Date(product.entered_stage_at).getTime()) / (1000 * 60 * 60 * 24),
      );

      for (const gestor of gestores) {
        // Create activity
        const { rows: actRows } = await client.query(
          `INSERT INTO activity (type, product_id, product_name, by_id, text, snippet, payload, workspace_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            'edit', product.id, product.name, gestor.id,
            `Produto parado em "Rodando" há ${daysStale} dias`,
            `${product.name} sem movimentação`,
            JSON.stringify({ alert: 'stale', days: daysStale }),
            product.workspace_id,
          ],
        );

        // Create notification
        await client.query(
          `INSERT INTO activity_targets (activity_id, user_id, reason)
           VALUES ($1, $2, 'watcher') ON CONFLICT DO NOTHING`,
          [actRows.rows[0].id, gestor.id],
        );

        emitToUser(gestor.id, 'notification.new', {
          activity_id: actRows.rows[0].id,
          type: 'stale_alert',
          product_id: product.id,
          product_name: product.name,
          workspace_id: product.workspace_id,
          days_stale: daysStale,
        });
      }
    }

    logger.info({ count: staleProducts.length }, 'Stale alerts sent');
  } catch (err) {
    logger.error({ err }, 'Stale alerts job failed');
  } finally {
    client.release();
  }
}
