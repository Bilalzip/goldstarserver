const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false, // Required for Render PostgreSQL
  },
});

// Test the connection
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('Full error:', err);
  }
})();

module.exports = pool;
