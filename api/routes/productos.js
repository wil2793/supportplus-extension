// ============================================================
// ROUTES/PRODUCTOS.JS - Productos y Log (DBA Info)
// ============================================================
const router = require("express").Router();
const {
  query,
  queryOne,
  execute,
  asyncHandler,
  success,
  fail,
} = require("../utils/query-helper");

// GET /api/productos - Obtener todos los productos activos
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT IdcatProducto, Nombre, Descripcion, Cantidad
     FROM ESP_cat_Producto
     WHERE Activo = 1
     ORDER BY Nombre`,
    );
    success(res, rows);
  }),
);

// GET /api/productos/mis-productos/:idUsuario - Productos donde participa el usuario, con miembros de cada uno
router.get(
  "/mis-productos/:idUsuario",
  asyncHandler(async (req, res) => {
    const idUsuario = parseInt(req.params.idUsuario);

    // Get products where this user is assigned
    const misProductos = await query(
      `SELECT p.IdcatProducto, p.Nombre, p.Descripcion, p.Cantidad
     FROM ESP_rel_ProductoUsuario pu
     INNER JOIN ESP_cat_Producto p ON pu.FK_IdcatProducto = p.IdcatProducto
     WHERE pu.FK_IdUsuario = @idUsuario AND pu.Activo = 1 AND p.Activo = 1
     ORDER BY p.Nombre`,
      { idUsuario },
    );

    // For each product, get all members
    const result = [];
    for (const prod of misProductos) {
      const miembros = await query(
        `SELECT u.IdUsuario, u.Nombre
       FROM ESP_rel_ProductoUsuario pu
       INNER JOIN ESP_Usuario u ON pu.FK_IdUsuario = u.IdUsuario
       WHERE pu.FK_IdcatProducto = @idProd AND pu.Activo = 1 AND u.Activo = 1
       ORDER BY u.Nombre`,
        { idProd: prod.IdcatProducto },
      );
      result.push({
        id: prod.IdcatProducto,
        nombre: prod.Nombre,
        descripcion: prod.Descripcion,
        cantidad: prod.Cantidad,
        miembros: miembros,
      });
    }

    success(res, result);
  }),
);

// GET /api/productos/log - Obtener registros activos del log
router.get(
  "/log",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT lp.IdLogProducto, lp.FK_IdcatProducto, lp.FK_IdUsuario, lp.Activo, lp.FechaAlta,
            p.Nombre AS ProductoNombre, u.Nombre AS UsuarioNombre
     FROM ESP_LogProducto lp
     INNER JOIN ESP_cat_Producto p ON lp.FK_IdcatProducto = p.IdcatProducto
     INNER JOIN ESP_Usuario u ON lp.FK_IdUsuario = u.IdUsuario
     WHERE lp.Activo = 1
     ORDER BY lp.FechaAlta ASC`,
    );
    success(res, rows);
  }),
);

// GET /api/productos/log/historial?from=YYYY-MM-DD&to=YYYY-MM-DD - Log por rango de fechas
router.get(
  "/log/historial",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return fail(res, "from y to son requeridos");
    const rows = await query(
      `SELECT lp.IdLogProducto, lp.FK_IdcatProducto, lp.FK_IdUsuario, lp.Activo, lp.FechaAlta,
            p.Nombre AS ProductoNombre, u.Nombre AS UsuarioNombre
     FROM ESP_LogProducto lp
     INNER JOIN ESP_cat_Producto p ON lp.FK_IdcatProducto = p.IdcatProducto
     INNER JOIN ESP_Usuario u ON lp.FK_IdUsuario = u.IdUsuario
     WHERE lp.FechaAlta >= @from AND lp.FechaAlta <= @to
     ORDER BY lp.FechaAlta DESC`,
      { from, to },
    );
    success(res, rows);
  }),
);

