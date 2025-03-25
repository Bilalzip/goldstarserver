const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  ssl: {
    rejectUnauthorized: false,
    require: true
  }
});

// Add error handler for connection issues
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
}; 