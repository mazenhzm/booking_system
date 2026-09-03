import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export const hashPassword = async (password) => bcrypt.hash(password, 10);

export const comparePassword = async (password, hash) => bcrypt.compare(password, hash);

export const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export const verifyToken = (token) => jwt.verify(token, JWT_SECRET);
