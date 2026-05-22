// ─── Background Service Worker ──────────────────────────
const NOTION_TOKEN = "ntn_b88252428094Q3HApzvw5PhLmIvbYao1cm6wgVcdRUJe5C";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_USERS_DB = "36620e0684b98051a190e51d38d97288";
const NOTION_ROLES_DB = "36720e0684b9807aba20c1c3d0536c09";
const NOTION_GROUPS_DB = "36620e0684b9800e9a57df46019a03e0";
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
      rolesMap[r.id] = { name, groups: roleGroups, active: r.properties.Activo?.checkbox };
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

      usersMap[email] = { name: nombre, role: mappedRole, groups: finalGroups, profileId, active };
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

    // Save to storage
    await chrome.storage.local.set({ notionUsers: usersMap, notionRoles: rolesList, notionRolesGroups: rolesGroupsMap, notionSyncTime: Date.now() });
    console.log("[SP Background] Notion synced:", Object.keys(usersMap).length, "users,", rolesList.length, "roles");
  } catch (e) {
    console.error("[SP Background] Notion sync error:", e);
  }
}

// Sync on install/update
chrome.runtime.onInstalled.addListener(() => { syncNotionData(); });

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
});
