// ============================================================
// API/UTILS/QUERY-HELPER.JS - Database query helpers
// Reduces boilerplate in route handlers
// ============================================================

const { sql, getPool } = require("../config/db");

/**
 * Execute a parameterized query and return the recordset.
 * Handles pool acquisition and error propagation automatically.
 *
 * @param {string} queryText - SQL query string
 * @param {Object} [params] - Parameters as { name: { type, value } } or { name: value }
 * @returns {Promise<Array>} - The recordset (array of rows)
 *
 * @example
 * const rows = await query(
 *   "SELECT * FROM Users WHERE Id = @id AND Active = 1",
 *   { id: { type: sql.Int, value: req.params.id } }
 * );
 */
async function query(queryText, params) {
  const pool = await getPool();
  const request = pool.request();

  if (params) {
    for (const [name, spec] of Object.entries(params)) {
      if (spec && typeof spec === "object" && spec.type) {
        request.input(name, spec.type, spec.value);
      } else {
        // Auto-detect type for simple values
        request.input(name, spec);
      }
    }
  }

  const result = await request.query(queryText);
  return result.recordset;
}

/**
 * Execute a query and return the first row, or null if not found.
 *
 * @param {string} queryText
 * @param {Object} [params]
 * @returns {Promise<Object|null>}
 */
async function queryOne(queryText, params) {
  const rows = await query(queryText, params);
  return rows.length ? rows[0] : null;
}

/**
 * Execute an INSERT and return the inserted row (using OUTPUT INSERTED).
 *
 * @param {string} queryText - Must include OUTPUT INSERTED clause
 * @param {Object} [params]
 * @returns {Promise<Object|null>} - The inserted row
 */
async function insertOne(queryText, params) {
  const rows = await query(queryText, params);
  return rows.length ? rows[0] : null;
}

/**
 * Execute an UPDATE/DELETE (no recordset expected).
 *
 * @param {string} queryText
 * @param {Object} [params]
 * @returns {Promise<void>}
 */
async function execute(queryText, params) {
  await query(queryText, params);
}

/**
 * Wrap an async route handler with automatic error forwarding.
 * Eliminates try/catch boilerplate in route handlers.
 *
 * @param {Function} fn - Async route handler (req, res, next)
 * @returns {Function} - Express middleware
 *
 * @example
 * router.get("/", asyncHandler(async (req, res) => {
 *   const rows = await query("SELECT * FROM Users WHERE Active = 1");
 *   res.json({ success: true, data: rows });
 * }));
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Standard success response
 * @param {Object} res - Express response
 * @param {any} data - Response data
 * @param {number} [status=200]
 */
function success(res, data, status) {
  res.status(status || 200).json({ success: true, data: data });
}

/**
 * Standard error response
 * @param {Object} res - Express response
 * @param {string} message - Error message
 * @param {number} [status=400]
 */
function fail(res, message, status) {
  res.status(status || 400).json({ success: false, error: message });
}

module.exports = {
  sql,
  query,
  queryOne,
  insertOne,
  execute,
  asyncHandler,
  success,
  fail
};
