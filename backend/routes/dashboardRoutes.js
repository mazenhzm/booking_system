import express from 'express';
import { getDatabase, sqlAll } from '../db/database.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  const bookings = await sqlAll('SELECT * FROM bookings');
  const payments = await sqlAll('SELECT * FROM payments');
  const installations = await sqlAll('SELECT * FROM installation_assignments');

  const totalBookings = bookings.length;
  const todayBookings = bookings.filter((b) => b.event_date === new Date().toISOString().slice(0, 10)).length;
  const confirmed = bookings.filter((b) => b.booking_status === 'Confirmed').length;
  const cancelled = bookings.filter((b) => b.booking_status === 'Cancelled').length;
  const pendingPayments = bookings.filter((b) => Number(b.remaining_amount || 0) > 0).length;
  const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const totalPaid = bookings.reduce((sum, b) => sum + Number(b.paid_amount || 0), 0);
  const totalRemaining = bookings.reduce((sum, b) => sum + Number(b.remaining_amount || 0), 0);
  const recurring = bookings.reduce((acc, booking) => {
    acc[booking.booking_status || 'Draft'] = (acc[booking.booking_status || 'Draft'] || 0) + 1;
    return acc;
  }, {});

  return res.json({
    totalBookings,
    todayBookings,
    upcomingInstallations: installations.filter((item) => item.status !== 'Completed').length,
    confirmed,
    cancelled,
    pendingPayments,
    totalRevenue,
    totalPaid,
    totalRemaining,
    bookingStatusSummary: recurring,
    totalPayments: payments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  });
});

export default router;