// POST /api/productos/log - Registrar consumo de producto
router.post(
  "/log",
  asyncHandler(async (req, res) => {
    const { fkIdProducto, fkIdUsuario, usuarioAlta } = req.body;
    if (!fkIdProducto || !fkIdUsuario)
      return fail(res, "fkIdProducto y fkIdUsuario son requeridos");
    await execute(
      `INSERT INTO ESP_LogProducto (FK_IdcatProducto, FK_IdUsuario, Activo, UsuarioAlta, FechaAlta)
     VALUES (@fkIdProducto, @fkIdUsuario, 1, @usuarioAlta, GETDATE())`,
      { fkIdProducto, fkIdUsuario, usuarioAlta: usuarioAlta || "EXTENSION" },
    );

    // Check if all members of this product have at least 1 active log
    const members = await query(
      "SELECT FK_IdUsuario FROM ESP_rel_ProductoUsuario WHERE FK_IdcatProducto = @p AND Activo = 1",
      { p: fkIdProducto },
    );
    if (members.length > 0) {
      const allHaveLog = await query(
        `SELECT pu.FK_IdUsuario,
              (SELECT COUNT(*) FROM ESP_LogProducto lp WHERE lp.FK_IdcatProducto = @p AND lp.FK_IdUsuario = pu.FK_IdUsuario AND lp.Activo = 1) AS LogCount
       FROM ESP_rel_ProductoUsuario pu
       WHERE pu.FK_IdcatProducto = @p AND pu.Activo = 1`,
        { p: fkIdProducto },
      );
      const everyoneHasOne = allHaveLog.every((r) => r.LogCount >= 1);

      if (everyoneHasOne) {
        // Reset: deactivate the oldest log of each member
        for (const m of allHaveLog) {
          await execute(
            `UPDATE TOP (1) ESP_LogProducto SET Activo = 0, UsuarioModificacion = 'SISTEMA_RESET', FechaModificacion = GETDATE()
           WHERE FK_IdcatProducto = @p AND FK_IdUsuario = @u AND Activo = 1
           AND IdLogProducto = (SELECT TOP 1 IdLogProducto FROM ESP_LogProducto WHERE FK_IdcatProducto = @p AND FK_IdUsuario = @u AND Activo = 1 ORDER BY FechaAlta ASC)`,
            { p: fkIdProducto, u: m.FK_IdUsuario },
          );
        }
      }
    }

    success(res, { message: "Registro creado" });
  }),
);

// PUT /api/productos/log/desactivar - Desactivar el log más antiguo de un producto para un usuario
router.put(
  "/log/desactivar",
  asyncHandler(async (req, res) => {
    const { fkIdProducto, fkIdUsuario, usuarioModificacion } = req.body;
    if (!fkIdProducto || !fkIdUsuario)
      return fail(res, "fkIdProducto y fkIdUsuario son requeridos");

    // Find the oldest active log for this user+product
    const oldest = await queryOne(
      `SELECT TOP 1 IdLogProducto FROM ESP_LogProducto
     WHERE FK_IdcatProducto = @fkIdProducto AND FK_IdUsuario = @fkIdUsuario AND Activo = 1
     ORDER BY FechaAlta ASC`,
      { fkIdProducto, fkIdUsuario },
    );
    if (!oldest) return fail(res, "No hay registro activo para desactivar");

    await execute(
      `UPDATE ESP_LogProducto SET Activo = 0, UsuarioModificacion = @usuario, FechaModificacion = GETDATE()
     WHERE IdLogProducto = @id`,
      { id: oldest.IdLogProducto, usuario: usuarioModificacion || "EXTENSION" },
    );
    success(res, { message: "Registro desactivado" });
  }),
);

// PUT /api/productos/log/reiniciar - Desactivar el log más antiguo de CADA usuario para un producto (reset)
router.put(
  "/log/reiniciar",
  asyncHandler(async (req, res) => {
    const { fkIdProducto, usuarioModificacion } = req.body;
    if (!fkIdProducto) return fail(res, "fkIdProducto es requerido");

    // Get all users that have active logs for this product, pick oldest per user
    const oldests = await query(
      `SELECT t.IdLogProducto FROM (
       SELECT IdLogProducto, FK_IdUsuario, ROW_NUMBER() OVER (PARTITION BY FK_IdUsuario ORDER BY FechaAlta ASC) AS rn
       FROM ESP_LogProducto
       WHERE FK_IdcatProducto = @fkIdProducto AND Activo = 1
     ) t WHERE t.rn = 1`,
      { fkIdProducto },
    );

    if (!oldests.length) return success(res, { deactivated: 0 });

    const ids = oldests.map((r) => r.IdLogProducto).join(",");
    await execute(
      `UPDATE ESP_LogProducto SET Activo = 0, UsuarioModificacion = @usuario, FechaModificacion = GETDATE()
     WHERE IdLogProducto IN (${ids})`,
      { usuario: usuarioModificacion || "EXTENSION" },
    );
    success(res, { deactivated: oldests.length });
  }),
);

