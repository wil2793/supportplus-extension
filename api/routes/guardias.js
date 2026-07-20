const { Router } = require("express");
const { sql, query, queryOne, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/guardias?mes=:mes&anio=:anio - Obtener guardias del mes
router.get("/", asyncHandler(async (req, res) => {
  const now = new Date();
  const mes = parseInt(req.query.mes) || (now.getMonth() + 1);
  const anio = parseInt(req.query.anio) || now.getFullYear();
  const startDate = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const lastDay = new Date(anio, mes, 0).getDate();
  const endDate = `${anio}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const rows = await query(
    `SELECT IdControlGuardia, Fecha, FK_IdUsuario, UsuarioNombre, UsuarioCorreo
     FROM vw_ESP_ControlGuardia WITH (NOLOCK)
     WHERE Fecha >= @start AND Fecha <= @end
     ORDER BY Fecha`,
    {
      start: { type: sql.Date, value: startDate },
      end: { type: sql.Date, value: endDate }
    }
  );
  success(res, rows);
}));

// POST /api/guardias - Crear entrada de guardia con usuario(s)
router.post("/", asyncHandler(async (req, res) => {
  const { fecha, fkIdUsuario, fkIdUsuarios, usuarioAlta } = req.body;
  if (!fecha) return fail(res, "fecha es requerido");

  const usuarios = fkIdUsuarios || (fkIdUsuario ? [fkIdUsuario] : []);
  if (!usuarios.length) return fail(res, "fkIdUsuario o fkIdUsuarios es requerido");

  const alta = usuarioAlta || "SISTEMA";

  // Create guardia entry
  const inserted = await insertOne(
    `INSERT INTO ESP_ControlGuardia (Fecha, UsuarioAlta)
     OUTPUT INSERTED.IdControlGuardia
     VALUES (@fecha, @alta)`,
    {
      fecha: { type: sql.Date, value: fecha },
      alta: { type: sql.VarChar(50), value: alta }
    }
  );

  const idGuardia = inserted.IdControlGuardia;

  // Insert relationship(s)
  for (const uid of usuarios) {
    await execute(
      `INSERT INTO ESP_rel_ControlGuardiaUsuario (FK_IdControlGuardia, FK_IdUsuario, UsuarioAlta)
       VALUES (@idGuardia, @idUsuario, @alta)`,
      {
        idGuardia: { type: sql.Int, value: idGuardia },
        idUsuario: { type: sql.Int, value: uid },
        alta: { type: sql.VarChar(50), value: alta }
      }
    );
  }

  success(res, { idControlGuardia: idGuardia }, 201);
}));

// PUT /api/guardias/:id/agregar-usuario - Agregar usuario a una guardia existente
router.put("/:id/agregar-usuario", asyncHandler(async (req, res) => {
  const { fkIdUsuario, usuarioAlta } = req.body;
  if (!fkIdUsuario) return fail(res, "fkIdUsuario es requerido");

  const idGuardia = parseInt(req.params.id);
  const alta = usuarioAlta || "SISTEMA";

  // Check guardia exists
  const guardia = await queryOne("SELECT 1 FROM ESP_ControlGuardia WHERE IdControlGuardia = @id AND Activo = 1", { id: { type: sql.Int, value: idGuardia } });
  if (!guardia) return fail(res, "Guardia no encontrada", 404);

  // Check not already assigned
  const exists = await queryOne(
    "SELECT 1 FROM ESP_rel_ControlGuardiaUsuario WHERE FK_IdControlGuardia = @idG AND FK_IdUsuario = @idU AND Activo = 1",
    { idG: { type: sql.Int, value: idGuardia }, idU: { type: sql.Int, value: fkIdUsuario } }
  );
  if (exists) return fail(res, "Usuario ya asignado a esta guardia");

  await execute(
    `INSERT INTO ESP_rel_ControlGuardiaUsuario (FK_IdControlGuardia, FK_IdUsuario, UsuarioAlta)
     VALUES (@idGuardia, @idUsuario, @alta)`,
    {
      idGuardia: { type: sql.Int, value: idGuardia },
      idUsuario: { type: sql.Int, value: fkIdUsuario },
      alta: { type: sql.VarChar(50), value: alta }
    }
  );
  success(res, null);
}));

// PUT /api/guardias/:id/quitar-usuario - Quitar usuario de una guardia
router.put("/:id/quitar-usuario", asyncHandler(async (req, res) => {
  const { fkIdUsuario, usuarioModificacion } = req.body;
  if (!fkIdUsuario) return fail(res, "fkIdUsuario es requerido");

  const mod = usuarioModificacion || "SISTEMA";

  await execute(
    `UPDATE ESP_rel_ControlGuardiaUsuario
     SET Activo = 0, UsuarioBaja = @mod, FechaBaja = GETDATE()
     WHERE FK_IdControlGuardia = @idG AND FK_IdUsuario = @idU AND Activo = 1`,
    {
      idG: { type: sql.Int, value: parseInt(req.params.id) },
      idU: { type: sql.Int, value: fkIdUsuario },
      mod: { type: sql.VarChar(50), value: mod }
    }
  );
  success(res, null);
}));

// POST /api/guardias/solicitud - Crear solicitud de cambio
router.post("/solicitud", asyncHandler(async (req, res) => {
  const { motivoCambio, fkIdControlGuardiaSolicitado, fkIdControlGuardiaOfrecido, fkIdUsuarioSolicitante, usuarioAlta } = req.body;
  if (!motivoCambio || !fkIdControlGuardiaSolicitado || !fkIdControlGuardiaOfrecido || !fkIdUsuarioSolicitante) {
    return fail(res, "motivoCambio, fkIdControlGuardiaSolicitado, fkIdControlGuardiaOfrecido y fkIdUsuarioSolicitante son requeridos");
  }

  const inserted = await insertOne(
    `INSERT INTO ESP_SolicitudCambioGuardia (MotivoCambio, FK_IdControlGuardiaSolicitado, FK_IdControlGuardiaOfrecido, FK_IdUsuarioSolicitante, UsuarioAlta)
     OUTPUT INSERTED.IdSolicitudCambio
     VALUES (@motivo, @solicitado, @ofrecido, @solicitante, @usuario)`,
    {
      motivo: { type: sql.VarChar(500), value: motivoCambio },
      solicitado: { type: sql.Int, value: fkIdControlGuardiaSolicitado },
      ofrecido: { type: sql.Int, value: fkIdControlGuardiaOfrecido },
      solicitante: { type: sql.Int, value: fkIdUsuarioSolicitante },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idSolicitudCambio: inserted.IdSolicitudCambio }, 201);
}));

// GET /api/guardias/solicitudes?pendientes=true - Listar solicitudes
router.get("/solicitudes", asyncHandler(async (req, res) => {
  const pendienteFilter = req.query.pendientes === "true" ? " AND sc.Aceptado = 0" : "";
  const rows = await query(`
    SELECT sc.IdSolicitudCambio, sc.MotivoCambio, sc.Aceptado,
           sc.FK_IdControlGuardiaSolicitado, sc.FK_IdControlGuardiaOfrecido,
           sc.FK_IdUsuarioSolicitante, us.Nombre AS SolicitanteNombre,
           gs.Fecha AS FechaSolicitada, go2.Fecha AS FechaOfrecida
    FROM ESP_SolicitudCambioGuardia sc
    INNER JOIN ESP_Usuario us ON sc.FK_IdUsuarioSolicitante = us.IdUsuario
    INNER JOIN ESP_ControlGuardia gs ON sc.FK_IdControlGuardiaSolicitado = gs.IdControlGuardia
    INNER JOIN ESP_ControlGuardia go2 ON sc.FK_IdControlGuardiaOfrecido = go2.IdControlGuardia
    WHERE sc.Activo = 1 ${pendienteFilter}
    ORDER BY sc.FechaAlta DESC
  `);
  success(res, rows);
}));

// PUT /api/guardias/solicitud/:id/aceptar - Aceptar solicitud y hacer swap
router.put("/solicitud/:id/aceptar", asyncHandler(async (req, res) => {
  const { usuarioModificacion } = req.body;
  const mod = usuarioModificacion || "SISTEMA";

  // Get solicitud
  const solicitud = await queryOne(
    "SELECT * FROM ESP_SolicitudCambioGuardia WHERE IdSolicitudCambio = @id AND Activo = 1",
    { id: { type: sql.Int, value: req.params.id } }
  );
  if (!solicitud) return fail(res, "Solicitud no encontrada", 404);

  // Get users assigned to each guardia
  const userSolicitado = await queryOne(
    "SELECT FK_IdUsuario FROM ESP_rel_ControlGuardiaUsuario WHERE FK_IdControlGuardia = @id AND Activo = 1",
    { id: { type: sql.Int, value: solicitud.FK_IdControlGuardiaSolicitado } }
  );
  const userOfrecido = await queryOne(
    "SELECT FK_IdUsuario FROM ESP_rel_ControlGuardiaUsuario WHERE FK_IdControlGuardia = @id AND Activo = 1",
    { id: { type: sql.Int, value: solicitud.FK_IdControlGuardiaOfrecido } }
  );

  if (!userSolicitado || !userOfrecido) return fail(res, "Guardias sin usuarios asignados");

  // Swap: deactivate old assignments, create new ones
  await execute(
    `UPDATE ESP_rel_ControlGuardiaUsuario SET Activo = 0, UsuarioBaja = @mod, FechaBaja = GETDATE()
     WHERE FK_IdControlGuardia = @idG AND FK_IdUsuario = @idU AND Activo = 1`,
    { idG: { type: sql.Int, value: solicitud.FK_IdControlGuardiaSolicitado }, idU: { type: sql.Int, value: userSolicitado.FK_IdUsuario }, mod: { type: sql.VarChar(50), value: mod } }
  );
  await execute(
    `UPDATE ESP_rel_ControlGuardiaUsuario SET Activo = 0, UsuarioBaja = @mod, FechaBaja = GETDATE()
     WHERE FK_IdControlGuardia = @idG AND FK_IdUsuario = @idU AND Activo = 1`,
    { idG: { type: sql.Int, value: solicitud.FK_IdControlGuardiaOfrecido }, idU: { type: sql.Int, value: userOfrecido.FK_IdUsuario }, mod: { type: sql.VarChar(50), value: mod } }
  );

  // Insert swapped
  await execute(
    "INSERT INTO ESP_rel_ControlGuardiaUsuario (FK_IdControlGuardia, FK_IdUsuario, UsuarioAlta) VALUES (@idG, @idU, @mod)",
    { idG: { type: sql.Int, value: solicitud.FK_IdControlGuardiaSolicitado }, idU: { type: sql.Int, value: solicitud.FK_IdUsuarioSolicitante }, mod: { type: sql.VarChar(50), value: mod } }
  );
  await execute(
    "INSERT INTO ESP_rel_ControlGuardiaUsuario (FK_IdControlGuardia, FK_IdUsuario, UsuarioAlta) VALUES (@idG, @idU, @mod)",
    { idG: { type: sql.Int, value: solicitud.FK_IdControlGuardiaOfrecido }, idU: { type: sql.Int, value: userSolicitado.FK_IdUsuario }, mod: { type: sql.VarChar(50), value: mod } }
  );

  // Mark solicitud as accepted
  await execute(
    "UPDATE ESP_SolicitudCambioGuardia SET Aceptado = 1, UsuarioModificacion = @mod, FechaModificacion = GETDATE() WHERE IdSolicitudCambio = @id",
    { id: { type: sql.Int, value: parseInt(req.params.id) }, mod: { type: sql.VarChar(50), value: mod } }
  );

  success(res, null);
}));

module.exports = router;
