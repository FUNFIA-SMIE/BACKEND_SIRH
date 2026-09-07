const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: 'postgres',
  host: 'bore.pub',
  database: 'SIRH',
  password: 'DBfun*123', // pas de mot de passe en dur, même en fallback
  port:  41234, // remplace par le port réel donné par bore
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