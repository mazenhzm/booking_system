import express from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';
import { requireUuid } from '../utils/validation.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();

const getBooking = (id) => sqlGet('SELECT * FROM bookings WHERE id = ?', [id]);

router.get('/', requirePermission('payments:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM payments ORDER BY payment_date DESC');
  return res.json({ payments: rows });
});

router.post('/', requireRole('Super Admin', 'Manager', 'Accountant'), async (req, res) => {
  const { bookingId, amount, paymentMethod = 'Cash', referenceNumber, notes, receivedBy } = req.body;

  if (!bookingId || amount === undefined || amount === null || amount === '') {
    await writeAuditLog({
      user: req.user,
      action: 'invalid_payment_request',
      entity: 'payments',
      metadata: {
        bookingId: bookingId || null,
        amount: amount ?? null,
        reason: 'missing_booking_id_or_amount',
      },
      ipAddress: req.ip || '127.0.0.1',
    });
    return res.status(400).json({ message: 'Booking id and amount are required.' });
  }

  try {
    requireUuid(bookingId, 'Booking id');
  } catch (error) {
    await writeAuditLog({
      user: req.user,
      action: 'invalid_payment_request',
      entity: 'payments',
      metadata: {
        bookingId,
        amount,
        reason: 'invalid_booking_uuid',
        error: error.message,
      },
      ipAddress: req.ip || '127.0.0.1',
    });
    return res.status(error.statusCode || 400).json({ message: error.message });
  }

  const booking = await getBooking(bookingId);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const paymentAmount = Number(amount);
  const remaining = Number(booking.remaining_amount || 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
  }
  if (paymentAmount > remaining) {
    return res.status(400).json({ message: 'Payment amount cannot exceed the remaining balance.' });
  }

  const paymentId = randomUUID();
  const previousPaid = Number(booking.paid_amount || 0);
  const newPaid = previousPaid + paymentAmount;
  const totalAmount = Number(booking.total_amount || 0);
  const updatedRemaining = Math.max(totalAmount - newPaid, 0);
  const paymentStatus = newPaid >= totalAmount ? 'Fully Paid' : 'Partially Paid';
  const actedByUserId = req.user?.id || null;
  const actedByName = receivedBy || req.user?.full_name || 'System';

  await sqlRun(`
    INSERT INTO payments (id, booking_id, amount, payment_method, reference_number, received_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [paymentId, bookingId, paymentAmount, paymentMethod, referenceNumber || null, actedByUserId, notes || null]);

  await sqlRun(`
    UPDATE bookings
    SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [newPaid, updatedRemaining, paymentStatus, bookingId]);

  const receiptId = randomUUID();
  await sqlRun(`
    INSERT INTO payment_receipts (id, receipt_number, booking_id, customer_name, payment_amount, previous_paid, new_paid, remaining, payment_method, received_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [receiptId, `RCPT-${Date.now()}`, bookingId, booking.customer_id, paymentAmount, previousPaid, newPaid, updatedRemaining, paymentMethod, actedByName]);

  await writeAuditLog({
    user: req.user,
    action: 'create_payment',
    entity: 'payments',
    entityId: paymentId,
    metadata: {
      bookingId,
      amount: paymentAmount,
      paymentMethod,
      previousPaid,
      newPaid,
      remaining: updatedRemaining,
      paymentStatus,
    },
    ipAddress: req.ip || '127.0.0.1',
  });

  return res.status(201).json({ payment: { id: paymentId, bookingId, amount: paymentAmount, paymentStatus }, remaining: updatedRemaining });
});

export default router;
