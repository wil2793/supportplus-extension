// ============================================================
// FEATURES/SESSION.JS - Authentication, permissions, user state
// ============================================================

(function () {
  "use strict";

  const SP_CONFIG = window.SP_CONFIG;
  const notionQuery = window.SP_API_Lib.notionQuery;
  const notionCreate = window.SP_API_Lib.notionCreate;
  const notionGetPage = window.SP_API_Lib.notionGetPage;
  const triggerNotionSync = window.SP_API_Lib.triggerNotionSync;
  const getSpToken = window.SP_API_Lib.getSpToken;

  // ─── Session State ────────────────────────────────────────
  const state = {
    userRole: "usuario",
    userName: "",
    userEmail: "",
    profileId: null,
    notionPageId: null,
    groups: [],
    teamArea: "",

    // Permissions
    canMigrateMonday: false,
    canDragDrop: false,
    btnDashboard: true,
    btnComments: true,
    btnReports: true,
    btnReassignApp: false,
    btnAddIAM: false,
    canShowLabels: false,
    canReopenTickets: false,
    canCommentClosed: false,
    canRejectTickets: false,

    // Config
    userConfig: {},
    workSchedule: { horaEntrada: 9, horaSalida: 19, diaInicio: "Lunes", diaFinal: "Viernes" },

    // Runtime flags
    versionBlocked: false,
    lastDropTime: 0,
    hasMondayConfig: false
  };

  // ─── Work Schedule Helper ─────────────────────────────────
  const DAY_MAP = {
    "Domingo": 0, "Lunes": 1, "Martes": 2,
    "Miercoles": 3, "Miércoles": 3, "Jueves": 4,
    "Viernes": 5, "Sabado": 6, "Sábado": 6
  };

  function isWithinWorkHours() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    const startDay = DAY_MAP[state.workSchedule.diaInicio] || 1;
    const endDay = DAY_MAP[state.workSchedule.diaFinal] || 5;
    const inDayRange = currentDay >= startDay && currentDay <= endDay;
    const inHourRange = currentHour >= state.workSchedule.horaEntrada && currentHour < state.workSchedule.horaSalida;
    return inDayRange && inHourRange;
  }

  // ─── Load persisted state from storage ────────────────────
  function loadPersistedState() {
    return SP_Storage.getMultiple(["subgroupPerms", "userConfig", "notionUsers", "userEmail", "workSchedule"])
      .then(function (r) {
        if (r.subgroupPerms) {
          state.canDragDrop = r.subgroupPerms.canDragDrop || false;
          state.btnReassignApp = r.subgroupPerms.canReassignApp || false;
          state.btnAddIAM = r.subgroupPerms.canAddIAM || false;
          state.canShowLabels = r.subgroupPerms.canShowLabels || false;
          state.canReopenTickets = r.subgroupPerms.canReopenTickets || false;
          state.canCommentClosed = r.subgroupPerms.canCommentClosed || false;
          state.canRejectTickets = r.subgroupPerms.canRejectTickets || false;
        } else if (r.notionUsers && r.userEmail) {
          const u = r.notionUsers[(r.userEmail || "").toLowerCase()];
          if (u) {
            state.canDragDrop = !!u.canDragDrop;
            state.btnReassignApp = !!u.canReassignApp;
            state.btnAddIAM = !!u.canAddIAM;
            state.canShowLabels = !!u.canShowLabels;
            state.canReopenTickets = !!u.canReopenTickets;
            state.canCommentClosed = !!u.canCommentClosed;
            state.canRejectTickets = !!u.canRejectTickets;
          }
        }
        if (r.userConfig) state.userConfig = r.userConfig;
        if (r.workSchedule) state.workSchedule = r.workSchedule;
      })
      .catch(function () { /* ignore */ });
  }

  // ─── Check Session ────────────────────────────────────────
  async function checkSession() {
    try {
      // Fetch session with timeout
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 15000);
      const res = await fetch(SP_CONFIG.SP_SESSION_API, {
        headers: { accept: "application/json", authorization: "Bearer " + getSpToken() },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return "usuario";

      const data = await res.json();
      let email = (data && data.user && data.user.email) ? data.user.email.toLowerCase() : "";
      state.userName = (data && data.user && data.user.name) ? data.user.name : "";
      state.userEmail = email;

      if (!email) return null;

      // Save email before triggering sync
      await SP_Storage.set("userEmail", email);

      // Trigger background sync with timeout
      try {
        await Promise.race([
          triggerNotionSync(),
          new Promise(function (resolve) { setTimeout(function () { resolve({ timeout: true }); }, 15000); })
        ]);
      } catch (e) { /* ignore */ }

      // Read synced data
      const stored = await SP_Storage.getMultiple(["notionUsers", "notionRoles", "notionRolesGroups", "suggestedComments", "userConfig", "workSchedule"]);
      if (stored.workSchedule) state.workSchedule = stored.workSchedule;

      const notionUsers = stored.notionUsers || {};
      let userData = notionUsers[email];

      if (!userData) {
        // Check directly in Notion before creating
        try {
          const checkData = await notionQuery(SP_CONFIG.NOTION_USERS_DB, {
            filter: { property: "Correo", rich_text: { equals: email } },
            page_size: 1
          });
          if (checkData && checkData.results && checkData.results.length > 0) {
            // User exists but not in cache - re-sync
            await triggerNotionSync();
            const freshStored = await SP_Storage.get("notionUsers");
            userData = (freshStored || {})[email];
            if (!userData) return null;
          } else {
            // Create user as inactive
            await notionCreate({
              parent: { database_id: SP_CONFIG.NOTION_USERS_DB },
              properties: {
                "Nombre": { title: [{ text: { content: state.userName || email } }] },
                "Correo": { rich_text: [{ text: { content: email } }] },
                "Activo": { checkbox: false }
              }
            }).catch(function () { /* ignore */ });
            return null;
          }
        } catch (e) {
          return null;
        }
      }

      if (!userData.active) return "inactive";

      // Set state from userData
      if (userData.profileId) state.profileId = userData.profileId;
      state.notionPageId = userData.notionPageId;

      if (userData.groups && userData.groups.length > 0) {
        state.groups = userData.groups;
        if (!state.teamArea) state.teamArea = String(userData.groups[0]);
      }

      // Set permissions
      state.canMigrateMonday = !!userData.canMigrate;
      state.btnDashboard = userData.btnDashboard !== false;
      state.btnComments = userData.btnComments !== false;
      state.btnReports = userData.btnReports !== false;
      state.btnReassignApp = !!userData.canReassignApp;
      state.btnAddIAM = !!userData.canAddIAM;
      state.canShowLabels = !!userData.canShowLabels;
      state.canReopenTickets = !!userData.canReopenTickets;
      state.canCommentClosed = !!userData.canCommentClosed;
      state.canRejectTickets = !!userData.canRejectTickets;
      state.canDragDrop = !!userData.canDragDrop;

      if (stored.userConfig) state.userConfig = stored.userConfig;

      // Persist for other modules
      await SP_Storage.setMultiple({
        userEmail: email,
        myProfileId: state.profileId,
        subgroupPerms: {
          canDragDrop: state.canDragDrop,
          canReassignApp: state.btnReassignApp,
          canAddIAM: state.btnAddIAM,
          canShowLabels: state.canShowLabels,
          canReopenTickets: state.canReopenTickets,
          canCommentClosed: state.canCommentClosed,
          canRejectTickets: state.canRejectTickets
        }
      });

      const role = (userData.roleName && userData.roleName.toLowerCase().includes("admin")) ? "admin" : "usuario";
      state.userRole = role;

      return { role: role, roleName: userData.roleName || "usuario", notionPageId: userData.notionPageId };
    } catch (e) {
      return { role: "usuario", roleName: "Usuario" };
    }
  }

  // ─── Resolve Profile ID ───────────────────────────────────
  async function resolveProfileId() {
    if (state.profileId) return state.profileId;
    const name = state.userName || getLoggedUserNameFromDOM();
    if (!name) return null;
    const spToken = getSpToken();
    if (!spToken) return null;
    const groupId = state.teamArea || "19";

    try {
      const res = await fetch(SP_CONFIG.SP_API + "/active-profiles-by-resolution-group/" + groupId, {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) return null;
      const json = await res.json();
      const profiles = json.data || json;
      if (!Array.isArray(profiles)) return null;
      const me = profiles.find(function (p) { return p.profileFullName === name; });
      if (me) {
        state.profileId = me.profileId;
        SP_Storage.set("sessionProfileId", me.profileId);
      }
      return state.profileId;
    } catch (e) {
      return null;
    }
  }

  // ─── DOM Helpers ──────────────────────────────────────────
  function getLoggedUserNameFromDOM() {
    const el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
    return el ? el.textContent.trim() : "";
  }

  // ─── Inject Role Label ────────────────────────────────────
  function injectRoleLabel() {
    SP_Storage.get("userEmail").then(function (email) {
      email = (email || "").toLowerCase();
      if (!email) return;

      notionQuery(SP_CONFIG.NOTION_USERS_DB, {
        filter: { property: "Correo", rich_text: { equals: email } },
        page_size: 1
      }).then(function (data) {
        if (!data || !data.results || !data.results[0]) return;
        const rolRel = data.results[0].properties.Rol && data.results[0].properties.Rol.relation ? data.results[0].properties.Rol.relation : [];
        if (!rolRel.length) return;

        notionGetPage(rolRel[0].id).then(function (roleData) {
          const rn = "";
          try { rn = roleData.properties.Nombre.title[0].plain_text; } catch (e) { return; }
          if (!rn) return;

          SP_DOM.waitForElement('[class*="warapperNameUserAndLogout"]', { maxAttempts: 30, interval: 300 })
            .then(function (wrapper) {
              if (!wrapper) return;
              if (document.getElementById("sp-role-label")) return;
              const nameEl = wrapper.querySelector("p");
              if (!nameEl) return;
              const rl = document.createElement("span");
              rl.id = "sp-role-label";
              rl.className = "sp-role-label";
              rl.textContent = rn;
              nameEl.appendChild(document.createElement("br"));
              nameEl.appendChild(rl);
            });
        }).catch(function () { });
      }).catch(function () { });
    });
  }

  // ─── Show Access Message ──────────────────────────────────
  function showAccessMessage(text) {
    SP_DOM.waitForElement('[class*="warapperNameUserAndLogout"]', { maxAttempts: 30, interval: 500 })
      .then(function (wrapper) {
        if (!wrapper) return;
        if (document.getElementById("sp-inactive-msg")) return;
        const msg = document.createElement("div");
        msg.id = "sp-inactive-msg";
        msg.className = "sp-access-msg";
        msg.textContent = text;
        wrapper.parentElement.insertBefore(msg, wrapper);
      });
  }

  // ─── Init By Role ─────────────────────────────────────────
  function initByRole() {
    SP_Storage.get("groupMondayConfig").then(function (config) {
      config = config || {};
      const groupId = state.teamArea || (state.groups.length ? state.groups[0] : "");
      state.hasMondayConfig = !!(groupId && config[groupId] && config[groupId].etiqueta) && state.canMigrateMonday;
    }).catch(function () { });

    // Fire custom event so content.js (or other modules) can initialize features
    document.dispatchEvent(new CustomEvent("sp-session-ready", { detail: { state: state } }));
  }

  // ─── Initialize ───────────────────────────────────────────
  // Load persisted state immediately
  loadPersistedState();

  // Expose state and functions
  window.SP_Session = {
    state: state,
    checkSession: checkSession,
    resolveProfileId: resolveProfileId,
    isWithinWorkHours: isWithinWorkHours,
    getLoggedUserName: function () { return state.userName || getLoggedUserNameFromDOM(); },
    showAccessMessage: showAccessMessage,
    injectRoleLabel: injectRoleLabel,
    initByRole: initByRole
  };

})();
