import bcrypt from 'bcryptjs';
import { query } from './postgres.js';

const seed = async () => {
  const username = process.env.DEV_ADMIN_USERNAME || 'admin';
  const rawPassword = process.env.DEV_ADMIN_PASSWORD || 'change-me-now';

  const adminExists = await query('SELECT 1 FROM users WHERE username = $1', [username]);

  if (adminExists.rowCount === 0) {
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    await query(
      `INSERT INTO users (id, username, full_name, password_hash, role, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW(), NOW())`,
      [username, 'System Admin', passwordHash, 'Super Admin']
    );

    console.log(`Seeded admin user: ${username}`);
  } else {
    console.log(`Admin user already exists: ${username}`);
  }
};

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
