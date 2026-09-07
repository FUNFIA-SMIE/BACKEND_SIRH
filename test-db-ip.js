const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: '159.223.110.159',
  database: 'SIRH',
  password: 'DBfun*123',
  port: 11348,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
  .then(res => console.log('OK:', res.rows[0]))
  .catch(err => console.error('ERREUR:', err))
  .finally(() => pool.end());
