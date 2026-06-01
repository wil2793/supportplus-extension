// ─── Background Service Worker ──────────────────────────
const NOTION_TOKEN = atob("bnRuX2I4ODI1MjQyODA5NFEzSEFwenZ3NVBoTG1JdmJZYW8xY202d2dWY2RSVUplNUM=");
const NOTION_API = "https://api.notion.com/v1";
const NOTION_USERS_DB = "36620e0684b98051a190e51d38d97288";
const NOTION_ROLES_DB = "36720e0684b9807aba20c1c3d0536c09";
const NOTION_GROUPS_DB = "36620e0684b9800e9a57df46019a03e0";
const NOTION_COMMENTS_DB = "36920e0684b980a19fdbd27302a65feb";
const NOTION_CONFIG_DB = "36b20e0684b9807aa115df0bb6b36517";
const NOTION_HEADERS = {
  "Authorization": "Bearer " + NOTION_TOKEN,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function notionQuery(dbId, body = {}) {
  const res = await fetch(NOTION_API + "/databases/" + dbId + "/query", {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify(body)
  });
  return res.json();
}

// Fetch all pages from a database (handles pagination)
async function notionQueryAll(dbId) {
  let all = [];
  let cursor = undefined;
  let hasMore = true;
  while (hasMore) {
    const body = cursor ? { start_cursor: cursor } : {};
    const data = await notionQuery(dbId, body);
    all = all.concat(data.results || []);
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  return all;
}

// Sync Notion data to chrome.storage.local
async function syncNotionData() {
  try {
    // 1. Get all users
    const users = await notionQueryAll(NOTION_USERS_DB);
    // 2. Get all roles
    const roles = await notionQueryAll(NOTION_ROLES_DB);
    // 3. Get all groups
    const groups = await notionQueryAll(NOTION_GROUPS_DB);

    // Build groups map: pageId -> groupId (number)
    const groupsMap = {};
    for (const g of groups) {
      const idSP = g.properties.IdSupportPlus?.title?.[0]?.plain_text || g.properties.IdSupportPlus?.rich_text?.[0]?.plain_text;
      if (idSP) groupsMap[g.id] = parseInt(idSP);
    }

    // Build roles map: pageId -> { name, groups[] }
    const rolesMap = {};
    for (const r of roles) {
      const name = (r.properties.Nombre?.title?.[0]?.plain_text || "").toLowerCase();
      const roleGroups = (r.properties.MSP_cat_Grupos?.relation || []).map(rel => groupsMap[rel.id]).filter(Boolean);
      const canMigrate = r.properties.PuedeMigrarMonday?.checkbox || false;
      rolesMap[r.id] = { name, groups: roleGroups, active: r.properties.Activo?.checkbox, canMigrate };
    }

    // Build users list: email -> { name, role, groups[], profileId, active }
    const usersMap = {};
    for (const u of users) {
      const email = (u.properties.Correo?.rich_text?.[0]?.plain_text || u.properties.Correo?.title?.[0]?.plain_text || "").toLowerCase();
      if (!email) continue;
      const nombre = u.properties.Nombre?.title?.[0]?.plain_text || "";
      const active = u.properties.Activo?.checkbox || false;
      const profileId = u.properties["Id Support Plus"]?.number || null;
      const rolRelation = u.properties.Rol?.relation || [];
      const rolPageId = rolRelation.length > 0 ? rolRelation[0].id : null;
      const userGroups = (u.properties["Grupos Suppor Plus"]?.relation || []).map(rel => groupsMap[rel.id]).filter(Boolean);

      // Resolve role
      let roleName = "usuario";
      let roleGroups = [];
      if (rolPageId && rolesMap[rolPageId]) {
        roleName = rolesMap[rolPageId].name;
        roleGroups = rolesMap[rolPageId].groups;
      }

      // Map role name to code role
      const roleNameMap = { "administrador": "admin", "gerente dba": "gerente", "gerente": "gerente", "director": "director", "ceo": "ceo", "usuario dba": "usuario", "usuario": "usuario" };
      const mappedRole = roleNameMap[roleName] || "usuario";

      // Groups: always use role's groups (they define what the user can see)
      const finalGroups = roleGroups.length > 0 ? roleGroups : userGroups;

      // Can migrate Monday
      const canMigrate = (rolPageId && rolesMap[rolPageId]) ? rolesMap[rolPageId].canMigrate : false;

      usersMap[email] = { name: nombre, role: mappedRole, groups: finalGroups, profileId, active, canMigrate };
    }

    // Check sub-groups for permissions (Drag And Drop)
    const SUBGRUPO_DB = "36c20e0684b9800db6afe60707a87df7";
    const subGroups = await notionQueryAll(SUBGRUPO_DB);
    const dragDropGroup = subGroups.find(sg => (sg.properties.Nombre?.title?.[0]?.plain_text || "").toLowerCase().includes("drag"));
    const dragDropMembers = dragDropGroup ? (dragDropGroup.properties.MSP_Usuarios?.relation || []).map(r => r.id) : [];

    // Mark users who can drag and drop
    for (const u of users) {
      const email = (u.properties.Correo?.rich_text?.[0]?.plain_text || u.properties.Correo?.title?.[0]?.plain_text || "").toLowerCase();
      if (email && usersMap[email]) {
        usersMap[email].canDragDrop = dragDropMembers.includes(u.id);
      }
    }

    // Build roles list for the view switcher (exclude admin)
    const rolesList = [];
    const rolesGroupsMap = {}; // roleName -> groups[]
    for (const r of roles) {
      const name = (r.properties.Nombre?.title?.[0]?.plain_text || "");
      const active = r.properties.Activo?.checkbox;
      const roleNameLower = name.toLowerCase();
      const roleGroups = rolesMap[r.id]?.groups || [];
      if (active) {
        rolesGroupsMap[roleNameLower] = roleGroups;
        if (roleNameLower !== "administrador") {
          rolesList.push(name);
        }
      }
    }

    // 4. Get suggested comments (only active ones)
    const commentsRaw = await notionQueryAll(NOTION_COMMENTS_DB);
    const suggestedComments = {}; // groupId -> [{id, text, name}]
    for (const c of commentsRaw) {
      const active = c.properties.Activo?.checkbox;
      if (!active) continue; // Skip inactive (logically deleted)
      const text = c.properties.Comentario?.rich_text?.[0]?.plain_text || "";
      const name = c.properties.Nombre?.title?.[0]?.plain_text || "";
      const commentGroups = (c.properties.MSP_cat_Grupos?.relation || []).map(rel => groupsMap[rel.id]).filter(Boolean);
      for (const gId of commentGroups) {
        if (!suggestedComments[gId]) suggestedComments[gId] = [];
        suggestedComments[gId].push({ id: c.id, text, name });
      }
    }

    // 5. Get config tokens (Monday token from Notion)
    const configRaw = await notionQueryAll(NOTION_CONFIG_DB);
    let mondayTokenFromNotion = "";
    let mondayWorkspaceId = "";
    let mondayFolderId = "";
    for (const c of configRaw) {
      const name = (c.properties.Nombre?.title?.[0]?.plain_text || "").toLowerCase();
      if (name === "token_monday") {
        mondayTokenFromNotion = c.properties.Valor?.rich_text?.[0]?.plain_text || "";
      } else if (name === "monday_workspace_id") {
        mondayWorkspaceId = c.properties.Valor?.rich_text?.[0]?.plain_text || "";
      } else if (name === "monday_folder_id") {
        mondayFolderId = c.properties.Valor?.rich_text?.[0]?.plain_text || "";
      }
    }

    // 6. Get latest version from Notion
    const VERSIONS_DB = "36f20e0684b98004b283ec713d3cde8a";
    const versionsRaw = await notionQuery(VERSIONS_DB, { filter: { property: "Activo", checkbox: { equals: true } }, sorts: [{ property: "Fecha de creación", direction: "descending" }], page_size: 1 });
    let latestVersion = "";
    let latestZipUrl = "";
    if (versionsRaw.results && versionsRaw.results[0]) {
      latestVersion = versionsRaw.results[0].properties.Version?.title?.[0]?.plain_text || "";
      var zipFiles = versionsRaw.results[0].properties["Archivo zip"]?.files || [];
      if (zipFiles.length) latestZipUrl = zipFiles[0].external?.url || zipFiles[0].file?.url || "";
    }

    // Save to storage
    await chrome.storage.local.set({ notionUsers: usersMap, notionRoles: rolesList, notionRolesGroups: rolesGroupsMap, suggestedComments, mondayToken: mondayTokenFromNotion, mondayWorkspaceId, mondayFolderId, latestVersion, latestZipUrl, notionSyncTime: Date.now() });
    console.log("[SP Background] Notion synced:", Object.keys(usersMap).length, "users,", rolesList.length, "roles,", commentsRaw.length, "comments, monday token:", mondayTokenFromNotion ? "OK" : "MISSING", "latest version:", latestVersion);
  } catch (e) {
    console.error("[SP Background] Notion sync error:", e);
  }
}

// Sync on install/update
chrome.runtime.onInstalled.addListener((details) => {
  syncNotionData();
  // Notify open tabs about the update
  if (details.reason === "update") {
    chrome.tabs.query({ url: "https://macropay.supportplus.mx/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (version) => {
            alert("⚠️ SupportPlus Tools se actualizó a v" + version + ". La página se recargará para aplicar los cambios.");
            window.location.reload();
          },
          args: [chrome.runtime.getManifest().version]
        }).catch(() => {});
      });
    });
  }
});

