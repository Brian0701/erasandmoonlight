// src/db.js — MySQL connection pool (mysql2/promise)
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'eras_moonlight',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  // Ensures dates come back as JS Date objects
  dateStrings:        false,
  timezone:           '+08:00', // Philippine Standard Time
});

// Quick connectivity test on startup
pool.getConnection()
  .then(conn => {
    console.log('✅  MySQL connected — database:', process.env.DB_NAME || 'eras_moonlight');
    conn.release();
  })
  .catch(err => {
    console.error('❌  MySQL connection failed:', err.message);
    console.error('    → Make sure XAMPP MySQL is running and .env is configured.');
  });

module.exports = pool;