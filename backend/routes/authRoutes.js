import express from 'express';
import { getDatabase, sqlGet, sqlRun } from '../db/database.js';
import { comparePassword, signToken, hashPassword } from '../utils/auth.js';
import { randomUUID } from 'crypto';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();
const allowedRoles = ['Super Admin', 'Manager', 'Accountant', 'Booking Employee', 'Installation Employee'];

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const user = await sqlGet('SELECT * FROM users WHERE username = ?', [username]);
  const userPasswordHash = user?.password_hash;

  if (!user || !userPasswordHash) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const passwordMatches = await comparePassword(password, userPasswordHash);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const token = signToken({ userId: user.id, role: user.role, username: user.username });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    },
  });
});

router.post('/register', requireAuth, requireRole('Super Admin', 'Manager'), async (req, res) => {
  const { username, fullName, password, role = 'Manager' } = req.body;

  if (!username || !fullName || !password) {
    return res.status(400).json({ message: 'Username, full name, and password are required.' });
  }

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role.' });
  }

  const existing = await sqlGet('SELECT 1 FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ message: 'Username already exists.' });
  }

  const userId = randomUUID();
  const hashedPassword = await hashPassword(password);

  await sqlRun(
    'INSERT INTO users (id, username, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [userId, username, fullName, hashedPassword, role]
  );

  return res.status(201).json({ message: 'User created successfully.' });
});

export default router;
