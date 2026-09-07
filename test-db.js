const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'bore.pub',
  database: 'SIRH',
  password: 'DBfun*123',
  port: 11348,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
  .then(res => console.log('OK:', res.rows[0]))
  .catch(err => console.error('ERREUR COMPLETE:', err))
  .finally(() => pool.end());
