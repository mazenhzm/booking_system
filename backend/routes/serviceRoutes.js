import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('services:read'), async (req, res) => {
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

router.put('/:id', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Service not found.' });
  }

  const { name, description, price, quantity, status } = req.body;
  await sqlRun(`
    UPDATE services
    SET name = ?, description = ?, price = ?, quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name || existing.name, description ?? existing.description, Number(price ?? existing.price ?? 0), Number(quantity ?? existing.quantity ?? 1), status || existing.status, req.params.id]);

  const service = await sqlGet('SELECT * FROM services WHERE id = ?', [req.params.id]);
  return res.json({ service });
});

router.delete('/:id', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Service not found.' });
  }

  await sqlRun('DELETE FROM services WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Service deleted successfully.' });
});

export default router;
