import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import decorationRoutes from './routes/decorationRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { requireAuth } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Booking system API is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/decorations', requireAuth, decorationRoutes);
app.use('/api/services', requireAuth, serviceRoutes);
app.use('/api/bookings', requireAuth, bookingRoutes);
app.use('/api/payments', requireAuth, paymentRoutes);
app.use('/api/invoices', requireAuth, invoiceRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'An error occurred while processing your request.' });
});

export default app;
