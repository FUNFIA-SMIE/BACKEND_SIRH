/*-const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '192.168.88.200',
  database: process.env.DB_NAME || 'SIRH',
  password: process.env.DB_PASS || 'DBfun*123',
  port: process.env.DB_PORT || 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
*/

const { neon } = require('@neondatabase/serverless');
const { setGlobalDispatcher, Agent } = require('undici');
require('dotenv').config();

// Force IPv4 uniquement pour tous les appels fetch (contourne le blocage IPv6 réseau)
setGlobalDispatcher(new Agent({
  connect: { family: 4 }
}));

const sql = neon(process.env.DATABASE_URL);

// Wrapper compatible avec l'ancienne API pg : db.query(text, params) -> { rows }
async function query(text, params = []) {
  const rows = await sql.query(text, params);
  return { rows };
}

module.exports = { query, sql };