import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

const ensureMigrationsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

export const run = async () => {
  await ensureMigrationsTable();

  for (const file of migrationFiles) {
    const name = file;
    const exists = await query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);

    if (exists.rowCount > 0) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');

    await query(sql);
    await query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    console.log(`Applied migration: ${name}`);
  }

  console.log('All migrations applied.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}
