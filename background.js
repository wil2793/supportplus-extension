// ============================================================
// BACKGROUND.JS - Service Worker (Notion sync + API proxy)
// ============================================================

// ─── Configuration ──────────────────────────────────────────
// ⚠️ SECURITY NOTE: This token should ideally be stored in chrome.storage
// and configured by an admin via a settings UI, not hardcoded in source.
// TODO: Move to encrypted storage in a future release.
const NOTION_TOKEN = atob("bnRuX2I4ODI1MjQyODA5NFEzSEFwenZ3NVBoTG1JdmJZYW8xY202d2dWY2RSVUplNUM=");
const NOTION_API = "https://api.notion.com/v1";
const NOTION_HEADERS = {
  "Authorization": "Bearer " + NOTION_TOKEN,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

// Notion Database IDs (centralized)
const DB = {
  USERS: "36620e0684b98051a190e51d38d97288",
  ROLES: "36720e0684b9807aba20c1c3d0536c09",
  GROUPS: "36620e0684b9800e9a57df46019a03e0",
  COMMENTS: "36920e0684b980a19fdbd27302a65feb",
  SUBGROUPS: "36c20e0684b9800db6afe60707a87df7",
  VERSIONS: "36f20e0684b98004b283ec713d3cde8a",
  USER_CONFIG: "37320e0684b9806b84ecc4aae906f645",
  WORK_SCHEDULE: "38420e0684b9808492a6f7d0d43cf1d1"
};

// ─── Notion Helpers ─────────────────────────────────────────

async function notionQuery(dbId, body = {}) {
  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify(body)
  });
  return res.json();
}

