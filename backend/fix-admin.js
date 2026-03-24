// Script to reset admin password
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.SQLITE_PATH || '/data/clawpanel.db';

console.log('Connecting to database:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Check if admin user exists
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  
  if (!admin) {
    console.log('Admin user not found, creating...');
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('admin', hash, 'admin');
    console.log('Admin user created successfully');
  } else {
    console.log('Admin user found, updating password...');
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?')
      .run(hash, 'admin');
    console.log('Admin password updated successfully');
  }
  
  console.log('Done! You can now login with: admin / admin');
  db.close();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
