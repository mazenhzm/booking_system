import express from 'express';
import { sqlAll } from '../db/database.js';
import { requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/summary', requirePermission('reports:read'), async (req, res) => {
  const bookings = await sqlAll('SELECT * FROM bookings');
  const payments = await sqlAll('SELECT * FROM payments');
  const customers = await sqlAll('SELECT * FROM customers');
  const decorations = await sqlAll('SELECT * FROM decorations');
  const installations = await sqlAll('SELECT * FROM installation_assignments');

  return res.json({
    totalBookings: bookings.length,
    totalRevenue: bookings.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    totalPaid: bookings.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
    totalRemaining: bookings.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0),
    totalPayments: payments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    totalCustomers: customers.length,
    totalDecorations: decorations.length,
    totalInstallations: installations.length,
    bookings,
    payments,
    customers,
    installations,
  });
});

router.get('/bookings', requirePermission('reports:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM bookings ORDER BY created_at DESC');
  return res.json({ bookings: rows });
});

router.get('/revenue', requirePermission('reports:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM bookings ORDER BY event_date DESC');
  return res.json({ revenue: rows });
});

router.get('/payments', requirePermission('reports:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM payments ORDER BY payment_date DESC');
  return res.json({ payments: rows });
});

router.get('/installations', requirePermission('reports:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM installation_assignments ORDER BY installation_date DESC');
  return res.json({ installations: rows });
});

router.get('/customers', requirePermission('reports:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM customers ORDER BY created_at DESC');
  return res.json({ customers: rows });
});

router.get('/decorations', requirePermission('reports:read'), async (req, res) => {
  const rows = await sqlAll('SELECT * FROM decorations ORDER BY created_at DESC');
  return res.json({ decorations: rows });
});

export default router;
