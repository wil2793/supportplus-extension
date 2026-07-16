// ============================================================
// ROUTES/PRODUCTOS.JS - Productos y Log (DBA Info)
// ============================================================
const router = require("express").Router();
const { query, queryOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");

// GET /api/productos - Obtener todos los productos activos
router.get("/", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT IdcatProducto, Nombre, Descripcion, Cantidad
     FROM MSP_cat_Producto
     WHERE Activo = 1
     ORDER BY Nombre`
  );
  success(res, rows);
}));

// GET /api/productos/mis-productos/:idUsuario - Productos donde participa el usuario, con miembros de cada uno
router.get("/mis-productos/:idUsuario", asyncHandler(async (req, res) => {
  const idUsuario = parseInt(req.params.idUsuario);

  // Get products where this user is assigned
  const misProductos = await query(
    `SELECT p.IdcatProducto, p.Nombre, p.Descripcion, p.Cantidad
     FROM MSP_rel_ProductoUsuario pu
     INNER JOIN MSP_cat_Producto p ON pu.FK_IdcatProducto = p.IdcatProducto
     WHERE pu.FK_IdUsuario = @idUsuario AND pu.Activo = 1 AND p.Activo = 1
     ORDER BY p.Nombre`,
    { idUsuario }
  );

  // For each product, get all members
  const result = [];
  for (const prod of misProductos) {
    const miembros = await query(
      `SELECT u.IdUsuario, u.Nombre
       FROM MSP_rel_ProductoUsuario pu
       INNER JOIN MSP_Usuario u ON pu.FK_IdUsuario = u.IdUsuario
       WHERE pu.FK_IdcatProducto = @idProd AND pu.Activo = 1 AND u.Activo = 1
       ORDER BY u.Nombre`,
      { idProd: prod.IdcatProducto }
    );
    result.push({
      id: prod.IdcatProducto,
      nombre: prod.Nombre,
      descripcion: prod.Descripcion,
      cantidad: prod.Cantidad,
      miembros: miembros
    });
  }

  success(res, result);
}));

// GET /api/productos/log - Obtener registros activos del log
router.get("/log", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT lp.IdLogProducto, lp.FK_IdcatProducto, lp.FK_IdUsuario, lp.Activo, lp.FechaAlta,
            p.Nombre AS ProductoNombre, u.Nombre AS UsuarioNombre
     FROM MSP_LogProducto lp
     INNER JOIN MSP_cat_Producto p ON lp.FK_IdcatProducto = p.IdcatProducto
     INNER JOIN MSP_Usuario u ON lp.FK_IdUsuario = u.IdUsuario
     WHERE lp.Activo = 1
     ORDER BY lp.FechaAlta ASC`
  );
  success(res, rows);
}));

// GET /api/productos/log/historial?from=YYYY-MM-DD&to=YYYY-MM-DD - Log por rango de fechas
router.get("/log/historial", asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return fail(res, "from y to son requeridos");
  const rows = await query(
    `SELECT lp.IdLogProducto, lp.FK_IdcatProducto, lp.FK_IdUsuario, lp.Activo, lp.FechaAlta,
            p.Nombre AS ProductoNombre, u.Nombre AS UsuarioNombre
     FROM MSP_LogProducto lp
     INNER JOIN MSP_cat_Producto p ON lp.FK_IdcatProducto = p.IdcatProducto
     INNER JOIN MSP_Usuario u ON lp.FK_IdUsuario = u.IdUsuario
     WHERE lp.FechaAlta >= @from AND lp.FechaAlta <= @to
     ORDER BY lp.FechaAlta DESC`,
    { from, to }
  );
  success(res, rows);
}));

// POST /api/productos/log - Registrar consumo de producto
router.post("/log", asyncHandler(async (req, res) => {
  const { fkIdProducto, fkIdUsuario, usuarioAlta } = req.body;
  if (!fkIdProducto || !fkIdUsuario) return fail(res, "fkIdProducto y fkIdUsuario son requeridos");
  await execute(
    `INSERT INTO MSP_LogProducto (FK_IdcatProducto, FK_IdUsuario, Activo, UsuarioAlta, FechaAlta)
     VALUES (@fkIdProducto, @fkIdUsuario, 1, @usuarioAlta, GETDATE())`,
    { fkIdProducto, fkIdUsuario, usuarioAlta: usuarioAlta || "EXTENSION" }
  );
  success(res, { message: "Registro creado" });
}));

// PUT /api/productos/log/desactivar - Desactivar el log más antiguo de un producto para un usuario
router.put("/log/desactivar", asyncHandler(async (req, res) => {
  const { fkIdProducto, fkIdUsuario, usuarioModificacion } = req.body;
  if (!fkIdProducto || !fkIdUsuario) return fail(res, "fkIdProducto y fkIdUsuario son requeridos");
  
  // Find the oldest active log for this user+product
  const oldest = await queryOne(
    `SELECT TOP 1 IdLogProducto FROM MSP_LogProducto
     WHERE FK_IdcatProducto = @fkIdProducto AND FK_IdUsuario = @fkIdUsuario AND Activo = 1
     ORDER BY FechaAlta ASC`,
    { fkIdProducto, fkIdUsuario }
  );
  if (!oldest) return fail(res, "No hay registro activo para desactivar");

  await execute(
    `UPDATE MSP_LogProducto SET Activo = 0, UsuarioModificacion = @usuario, FechaModificacion = GETDATE()
     WHERE IdLogProducto = @id`,
    { id: oldest.IdLogProducto, usuario: usuarioModificacion || "EXTENSION" }
  );
  success(res, { message: "Registro desactivado" });
}));

// PUT /api/productos/log/reiniciar - Desactivar el log más antiguo de CADA usuario para un producto (reset)
router.put("/log/reiniciar", asyncHandler(async (req, res) => {
  const { fkIdProducto, usuarioModificacion } = req.body;
  if (!fkIdProducto) return fail(res, "fkIdProducto es requerido");

  // Get all users that have active logs for this product, pick oldest per user
  const oldests = await query(
    `SELECT t.IdLogProducto FROM (
       SELECT IdLogProducto, FK_IdUsuario, ROW_NUMBER() OVER (PARTITION BY FK_IdUsuario ORDER BY FechaAlta ASC) AS rn
       FROM MSP_LogProducto
       WHERE FK_IdcatProducto = @fkIdProducto AND Activo = 1
     ) t WHERE t.rn = 1`,
    { fkIdProducto }
  );

  if (!oldests.length) return success(res, { deactivated: 0 });

  const ids = oldests.map(r => r.IdLogProducto).join(",");
  await execute(
    `UPDATE MSP_LogProducto SET Activo = 0, UsuarioModificacion = @usuario, FechaModificacion = GETDATE()
     WHERE IdLogProducto IN (${ids})`,
    { usuario: usuarioModificacion || "EXTENSION" }
  );
  success(res, { deactivated: oldests.length });
}));

module.exports = router;
