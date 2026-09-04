import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requireRole } from '../middleware/authMiddleware.js';
import { receiveDecorationImage, removeDecorationImage, saveDecorationImage } from '../middleware/decorationUpload.js';

const router = express.Router();
const allowedCategories = ['Wedding', 'Engagement', 'Birthday', 'Graduation', 'Corporate', 'Other'];
const allowedStatuses = ['Available', 'Reserved', 'Maintenance', 'Inactive'];

router.get('/', async (req, res) => {
  const { search = '', category = '' } = req.query;
  const rows = await sqlAll(`
    SELECT * FROM decorations
    WHERE (? = '' OR category = ?) AND (name LIKE ? OR description LIKE ?)
    ORDER BY created_at DESC
  `, [category, category, `%${search}%`, `%${search}%`]);

  return res.json({ decorations: rows });
});

router.post('/', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const { name, description, category, basePrice, status = 'Available', availability = true, notes } = req.body;

  if (!name || !category) {
    return res.status(400).json({ message: 'Decoration name and category are required.' });
  }

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({ message: 'Invalid category.' });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }

  const newId = randomUUID();
  await sqlRun(`
    INSERT INTO decorations (id, name, description, category, base_price, status, availability, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [newId, name, description || null, category, Number(basePrice) || 0, status, availability ? 1 : 0, notes || null]);

  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [newId]);
  return res.status(201).json({ decoration });
});

router.get('/:id', async (req, res) => {
  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!decoration) {
    return res.status(404).json({ message: 'Decoration not found.' });
  }
  return res.json({ decoration });
});

router.post('/:id/image', requireRole('Super Admin', 'Manager'), receiveDecorationImage, async (req, res, next) => {
  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!decoration) {
    return res.status(404).json({ message: 'Decoration not found.' });
  }

  let savedImage;
  try {
    savedImage = await saveDecorationImage(req.file);
    await sqlRun('UPDATE decorations SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [savedImage.imageUrl, req.params.id]);
    await removeDecorationImage(decoration.image_url);
    const updated = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
    return res.json({ decoration: updated });
  } catch (error) {
    if (savedImage) await removeDecorationImage(savedImage.imageUrl);
    return next(error);
  }
});

export default router;
