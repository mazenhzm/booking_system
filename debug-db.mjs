import { getDatabase, sqlGet, sqlRun } from './backend/db/database.js';

const db = getDatabase();
console.log('all tables', JSON.stringify(db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"), null, 2));
console.log('count users', JSON.stringify(sqlGet('SELECT COUNT(*) as c FROM users')));
console.log('admin row', JSON.stringify(sqlGet('SELECT * FROM users WHERE username = ?', ['admin'])));
console.log('row exists query', JSON.stringify(sqlGet('SELECT 1 FROM users WHERE username = ?', ['admin'])));
console.log('manual insert test', (() => {
  try {
    sqlRun('INSERT INTO users (id, username, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?)', ['temp-1', 'tempuser', 'Temp User', 'hash', 'Super Admin']);
    return 'inserted';
  } catch (error) {
    return error.message;
  }
})());
console.log('count users after temp', JSON.stringify(sqlGet('SELECT COUNT(*) as c FROM users')));
