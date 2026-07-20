const { Router } = require("express");
const { sql, query, insertOne, execute, asyncHandler, success, fail } = require("../utils/query-helper");
const { getPool } = require("../config/db");
const router = Router();

// GET /api/comentarios?grupo=:idGrupo - Listar comentarios sugeridos por grupo
router.get("/", asyncHandler(async (req, res) => {
  const grupoFilter = req.query.grupo ? " AND (cs.FK_IdcatGrupo = @grupo OR g.IdcatGrupo = @grupo)" : "";
  const params = req.query.grupo ? { grupo: { type: sql.Int, value: req.query.grupo } } : {};

  const rows = await query(
    `SELECT cs.IdComentarioSugerido, cs.Nombre, cs.Comentario, cs.FK_IdcatGrupo, g.Nombre AS GrupoNombre, g.IdcatGrupo AS GrupoIdSupportPlus
     FROM ESP_ComentarioSugerido cs
     INNER JOIN ESP_cat_Grupo g ON cs.FK_IdcatGrupo = g.IdcatGrupo
     WHERE cs.Activo = 1${grupoFilter}
     ORDER BY cs.Nombre`,
    params
  );
  success(res, rows);
}));

// POST /api/comentarios - Crear comentario sugerido
router.post("/", asyncHandler(async (req, res) => {
  const { nombre, comentario, fkIdcatGrupo, usuarioAlta } = req.body;
  if (!comentario || !fkIdcatGrupo) return fail(res, "comentario y fkIdcatGrupo son requeridos");

  const inserted = await insertOne(
    `INSERT INTO ESP_ComentarioSugerido (Nombre, Comentario, FK_IdcatGrupo, UsuarioAlta)
     OUTPUT INSERTED.IdComentarioSugerido
     VALUES (@nombre, @comentario, @grupo, @usuario)`,
    {
      nombre: { type: sql.VarChar(100), value: nombre || null },
      comentario: { type: sql.VarChar(500), value: comentario },
      grupo: { type: sql.Int, value: fkIdcatGrupo },
      usuario: { type: sql.VarChar(50), value: usuarioAlta || "SISTEMA" }
    }
  );
  success(res, { idComentarioSugerido: inserted.IdComentarioSugerido }, 201);
}));

// PUT /api/comentarios/:id
router.put("/:id", asyncHandler(async (req, res) => {
  const { nombre, comentario, usuarioModificacion } = req.body;

  await execute(
    `UPDATE ESP_ComentarioSugerido SET
       Nombre = ISNULL(@nombre, Nombre),
       Comentario = ISNULL(@comentario, Comentario),
       UsuarioModificacion = @usuario,
       FechaModificacion = GETDATE()
     WHERE IdComentarioSugerido = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      nombre: { type: sql.VarChar(100), value: nombre || null },
      comentario: { type: sql.VarChar(500), value: comentario || null },
      usuario: { type: sql.VarChar(50), value: usuarioModificacion || "SISTEMA" }
    }
  );
  success(res, null);
}));

// DELETE /api/comentarios/:id - Baja lógica
router.delete("/:id", asyncHandler(async (req, res) => {
  await execute(
    `UPDATE ESP_ComentarioSugerido SET Activo = 0, UsuarioBaja = @usuario, FechaBaja = GETDATE() WHERE IdComentarioSugerido = @id`,
    {
      id: { type: sql.Int, value: req.params.id },
      usuario: { type: sql.VarChar(50), value: (req.body.usuarioBaja || "SISTEMA") }
    }
  );
  success(res, null);
}));

module.exports = router;
