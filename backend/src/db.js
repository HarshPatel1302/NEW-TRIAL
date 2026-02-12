const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const useSsl =
  process.env.PGSSL === "true" ||
  process.env.PGSSLMODE === "require";

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
      database: process.env.PGDATABASE || "receptionist",
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(connectionConfig);

async function query(text, params) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  close,
};
