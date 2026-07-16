const { Router } = require("express");
const { sql, query, queryOne, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/usuarios - Listar usuarios activos
router.get("/", asyncHandler(async (req, res) => {
  const rows = await query(`
    SELECT IdUsuario, Nombre, Correo, CargoCompleto
    FROM vw_MSP_Usuario WITH (NOLOCK)
    ORDER BY Nombre
  `);
  success(res, rows);
}));

// GET /api/usuarios/:id - Obtener usuario por ID
router.get("/:id", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT IdUsuario, Nombre, Correo, TokenMonday, FechaCumpleanos, Cargo, NivelCargo, CargoCompleto
     FROM vw_MSP_Usuario WITH (NOLOCK)
     WHERE IdUsuario = @id`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  if (!row) return fail(res, "Usuario no encontrado", 404);
  success(res, row);
}));

// GET /api/usuarios/correo/:correo - Obtener usuario por correo
router.get("/correo/:correo", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT IdUsuario, Nombre, Correo, TokenMonday, FechaCumpleanos, Cargo, NivelCargo, CargoCompleto
     FROM vw_MSP_Usuario WITH (NOLOCK)
     WHERE Correo = @correo`,
    { correo: { type: sql.VarChar(150), value: req.params.correo } }
  );
  if (!row) return fail(res, "Usuario no encontrado", 404);
  success(res, row);
}));

// GET /api/usuarios/:id/grupos - Obtener grupos de un usuario
router.get("/:id/grupos", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT g.IdcatGrupo, g.Nombre
     FROM MSP_rel_UsuarioGrupo ug
     INNER JOIN MSP_cat_Grupo g ON ug.FK_IdcatGrupo = g.IdcatGrupo
     WHERE ug.FK_IdUsuario = @id AND ug.Activo = 1 AND g.Activo = 1`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  success(res, rows);
}));

// GET /api/usuarios/:id/roles - Obtener roles (permisos) del usuario
router.get("/:id/roles", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT r.IdcatRol, r.Nombre, r.Descripcion
     FROM MSP_rel_UsuarioRol ur
     INNER JOIN MSP_cat_Rol r ON ur.FK_IdcatRol = r.IdcatRol
     WHERE ur.FK_IdUsuario = @id AND ur.Activo = 1 AND r.Activo = 1`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  success(res, rows);
}));

// POST /api/usuarios - Crear usuario
router.post("/", asyncHandler(async (req, res) => {
  const { nombre, correo, fkIdcatCargo, fkIdcatNivelCargo, tokenMonday, usuarioAlta } = req.body;
  if (!nombre || !correo) return fail(res, "nombre y correo son requeridos");

  const inserted = await insertOne(
    `INSERT INTO MSP_Usuario (Nombre, Correo, FK_IdcatCargo, FK_IdcatNivelCargo, TokenMonday, UsuarioAlta)
     OUTPUT INSERTED.IdUsuario
     VALUES (@nombre, @correo, @cargo, @nivel, @token, @usuario)`,
    {
      nombre: { type: sql.VarChar(200), value: nombre },
      correo: { type: sql.VarChar(150), value: correo },
      cargo: { type: sql.Int, value: fkIdcatCargo || null },
      nivel: { type: sql.Int, value: fkIdcatNivelCargo || null },
      token: { type: sql.VarChar(500), value: tokenMonday || null },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idUsuario: inserted.IdUsuario }, 201);
}));

// PUT /api/usuarios/:id - Actualizar usuario
router.put("/:id", asyncHandler(async (req, res) => {
  const { nombre, correo, fkIdcatCargo, fkIdcatNivelCargo, tokenMonday, usuarioModificacion } = req.body;

  await execute(
    `UPDATE MSP_Usuario SET
       Nombre = ISNULL(@nombre, Nombre),
       Correo = ISNULL(@correo, Correo),
       FK_IdcatCargo = ISNULL(@cargo, FK_IdcatCargo),
       FK_IdcatNivelCargo = ISNULL(@nivel, FK_IdcatNivelCargo),
       TokenMonday = ISNULL(@token, TokenMonday),
       UsuarioModificacion = @usuario,
       FechaModificacion = GETDATE()
     WHERE IdUsuario = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      nombre: { type: sql.VarChar(200), value: nombre || null },
      correo: { type: sql.VarChar(150), value: correo || null },
      cargo: { type: sql.Int, value: fkIdcatCargo || null },
      nivel: { type: sql.Int, value: fkIdcatNivelCargo || null },
      token: { type: sql.VarChar(500), value: tokenMonday || null },
      usuario: { type: sql.VarChar(50), value: usuarioModificacion || "SISTEMA" }
    }
  );
  success(res, null);
}));

// DELETE /api/usuarios/:id - Desactivar usuario
router.delete("/:id", asyncHandler(async (req, res) => {
  const { usuarioBaja } = req.body;
  await execute(
    `UPDATE MSP_Usuario SET Activo = 0, UsuarioBaja = @usuario, FechaBaja = GETDATE() WHERE IdUsuario = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: usuarioBaja || "SISTEMA" }
    }
  );
  success(res, null);
}));

module.exports = router;