async function notionQueryAll(dbId) {
  const all = [];
  let cursor = undefined;
  let hasMore = true;
  while (hasMore) {
    const body = cursor ? { start_cursor: cursor } : {};
    const data = await notionQuery(dbId, body);
    all.push(...(data.results || []));
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  return all;
}

/** Safely extract a property value from a Notion page */
function prop(page, name, type) {
  const p = page.properties[name];
  if (!p) return null;
  switch (type) {
    case "title": return p.title?.[0]?.plain_text || "";
    case "rich_text": return p.rich_text?.[0]?.plain_text || "";
    case "number": return p.number || null;
    case "checkbox": return !!p.checkbox;
    case "relation": return (p.relation || []).map(r => r.id);
    case "files": return p.files || [];
    default: return null;
  }
}

// ─── Sync: Build Groups Map ─────────────────────────────────

function buildGroupsData(groups) {
  const groupsMap = {};       // pageId -> groupId (number)
  const groupNamesMap = {};   // groupId -> name
  const groupMondayConfig = {}; // groupId -> {workspaceId, folderId, etiqueta}

  for (const g of groups) {
    const idSP = prop(g, "IdSupportPlus", "title") || prop(g, "IdSupportPlus", "rich_text");
    const groupName = prop(g, "Grupo", "title") || prop(g, "Nombre", "title") || prop(g, "Grupo", "rich_text") || "";
    if (!idSP) continue;

    const gId = parseInt(idSP);
    groupsMap[g.id] = gId;
    if (groupName) groupNamesMap[gId] = groupName;

    const wsId = g.properties.monday_workspace_id?.number ? String(g.properties.monday_workspace_id.number) : "";
    const folderId = g.properties.monday_folder_id?.number ? String(g.properties.monday_folder_id.number) : "";
    const etiqueta = prop(g, "EtiquetaMonday", "rich_text");
    if (wsId && etiqueta) {
      groupMondayConfig[gId] = { workspaceId: wsId, folderId, etiqueta };
    }
  }

  return { groupsMap, groupNamesMap, groupMondayConfig };
}

// ─── Sync: Build Roles Map ──────────────────────────────────

function buildRolesData(roles, groupsMap) {
  const rolesMap = {};
  const rolesList = [];
  const rolesGroupsMap = {};

  for (const r of roles) {
    const name = prop(r, "Nombre", "title");
    const active = prop(r, "Activo", "checkbox");
    const roleGroups = prop(r, "MSP_cat_Grupos", "relation").map(id => groupsMap[id]).filter(Boolean);
    const canMigrate = prop(r, "PuedeMigrarMonday", "checkbox");
    const btnDashboard = prop(r, "BotonDasboard", "checkbox");
    const btnComments = prop(r, "BotonComentarios", "checkbox");
    const btnReports = prop(r, "BotonReportesExcel", "checkbox");

    rolesMap[r.id] = { name, groups: roleGroups, active, canMigrate, btnDashboard, btnComments, btnReports };

    if (active) {
      rolesGroupsMap[name.toLowerCase()] = roleGroups;
      if (name.toLowerCase() !== "administrador") {
        rolesList.push(name);
      }
    }
  }

  return { rolesMap, rolesList, rolesGroupsMap };
}

// ─── Sync: Build Users Map ──────────────────────────────────

function buildUsersData(users, groupsMap, rolesMap) {
  const usersMap = Object.create(null);

  for (const u of users) {
    const email = (prop(u, "Correo", "rich_text") || prop(u, "Correo", "title")).toLowerCase();
    if (!email || email === "__proto__" || email === "constructor" || email === "prototype") continue;

    const nombre = prop(u, "Nombre", "title");
    const active = prop(u, "Activo", "checkbox");
    const profileId = prop(u, "Id Support Plus", "number");
    const rolRelation = prop(u, "Rol", "relation");
    const rolPageId = rolRelation.length > 0 ? rolRelation[0] : null;
    const userGroups = prop(u, "Grupos Suppor Plus", "relation").map(id => groupsMap[id]).filter(Boolean);

    // Resolve role
    let roleName = "usuario";
    let roleGroups = [];
    let canMigrate = false;
    let btnDashboard = false;
    let btnComments = false;
    let btnReports = false;

    if (rolPageId && rolesMap[rolPageId]) {
      const role = rolesMap[rolPageId];
      roleName = role.name;
      roleGroups = role.groups;
      canMigrate = role.canMigrate;
      btnDashboard = role.btnDashboard;
      btnComments = role.btnComments;
      btnReports = role.btnReports;
    }

    const finalGroups = [...new Set([...roleGroups, ...userGroups])];

    usersMap[email] = {
      name: nombre,
      role: "usuario",
      roleName,
      groups: finalGroups,
      profileId,
      active,
      canMigrate,
      btnDashboard,
      btnComments,
      btnReports,
      notionPageId: u.id
    };
  }

  return usersMap;
}

// ─── Sync: Apply Subgroup Permissions ───────────────────────

function applySubgroupPermissions(users, subGroups, usersMap) {
  const PERM_KEYWORDS = {
    canDragDrop: "drag",
    canReassignApp: "migrar apli",
    canAddIAM: "iamcito",
    canShowLabels: "etiquetas",
    canReopenTickets: "reabrir",
    canCommentClosed: "comentar con ticket cerrado",
    canRejectTickets: "rechazar"
  };

  // For each permission, find the subgroup and collect member page IDs
  const permMembers = {};
  for (const [key, keyword] of Object.entries(PERM_KEYWORDS)) {
    const sg = subGroups.find(s => (prop(s, "Nombre", "title")).toLowerCase().includes(keyword));
    permMembers[key] = sg ? prop(sg, "MSP_Usuarios", "relation") : [];
  }

  // Apply permissions to users
  for (const u of users) {
    const email = (prop(u, "Correo", "rich_text") || prop(u, "Correo", "title")).toLowerCase();
    if (!email || !usersMap[email]) continue;
    for (const [key, members] of Object.entries(permMembers)) {
      if (members.includes(u.id)) usersMap[email][key] = true;
    }
  }
}

// ─── Sync: Get Suggested Comments ───────────────────────────

function buildSuggestedComments(commentsRaw, groupsMap) {
  const suggestedComments = {};
  for (const c of commentsRaw) {
    if (!prop(c, "Activo", "checkbox")) continue;
    const text = prop(c, "Comentario", "rich_text");
    const name = prop(c, "Nombre", "title");
    const commentGroups = prop(c, "MSP_cat_Grupos", "relation").map(id => groupsMap[id]).filter(Boolean);
    for (const gId of commentGroups) {
      if (!suggestedComments[gId]) suggestedComments[gId] = [];
      suggestedComments[gId].push({ id: c.id, text, name });
    }
  }
  return suggestedComments;
}

// ─── Sync: Get Versions ─────────────────────────────────────

async function getVersionsData() {
  const raw = await notionQuery(DB.VERSIONS, {
    filter: { property: "Activo", checkbox: { equals: true } },
    sorts: [{ property: "Fecha de creación", direction: "descending" }]
  });

  const allVersions = [];
  let latestVersion = "";
  let latestZipUrl = "";

  if (raw.results) {
    for (const v of raw.results) {
      const ver = prop(v, "Version", "title");
      const changes = prop(v, "Camios", "rich_text");
      const zipFiles = prop(v, "Archivo zip", "files");
      const zipUrl = zipFiles.length ? (zipFiles[0].external?.url || zipFiles[0].file?.url || "") : "";
      if (ver) allVersions.push({ version: ver, changes, zipUrl });
    }
    if (allVersions.length) {
      latestVersion = allVersions[0].version;
      latestZipUrl = allVersions[0].zipUrl;
    }
  }

  return { allVersions, latestVersion, latestZipUrl };
}

// ─── Sync: Get User Config ──────────────────────────────────

async function getUserConfig(currentEmail, usersMap) {
  if (!currentEmail || !usersMap[currentEmail]?.notionPageId) return {};
  const userNotionId = usersMap[currentEmail].notionPageId;
  const cfgRaw = await notionQuery(DB.USER_CONFIG, {
    filter: { property: "Usuario", relation: { contains: userNotionId } },
    page_size: 1
  });
  if (!cfgRaw.results?.[0]) return {};
  const cfgPage = cfgRaw.results[0];
  return {
    pageId: cfgPage.id,
    blacklist: prop(cfgPage, "BlackList", "relation"),
    onlyWithTickets: prop(cfgPage, "MostrarSoloConTickets", "checkbox")
  };
}

// ─── Sync: Get Work Schedule ────────────────────────────────

async function getWorkSchedule() {
  const schedule = { horaEntrada: 9, horaSalida: 19, diaInicio: "Lunes", diaFinal: "Viernes" };
  try {
    const rows = await notionQueryAll(DB.WORK_SCHEDULE);
    for (const row of rows) {
      const name = prop(row, "Nombre", "title").trim();
      const value = prop(row, "Valor", "rich_text").trim();
      if (name === "HorarioEntrada") schedule.horaEntrada = parseInt(value) || 9;
      if (name === "HorarioSalida") schedule.horaSalida = parseInt(value) || 19;
      if (name === "DiaInicio") schedule.diaInicio = value || "Lunes";
      if (name === "DiaFinal") schedule.diaFinal = value || "Viernes";
    }
  } catch (e) {
    console.log("[SP Background] Work schedule error:", e.message);
  }
  return schedule;
}

// ─── Main Sync Function ─────────────────────────────────────

async function syncNotionData() {
  try {
    // Fetch all data in parallel where possible
    const [users, roles, groups, subGroups, commentsRaw] = await Promise.all([
      notionQueryAll(DB.USERS),
      notionQueryAll(DB.ROLES),
      notionQueryAll(DB.GROUPS),
      notionQueryAll(DB.SUBGROUPS),
      notionQueryAll(DB.COMMENTS)
    ]);

    // Build data structures
    const { groupsMap, groupNamesMap, groupMondayConfig } = buildGroupsData(groups);
    const { rolesMap, rolesList, rolesGroupsMap } = buildRolesData(roles, groupsMap);
    const usersMap = buildUsersData(users, groupsMap, rolesMap);
    applySubgroupPermissions(users, subGroups, usersMap);
    const suggestedComments = buildSuggestedComments(commentsRaw, groupsMap);

    // Get current user email for user-specific data
    const storedData = await chrome.storage.local.get("userEmail");
    const currentEmail = (storedData.userEmail || "").toLowerCase();

    // Get Monday token from user's Notion record
    let mondayTokenFromNotion = "";
    if (currentEmail && usersMap[currentEmail]?.notionPageId) {
      const userPage = users.find(u => u.id === usersMap[currentEmail].notionPageId);
      if (userPage) {
        const encoded = prop(userPage, "token_monday", "rich_text");
        if (encoded) {
          try { mondayTokenFromNotion = atob(encoded); } catch (e) { mondayTokenFromNotion = encoded; }
        }
      }
    }

    // Fetch remaining data (sequential - depends on previous results)
    const [versionsData, userConfig, workSchedule] = await Promise.all([
      getVersionsData(),
      getUserConfig(currentEmail, usersMap),
      getWorkSchedule()
    ]);

    // Save everything to storage
    await chrome.storage.local.set({
      notionUsers: usersMap,
      notionRoles: rolesList,
      notionRolesGroups: rolesGroupsMap,
      groupNames: groupNamesMap,
      groupMondayConfig,
      suggestedComments,
      mondayToken: mondayTokenFromNotion,
      latestVersion: versionsData.latestVersion,
      latestZipUrl: versionsData.latestZipUrl,
      allVersions: versionsData.allVersions,
      userConfig,
      workSchedule,
      notionSyncTime: Date.now()
    });

    console.log("[SP Background] Synced:", Object.keys(usersMap).length, "users,", rolesList.length, "roles,", commentsRaw.length, "comments, monday:", mondayTokenFromNotion ? "OK" : "N/A", "v:", versionsData.latestVersion);
  } catch (e) {
    console.error("[SP Background] Sync error:", e);
  }
}

// Retry wrapper: retries sync up to 2 times with exponential backoff
var _syncRetryCount = 0;
async function syncWithRetry() {
  try {
    await syncNotionData();
    _syncRetryCount = 0;
  } catch (e) {
    _syncRetryCount++;
    if (_syncRetryCount <= 2) {
      var delay = _syncRetryCount * 5000;
      console.log("[SP Background] Sync failed, retry", _syncRetryCount, "in", delay, "ms");
      setTimeout(syncWithRetry, delay);
    } else {
      console.error("[SP Background] Sync failed after 3 attempts:", e.message);
      _syncRetryCount = 0;
    }
  }
}

// ─── Lifecycle Events ───────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  syncWithRetry();
  if (details.reason === "update") {
    chrome.tabs.query({ url: "https://macropay.supportplus.mx/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (version) => {
            alert("⚠️ SupportPlus Tools se actualizó a v" + version + ". La página se recargará.");
            window.location.reload();
          },
          args: [chrome.runtime.getManifest().version]
        }).catch(() => {});
      });
    });
  }
});

