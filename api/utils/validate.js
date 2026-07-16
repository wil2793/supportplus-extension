// ============================================================
// API/UTILS/VALIDATE.JS - Input validation helpers
// ============================================================

/**
 * Validate that required fields are present in the request body.
 * Returns an error message string if validation fails, or null if valid.
 *
 * @param {Object} body - req.body
 * @param {string[]} requiredFields - Array of required field names
 * @returns {string|null} - Error message or null
 *
 * @example
 * const error = requireFields(req.body, ["nombre", "correo"]);
 * if (error) return fail(res, error);
 */
function requireFields(body, requiredFields) {
  const missing = requiredFields.filter(function (field) {
    return body[field] == null || body[field] === "";
  });
  if (missing.length) {
    return missing.join(", ") + (missing.length === 1 ? " es requerido" : " son requeridos");
  }
  return null;
}

/**
 * Validate that a value is a positive integer.
 * @param {any} value
 * @returns {boolean}
 */
function isPositiveInt(value) {
  const n = parseInt(value);
  return !isNaN(n) && n > 0 && String(n) === String(value);
}

/**
 * Validate email format (basic check)
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

/**
 * Sanitize a string by trimming whitespace. Returns null if empty.
 * @param {any} value
 * @returns {string|null}
 */
function sanitizeString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Express middleware factory for validating required body fields.
 * Short-circuits with 400 if validation fails.
 *
 * @param {string[]} fields - Required field names
 * @returns {Function} - Express middleware
 *
 * @example
 * router.post("/", validateBody(["nombre", "correo"]), asyncHandler(async (req, res) => { ... }));
 */
function validateBody(fields) {
  return function (req, res, next) {
    const error = requireFields(req.body, fields);
    if (error) {
      return res.status(400).json({ success: false, error: error });
    }
    next();
  };
}

module.exports = {
  requireFields,
  isPositiveInt,
  isValidEmail,
  sanitizeString,
  validateBody
};
