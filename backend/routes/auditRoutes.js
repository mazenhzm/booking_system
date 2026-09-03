import express from 'express';
import { sqlAll } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('audit:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  return res.json({ logs: rows });
});

router.get('/user/:userId', requirePermission('audit:read'), requireRole('Super Admin', 'Manager'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', [req.params.userId]);
  return res.json({ logs: rows });
});

export default router;