chrome.runtime.onStartup.addListener(() => syncWithRetry());

// ─── Message Router ─────────────────────────────────────────

const MESSAGE_HANDLERS = {
  "sync-notion": async () => {
    await syncNotionData();
    return { success: true };
  },

  "notion-query": async (msg) => {
    const data = await fetch(`${NOTION_API}/databases/${msg.dbId || DB.USERS}/query`, {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(msg.body || {})
    }).then(r => r.json());
    return { success: true, data };
  },

  "notion-create": async (msg) => {
    const data = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(msg.body)
    }).then(r => r.json());
    return { success: true, data };
  },

  "notion-update": async (msg) => {
    const data = await fetch(`${NOTION_API}/pages/${msg.pageId}`, {
      method: "PATCH",
      headers: NOTION_HEADERS,
      body: JSON.stringify(msg.body)
    }).then(r => r.json());
    return { success: true, data };
  },

  "notion-delete": async (msg) => {
    const data = await fetch(`${NOTION_API}/pages/${msg.pageId}`, {
      method: "PATCH",
      headers: NOTION_HEADERS,
      body: JSON.stringify({ archived: true })
    }).then(r => r.json());
    return { success: true, data };
  },

  "notion-page": async (msg) => {
    const data = await fetch(`${NOTION_API}/pages/${msg.pageId}`, {
      method: "GET",
      headers: NOTION_HEADERS
    }).then(r => r.json());
    return { success: true, data };
  },

  "notion-pages-batch": async (msg) => {
    const data = await Promise.all(
      (msg.pageIds || []).map(id =>
        fetch(`${NOTION_API}/pages/${id}`, { method: "GET", headers: NOTION_HEADERS }).then(r => r.json())
      )
    );
    return { success: true, data };
  },

  "monday-query": async (msg) => {
    const data = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": msg.token },
      body: JSON.stringify({ query: msg.query, variables: msg.variables })
    }).then(r => r.json());
    if (data.errors) throw new Error(data.errors[0].message);
    return { success: true, data: data.data };
  },

  "proxy-fetch": async (msg) => {
    const res = await fetch(msg.url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buffer = await res.blob().then(b => b.arrayBuffer());
    return { success: true, data: Array.from(new Uint8Array(buffer)) };
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message.type];
  if (!handler) return;

  handler(message)
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Keep channel open for async response
});
