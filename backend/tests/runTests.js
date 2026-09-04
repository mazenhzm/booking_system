import dotenv from 'dotenv';
import pg from 'pg';
import { spawnSync } from 'child_process';

dotenv.config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run tests.');
}

const testUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(testUrl.pathname.replace(/^\//, ''));

if (testDatabaseName === 'booking_system' || !testDatabaseName.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must target a database ending in _test, never booking_system.');
}

const adminUrl = new URL(testDatabaseUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const client = new pg.Client({ connectionString: adminUrl.toString() });

try {
  await client.connect();
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDatabaseName]);
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE "${testDatabaseName.replace(/"/g, '""')}"`);
  }
} finally {
  await client.end();
}

process.env.NODE_ENV = 'test';
process.env.ALLOW_PG_MEM = 'false';
process.env.DATABASE_URL = testDatabaseUrl;

const { run } = await import('../db/runMigrations.js');
await run();

const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
