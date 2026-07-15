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
    `SELECT IdControlGuardia, Fecha, FK_IdUsuario, UsuarioNombre, UsuarioCorreo,
            FK_IdUsuarioAnterior, UsuarioAnteriorNombre
     FROM vw_MSP_ControlGuardia WITH (NOLOCK)
     WHERE Fecha >= @start AND Fecha <= @end
     ORDER BY Fecha`,
    {
      start: { type: sql.Date, value: startDate },
      end: { type: sql.Date, value: endDate }
    }
  );
  success(res, rows);
}));

// POST /api/guardias - Crear entrada de guardia
router.post("/", asyncHandler(async (req, res) => {
  const { fecha, fkIdUsuario, usuarioAlta } = req.body;
  if (!fecha || !fkIdUsuario) return fail(res, "fecha y fkIdUsuario son requeridos");

  const inserted = await insertOne(
    `INSERT INTO MSP_ControlGuardia (Fecha, FK_IdUsuario, UsuarioAlta)
     OUTPUT INSERTED.IdControlGuardia
     VALUES (@fecha, @usuario, @alta)`,
    {
      fecha: { type: sql.Date, value: fecha },
      usuario: { type: sql.Int, value: fkIdUsuario },
      alta: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idControlGuardia: inserted.IdControlGuardia }, 201);
}));

// PUT /api/guardias/:id - Actualizar guardia (cambio de usuario)
router.put("/:id", asyncHandler(async (req, res) => {
  const { fkIdUsuario, fkIdUsuarioAnterior, usuarioModificacion } = req.body;

  await execute(
    `UPDATE MSP_ControlGuardia SET
       FK_IdUsuario = ISNULL(@usuario, FK_IdUsuario),
       FK_IdUsuarioAnterior = @anterior,
       UsuarioModificacion = @mod,
       FechaModificacion = GETDATE()
     WHERE IdControlGuardia = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.Int, value: fkIdUsuario },
      anterior: { type: sql.Int, value: fkIdUsuarioAnterior || null },
      mod: { type: sql.VarChar(50), value: usuarioModificacion || "SISTEMA" }
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
    `INSERT INTO MSP_SolicitudCambioGuardia (MotivoCambio, FK_IdControlGuardiaSolicitado, FK_IdControlGuardiaOfrecido, FK_IdUsuarioSolicitante, UsuarioAlta)
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
  const queryText = `
    SELECT sc.IdSolicitudCambio, sc.MotivoCambio, sc.Aceptado,
           sc.FK_IdControlGuardiaSolicitado, sc.FK_IdControlGuardiaOfrecido,
           sc.FK_IdUsuarioSolicitante, us.Nombre AS SolicitanteNombre,
           gs.Fecha AS FechaSolicitada, go2.Fecha AS FechaOfrecida
    FROM MSP_SolicitudCambioGuardia sc
    INNER JOIN MSP_Usuario us ON sc.FK_IdUsuarioSolicitante = us.IdUsuario
    INNER JOIN MSP_ControlGuardia gs ON sc.FK_IdControlGuardiaSolicitado = gs.IdControlGuardia
    INNER JOIN MSP_ControlGuardia go2 ON sc.FK_IdControlGuardiaOfrecido = go2.IdControlGuardia
    WHERE sc.Activo = 1 ${pendienteFilter}
    ORDER BY sc.FechaAlta DESC
  `;

  const rows = await query(queryText);
  success(res, rows);
}));

// PUT /api/guardias/solicitud/:id/aceptar - Aceptar solicitud y hacer swap
router.put("/solicitud/:id/aceptar", asyncHandler(async (req, res) => {
  const { usuarioModificacion } = req.body;
  const mod = usuarioModificacion || "SISTEMA";

  // Get solicitud
  const solicitud = await queryOne(
    `SELECT * FROM MSP_SolicitudCambioGuardia WHERE IdSolicitudCambio = @id AND Activo = 1`,
    { id: { type: sql.Int, value: req.params.id } }
  );
  if (!solicitud) return fail(res, "Solicitud no encontrada", 404);

  // Get both guardias
  const guardias = await query(
    `SELECT * FROM MSP_ControlGuardia WHERE IdControlGuardia IN (@g1, @g2)`,
    {
      g1: { type: sql.Int, value: solicitud.FK_IdControlGuardiaSolicitado },
      g2: { type: sql.Int, value: solicitud.FK_IdControlGuardiaOfrecido }
    }
  );

  const gSolicitado = guardias.find(g => g.IdControlGuardia === solicitud.FK_IdControlGuardiaSolicitado);
  const gOfrecido = guardias.find(g => g.IdControlGuardia === solicitud.FK_IdControlGuardiaOfrecido);
  if (!gSolicitado || !gOfrecido) return fail(res, "Guardias no encontradas");

  // Swap users
  await execute(
    `UPDATE MSP_ControlGuardia SET FK_IdUsuario = @nuevoUsuario, FK_IdUsuarioAnterior = @anterior, UsuarioModificacion = @mod, FechaModificacion = GETDATE() WHERE IdControlGuardia = @id`,
    {
      id: { type: sql.Int, value: gSolicitado.IdControlGuardia },
      nuevoUsuario: { type: sql.Int, value: solicitud.FK_IdUsuarioSolicitante },
      anterior: { type: sql.Int, value: gSolicitado.FK_IdUsuario },
      mod: { type: sql.VarChar(50), value: mod }
    }
  );

  await execute(
    `UPDATE MSP_ControlGuardia SET FK_IdUsuario = @nuevoUsuario, FK_IdUsuarioAnterior = @anterior, UsuarioModificacion = @mod, FechaModificacion = GETDATE() WHERE IdControlGuardia = @id`,
    {
      id: { type: sql.Int, value: gOfrecido.IdControlGuardia },
      nuevoUsuario: { type: sql.Int, value: gSolicitado.FK_IdUsuario },
      anterior: { type: sql.Int, value: gOfrecido.FK_IdUsuario },
      mod: { type: sql.VarChar(50), value: mod }
    }
  );

  // Mark as accepted
  await execute(
    `UPDATE MSP_SolicitudCambioGuardia SET Aceptado = 1, UsuarioModificacion = @mod, FechaModificacion = GETDATE() WHERE IdSolicitudCambio = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      mod: { type: sql.VarChar(50), value: mod }
    }
  );

  success(res, null);
}));

module.exports = router;
