import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';
import { receiveDecorationImage, removeDecorationImage, saveDecorationImage } from '../middleware/decorationUpload.js';

const router = express.Router();
const allowedCategories = ['Wedding', 'Engagement', 'Birthday', 'Graduation', 'Corporate', 'Other'];
const allowedStatuses = ['Available', 'Reserved', 'Maintenance', 'Inactive'];

router.get('/', requirePermission('decorations:read'), async (req, res) => {
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

router.get('/:id', requirePermission('decorations:read'), async (req, res) => {
  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!decoration) {
    return res.status(404).json({ message: 'Decoration not found.' });
  }
  return res.json({ decoration });
});

router.post('/:id/image', requireRole('Super Admin', 'Manager'), receiveDecorationImage, async (req, res) => {
  const existing = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'الكوشة غير موجودة.' });
  }

  let savedImage;
  try {
    savedImage = await saveDecorationImage(req.file);
    await sqlRun('UPDATE decorations SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [savedImage.imageUrl, req.params.id]);
  } catch (error) {
    if (savedImage) await removeDecorationImage(savedImage.imageUrl);
    console.error('Decoration image upload failed:', error);
    return res.status(500).json({ message: 'تعذر حفظ صورة الكوشة.' });
  }

  await removeDecorationImage(existing.image_url);
  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  return res.json({ decoration });
});

router.delete('/:id/image', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'الكوشة غير موجودة.' });
  await sqlRun('UPDATE decorations SET image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  await removeDecorationImage(existing.image_url);
  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  return res.json({ decoration });
});

router.put('/:id', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Decoration not found.' });
  }

  const { name, description, category, basePrice, status = existing.status, availability = existing.availability, notes } = req.body;
  if (!name || !category) {
    return res.status(400).json({ message: 'Decoration name and category are required.' });
  }

  await sqlRun(`
    UPDATE decorations
    SET name = ?, description = ?, category = ?, base_price = ?, status = ?, availability = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, description || existing.description, category, Number(basePrice ?? existing.base_price ?? 0), status, availability ? 1 : 0, notes ?? existing.notes, req.params.id]);

  const decoration = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  return res.json({ decoration });
});

router.delete('/:id', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM decorations WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Decoration not found.' });
  }

  await sqlRun('DELETE FROM decorations WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Decoration deleted successfully.' });
});

export default router;
