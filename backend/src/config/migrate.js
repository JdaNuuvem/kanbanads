import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied() {
  const { rows } = await pool.query('SELECT name FROM _migrations ORDER BY id');
  return new Set(rows.map((r) => r.name));
}

async function applyFile(file) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`  ✅ ${file}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  console.log('Running migrations...');
  await ensureTable();
  const applied = await getApplied();
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('  Nothing to migrate.');
    return;
  }

  for (const file of pending) {
    await applyFile(file);
  }

  console.log(`  Done — ${pending.length} migration(s) applied.`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
}).finally(() => pool.end());
