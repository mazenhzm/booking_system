import { describe, it, expect } from 'vitest';
import { query, sqlRun, sqlGet } from '../db/database.js';

describe('database adapter', () => {
  it('provides a postgres-compatible query interface and parameterized row access', async () => {
    await query('DROP TABLE IF EXISTS test_items');
    await query('CREATE TABLE test_items (id SERIAL PRIMARY KEY, name TEXT NOT NULL)');
    await query('INSERT INTO test_items (name) VALUES ($1)', ['alpha']);

    const { rows } = await query('SELECT * FROM test_items WHERE name = $1', ['alpha']);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');

    await sqlRun('INSERT INTO test_items (name) VALUES (?)', ['beta']);
    const item = await sqlGet('SELECT * FROM test_items WHERE name = ?', ['beta']);

    expect(item).toMatchObject({ name: 'beta' });
  });
});