// POST /api/productos/asignar-usuario - Asignar un usuario a un producto
router.post(
  "/asignar-usuario",
  asyncHandler(async (req, res) => {
    const { fkIdProducto, fkIdUsuario, usuarioAlta } = req.body;
    if (!fkIdProducto || !fkIdUsuario)
      return fail(res, "fkIdProducto y fkIdUsuario son requeridos");

    // Check not already assigned
    const exists = await queryOne(
      "SELECT 1 FROM ESP_rel_ProductoUsuario WHERE FK_IdcatProducto = @p AND FK_IdUsuario = @u AND Activo = 1",
      { p: fkIdProducto, u: fkIdUsuario },
    );
    if (exists) return success(res, { message: "Ya asignado" });

    await execute(
      `INSERT INTO ESP_rel_ProductoUsuario (FK_IdcatProducto, FK_IdUsuario, UsuarioAlta, FechaAlta, Activo)
     VALUES (@p, @u, @alta, GETDATE(), 1)`,
      { p: fkIdProducto, u: fkIdUsuario, alta: usuarioAlta || "EXTENSION" },
    );
    success(res, { message: "Asignado" }, 201);
  }),
);

// PUT /api/productos/quitar-usuario - Quitar un usuario de un producto
router.put(
  "/quitar-usuario",
  asyncHandler(async (req, res) => {
    const { fkIdProducto, fkIdUsuario, usuarioModificacion } = req.body;
    if (!fkIdProducto || !fkIdUsuario)
      return fail(res, "fkIdProducto y fkIdUsuario son requeridos");

    await execute(
      `UPDATE ESP_rel_ProductoUsuario SET Activo = 0, UsuarioBaja = @mod, FechaBaja = GETDATE()
     WHERE FK_IdcatProducto = @p AND FK_IdUsuario = @u AND Activo = 1`,
      {
        p: fkIdProducto,
        u: fkIdUsuario,
        mod: usuarioModificacion || "EXTENSION",
      },
    );
    success(res, { message: "Desasignado" });
  }),
);

// GET /api/productos/usuario/:idUsuario - Obtener productos asignados a un usuario
router.get(
  "/usuario/:idUsuario",
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT p.IdcatProducto, p.Nombre
     FROM ESP_rel_ProductoUsuario pu
     INNER JOIN ESP_cat_Producto p ON pu.FK_IdcatProducto = p.IdcatProducto
     WHERE pu.FK_IdUsuario = @id AND pu.Activo = 1 AND p.Activo = 1`,
      { id: parseInt(req.params.idUsuario) },
    );
    success(res, rows);
  }),
);

// POST /api/productos/crear - Crear producto y retornar ID
router.post(
  "/crear",
  asyncHandler(async (req, res) => {
    const { nombre, cantidad, usuarioAlta } = req.body;
    if (!nombre) return fail(res, "nombre es requerido");

    const rows = await query(
      `INSERT INTO ESP_cat_Producto (Nombre, Cantidad, UsuarioAlta, FechaAlta, Activo)
     OUTPUT INSERTED.IdcatProducto
     VALUES (@nombre, @cantidad, @alta, GETDATE(), 1)`,
      { nombre, cantidad: cantidad || 1, alta: usuarioAlta || "EXTENSION" },
    );
    const id = rows && rows[0] ? rows[0].IdcatProducto : null;
    success(res, { idcatProducto: id }, 201);
  }),
);

module.exports = router;
