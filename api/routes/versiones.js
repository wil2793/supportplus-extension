const { Router } = require("express");
const { sql, query, queryOne, insertOne, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/versiones - Listar versiones activas
router.get("/", asyncHandler(async (req, res) => {
  const rows = await query(`
    SELECT IdVersion, Version, Cambio, ArchivoZipUrl, FechaAlta
    FROM MSP_Version WHERE Activo = 1 ORDER BY IdVersion DESC
  `);
  success(res, rows);
}));

// GET /api/versiones/latest - Última versión
router.get("/latest", asyncHandler(async (req, res) => {
  const row = await queryOne(`
    SELECT TOP 1 IdVersion, Version, Cambio, ArchivoZipUrl, FechaAlta
    FROM MSP_Version WHERE Activo = 1 ORDER BY IdVersion DESC
  `);
  if (!row) return fail(res, "No hay versiones", 404);
  success(res, row);
}));

// POST /api/versiones - Crear versión
router.post("/", asyncHandler(async (req, res) => {
  const { version, cambio, archivoZipUrl, usuarioAlta } = req.body;
  if (!version) return fail(res, "version es requerido");

  const inserted = await insertOne(
    `INSERT INTO MSP_Version (Version, Cambio, ArchivoZipUrl, UsuarioAlta)
     OUTPUT INSERTED.IdVersion
     VALUES (@version, @cambio, @zip, @usuario)`,
    {
      version: { type: sql.VarChar(20), value: version },
      cambio: { type: sql.VarChar(1000), value: cambio || null },
      zip: { type: sql.VarChar(500), value: archivoZipUrl || null },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idVersion: inserted.IdVersion }, 201);
}));

module.exports = router;
