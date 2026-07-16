const { Router } = require("express");
const { sql, query, queryOne, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/grupos - Listar grupos activos
router.get("/", asyncHandler(async (req, res) => {
  const rows = await query(`
    SELECT IdcatGrupo, Nombre
    FROM MSP_cat_Grupo WHERE Activo = 1 ORDER BY Nombre
  `);
  success(res, rows);
}));

// GET /api/grupos/:id - Obtener grupo por ID
router.get("/:id", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT * FROM MSP_cat_Grupo WHERE IdcatGrupo = @id AND Activo = 1`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  if (!row) return fail(res, "Grupo no encontrado", 404);
  success(res, row);
}));

// GET /api/grupos/:id/usuarios - Usuarios de un grupo
router.get("/:id/usuarios", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.IdUsuario, u.Nombre, u.Correo, u.IdUsuario
     FROM MSP_rel_UsuarioGrupo ug
     INNER JOIN MSP_Usuario u ON ug.FK_IdUsuario = u.IdUsuario
     WHERE ug.FK_IdcatGrupo = @id AND ug.Activo = 1 AND u.Activo = 1
     ORDER BY u.Nombre`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  success(res, rows);
}));

// POST /api/grupos/:id/usuarios - Asignar usuario a grupo
router.post("/:id/usuarios", asyncHandler(async (req, res) => {
  const { fkIdUsuario, usuarioAlta } = req.body;
  if (!fkIdUsuario) return fail(res, "fkIdUsuario es requerido");

  // Check if already exists
  const existing = await queryOne(
    `SELECT IdrelUsuarioGrupo FROM MSP_rel_UsuarioGrupo WHERE FK_IdUsuario = @usuario AND FK_IdcatGrupo = @grupo AND Activo = 1`,
    {
      usuario: { type: sql.Int, value: fkIdUsuario },
      grupo: { type: sql.Int, value: req.params.id }
    }
  );
  if (existing) return success(res, { idUsuarioGrupo: existing.IdrelUsuarioGrupo, existed: true });

  const inserted = await insertOne(
    `INSERT INTO MSP_rel_UsuarioGrupo (FK_IdUsuario, FK_IdcatGrupo, UsuarioAlta)
     OUTPUT INSERTED.IdrelUsuarioGrupo
     VALUES (@usuario, @grupo, @alta)`,
    {
      usuario: { type: sql.Int, value: fkIdUsuario },
      grupo: { type: sql.Int, value: req.params.id },
      alta: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idUsuarioGrupo: inserted.IdrelUsuarioGrupo }, 201);
}));

// POST /api/grupos - Crear grupo
router.post("/", asyncHandler(async (req, res) => {
  const { idcatGrupo, nombre, usuarioAlta } = req.body;
  if (!nombre || !idcatGrupo) return fail(res, "idcatGrupo y nombre son requeridos");

  const inserted = await insertOne(
    `INSERT INTO MSP_cat_Grupo (IdcatGrupo, Nombre, UsuarioAlta)
     OUTPUT INSERTED.IdcatGrupo
     VALUES (@id, @nombre, @usuario)`,
    {
      id: { type: sql.Int, value: idcatGrupo },
      nombre: { type: sql.VarChar(150), value: nombre },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idcatGrupo: inserted.IdcatGrupo }, 201);
}));

// PUT /api/grupos/:id
router.put("/:id", asyncHandler(async (req, res) => {
  const { nombre, usuarioModificacion } = req.body;

  await execute(
    `UPDATE MSP_cat_Grupo SET
       Nombre = ISNULL(@nombre, Nombre),
       UsuarioModificacion = @usuario,
       FechaModificacion = GETDATE()
     WHERE IdcatGrupo = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      nombre: { type: sql.VarChar(150), value: nombre || null },
      usuario: { type: sql.VarChar(50), value: usuarioModificacion || "SISTEMA" }
    }
  );
  success(res, null);
}));

// DELETE /api/grupos/:id - Baja lógica
router.delete("/:id", asyncHandler(async (req, res) => {
  await execute(
    `UPDATE MSP_cat_Grupo SET Activo = 0, UsuarioBaja = @usuario, FechaBaja = GETDATE() WHERE IdcatGrupo = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: (req.body.usuarioBaja || "SISTEMA") }
    }
  );
  success(res, null);
}));

module.exports = router;
