const { Router } = require("express");
const { getPool } = require("../config/db");
const { asyncHandler } = require("../utils/query-helper");
const router = Router();

// GET /api/sync - Retorna TODA la data necesaria para la extensión en un solo request
router.get("/", asyncHandler(async (req, res) => {
  const pool = await getPool();

  const [usuariosResult, rolesResult, gruposResult, comentariosResult, versionesResult, configResult, usuarioGrupoResult, usuarioRolResult] = await Promise.all([
    pool.request().query(`
      SELECT IdUsuario, Nombre, Correo, TokenMonday, FechaCumpleanos, CargoCompleto
      FROM vw_MSP_Usuario WITH (NOLOCK)
    `),
    pool.request().query(`SELECT IdcatRol, Nombre FROM MSP_cat_Rol WHERE Activo = 1`),
    pool.request().query(`SELECT IdcatGrupo, Nombre FROM MSP_cat_Grupo WHERE Activo = 1`),
    pool.request().query(`
      SELECT cs.IdComentarioSugerido, cs.Nombre, cs.Comentario, cs.FK_IdcatGrupo, g.IdcatGrupo AS GrupoIdSP
      FROM MSP_ComentarioSugerido cs
      INNER JOIN MSP_cat_Grupo g ON cs.FK_IdcatGrupo = g.IdcatGrupo
      WHERE cs.Activo = 1
    `),
    pool.request().query(`SELECT IdVersion, Version, Cambio, ArchivoZipUrl FROM MSP_Version WHERE Activo = 1 ORDER BY IdVersion DESC`),
    pool.request().query(`SELECT Nombre, Valor FROM MSP_Configuracion WHERE Activo = 1`),
    pool.request().query(`
      SELECT ug.FK_IdUsuario, g.IdcatGrupo
      FROM MSP_rel_UsuarioGrupo ug
      INNER JOIN MSP_cat_Grupo g ON ug.FK_IdcatGrupo = g.IdcatGrupo
      WHERE ug.Activo = 1 AND g.Activo = 1
    `),
    pool.request().query(`
      SELECT ur.FK_IdUsuario, r.Nombre AS RolNombre
      FROM MSP_rel_UsuarioRol ur
      INNER JOIN MSP_cat_Rol r ON ur.FK_IdcatRol = r.IdcatRol
      WHERE ur.Activo = 1 AND r.Activo = 1
    `)
  ]);

  // Build user-groups map (IdUsuario -> [IdcatGrupo])
  const userGroupsMap = {};
  for (const row of usuarioGrupoResult.recordset) {
    if (!userGroupsMap[row.FK_IdUsuario]) userGroupsMap[row.FK_IdUsuario] = [];
    userGroupsMap[row.FK_IdUsuario].push(row.IdcatGrupo);
  }

  // Build user-roles map (IdUsuario -> [rolName lowercase])
  const userRolesMap = {};
  for (const row of usuarioRolResult.recordset) {
    if (!userRolesMap[row.FK_IdUsuario]) userRolesMap[row.FK_IdUsuario] = [];
    userRolesMap[row.FK_IdUsuario].push(row.RolNombre.toLowerCase());
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
    if (g.IdcatGrupo) groupNames[g.IdcatGrupo] = g.Nombre;
  }

  // Build usersMap
  const usersMap = {};
  for (const u of usuariosResult.recordset) {
    const email = (u.Correo || "").toLowerCase();
    if (!email) continue;

    const userRoles = userRolesMap[u.IdUsuario] || [];
    const userGroups = userGroupsMap[u.IdUsuario] || [];

    usersMap[email] = {
      name: u.Nombre,
      roleName: u.CargoCompleto || "usuario",
      groups: userGroups,
      profileId: u.IdUsuario,
      active: true,
      canMigrate: userRoles.some(r => r.includes("migrar monday")),
      btnDashboard: userRoles.some(r => r.includes("dashboard")),
      btnComments: userRoles.some(r => r.includes("comentarios sugeridos")),
      btnReports: userRoles.some(r => r.includes("reporte excel")),
      idUsuario: u.IdUsuario,
      canDragDrop: userRoles.some(r => r.includes("drag")),
      canReassignApp: userRoles.some(r => r.includes("migrar aplicaciones")),
      canAddIAM: userRoles.some(r => r.includes("iam")),
      canShowLabels: userRoles.some(r => r.includes("etiqueta")),
      canReopenTickets: userRoles.some(r => r.includes("reabrir")),
      canCommentClosed: userRoles.some(r => r.includes("comentar con ticket cerrado")),
      canRejectTickets: userRoles.some(r => r.includes("rechazar")),
      canDBAInfo: userRoles.some(r => r.includes("dba info")),
      canGuardias: userRoles.some(r => r.includes("guardias")),
      cumpleanos: u.FechaCumpleanos ? u.FechaCumpleanos.toISOString().slice(0, 10) : null,
      tokenMonday: u.TokenMonday || null
    };
  }

  // Versions
  const allVersions = versionesResult.recordset.map(v => ({ version: v.Version, changes: v.Cambio || "", zipUrl: v.ArchivoZipUrl || "" }));

  // Roles list
  const rolesList = rolesResult.recordset.map(r => r.Nombre);

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
