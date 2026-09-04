import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

const getBooking = (id) => sqlGet('SELECT * FROM bookings WHERE id = ?', [id]);

router.get('/', async (req, res) => {
  const rows = await sqlAll('SELECT * FROM payments ORDER BY payment_date DESC');
  return res.json({ payments: rows });
});

router.post('/', requireRole('Super Admin', 'Manager', 'Accountant'), async (req, res) => {
  const { bookingId, amount, paymentMethod = 'Cash', referenceNumber, notes, receivedBy } = req.body;

  if (!bookingId || !amount) {
    return res.status(400).json({ message: 'Booking id and amount are required.' });
  }

  const booking = await getBooking(bookingId);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const paymentAmount = Number(amount);
  const remaining = Number(booking.remaining_amount || 0);
  if (paymentAmount <= 0 || paymentAmount > remaining) {
    return res.status(400).json({ message: 'Payment amount cannot exceed the remaining balance.' });
  }

  const paymentId = randomUUID();
  const previousPaid = Number(booking.paid_amount || 0);
  const newPaid = previousPaid + paymentAmount;
  const updatedRemaining = Math.max(Number(booking.total_amount || 0) - newPaid, 0);
  const paymentStatus = newPaid >= Number(booking.total_amount || 0) ? 'Fully Paid' : 'Partially Paid';
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

  return res.status(201).json({ payment: { id: paymentId, bookingId, amount: paymentAmount, paymentStatus }, remaining: updatedRemaining });
});

export default router;
