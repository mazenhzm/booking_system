import express from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('notifications:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC', [req.user?.id]);
  return res.json({ notifications: rows });
});

router.post('/', requirePermission('notifications:write'), async (req, res) => {
  const { userId, title, message, type = 'info' } = req.body;

  if (!title || !message) {
    return res.status(400).json({ message: 'Title and message are required.' });
  }

  const notificationId = randomUUID();
  await sqlRun('INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)', [notificationId, userId || null, title, message, type]);

  const notification = await sqlGet('SELECT * FROM notifications WHERE id = ?', [notificationId]);
  return res.status(201).json({ notification });
});

router.patch('/:id/read', requirePermission('notifications:write'), async (req, res) => {
  await sqlRun('UPDATE notifications SET is_read = true WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Notification marked as read.' });
});

export default router;
