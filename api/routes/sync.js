const { Router } = require("express");
const { getPool } = require("../config/db");
const { asyncHandler } = require("../utils/query-helper");
const router = Router();

// GET /api/sync - Retorna TODA la data necesaria para la extensión en un solo request
router.get("/", asyncHandler(async (req, res) => {
  const pool = await getPool();

  // Ejecutar todas las queries en paralelo
  const [usuariosResult, rolesResult, gruposResult, subrolesResult, comentariosResult, versionesResult, configResult, usuarioGrupoResult, rolSubrolResult] = await Promise.all([
    pool.request().query(`
      SELECT u.IdUsuario, u.Nombre, u.Correo, u.IdSupportPlus, u.FK_IdcatRol, u.TokenMonday, u.FechaCumpleanos,
             r.Nombre AS RolNombre, r.PuedeMigrarMonday, r.BotonDashboard, r.BotonComentario, r.BotonReporteExcel
      FROM MSP_Usuario u
      LEFT JOIN MSP_cat_Rol r ON u.FK_IdcatRol = r.IdcatRol
      WHERE u.Activo = 1
    `),
    pool.request().query(`SELECT IdcatRol, Nombre FROM MSP_cat_Rol WHERE Activo = 1`),
    pool.request().query(`SELECT IdcatGrupo, Nombre, IdSupportPlus FROM MSP_cat_Grupo WHERE Activo = 1`),
    pool.request().query(`SELECT IdcatSubRol, Nombre, Descripcion FROM MSP_cat_SubRol WHERE Activo = 1`),
    pool.request().query(`
      SELECT cs.IdComentarioSugerido, cs.Nombre, cs.Comentario, cs.FK_IdcatGrupo, g.IdSupportPlus AS GrupoIdSP
      FROM MSP_ComentarioSugerido cs
      INNER JOIN MSP_cat_Grupo g ON cs.FK_IdcatGrupo = g.IdcatGrupo
      WHERE cs.Activo = 1
    `),
    pool.request().query(`SELECT IdVersion, Version, Cambio, ArchivoZipUrl FROM MSP_Version WHERE Activo = 1 ORDER BY IdVersion DESC`),
    pool.request().query(`SELECT Nombre, Valor FROM MSP_Configuracion WHERE Activo = 1`),
    pool.request().query(`
      SELECT ug.FK_IdUsuario, g.IdSupportPlus
      FROM MSP_UsuarioGrupo ug
      INNER JOIN MSP_cat_Grupo g ON ug.FK_IdcatGrupo = g.IdcatGrupo
      WHERE ug.Activo = 1 AND g.Activo = 1
    `),
    pool.request().query(`
      SELECT rs.FK_IdcatRol, sr.Nombre AS SubRolNombre
      FROM MSP_RolSubRol rs
      INNER JOIN MSP_cat_SubRol sr ON rs.FK_IdcatSubRol = sr.IdcatSubRol
      WHERE rs.Activo = 1 AND sr.Activo = 1
    `)
  ]);

  // Build user-groups map (IdUsuario -> [IdSupportPlus])
  const userGroupsMap = {};
  for (const row of usuarioGrupoResult.recordset) {
    if (!userGroupsMap[row.FK_IdUsuario]) userGroupsMap[row.FK_IdUsuario] = [];
    userGroupsMap[row.FK_IdUsuario].push(row.IdSupportPlus);
  }

  // Build rol-subroles map (IdcatRol -> [subrolName])
  const rolSubrolesMap = {};
  for (const row of rolSubrolResult.recordset) {
    if (!rolSubrolesMap[row.FK_IdcatRol]) rolSubrolesMap[row.FK_IdcatRol] = [];
    rolSubrolesMap[row.FK_IdcatRol].push(row.SubRolNombre.toLowerCase());
  }

  // Build config map
  const config = {};
  for (const row of configResult.recordset) {
    config[row.Nombre] = row.Valor;
  }

  // Build suggested comments (GrupoIdSP -> [{id, text, name}])
  const suggestedComments = {};
  for (const c of comentariosResult.recordset) {
    const key = c.GrupoIdSP;
    if (!suggestedComments[key]) suggestedComments[key] = [];
    suggestedComments[key].push({ id: c.IdComentarioSugerido, text: c.Comentario, name: c.Nombre || "" });
  }

  // Build groupNames map
  const groupNames = {};
  for (const g of gruposResult.recordset) {
    if (g.IdSupportPlus) groupNames[g.IdSupportPlus] = g.Nombre;
  }

  // Build usersMap
  const usersMap = {};
  for (const u of usuariosResult.recordset) {
    const email = (u.Correo || "").toLowerCase();
    if (!email) continue;

    const userSubroles = u.FK_IdcatRol ? (rolSubrolesMap[u.FK_IdcatRol] || []) : [];
    const userGroups = userGroupsMap[u.IdUsuario] || [];

    usersMap[email] = {
      name: u.Nombre,
      role: "usuario",
      roleName: u.RolNombre || "usuario",
      groups: userGroups,
      profileId: u.IdSupportPlus,
      active: true,
      canMigrate: !!u.PuedeMigrarMonday,
      btnDashboard: u.BotonDashboard !== false && u.BotonDashboard !== 0,
      btnComments: u.BotonComentario !== false && u.BotonComentario !== 0,
      btnReports: u.BotonReporteExcel !== false && u.BotonReporteExcel !== 0,
      notionPageId: String(u.IdUsuario),
      idUsuario: u.IdUsuario,
      canDragDrop: userSubroles.some(s => s.includes("drag")),
      canReassignApp: userSubroles.some(s => s.includes("migrar")),
      canAddIAM: userSubroles.some(s => s.includes("iam")),
      canShowLabels: userSubroles.some(s => s.includes("etiqueta")),
      canReopenTickets: userSubroles.some(s => s.includes("reabrir")),
      canCommentClosed: userSubroles.some(s => s.includes("comentar con ticket cerrado")),
      canRejectTickets: userSubroles.some(s => s.includes("rechazar")),
      canDBAInfo: userSubroles.some(s => s.includes("dba info")),
      cumpleanos: u.FechaCumpleanos ? u.FechaCumpleanos.toISOString().slice(0, 10) : null,
      tokenMonday: u.TokenMonday || null
    };
  }

  // Versions
  const allVersions = versionesResult.recordset.map(v => ({ version: v.Version, changes: v.Cambio || "", zipUrl: v.ArchivoZipUrl || "" }));

  // Roles list
  const rolesList = rolesResult.recordset.map(r => r.Nombre).filter(n => n.toLowerCase() !== "administrador");

  res.json({
    success: true,
    data: {
      usersMap,
      rolesList,
      groupNames,
      suggestedComments,
      allVersions,
      latestVersion: allVersions.length ? allVersions[0].version : "",
      latestZipUrl: allVersions.length ? allVersions[0].zipUrl : "",
      config
    }
  });
}));

module.exports = router;
