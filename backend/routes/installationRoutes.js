import express from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';
import { requireUuid } from '../utils/validation.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();

router.get('/', requirePermission('installations:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM installation_assignments ORDER BY created_at DESC');
  return res.json({ assignments: rows });
});

router.post('/', requirePermission('installations:write'), requireRole('Super Admin', 'Manager', 'Installation Employee'), async (req, res) => {
  const { bookingId, employeeId, assignedDate, installationDate, installationTime, status = 'Assigned', notes } = req.body;

  if (!bookingId || !employeeId) {
    return res.status(400).json({ message: 'Booking and employee are required.' });
  }

  try {
    requireUuid(bookingId, 'Booking id');
    requireUuid(employeeId, 'Employee id');
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }

  const booking = await sqlGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const employee = await sqlGet('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const assignmentId = randomUUID();
  await sqlRun(
    'INSERT INTO installation_assignments (id, booking_id, employee_id, assigned_date, installation_date, installation_time, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [assignmentId, bookingId, employeeId, assignedDate || null, installationDate || null, installationTime || null, status, notes || null]
  );

  await writeAuditLog({
    user: req.user,
    action: 'create_installation_assignment',
    entity: 'installation_assignments',
    entityId: assignmentId,
    metadata: {
      bookingId,
      employeeId,
      status,
      assignedDate,
      installationDate,
      installationTime,
    },
    ipAddress: req.ip || '127.0.0.1',
  });

  const assignment = await sqlGet('SELECT * FROM installation_assignments WHERE id = ?', [assignmentId]);
  return res.status(201).json({ assignment });
});

router.put('/:id', requirePermission('installations:write'), requireRole('Super Admin', 'Manager', 'Installation Employee'), async (req, res) => {
  const existing = await sqlGet('SELECT * FROM installation_assignments WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ message: 'Assignment not found.' });
  }

  const { status, notes, installationTime, installationDate } = req.body;
  await sqlRun(
    'UPDATE installation_assignments SET status = ?, notes = ?, installation_time = ?, installation_date = ?, updated_at = NOW() WHERE id = ?',
    [status || existing.status, notes ?? existing.notes, installationTime ?? existing.installation_time, installationDate ?? existing.installation_date, req.params.id]
  );

  await writeAuditLog({
    user: req.user,
    action: 'update_installation_assignment',
    entity: 'installation_assignments',
    entityId: req.params.id,
    metadata: {
      status: status || existing.status,
      installationDate: installationDate || existing.installation_date,
      installationTime: installationTime || existing.installation_time,
    },
    ipAddress: req.ip || '127.0.0.1',
  });

  const assignment = await sqlGet('SELECT * FROM installation_assignments WHERE id = ?', [req.params.id]);
  return res.json({ assignment });
});

router.get('/my', requirePermission('installations:read'), async (req, res) => {
  const userId = req.user?.id;
  const rows = await sqlAll('SELECT * FROM installation_assignments WHERE employee_id = ? ORDER BY created_at DESC', [userId]);
  return res.json({ assignments: rows });
});

export default router;
