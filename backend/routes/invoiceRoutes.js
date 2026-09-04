import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun } from '../db/database.js';
import { requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const rows = await sqlAll('SELECT * FROM invoices ORDER BY invoice_date DESC');
  return res.json({ invoices: rows });
});

router.post('/', requireRole('Super Admin', 'Manager', 'Accountant'), async (req, res) => {
  const { bookingId, customerName, eventDate, eventLocation, decorationName } = req.body;

  if (!bookingId) {
    return res.status(400).json({ message: ' bookingId is required.' });
  }

  const booking = await sqlGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  const invoiceId = randomUUID();
  const invoiceNumber = `INV-${Date.now()}`;

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
    Number(booking.subtotal || 0),
    Number(booking.discount || 0),
    Number(booking.total_amount || 0),
    Number(booking.paid_amount || 0),
    Number(booking.remaining_amount || 0),
    booking.payment_status || 'Unpaid'
  ]);

  const invoice = await sqlGet('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  return res.status(201).json({ invoice });
});

export default router;
