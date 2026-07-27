// ============================================================
// FEATURES/SESSION.JS - Authentication, permissions, user state
// ============================================================

(function () {
  "use strict";

  const SP_CONFIG = window.SP_CONFIG;
  const getSpToken = window.SP_API_Lib.getSpToken;

  // ─── Session State ────────────────────────────────────────
  const state = {
    userRole: "usuario",
    userName: "",
    userEmail: "",
    profileId: null,
    groups: [],
    teamArea: "",

    // Permissions
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
    return SP_Storage.getMultiple(["subgroupPerms", "userConfig", "usersMap", "userEmail", "workSchedule"])
      .then(function (r) {
        if (r.subgroupPerms) {
          state.btnReassignApp = r.subgroupPerms.canReassignApp || false;
          state.btnAddIAM = r.subgroupPerms.canAddIAM || false;
          state.canShowLabels = r.subgroupPerms.canShowLabels || false;
          state.canReopenTickets = r.subgroupPerms.canReopenTickets || false;
          state.canCommentClosed = r.subgroupPerms.canCommentClosed || false;
          state.canRejectTickets = r.subgroupPerms.canRejectTickets || false;
        } else if (r.usersMap && r.userEmail) {
          const u = r.usersMap[(r.userEmail || "").toLowerCase()];
          if (u) {
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
      // Fetch session from SupportPlus portal
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 15000);
      const res = await fetch(SP_CONFIG.SP_SESSION_API, {
        headers: { accept: "application/json", authorization: "Bearer " + getSpToken() },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return "usuario";

      const data = await res.json();
      const email = (data && data.user && data.user.email) ? data.user.email.toLowerCase() : "";
      state.userName = (data && data.user && data.user.name) ? data.user.name : "";
      state.userEmail = email;

      if (!email) return null;

      // Save email + portal token for background API auth
      const portalToken = getSpToken();
      await SP_Storage.set("userEmail", email);
      await SP_Storage.set("portalToken", portalToken);

      // Trigger background sync (API)
      try {
        await Promise.race([
          new Promise(function (resolve) {
            chrome.runtime.sendMessage({ type: "sync" }, function (resp) { resolve(resp || {}); });
          }),
          new Promise(function (resolve) { setTimeout(function () { resolve({ timeout: true }); }, 15000); })
        ]);
      } catch (e) { /* ignore */ }

      // Read synced data from storage
      const stored = await SP_Storage.getMultiple(["usersMap", "userConfig", "workSchedule"]);
      if (stored.workSchedule) state.workSchedule = stored.workSchedule;

      const usersMap = stored.usersMap || {};
      const ctx = { userData: usersMap[email] };

      if (!ctx.userData) {
        // Try cached session first
        const cachedSession = await SP_Storage.get("sp_last_session");
        if (cachedSession && cachedSession.email === email && cachedSession.active) {
          ctx.userData = cachedSession;
        } else {
          // Sync might not have finished — retry with increasing delays
          for (var _retryAttempt = 0; _retryAttempt < 3; _retryAttempt++) {
            await new Promise(function (r) { setTimeout(r, 1500 * (_retryAttempt + 1)); });
            var retryStored = await SP_Storage.get("usersMap");
            var retryMap = retryStored || {};
            if (retryMap[email]) {
              ctx.userData = retryMap[email];
              break;
            }
          }
          // If still nothing, allow with minimal permissions (won't show panels but won't block)
          if (!ctx.userData) {
            ctx.userData = {
              name: state.userName,
              active: true,
              groups: [],
              profileId: null,
              canMigrate: false,
              btnDashboard: false,
              btnComments: false,
              btnReports: false,
            };
          }
        }
      }

      if (!ctx.userData.active) return "inactive";

      // Set state from userData
      if (ctx.userData.profileId) state.profileId = ctx.userData.profileId;

      if (ctx.userData.groups && ctx.userData.groups.length > 0) {
        state.groups = ctx.userData.groups;
        if (!state.teamArea) state.teamArea = String(ctx.userData.groups[0]);
      }

      // Set permissions
      state.btnDashboard = ctx.userData.btnDashboard !== false;
      state.btnComments = ctx.userData.btnComments !== false;
      state.btnReports = ctx.userData.btnReports !== false;
      state.btnReassignApp = !!ctx.userData.canReassignApp;
      state.btnAddIAM = !!ctx.userData.canAddIAM;
      state.canShowLabels = !!ctx.userData.canShowLabels;
      state.canReopenTickets = !!ctx.userData.canReopenTickets;
      state.canCommentClosed = !!ctx.userData.canCommentClosed;
      state.canRejectTickets = !!ctx.userData.canRejectTickets;
      state.canAddParticipant = !!ctx.userData.canAddParticipant;
      state.canAddProduct = !!ctx.userData.canAddProduct;

      if (stored.userConfig) state.userConfig = stored.userConfig;

      // Persist for other modules
      await SP_Storage.setMultiple({
        userEmail: email,
        myProfileId: state.profileId,
        subgroupPerms: {
          canReassignApp: state.btnReassignApp,
          canAddIAM: state.btnAddIAM,
          canShowLabels: state.canShowLabels,
          canReopenTickets: state.canReopenTickets,
          canCommentClosed: state.canCommentClosed,
          canRejectTickets: state.canRejectTickets,
        }
      });

      // Cache session
      await SP_Storage.set("sp_last_session", {
        email: email,
        name: ctx.userData.name,
        roleName: ctx.userData.roleName,
        groups: ctx.userData.groups,
        profileId: ctx.userData.profileId,
        active: ctx.userData.active,
        canMigrate: ctx.userData.canMigrate,
        btnDashboard: ctx.userData.btnDashboard,
        btnComments: ctx.userData.btnComments,
        btnReports: ctx.userData.btnReports,
        canReassignApp: ctx.userData.canReassignApp,
        canAddIAM: ctx.userData.canAddIAM,
        canShowLabels: ctx.userData.canShowLabels,
        canReopenTickets: ctx.userData.canReopenTickets,
        canCommentClosed: ctx.userData.canCommentClosed,
        canRejectTickets: ctx.userData.canRejectTickets,
        cachedAt: Date.now()
      });

      const role = (ctx.userData.roleName && ctx.userData.roleName.toLowerCase().includes("admin")) ? "admin" : "usuario";
      state.userRole = role;

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
    SP_Storage.getMultiple(["userEmail", "usersMap"]).then(function (stored) {
      const email = (stored.userEmail || "").toLowerCase();
      if (!email) return;
      const users = stored.usersMap || {};
      const userData = users[email];
      if (!userData || !userData.roleName) return;

      SP_DOM.waitForElement('[class*="warapperNameUserAndLogout"]', { maxAttempts: 30, interval: 300 })
        .then(function (wrapper) {
          if (!wrapper) return;
          if (document.getElementById("sp-role-label")) return;
          const nameEl = wrapper.querySelector("p");
          if (!nameEl) return;
          const rl = document.createElement("span");
          rl.id = "sp-role-label";
          rl.className = "sp-role-label";
          rl.textContent = userData.roleName;
          nameEl.appendChild(document.createElement("br"));
          nameEl.appendChild(rl);
        });
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
    }).catch(function () { });

    document.dispatchEvent(new CustomEvent("sp-session-ready", { detail: { state: state } }));
  }

  // ─── Initialize ───────────────────────────────────────────
  loadPersistedState();

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
