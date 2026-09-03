import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import decorationRoutes from './routes/decorationRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import installationRoutes from './routes/installationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import { requireAuth } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads/decorations', express.static(path.resolve(process.cwd(), 'uploads', 'decorations'), {
  fallthrough: false,
  index: false,
  dotfiles: 'deny',
}));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Booking system API is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/decorations', requireAuth, decorationRoutes);
app.use('/api/services', requireAuth, serviceRoutes);
app.use('/api/bookings', requireAuth, bookingRoutes);
app.use('/api/payments', requireAuth, paymentRoutes);
app.use('/api/invoices', requireAuth, invoiceRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/employees', requireAuth, employeeRoutes);
app.use('/api/installations', requireAuth, installationRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/audit-logs', requireAuth, auditRoutes);
app.use('/api/reports', requireAuth, reportRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'An error occurred while processing your request.' });
});

export default app;
