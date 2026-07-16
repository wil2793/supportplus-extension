function errorHandler(err, req, res, next) {
  console.error("[API Error]", err.message || err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Error interno del servidor"
  });
}

module.exports = errorHandler;
