import express from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, sqlAll, sqlGet, sqlRun, transaction } from '../db/database.js';
import { requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

const calculateBookingTotals = (decoration, selectedServices = [], discount = 0) => {
  const subtotal = Number(decoration.base_price || 0) + selectedServices.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.quantity || 1)), 0);
  const finalDiscount = Number(discount || 0);
  const total = Math.max(subtotal - finalDiscount, 0);
  return { subtotal, discount: finalDiscount, total };
};

const normalizeNumericField = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  const trimmed = String(value).trim();
  if (trimmed === '') return value;
  if (!Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  return value;
};

const normalizeBookingRecord = (booking) => {
  if (!booking) return null;

  return {
    id: booking.id,
    customerId: booking.customer_id,
    decorationId: booking.decoration_id,
    eventType: booking.event_type,
    eventDate: booking.event_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    eventLocation: booking.event_location,
    locationDetails: booking.location_details,
    notes: booking.notes,
    subtotal: normalizeNumericField(booking.subtotal),
    discount: normalizeNumericField(booking.discount),
    totalAmount: normalizeNumericField(booking.total_amount),
    paidAmount: normalizeNumericField(booking.paid_amount),
    remainingAmount: normalizeNumericField(booking.remaining_amount),
    paymentStatus: booking.payment_status,
    bookingStatus: booking.booking_status,
    installationStatus: booking.installation_status,
    depositAmount: normalizeNumericField(booking.deposit_amount),
    createdBy: booking.created_by,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
  };
};

const getBookingById = async (id) => normalizeBookingRecord(await sqlGet('SELECT * FROM bookings WHERE id = ?', [id]));

const ensureNoConflict = async (client, decorationId, eventDate, startTime, endTime, bookingId = null) => {
  const queryText = bookingId
    ? `
      SELECT id
      FROM bookings
      WHERE decoration_id = $1
        AND event_date = $2
        AND booking_status NOT IN ('Cancelled')
        AND id <> $3
        AND start_time < $4
        AND end_time > $5
    `
    : `
      SELECT id
      FROM bookings
      WHERE decoration_id = $1
        AND event_date = $2
        AND booking_status NOT IN ('Cancelled')
        AND start_time < $3
        AND end_time > $4
    `;

  const params = bookingId
    ? [decorationId, eventDate, bookingId, endTime, startTime]
    : [decorationId, eventDate, endTime, startTime];

  const result = await client.query(queryText, params);
  return result.rows.length === 0;
};

router.get('/', async (req, res) => {
  const rows = await sqlAll('SELECT * FROM bookings ORDER BY created_at DESC');
  return res.json({ bookings: rows });
});

router.post('/', requireRole('Super Admin', 'Manager', 'Booking Employee'), async (req, res) => {
  const {
    customerId,
    decorationId,
    eventType,
    eventDate,
    startTime,
    endTime,
    eventLocation,
    locationDetails,
    notes,
    discount = 0,
    depositAmount = 0,
    services = [],
    bookingStatus = 'Draft'
  } = req.body;

  if (!customerId || !decorationId || !eventType || !eventDate || !startTime || !endTime || !eventLocation) {
    return res.status(400).json({ message: 'Customer, decoration, event details, and location are required.' });
  }

  try {
    const booking = await transaction(async (client) => {
      const customer = await client.query('SELECT * FROM customers WHERE id = $1', [customerId]);
      if (customer.rows.length === 0) {
        const err = new Error('Customer not found.');
        err.statusCode = 404;
        throw err;
      }

      const decorationResult = await client.query('SELECT * FROM decorations WHERE id = $1 FOR UPDATE', [decorationId]);
      const decoration = decorationResult.rows[0];
      if (!decoration) {
        const err = new Error('Decoration not found.');
        err.statusCode = 404;
        throw err;
      }

      const { subtotal, discount: finalDiscount, total } = calculateBookingTotals(decoration, services, discount);

      const hasConflict = !(await ensureNoConflict(client, decorationId, eventDate, startTime, endTime));
      if (hasConflict) {
        const err = new Error('This decoration is unavailable at the selected time.');
        err.statusCode = 409;
        throw err;
      }

      const bookingId = randomUUID();
      const paidAmount = Number(depositAmount) || 0;
      const remainingAmount = Math.max(total - paidAmount, 0);
      const paymentStatus = paidAmount <= 0 ? 'Unpaid' : paidAmount >= total ? 'Fully Paid' : 'Partially Paid';

      await client.query(`
        INSERT INTO bookings (
          id, customer_id, decoration_id, event_type, event_date, start_time, end_time,
          event_location, location_details, notes, subtotal, discount, total_amount,
          paid_amount, remaining_amount, payment_status, booking_status, installation_status,
          deposit_amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      `, [
        bookingId,
        customerId,
        decorationId,
        eventType,
        eventDate,
        startTime,
        endTime,
        eventLocation,
        locationDetails || null,
        notes || null,
        subtotal,
        finalDiscount,
        total,
        paidAmount,
        remainingAmount,
        paymentStatus,
        bookingStatus,
        'Pending',
        paidAmount,
        req.user?.id || 'system'
      ]);

      for (const item of services) {
        const serviceId = item.serviceId || item.id;
        const serviceRow = await client.query('SELECT * FROM services WHERE id = $1', [serviceId]);
        if (serviceRow.rows.length === 0) continue;

        const quantityValue = Number(item.quantity ?? 1);
        if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
          const err = new Error('Each selected service must have a quantity greater than zero.');
          err.statusCode = 400;
          throw err;
        }

        const unitPrice = Number(item.unitPrice ?? serviceRow.rows[0].price ?? 0);
        const totalPrice = unitPrice * quantityValue;
        await client.query(`
          INSERT INTO booking_services (id, booking_id, service_id, quantity, unit_price, total_price)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [randomUUID(), bookingId, serviceId, quantityValue, unitPrice, totalPrice]);
      }

      const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      return normalizeBookingRecord(bookingResult.rows[0]);
    });

    return res.status(201).json({ booking });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error('Booking creation failed:', error);
    return res.status(500).json({ message: 'Booking creation failed.' });
  }
});

router.patch('/:id/confirm', requireRole('Super Admin', 'Manager'), async (req, res) => {
  const booking = await getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  if (!booking.customerId || !booking.eventDate || !booking.decorationId) {
    return res.status(400).json({ message: 'Booking cannot be confirmed without customer, date, and decoration.' });
  }

  await sqlRun('UPDATE bookings SET booking_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['Confirmed', req.params.id]);
  const updated = await getBookingById(req.params.id);
  return res.json({ booking: updated });
});

router.get('/:id', async (req, res) => {
  const booking = await getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  return res.json({ booking });
});

export default router;
