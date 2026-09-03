import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { newDb } from 'pg-mem';
import { pool, transaction as pgTransaction } from './postgres.js';

dotenv.config();

const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const isPgMemExplicitlyEnabled = process.env.ALLOW_PG_MEM === 'true';
const useRealDatabase = Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.POSTGRES_HOST);

if (!useRealDatabase && isProduction) {
  throw new Error('DATABASE_URL is required in production. The pg-mem fallback is disabled for production use.');
}

if (!useRealDatabase && !isPgMemExplicitlyEnabled) {
  throw new Error('DATABASE_URL is required. To enable the local pg-mem fallback for unit tests, set ALLOW_PG_MEM=true explicitly.');
}

const memoryDb = !useRealDatabase && isPgMemExplicitlyEnabled ? newDb({ autoCreateForeignKeyIndices: true }) : null;
if (memoryDb) {
  memoryDb.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: 'uuid',
    implementation: () => randomUUID(),
  });
}

const memoryPgAdapter = memoryDb ? memoryDb.adapters.createPg() : null;
const memoryPool = memoryPgAdapter ? new memoryPgAdapter.Pool() : null;

if (memoryPool) {
  console.warn('[database] pg-mem fallback enabled via ALLOW_PG_MEM=true. This is for unit tests only and must not be used in production.');
}

const normalizeParams = (params = []) => (Array.isArray(params) ? params : [params]);

const normalizePlaceholderSql = (sql, params = []) => {
  if (!sql.includes('?')) {
    return { text: sql, params: normalizeParams(params) };
  }

  let index = 0;
  const transformed = sql.replace(/\?/g, () => `$${++index}`);
  return { text: transformed, params: normalizeParams(params) };
};

const normalizeNumericStrings = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return value;
};

const normalizeRow = (row = {}) => {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeNumericStrings(value);
  }
  return normalized;
};

const normalizeResultRows = (result) => {
  if (!result || !Array.isArray(result.rows)) {
    return result;
  }

  return {
    ...result,
    rows: result.rows.map((row) => normalizeRow(row)),
  };
};

export const query = async (text, params = []) => {
  const { text: normalizedText, params: normalizedParams } = normalizePlaceholderSql(text, params);

  if (useRealDatabase) {
    return normalizeResultRows(await pool.query(normalizedText, normalizedParams));
  }

  return normalizeResultRows(await memoryPool.query(normalizedText, normalizedParams));
};

export const transaction = async (callback) => {
  if (useRealDatabase) {
    return pgTransaction(callback);
  }

  return callback({ query: async (text, params = []) => query(text, params) });
};

export const sqlExec = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows ?? result;
};

export const sqlRun = async (text, params = []) => {
  const result = await query(text, params);
  return {
    rowCount: result.rowCount ?? 0,
    rows: result.rows ?? [],
    changes: result.rowCount ?? 0,
  };
};

export const sqlGet = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows?.[0] ?? null;
};

export const sqlAll = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows ?? [];
};

const ensureDefaultAdmin = async () => {
  const isDevelopment = (process.env.NODE_ENV || 'development') !== 'production';
  const username = process.env.DEV_ADMIN_USERNAME || 'admin';
  const password = process.env.DEV_ADMIN_PASSWORD || 'change-me-now';

  if (!isDevelopment) {
    return;
  }

  const existing = await sqlGet('SELECT 1 FROM users WHERE username = ?', [username]);
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await sqlRun(
      'INSERT INTO users (id, username, full_name, password_hash, role, is_active) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)',
      [username, 'System Admin', passwordHash, 'Super Admin', true]
    );
  }
};

const bootstrap = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      alternative_phone TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      full_name TEXT NOT NULL,
      phone TEXT,
      employee_type TEXT NOT NULL,
      gender TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS decorations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Other',
      base_price REAL DEFAULT 0,
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'Available',
      availability BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      decoration_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      event_location TEXT NOT NULL,
      location_details TEXT,
      notes TEXT,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      remaining_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'Unpaid',
      booking_status TEXT DEFAULT 'Draft',
      installation_status TEXT DEFAULT 'Pending',
      deposit_amount REAL DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS booking_services (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_date TEXT DEFAULT CURRENT_TIMESTAMP,
      customer_name TEXT NOT NULL,
      event_date TEXT,
      event_location TEXT,
      decoration_name TEXT,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'Unpaid',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      invoice_id TEXT,
      amount REAL NOT NULL,
      payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT NOT NULL,
      reference_number TEXT,
      received_by TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payment_receipts (
      id TEXT PRIMARY KEY,
      receipt_number TEXT UNIQUE NOT NULL,
      booking_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      payment_amount REAL NOT NULL,
      previous_paid REAL DEFAULT 0,
      new_paid REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      payment_method TEXT,
      payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
      received_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS installation_assignments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      employee_id TEXT,
      assigned_date TEXT,
      installation_date TEXT,
      installation_time TEXT,
      status TEXT DEFAULT 'Pending',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read BOOLEAN DEFAULT false,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT
    )`
  ];

  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('already exists')) {
        throw error;
      }
    }
  }

  await ensureDefaultAdmin();
};

await bootstrap();

export const getDatabase = () => (useRealDatabase ? pool : memoryPool);
