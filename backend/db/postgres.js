import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

export const query = (text, params = []) => {
  if (!pool) {
    throw new Error('DATABASE_URL must be configured to connect to PostgreSQL.');
  }

  return pool.query(text, params);
};

export const transaction = async (callback) => {
  if (!pool) {
    throw new Error('DATABASE_URL must be configured to connect to PostgreSQL.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
