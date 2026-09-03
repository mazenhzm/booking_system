import express from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requirePermission, requireRole } from '../middleware/authMiddleware.js';
import { requireUuid } from '../utils/validation.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();

router.get('/', requirePermission('invoices:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM invoices ORDER BY invoice_date DESC');
  return res.json({ invoices: rows });
});

router.post('/', requireRole('Super Admin', 'Manager', 'Accountant'), async (req, res) => {
  const { bookingId, customerName, eventDate, eventLocation, decorationName } = req.body;

  if (!bookingId) {
    return res.status(400).json({ message: 'bookingId is required.' });
  }

  try {
    requireUuid(bookingId, 'Booking id');
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }

  const booking = await sqlGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const invoiceId = randomUUID();
  const invoiceNumber = `INV-${Date.now()}`;
  const subtotal = Number(booking.subtotal || 0);
  const discount = Number(booking.discount || 0);
  const total = Number(booking.total_amount || 0);
  const paid = Number(booking.paid_amount || 0);
  const remaining = Math.max(total - paid, 0);

  const existing = await sqlGet('SELECT * FROM invoices WHERE invoice_number = ?', [invoiceNumber]);
  if (existing) {
    return res.status(409).json({ message: 'Invoice number already exists.' });
  }

  await sqlRun(`
    INSERT INTO invoices (id, booking_id, invoice_number, customer_name, event_date, event_location, decoration_name, subtotal, discount, total, paid, remaining, payment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    invoiceId,
    bookingId,
    invoiceNumber,
    customerName || 'Customer',
    eventDate || booking.event_date,
    eventLocation || booking.event_location,
    decorationName || 'Decoration',
    subtotal,
    discount,
    total,
    paid,
    remaining,
    booking.payment_status || 'Unpaid'
  ]);

  await writeAuditLog({
    user: req.user,
    action: 'create_invoice',
    entity: 'invoices',
    entityId: invoiceId,
    metadata: {
      bookingId,
      invoiceNumber,
      total,
      paid,
      remaining,
    },
    ipAddress: req.ip || '127.0.0.1',
  });

  const invoice = await sqlGet('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  return res.status(201).json({ invoice });
});

export default router;
