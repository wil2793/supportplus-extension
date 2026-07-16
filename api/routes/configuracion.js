const { Router } = require("express");
const { sql, query, queryOne, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const router = Router();

// GET /api/configuracion - Listar configuración global
router.get("/", asyncHandler(async (req, res) => {
  const rows = await query(`SELECT IdConfiguracion, Nombre, Valor FROM MSP_Configuracion WHERE Activo = 1`);
  const config = {};
  rows.forEach(r => { config[r.Nombre] = r.Valor; });
  res.json({ success: true, data: config, raw: rows });
}));

// PUT /api/configuracion/:nombre - Actualizar un parámetro
router.put("/:nombre", asyncHandler(async (req, res) => {
  const { valor, usuarioModificacion } = req.body;
  if (valor == null) return fail(res, "valor es requerido");

  await execute(
    `UPDATE MSP_Configuracion SET
       Valor = @valor,
       UsuarioModificacion = @usuario,
       FechaModificacion = GETDATE()
     WHERE Nombre = @nombre AND Activo = 1`,
    {
      nombre: { type: sql.VarChar(100), value: req.params.nombre },
      valor: { type: sql.VarChar(200), value: String(valor) },
      usuario: { type: sql.VarChar(50), value: usuarioModificacion || "SISTEMA" }
    }
  );
  success(res, null);
}));

// GET /api/configuracion/usuario/:idUsuario - Config de usuario
router.get("/usuario/:idUsuario", asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT cu.IdConfiguracionUsuario, cu.MostrarSoloConTickets, cu.BlacklistProfileIds
     FROM MSP_ConfiguracionUsuario cu
     WHERE cu.FK_IdUsuario = @id AND cu.Activo = 1`,
    { id: { type: sql.Int, value: req.params.idUsuario } }
  );

  if (!row) return success(res, null);

  const blacklistStr = row.BlacklistProfileIds || "";
  const blacklist = blacklistStr ? blacklistStr.split(",").map(Number).filter(Boolean) : [];
  success(res, { ...row, blacklist });
}));

// POST /api/configuracion/usuario - Crear/actualizar config de usuario
router.post("/usuario", asyncHandler(async (req, res) => {
  const { fkIdUsuario, mostrarSoloConTickets, blacklist, blacklistByProfileId, usuarioAlta } = req.body;
  if (!fkIdUsuario) return fail(res, "fkIdUsuario es requerido");

  // Determine the profileIds to store
  const profileIds = Array.isArray(blacklistByProfileId) ? blacklistByProfileId : (Array.isArray(blacklist) ? blacklist : null);
  const profileIdsStr = profileIds ? profileIds.join(",") : null;

  // Check if exists
  const existing = await queryOne(
    `SELECT IdConfiguracionUsuario FROM MSP_ConfiguracionUsuario WHERE FK_IdUsuario = @id AND Activo = 1`,
    { id: { type: sql.Int, value: fkIdUsuario } }
  );

  const configId = existing
    ? await (async function () {
        const id = existing.IdConfiguracionUsuario;
        const baseParams = {
          configId: { type: sql.Int, value: id },
          solo: { type: sql.Bit, value: mostrarSoloConTickets ? 1 : 0 },
          usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
        };
        if (profileIdsStr !== null) {
          await execute(
            `UPDATE MSP_ConfiguracionUsuario SET
               MostrarSoloConTickets = @solo,
               BlacklistProfileIds = @blacklist,
               UsuarioModificacion = @usuario,
               FechaModificacion = GETDATE()
             WHERE IdConfiguracionUsuario = @configId`,
            Object.assign({}, baseParams, { blacklist: { type: sql.VarChar(2000), value: profileIdsStr } })
          );
        } else {
          await execute(
            `UPDATE MSP_ConfiguracionUsuario SET
               MostrarSoloConTickets = @solo,
               UsuarioModificacion = @usuario,
               FechaModificacion = GETDATE()
             WHERE IdConfiguracionUsuario = @configId`,
            baseParams
          );
        }
        return id;
      })()
    : await (async function () {
        const inserted = await insertOne(
          `INSERT INTO MSP_ConfiguracionUsuario (FK_IdUsuario, MostrarSoloConTickets, BlacklistProfileIds, UsuarioAlta)
           OUTPUT INSERTED.IdConfiguracionUsuario
           VALUES (@idUser, @solo, @blacklist, @usuario)`,
          {
            idUser: { type: sql.Int, value: fkIdUsuario },
            solo: { type: sql.Bit, value: mostrarSoloConTickets ? 1 : 0 },
            blacklist: { type: sql.VarChar(2000), value: profileIdsStr || "" },
            usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
          }
        );
        return inserted.IdConfiguracionUsuario;
      })();

  success(res, { idConfiguracionUsuario: configId });
}));

module.exports = router;
