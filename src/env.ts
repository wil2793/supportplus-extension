// ============================================================
// SRC/ENV.TS - Local environment overrides
// Este archivo NO se commitea. Úsalo para desarrollo local.
// En producción webpack usa el valor de config.ts directamente.
// ============================================================

export const SP_ENV: { API_URL?: string } = {
  // Uncomment for local development:
  // API_URL: "http://localhost:3500/api",
};
