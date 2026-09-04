import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

const normalizeCustomerPayload = (payload) => ({
  fullName: payload.fullName || payload.full_name,
  phone: payload.phone,
  alternativePhone: payload.alternativePhone || payload.alternative_phone,
  address: payload.address,
  notes: payload.notes,
});

router.get('/', async (req, res) => {
  const { search = '' } = req.query;
  const rows = await sqlAll(`
    SELECT * FROM customers
    WHERE full_name LIKE ? OR phone LIKE ?
    ORDER BY created_at DESC
  `, [`%${search}%`, `%${search}%`]);

  return res.json({ customers: rows });
});

router.post('/', requireRole('Super Admin', 'Manager', 'Booking Employee'), async (req, res) => {
  const { fullName, phone, alternativePhone, address, notes } = normalizeCustomerPayload(req.body);

  if (!fullName || !phone) {
    return res.status(400).json({ message: 'Full name and phone number are required.' });
  }

  const existing = await sqlGet('SELECT * FROM customers WHERE phone = ?', [phone]);
  if (existing) {
    return res.status(409).json({ message: 'A customer with this phone number already exists.' });
  }

  const customerId = randomUUID();
  await sqlRun(`
    INSERT INTO customers (id, full_name, phone, alternative_phone, address, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [customerId, fullName, phone, alternativePhone || null, address || null, notes || null]);

  const customer = await sqlGet('SELECT * FROM customers WHERE id = ?', [customerId]);
  return res.status(201).json({ customer });
});

router.get('/:id', async (req, res) => {
  const customer = await sqlGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) {
    return res.status(404).json({ message: 'Customer not found.' });
  }
  return res.json({ customer });
});

router.put('/:id', requireRole('Super Admin', 'Manager', 'Booking Employee'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Customer not found.' });
  }

  const payload = normalizeCustomerPayload(req.body);
  const updated = await sqlRun(`
    UPDATE customers
    SET full_name = ?, phone = ?, alternative_phone = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [payload.fullName, payload.phone, payload.alternativePhone || null, payload.address || null, payload.notes || null, req.params.id]);

  if (updated.changes === 0) {
    return res.status(400).json({ message: 'Customer could not be updated.' });
  }

  const customer = await sqlGet('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  return res.json({ customer });
});

export default router;