// Sync on startup
chrome.runtime.onStartup.addListener(() => { syncNotionData(); });

// Sync when content script requests it
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "sync-notion") {
    syncNotionData().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // Keep legacy notion-query for other uses
  if (message.type === "notion-query") {
    fetch(NOTION_API + "/databases/" + (message.dbId || NOTION_USERS_DB) + "/query", {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body || {})
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-create") {
    fetch(NOTION_API + "/pages", {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body)
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-update") {
    fetch(NOTION_API + "/pages/" + message.pageId, {
      method: "PATCH",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body)
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-delete") {
    fetch(NOTION_API + "/pages/" + message.pageId, {
      method: "PATCH",
      headers: NOTION_HEADERS,
      body: JSON.stringify({ archived: true })
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-page") {
    fetch(NOTION_API + "/pages/" + message.pageId, {
      method: "GET",
      headers: NOTION_HEADERS
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-pages-batch") {
    // Fetch multiple pages in parallel
    Promise.all((message.pageIds || []).map(id =>
      fetch(NOTION_API + "/pages/" + id, { method: "GET", headers: NOTION_HEADERS }).then(r => r.json())
    )).then(pages => sendResponse({ success: true, data: pages })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "monday-query") {
    fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": message.token },
      body: JSON.stringify({ query: message.query, variables: message.variables })
    }).then(r => r.json()).then(data => {
      if (data.errors) sendResponse({ success: false, error: data.errors[0].message });
      else sendResponse({ success: true, data: data.data });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
