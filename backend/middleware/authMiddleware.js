import { verifyToken } from '../utils/auth.js';
import { sqlGet } from '../db/database.js';

const rolePermissions = {
  'Super Admin': ['*'],
  Manager: ['users:read', 'users:write', 'customers:read', 'customers:write', 'decorations:read', 'decorations:write', 'services:read', 'services:write', 'bookings:read', 'bookings:write', 'payments:read', 'payments:write', 'invoices:read', 'invoices:write', 'employees:read', 'employees:write', 'installations:read', 'installations:write', 'reports:read', 'notifications:read', 'notifications:write', 'audit:read'],
  'Booking Employee': ['customers:read', 'customers:write', 'decorations:read', 'services:read', 'bookings:read', 'bookings:write', 'payments:read', 'invoices:read', 'installations:read', 'notifications:read'],
  'Installation Employee': ['decorations:read', 'bookings:read', 'installations:read', 'installations:write', 'notifications:read'],
  Accountant: ['customers:read', 'bookings:read', 'payments:read', 'payments:write', 'invoices:read', 'invoices:write', 'reports:read', 'notifications:read'],
};

const getUserPermissions = (userRole) => rolePermissions[userRole] || [];

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    const user = await sqlGet('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (!user) {
      return res.status(401).json({ message: 'User not found or inactive.' });
    }

    req.user = {
      ...user,
      role: user.role,
      permissions: getUserPermissions(user.role),
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  const userRole = req.user?.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' });
  }

  return next();
};

export const requirePermission = (permission) => (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const permissions = user.permissions || getUserPermissions(user.role);
  const hasAccess = permissions.includes('*') || permissions.includes(permission);

  if (!hasAccess) {
    return res.status(403).json({ message: 'You do not have permission to perform this action.' });
  }

  return next();
};
