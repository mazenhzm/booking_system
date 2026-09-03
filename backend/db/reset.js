import { query } from './postgres.js';

const reset = async () => {
  await query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
  await query('DROP TABLE IF EXISTS booking_services CASCADE;');
  await query('DROP TABLE IF EXISTS payments CASCADE;');
  await query('DROP TABLE IF EXISTS invoices CASCADE;');
  await query('DROP TABLE IF EXISTS bookings CASCADE;');
  await query('DROP TABLE IF EXISTS decorations CASCADE;');
  await query('DROP TABLE IF EXISTS customers CASCADE;');
  await query('DROP TABLE IF EXISTS users CASCADE;');
  console.log('Development database reset complete.');
};

reset().catch((error) => {
  console.error('Reset failed:', error);
  process.exit(1);
});
