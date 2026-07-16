// ============================================================
// MIDDLEWARE/AUTH.JS - API Key authentication
// ============================================================
//
// Protects API routes with a shared secret (API key).
// The key is read from the environment variable SP_API_KEY.
//
// Usage in server.js:
//   const auth = require("./middleware/auth");
//   app.use("/api", auth);  // Protect all /api routes
//
// The client (Chrome extension background.js) must send the key
// in the header: X-API-Key: <value>
//
// If SP_API_KEY is not set, the middleware allows all requests
// (development mode — no auth required).
// ============================================================

function authMiddleware(req, res, next) {
  const apiKey = process.env.SP_API_KEY;

  // If no API key configured, skip auth (development mode)
  if (!apiKey) return next();

  // Health check is always public
  if (req.path === "/api/health") return next();

  const clientKey = req.headers["x-api-key"] || req.query.apiKey;

  if (!clientKey || clientKey !== apiKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: invalid or missing API key"
    });
  }

  next();
}

module.exports = authMiddleware;
