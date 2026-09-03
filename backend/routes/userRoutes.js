import express from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requireRole, requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('users:read'), async (req, res) => {
  const users = await sqlAll('SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC');
  return res.json({ users });
});

router.post('/', requirePermission('users:write'), requireRole('Super Admin', 'Manager'), async (req, res) => {
  const { username, fullName, password, role = 'Manager', isActive = true } = req.body;

  if (!username || !fullName || !password || !role) {
    return res.status(400).json({ message: 'Username, full name, password, and role are required.' });
  }

  const existing = await sqlGet('SELECT 1 FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ message: 'Username already exists.' });
  }

  const hashed = await import('bcryptjs').then(({ default: bcrypt }) => bcrypt.hash(password, 10));
  const userId = randomUUID();
  await sqlRun(
    'INSERT INTO users (id, username, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, username, fullName, hashed, role, isActive]
  );

  const user = await sqlGet('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?', [userId]);
  return res.status(201).json({ user });
});

router.put('/:id', requirePermission('users:write'), requireRole('Super Admin', 'Manager'), async (req, res) => {
  const { fullName, role, isActive } = req.body;
  const existing = await sqlGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'User not found.' });
  }

  await sqlRun(
    'UPDATE users SET full_name = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [fullName || existing.full_name, role || existing.role, isActive !== undefined ? isActive : existing.is_active, req.params.id]
  );

  const user = await sqlGet('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?', [req.params.id]);
  return res.json({ user });
});

router.delete('/:id', requirePermission('users:write'), requireRole('Super Admin'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'User not found.' });
  }

  await sqlRun('DELETE FROM users WHERE id = ?', [req.params.id]);
  return res.json({ message: 'User deleted.' });
});

export default router;
