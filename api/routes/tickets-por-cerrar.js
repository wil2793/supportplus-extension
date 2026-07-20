const { Router } = require("express");
const { sql, query, queryOne, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/tickets-por-cerrar?grupo=:idGrupo - Listar tickets pendientes (no cerrados)
router.get("/", asyncHandler(async (req, res) => {
  const grupoFilter = req.query.grupo ? " AND t.FK_IdcatGrupo = @grupo" : "";
  const params = req.query.grupo ? { grupo: { type: sql.Int, value: req.query.grupo } } : {};

  const rows = await query(
    `SELECT t.IdTicketPorCerrar, t.Ticket, t.IdSupportPlus, t.FK_IdUsuario, t.FK_IdcatGrupo, t.Cerrado,
            u.Nombre AS UsuarioNombre, u.Correo AS UsuarioCorreo, g.Nombre AS GrupoNombre
     FROM ESP_TicketPorCerrar t
     INNER JOIN ESP_Usuario u ON t.FK_IdUsuario = u.IdUsuario
     LEFT JOIN ESP_cat_Grupo g ON t.FK_IdcatGrupo = g.IdcatGrupo
     WHERE t.Activo = 1 AND t.Cerrado = 0${grupoFilter}
     ORDER BY t.FechaAlta DESC`,
    params
  );
  success(res, rows);
}));

// GET /api/tickets-por-cerrar/existe/:idSupportPlus - Verificar si ticket ya existe
router.get("/existe/:idSupportPlus", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT TOP 1 IdTicketPorCerrar, Cerrado FROM ESP_TicketPorCerrar WHERE IdSupportPlus = @idSP AND Activo = 1`,
    { idSP: { type: sql.Int, value: req.params.idSupportPlus } }
  );
  if (!row) return res.json({ success: true, exists: false });
  res.json({ success: true, exists: true, cerrado: row.Cerrado, data: row });
}));

// POST /api/tickets-por-cerrar - Guardar ticket pendiente
router.post("/", asyncHandler(async (req, res) => {
  const { ticket, idSupportPlus, fkIdUsuario, fkIdcatGrupo, usuarioAlta } = req.body;
  if (!ticket || !idSupportPlus || !fkIdUsuario) return fail(res, "ticket, idSupportPlus y fkIdUsuario son requeridos");

  const inserted = await insertOne(
    `INSERT INTO ESP_TicketPorCerrar (Ticket, IdSupportPlus, FK_IdUsuario, FK_IdcatGrupo, UsuarioAlta)
     OUTPUT INSERTED.IdTicketPorCerrar
     VALUES (@ticket, @idSP, @usuario, @grupo, @alta)`,
    {
      ticket: { type: sql.VarChar(50), value: ticket },
      idSP: { type: sql.Int, value: idSupportPlus },
      usuario: { type: sql.Int, value: fkIdUsuario },
      grupo: { type: sql.Int, value: fkIdcatGrupo || null },
      alta: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idTicketPorCerrar: inserted.IdTicketPorCerrar }, 201);
}));

// PUT /api/tickets-por-cerrar/:id/cerrar - Marcar como cerrado
router.put("/:id/cerrar", asyncHandler(async (req, res) => {
  await execute(
    `UPDATE ESP_TicketPorCerrar SET Cerrado = 1, UsuarioModificacion = @usuario, FechaModificacion = GETDATE()
     WHERE IdTicketPorCerrar = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: (req.body.usuarioModificacion || "SISTEMA") }
    }
  );
  success(res, null);
}));

// PUT /api/tickets-por-cerrar/cerrar-por-sp/:idSupportPlus - Marcar como cerrado por IdSupportPlus
router.put("/cerrar-por-sp/:idSupportPlus", asyncHandler(async (req, res) => {
  await execute(
    `UPDATE ESP_TicketPorCerrar SET Cerrado = 1, UsuarioModificacion = @usuario, FechaModificacion = GETDATE()
     WHERE IdSupportPlus = @idSP AND Cerrado = 0`,
    {
      idSP: { type: sql.Int, value: req.params.idSupportPlus },
      usuario: { type: sql.VarChar(50), value: (req.body.usuarioModificacion || "SISTEMA") }
    }
  );
  success(res, null);
}));

// DELETE /api/tickets-por-cerrar/:id - Baja lógica
router.delete("/:id", asyncHandler(async (req, res) => {
  await execute(
    `UPDATE ESP_TicketPorCerrar SET Activo = 0, UsuarioBaja = @usuario, FechaBaja = GETDATE() WHERE IdTicketPorCerrar = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: (req.body.usuarioBaja || "SISTEMA") }
    }
  );
  success(res, null);
}));

module.exports = router;
