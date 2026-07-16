const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_NAME || "SupportPlusDB",
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "",
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

const _state = { pool: null };

async function getPool() {
  if (!_state.pool) {
    _state.pool = await sql.connect(config);
  }
  return _state.pool;
}

module.exports = { sql, getPool };
