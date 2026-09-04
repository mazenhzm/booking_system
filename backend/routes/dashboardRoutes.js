import express from 'express';
import { getDatabase, sqlAll } from '../db/database.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  const bookings = await sqlAll('SELECT * FROM bookings');
  const totalBookings = bookings.length;
  const confirmed = bookings.filter((b) => b.booking_status === 'Confirmed').length;
  const cancelled = bookings.filter((b) => b.booking_status === 'Cancelled').length;
  const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const totalPaid = bookings.reduce((sum, b) => sum + Number(b.paid_amount || 0), 0);
  const totalRemaining = bookings.reduce((sum, b) => sum + Number(b.remaining_amount || 0), 0);

  return res.json({
    totalBookings,
    confirmed,
    cancelled,
    totalRevenue,
    totalPaid,
    totalRemaining,
  });
});

export default router;
