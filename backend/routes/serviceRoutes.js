import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { search = '' } = req.query;
  const rows = await sqlAll(`
    SELECT * FROM services
    WHERE name LIKE ? OR description LIKE ?
    ORDER BY created_at DESC
  `, [`%${search}%`, `%${search}%`]);

  return res.json({ services: rows });
});

router.post('/', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const { name, description, price, quantity = 1, status = 'Active' } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Service name is required.' });
  }

  const id = randomUUID();
  await sqlRun(`
    INSERT INTO services (id, name, description, price, quantity, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, name, description || null, Number(price) || 0, Number(quantity) || 1, status]);

  const service = await sqlGet('SELECT * FROM services WHERE id = ?', [id]);
  return res.status(201).json({ service });
});

export default router;
