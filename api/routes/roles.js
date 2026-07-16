const { Router } = require("express");
const { sql, query, queryOne, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/roles - Listar roles activos
router.get("/", asyncHandler(async (req, res) => {
  const rows = await query(`SELECT IdcatRol, Nombre, Descripcion FROM MSP_cat_Rol WHERE Activo = 1 ORDER BY Nombre`);
  success(res, rows);
}));

// GET /api/roles/:id - Obtener rol por ID
router.get("/:id", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT IdcatRol, Nombre, Descripcion FROM MSP_cat_Rol WHERE IdcatRol = @id AND Activo = 1`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  if (!row) return fail(res, "Rol no encontrado", 404);
  success(res, row);
}));

// POST /api/roles - Crear rol
router.post("/", asyncHandler(async (req, res) => {
  const { nombre, descripcion, usuarioAlta } = req.body;
  if (!nombre) return fail(res, "nombre es requerido");

  const inserted = await insertOne(
    `INSERT INTO MSP_cat_Rol (Nombre, Descripcion, UsuarioAlta)
     OUTPUT INSERTED.IdcatRol
     VALUES (@nombre, @desc, @usuario)`,
    {
      nombre: { type: sql.VarChar(100), value: nombre },
      desc: { type: sql.VarChar(255), value: descripcion || null },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idcatRol: inserted.IdcatRol }, 201);
}));

// DELETE /api/roles/:id - Desactivar rol
router.delete("/:id", asyncHandler(async (req, res) => {
  const { usuarioBaja } = req.body;
  await execute(
    `UPDATE MSP_cat_Rol SET Activo = 0, UsuarioBaja = @usuario, FechaBaja = GETDATE() WHERE IdcatRol = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: usuarioBaja || "SISTEMA" }
    }
  );
  success(res, null);
}));

// POST /api/roles/asignar - Asignar rol a usuario
router.post("/asignar", asyncHandler(async (req, res) => {
  const { fkIdUsuario, fkIdcatRol, usuarioAlta } = req.body;
  if (!fkIdUsuario || !fkIdcatRol) return fail(res, "fkIdUsuario y fkIdcatRol son requeridos");

  // Check not already assigned
  const exists = await queryOne(
    "SELECT 1 FROM MSP_rel_UsuarioRol WHERE FK_IdUsuario = @u AND FK_IdcatRol = @r AND Activo = 1",
    { u: { type: sql.Int, value: fkIdUsuario }, r: { type: sql.Int, value: fkIdcatRol } }
  );
  if (exists) return fail(res, "Rol ya asignado a este usuario");

  const inserted = await insertOne(
    `INSERT INTO MSP_rel_UsuarioRol (FK_IdUsuario, FK_IdcatRol, UsuarioAlta)
     OUTPUT INSERTED.IdrelUsuarioRol
     VALUES (@u, @r, @usuario)`,
    {
      u: { type: sql.Int, value: fkIdUsuario },
      r: { type: sql.Int, value: fkIdcatRol },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idrelUsuarioRol: inserted.IdrelUsuarioRol }, 201);
}));

// DELETE /api/roles/asignar/:id - Quitar rol de usuario
router.delete("/asignar/:id", asyncHandler(async (req, res) => {
  const { usuarioBaja } = req.body;
  await execute(
    `UPDATE MSP_rel_UsuarioRol SET Activo = 0, UsuarioBaja = @usuario, FechaBaja = GETDATE() WHERE IdrelUsuarioRol = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: usuarioBaja || "SISTEMA" }
    }
  );
  success(res, null);
}));

module.exports = router;
