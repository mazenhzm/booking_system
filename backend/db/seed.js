import bcrypt from 'bcryptjs';
import { query } from './postgres.js';

const seedUsers = [
  { username: 'admin', fullName: 'System Admin', password: 'change-me-now', role: 'Super Admin' },
  { username: 'manager', fullName: 'Operations Manager', password: 'change-me-now', role: 'Manager' },
  { username: 'booking', fullName: 'Booking Employee', password: 'change-me-now', role: 'Booking Employee' },
  { username: 'install', fullName: 'Installation Employee', password: 'change-me-now', role: 'Installation Employee' },
  { username: 'accountant', fullName: 'Accountant', password: 'change-me-now', role: 'Accountant' },
];

const seed = async () => {
  for (const user of seedUsers) {
    const exists = await query('SELECT 1 FROM users WHERE username = $1', [user.username]);
    if (exists.rowCount === 0) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await query(
        `INSERT INTO users (id, username, full_name, password_hash, role, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW(), NOW())`,
        [user.username, user.fullName, passwordHash, user.role]
      );
      console.log(`Seeded ${user.role}: ${user.username}`);
    }
  }

  const customersCount = await query('SELECT COUNT(*)::int AS count FROM customers');
  if ((customersCount.rows[0]?.count ?? 0) === 0) {
    await query(`INSERT INTO customers (id, full_name, phone, address, notes) VALUES (gen_random_uuid(), 'Noura Ali', '0500000001', 'Jeddah', 'VIP customer')`);
    await query(`INSERT INTO customers (id, full_name, phone, address, notes) VALUES (gen_random_uuid(), 'Salem Ahmed', '0500000002', 'Riyadh', 'Corporate event')`);
  }

  const decorationsCount = await query('SELECT COUNT(*)::int AS count FROM decorations');
  if ((decorationsCount.rows[0]?.count ?? 0) === 0) {
    await query(`INSERT INTO decorations (id, name, description, category, base_price, price, status, availability) VALUES (gen_random_uuid(), 'Royal Arch', 'Luxury wedding arch', 'Wedding', 2800, 2800, 'Available', true)`);
    await query(`INSERT INTO decorations (id, name, description, category, base_price, price, status, availability) VALUES (gen_random_uuid(), 'Garden Lounge', 'Outdoor lounge decor', 'Corporate', 1800, 1800, 'Available', true)`);
  }

  const servicesCount = await query('SELECT COUNT(*)::int AS count FROM services');
  if ((servicesCount.rows[0]?.count ?? 0) === 0) {
    await query(`INSERT INTO services (id, name, description, price, quantity, status) VALUES (gen_random_uuid(), 'Chairs', 'Extra chairs setup', 150, 20, 'Active')`);
    await query(`INSERT INTO services (id, name, description, price, quantity, status) VALUES (gen_random_uuid(), 'Lighting', 'Stage lighting', 420, 10, 'Active')`);
  }
};

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
