/*const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: '159.223.110.159',
  database: 'SIRH',
  password: 'DBfun*123',
  port: 23486,
  ssl: { rejectUnauthorized: false }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
*/


const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: '192.168.88.200',
  database: 'SIRH',
  password: 'DBfun*123',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};





/*
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
*/