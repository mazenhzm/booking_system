import express from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('employees:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM employees ORDER BY created_at DESC');
  return res.json({ employees: rows });
});

router.post('/', requirePermission('employees:write'), requireRole('Super Admin', 'Manager'), async (req, res) => {
  const { userId, fullName, phone, employeeType, gender, status = 'Active' } = req.body;

  if (!fullName || !phone || !employeeType) {
    return res.status(400).json({ message: 'Employee name, phone, and type are required.' });
  }

  const id = randomUUID();
  await sqlRun(
    'INSERT INTO employees (id, user_id, full_name, phone, employee_type, gender, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, userId || null, fullName, phone, employeeType, gender || null, status]
  );

  const employee = await sqlGet('SELECT * FROM employees WHERE id = ?', [id]);
  return res.status(201).json({ employee });
});

router.put('/:id', requirePermission('employees:write'), requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const { fullName, phone, employeeType, gender, status } = req.body;
  await sqlRun(
    'UPDATE employees SET full_name = ?, phone = ?, employee_type = ?, gender = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [fullName || existing.full_name, phone || existing.phone, employeeType || existing.employee_type, gender ?? existing.gender, status || existing.status, req.params.id]
  );

  const employee = await sqlGet('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  return res.json({ employee });
});

router.delete('/:id', requirePermission('employees:write'), requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  await sqlRun('DELETE FROM employees WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Employee deleted.' });
});

export default router;
