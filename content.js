(function () {
  console.log("[SP] Extension loading...");

  // Reference components from components.js (loaded before this script)
  var createModal = window.createModal;
  var createHeaderButton = window.createHeaderButton;
  var esc = window.esc;
  var stringToColor = window.stringToColor;

  // Version check against Notion
  var _currentVersion = chrome.runtime.getManifest().version;
  var _versionBlocked = false;
  var _latestVersion = "";
  var _latestZipUrl = "";
  function checkVersion() {
    chrome.storage.local.get(["latestVersion", "latestZipUrl"], function (r) {
      var latest = r.latestVersion || "";
      var zipUrl = r.latestZipUrl || "";
      if (!latest || latest === _currentVersion) {
        // Same version - hide buttons
        var btn = document.getElementById("sp-update-btn");
        if (btn) btn.style.display = "none";
        return;
      }
      _latestVersion = latest;
      _latestZipUrl = zipUrl;
      var cur = _currentVersion.split(".").map(Number);
      var lat = latest.split(".").map(Number);
      if (lat[0] > cur[0]) {
        // Major version change - block everything
        _versionBlocked = true;
        var blocker = document.createElement("div");
        blocker.id = "sp-version-blocker";
        blocker.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;";
        var downloadBtn = zipUrl ? '<button id="sp-blocker-download" style="margin-top:10px;padding:8px 16px;background:#1976D2;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">📥 Descargar v' + latest + '</button>' : '';
        blocker.innerHTML = '<div style="background:#fff;padding:30px;border-radius:12px;text-align:center;max-width:400px;font-family:system-ui;"><h2 style="margin:0 0 12px;color:#D32F2F;">⚠️ Actualización requerida</h2><p style="margin:0 0 8px;font-size:14px;">Tu versión (<b>' + _currentVersion + '</b>) está muy desactualizada.<br>La versión actual es <b>' + latest + '</b>.</p><p style="margin:0;font-size:13px;color:#555;">Actualiza la extensión para continuar usando SupportPlus Tools.</p>' + downloadBtn + '</div>';
        document.body.appendChild(blocker);
        if (zipUrl) document.getElementById("sp-blocker-download").addEventListener("click", function (e) { downloadZip(zipUrl, latest, e); });
      } else {
        // Show update button in header if available
        var btn = document.getElementById("sp-update-btn");
        if (btn) btn.style.display = "inline-block";
      }
    });
  }
  function downloadZip(url, version, e) {
    var btn = e && e.target ? e.target : null;
    if (btn) { btn.textContent = "⏳ Descargando..."; btn.disabled = true; }
    // Try proxy via background first, fallback to direct link
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "proxy-fetch", url: url }, function (resp) {
        if (resp && resp.success) {
          var byteArray = new Uint8Array(resp.data);
          var blob = new Blob([byteArray], { type: "application/zip" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "supportplus-v" + version + ".zip";
          a.click();
          URL.revokeObjectURL(a.href);
          if (btn) { btn.textContent = "✅ Descargado"; }
        } else {
          // Fallback: direct link open (no CORS issue with navigation)
          var a = document.createElement("a");
          a.href = url;
          a.download = "supportplus-v" + version + ".zip";
          a.target = "_blank";
          a.click();
          if (btn) { btn.textContent = "📥 Abriendo..."; setTimeout(function () { btn.textContent = "📥 Descargar"; btn.disabled = false; }, 3000); }
        }
      });
    } else {
      // No background available - direct link
      var a = document.createElement("a");
      a.href = url;
      a.download = "supportplus-v" + version + ".zip";
      a.target = "_blank";
      a.click();
      if (btn) { btn.textContent = "📥 Abriendo..."; setTimeout(function () { btn.textContent = "📥 Descargar"; btn.disabled = false; }, 3000); }
    }
  }
  // Check on load (after a delay to let sync finish)
  setTimeout(checkVersion, 3000);
  // Check on focus
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !_versionBlocked) checkVersion();
  });

  // Make loading backdrop less invasive - thin top bar instead of fullscreen (all users)
  const hideBackdrop = document.createElement("style");
  hideBackdrop.textContent = ".MuiBackdrop-root { background: transparent !important; top: 0 !important; bottom: auto !important; height: 3px !important; opacity: 1 !important; } .MuiBackdrop-root .MuiCircularProgress-root { display: none !important; } .MuiBackdrop-root::after { content: ''; position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: #D94040; animation: sp-loading-bar 1.2s ease-in-out infinite; } @keyframes sp-loading-bar { 0% { left: -30%; } 100% { left: 100%; } }";
  document.head.appendChild(hideBackdrop);

  // Colorear filas por estatus (inmediato, sin esperar Notion - usa MutationObserver ligero)
  const STATUS_BG_COLORS = {
    "Asignado": "rgba(33,150,243,0.18)",
    "En validación": "rgba(156,39,176,0.18)",
    "En atención": "rgba(255,152,0,0.18)",
    "Por aprobador": "rgba(121,85,72,0.18)",
    "Por ejecutar": "rgba(0,150,136,0.18)",
    "Por revisar": "rgba(63,81,181,0.18)",
    "En aplicaciones": "rgba(233,30,99,0.18)",
    "Por confirmar": "rgba(255,193,7,0.20)",
    "Cerrado": "rgba(76,175,80,0.18)",
    "Rechazado": "rgba(244,67,54,0.18)",
    "Cancelado": "rgba(158,158,158,0.20)",
    "Reabierto": "rgba(255,87,34,0.18)",
    "En espera": "rgba(255,235,59,0.20)"
  };
  function colorRowsImmediate() {
    document.querySelectorAll('.MuiDataGrid-row').forEach(function (row) {
      if (row.dataset.spColored) return;
      var cell = row.querySelector('[data-field="ticketStatusName"]');
      if (!cell) return;
      var status = cell.textContent.trim();
      var color = STATUS_BG_COLORS[status];
      if (color) { row.style.backgroundColor = color; row.dataset.spColored = "1"; }
    });
  }
  var _colorObserver = new MutationObserver(colorRowsImmediate);
  _colorObserver.observe(document.body, { childList: true, subtree: true });
  // Also run on load
  colorRowsImmediate();

  // GROUP_INFO: loaded from Notion (groupNames in storage), fallback to config
  var GROUP_INFO = window.SP_CONFIG.GROUP_INFO;
  try {
    chrome.storage.local.get("groupNames", function (r) {
      if (r.groupNames && Object.keys(r.groupNames).length > 0) {
        GROUP_INFO = Object.keys(r.groupNames).map(function (id) {
          return { id: parseInt(id), name: r.groupNames[id] };
        });
      }
    });
  } catch (e) { }

  var currentUserRole = "usuario";
  var currentUserGroups = []; // Groups from Notion
  var canMigrateMonday = false; // Permission from Notion role
  var canDragDrop = false; // Permission from sub-group "Drag And Drop"
  var _btnDashboard = true; // Show dashboard button
  var _btnComments = true; // Show comments button
  var _btnReports = true; // Show reports button
  var _btnReassignApp = false; // Show reassign to apps button (from sub-group)
  var _btnAddIAM = false; // Show add IAM button (from sub-group)
  var _canShowLabels = false; // Show labels/tags (from sub-group)
  var _canReopenTickets = false; // Show reopen button (from sub-group)
  var _canCommentClosed = false; // Allow commenting on closed tickets (from sub-group)
  var _canRejectTickets = false; // Show reject button (from sub-group)
  var _lastDropTime = 0; // Timestamp of last drag-and-drop to prevent accidental modal opens
  var _mondayGroupCache = {}; // Cache of created Monday groups: groupName -> groupId
  var _autoMigrateQueue = Promise.resolve(); // Serial queue for auto-migrations
  var _userConfig = {}; // User config from Notion (blacklist, onlyWithTickets)

  // Load persisted state from storage immediately (like useState initial value)
  try {
    chrome.storage.local.get(["subgroupPerms", "userConfig", "notionUsers", "userEmail"], function (r) {
      // Try subgroupPerms first (set by checkSession)
      if (r.subgroupPerms) {
        canDragDrop = r.subgroupPerms.canDragDrop || false;
        _btnReassignApp = r.subgroupPerms.canReassignApp || false;
        _btnAddIAM = r.subgroupPerms.canAddIAM || false;
        _canShowLabels = r.subgroupPerms.canShowLabels || false;
        _canReopenTickets = r.subgroupPerms.canReopenTickets || false;
        _canCommentClosed = r.subgroupPerms.canCommentClosed || false;
        _canRejectTickets = r.subgroupPerms.canRejectTickets || false;
      } else if (r.notionUsers && r.userEmail) {
        // Fallback: read directly from notionUsers (set by background sync)
        var u = r.notionUsers[(r.userEmail || "").toLowerCase()];
        if (u) {
          canDragDrop = !!u.canDragDrop;
          _btnReassignApp = !!u.canReassignApp;
          _btnAddIAM = !!u.canAddIAM;
          _canShowLabels = !!u.canShowLabels;
          _canReopenTickets = !!u.canReopenTickets;
          _canCommentClosed = !!u.canCommentClosed;
          _canRejectTickets = !!u.canRejectTickets;
        }
      }
      if (r.userConfig) _userConfig = r.userConfig;
    });
  } catch (e) { }

  // Update Monday item person when analyst changes
  async function updateMondayPerson(ticketId, uniqueCode, analystEmail) {
    try {
      var mondayToken = await getMondayToken();
      if (!mondayToken || !analystEmail) return;
      var code = uniqueCode || String(ticketId);
      // Search across all ticket boards
      var ticketBoards = await getMondayTicketBoards(mondayToken);
      var mondayItemId = null, foundBoardId = null;
      for (var b of ticketBoards) {
        var itemRes = await mondayQuery(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: code });
        var items = itemRes.items_page_by_column_values?.items || [];
        if (items.length) { mondayItemId = items[0].id; foundBoardId = b.id; break; }
      }
      if (!mondayItemId) return;
      var users = await getMondayUsers(mondayToken);
      var userId = users[analystEmail.toLowerCase()];
      if (!userId) return;
      var personValue = JSON.stringify({ multiple_person_mm25nvfq: { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] } });
      await mondayQuery(mondayToken, 'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: foundBoardId, itemId: mondayItemId, columnValues: personValue });
      console.log("[SP] Monday person updated:", code, "->", analystEmail);
    } catch (e) { console.log("[SP] Monday person update failed:", e.message); }
  }

  // Update Monday item status when SP ticket status changes
  async function updateMondayStatus(ticketId, uniqueCode, newStatusName) {
    try {
      var mondayToken = await getMondayToken();
      if (!mondayToken) return;
      var code = uniqueCode || String(ticketId);
      // Search across all ticket boards in workspace
      var ticketBoards = await getMondayTicketBoards(mondayToken);
      // Search for the item in each board
      var mondayItemId = null, foundBoardId = null;
      for (var b of ticketBoards) {
        var itemRes = await mondayQuery(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: code });
        var items = itemRes.items_page_by_column_values?.items || [];
        if (items.length) { mondayItemId = items[0].id; foundBoardId = b.id; break; }
      }
      if (!mondayItemId) return;
      var spStatus = (newStatusName || "").toLowerCase();
      var mondayStatusIndex = mapStatusToMonday(spStatus);
      await mondayQuery(mondayToken, 'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: foundBoardId, itemId: mondayItemId, columnValues: JSON.stringify({ status: { index: mondayStatusIndex } }) });
      console.log("[SP] Monday status updated:", code, "->", newStatusName);
    } catch (e) { console.log("[SP] Monday status update failed:", e.message); }
  }



  // --- Session check ---
  var sessionUserName = ""; // Full name from session API, cached globally
  var sessionProfileId = null; // profileId resolved at startup

  async function checkSession() {
    try {
      var res = await fetch("https://macropay.supportplus.mx/api/auth/session", {
        headers: { accept: "application/json", authorization: "Bearer " + (localStorage.getItem("token") || "") }
      });
      if (!res.ok) return "usuario";
      var data = await res.json();
      var email = data?.user?.email?.toLowerCase() || "";
      sessionUserName = data?.user?.name || "";
      _loggedUserEmail = email;

      if (!email) return null;

      // Save email to storage BEFORE triggering sync (background needs it to find user config)
      try { chrome.storage.local.set({ userEmail: email }); } catch (e) { }

      // Trigger background sync and wait (with timeout)
      try {
        await Promise.race([
          new Promise(function (resolve) {
            chrome.runtime.sendMessage({ type: "sync-notion" }, function (resp) { resolve(resp); });
          }),
          new Promise(function (resolve) { setTimeout(function () { resolve({ timeout: true }); }, 15000); })
        ]);
      } catch (e) { }

      // Read synced data from storage
      var stored = await new Promise(function (resolve) {
        chrome.storage.local.get(["notionUsers", "notionRoles", "notionRolesGroups", "suggestedComments", "userConfig"], function (r) { resolve(r); });
      });

      var notionUsers = stored.notionUsers || {};
      var userData = notionUsers[email];

      if (!userData) {
        // Check directly in Notion before creating (avoid duplicates)
        try {
          var checkResp = await new Promise(function (resolve) {
            chrome.runtime.sendMessage({ type: "notion-query", dbId: "36620e0684b98051a190e51d38d97288", body: { filter: { property: "Correo", rich_text: { equals: email } }, page_size: 1 } }, function (resp) { resolve(resp); });
          });
          if (checkResp && checkResp.success && checkResp.data.results && checkResp.data.results.length > 0) {
            // User exists in Notion but wasn't in cache - trigger re-sync and wait
            await new Promise(function(resolve) {
              chrome.runtime.sendMessage({ type: "sync-notion" }, function() { resolve(); });
            });
            // Re-read from storage after sync
            var freshStored = await new Promise(function(resolve) {
              chrome.storage.local.get(["notionUsers"], function(r) { resolve(r); });
            });
            var freshUsers = freshStored.notionUsers || {};
            userData = freshUsers[email];
            if (!userData) return null; // Still not found after sync
          } else {
            // User truly doesn't exist - create as inactive
            chrome.runtime.sendMessage({
              type: "notion-create", body: {
                parent: { database_id: "36620e0684b98051a190e51d38d97288" },
                properties: {
                  "Nombre": { title: [{ text: { content: sessionUserName || email } }] },
                  "Correo": { rich_text: [{ text: { content: email } }] },
                  "Activo": { checkbox: false }
                }
              }
            });
          }
        } catch (e) { }
        return null;
      }
      if (!userData.active) return "inactive";

      // Set profileId
      if (userData.profileId) sessionProfileId = userData.profileId;

      // Set groups
      if (userData.groups && userData.groups.length > 0) {
        currentUserGroups = userData.groups;
        if (!currentTeamArea) currentTeamArea = String(userData.groups[0]);
      }

      // Set permissions from synced data
      canMigrateMonday = !!userData.canMigrate;
      _btnDashboard = userData.btnDashboard !== false;
      _btnComments = userData.btnComments !== false;
      _btnReports = userData.btnReports !== false;
      _btnReassignApp = !!userData.canReassignApp;
      _btnAddIAM = !!userData.canAddIAM;
      _canShowLabels = !!userData.canShowLabels;
      _canReopenTickets = !!userData.canReopenTickets;
      _canCommentClosed = !!userData.canCommentClosed;
      _canRejectTickets = !!userData.canRejectTickets;
      canDragDrop = !!userData.canDragDrop;

      // Set user config
      if (stored.userConfig) _userConfig = stored.userConfig;

      // Persist to storage for immediate use by other functions
      try {
        chrome.storage.local.set({
          userEmail: email,
          myProfileId: sessionProfileId,
          subgroupPerms: { canDragDrop: canDragDrop, canReassignApp: _btnReassignApp, canAddIAM: _btnAddIAM, canShowLabels: _canShowLabels, canReopenTickets: _canReopenTickets, canCommentClosed: _canCommentClosed, canRejectTickets: _canRejectTickets }
        });
      } catch (e) { }

      return { role: userData.roleName && userData.roleName.toLowerCase().includes("admin") ? "admin" : "usuario", roleName: userData.roleName || "usuario", notionPageId: userData.notionPageId };
    } catch (e) { return { role: "usuario", roleName: "Usuario" }; }
  }

  // Resolve profileId from session name at startup (called once after teamArea is loaded)
  async function resolveSessionProfileId() {
    if (sessionProfileId) return sessionProfileId;
    var name = sessionUserName || getLoggedUserNameFromDOM();
    if (!name) return null;
    var spToken = localStorage.getItem("token");
    if (!spToken) return null;
    var groupId = currentTeamArea || "19";
    try {
      var res = await fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) return null;
      var json = await res.json();
      var profiles = json.data || json;
      if (!Array.isArray(profiles)) return null;
      var me = profiles.find(function (p) { return p.profileFullName === name; });
      if (me) {
        sessionProfileId = me.profileId;
        try { chrome.storage.local.set({ sessionProfileId: me.profileId }); } catch (e) { }
      }
      return sessionProfileId;
    } catch (e) { return null; }
  }

  // Helper to get name from DOM (fallback if session name not available yet)
  function getLoggedUserNameFromDOM() {
    var el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
    return el ? el.textContent.trim() : "";
  }

  // Inject header buttons independently of session (retry until wrapper appears)
  (function retryHeaderIndependent(attempts) {
    setTimeout(function() {
      var wrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (wrapper) {
        if (typeof injectConfigButton === "function") injectConfigButton();
        if (typeof injectSearchButton === "function") injectSearchButton();
        if (typeof injectQuickSearch === "function") injectQuickSearch();
        if (typeof injectUpdateButton === "function") injectUpdateButton();
      } else if (attempts < 50) {
        retryHeaderIndependent(attempts + 1);
      }
    }, 100);
  })(0);

  checkSession().then(function (result) {
    if (result === null) { showAccessMessage("⚠️ Usuario no registrado en SupportPlus Tools. Solicite su alta con el administrador."); injectFolioButtons(); return; }
    if (result === "inactive") { showAccessMessage("⚠️ Usuario inactivo en SupportPlus Tools. Solicite su reactivación con el administrador."); injectFolioButtons(); return; }
    currentUserRole = result.role || result;
    initByRole();

    // Inject role label (independent, after everything loads)
    chrome.storage.local.get("userEmail", function (r) {
      var email = (r.userEmail || "").toLowerCase();
      if (!email) return;
      chrome.runtime.sendMessage({ type: "notion-query", dbId: "36620e0684b98051a190e51d38d97288", body: { filter: { property: "Correo", rich_text: { equals: email } }, page_size: 1 } }, function (resp) {
        if (!resp || !resp.success || !resp.data.results || !resp.data.results[0]) return;
        var rolRel = resp.data.results[0].properties.Rol?.relation || [];
        if (!rolRel.length) return;
        chrome.runtime.sendMessage({ type: "notion-page", pageId: rolRel[0].id }, function (roleResp) {
          if (!roleResp || !roleResp.success) return;
          var rn = roleResp.data?.properties?.Nombre?.title?.[0]?.plain_text || "";
          if (!rn) return;
          var iv = setInterval(function () {
            var wrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
            if (!wrapper) return;
            clearInterval(iv);
            if (document.getElementById("sp-role-label")) return;
            var nameEl = wrapper.querySelector("p");
            if (!nameEl) return;
            var rl = document.createElement("span");
            rl.id = "sp-role-label";
            rl.textContent = rn;
            rl.style.cssText = "display:block;font-size:11px;color:#fff;opacity:0.6;font-weight:400;margin-top:2px;text-transform:uppercase;text-align:right;";
            nameEl.appendChild(document.createElement("br"));
            nameEl.appendChild(rl);
          }, 300);
        });
      });
    });
  });

  function showAccessMessage(text) {
    var attempts = 0;
    var interval = setInterval(function () {
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper && attempts < 30) { attempts++; return; }
      clearInterval(interval);
      if (!userWrapper) return;
      if (document.getElementById("sp-inactive-msg")) return;
      var msg = document.createElement("div");
      msg.id = "sp-inactive-msg";
      msg.style.cssText = "padding:4px 12px;font-size:11px;border-radius:4px;background:rgba(217,64,64,0.15);color:#D94040;border:1px solid rgba(217,64,64,0.3);margin-right:8px;font-weight:600;";
      msg.textContent = text;
      userWrapper.parentElement.insertBefore(msg, userWrapper);
    }, 500);
  }

  function initByRole() {
    // Update Monday config based on canMigrateMonday permission and group config
    try {
      chrome.storage.local.get(["groupMondayConfig"], function (r) {
        var config = r.groupMondayConfig || {};
        var groupId = currentTeamArea || (currentUserGroups.length ? currentUserGroups[0] : "");
        hasMondayConfig = !!(groupId && config[groupId] && config[groupId].etiqueta) && canMigrateMonday;
      });
    } catch (e) { }
    // Always init extension (for config, buttons, etc.)
    initExtension();
    // Always show manager view (unified) - groups determine if filter/counter shows
    if (currentUserGroups.length > 0) {
      initManagerView();
    }
  }

  // --- Global config modal reference ---
  var _showConfigModal = null;
  var _showQuickDetailModal = null;
  document.addEventListener("sp-open-config", function () { if (_showConfigModal) _showConfigModal(); });
  document.addEventListener("sp-open-ticket", function (e) { if (e.detail && e.detail.ticketId && _showQuickDetailModal) _showQuickDetailModal(e.detail.ticketId); });

  // --- Manager view ---
  function initManagerView() {
    var groups = currentUserGroups.length > 0 ? currentUserGroups : [];
    if (!groups.length) return;
    var canDrag = canDragDrop;
    var mgrLoading = false;

    function tryInject() {
      if (mgrLoading) return;
      if (!window.location.pathname.includes("/dashboard/tickets-mesa")) return;
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid) return;
      if (document.getElementById("sp-manager-panel")) return;
      mgrLoading = true;
      loadManagerPanel(grid, groups, canDrag);
    }

    // Initial inject with retry
    var attempts = 0;
    var interval = setInterval(function () {
      if (!window.location.pathname.includes("/dashboard/tickets-mesa")) { attempts++; if (attempts > 40) clearInterval(interval); return; }
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid && attempts < 40) { attempts++; return; }
      clearInterval(interval);
      if (!grid) return;
      if (document.getElementById("sp-manager-panel")) return;
      mgrLoading = true;
      loadManagerPanel(grid, groups, canDrag);
    }, 500);

    // Observer to re-inject when navigating back (debounced)
    var mgrDebounceTimer = null;
    var mgrObserver = new MutationObserver(function () {
      if (mgrDebounceTimer) clearTimeout(mgrDebounceTimer);
      mgrDebounceTimer = setTimeout(function () {
        // Remove panel if not on the right page
        if (!window.location.pathname.includes("/dashboard/tickets-mesa")) {
          var existing = document.getElementById("sp-manager-panel");
          if (existing) { existing.remove(); mgrLoading = false; }
          return;
        }
        tryInject();
      }, 500);
    });
    mgrObserver.observe(document.body, { childList: true, subtree: true });
  }

  function loadManagerPanel(grid, groups, canDrag) {
    var spToken = localStorage.getItem("token");
    if (!spToken) return;

    // Inject config button for manager views
    var cfgAttempts = 0;
    var cfgInterval = setInterval(function () {
      if (document.getElementById("sp-config-btn") || cfgAttempts > 20) { clearInterval(cfgInterval); return; }
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper) { cfgAttempts++; return; }
      clearInterval(cfgInterval);
      var btn = document.createElement("button");
      btn.id = "sp-config-btn";
      btn.textContent = "⚙️";
      btn.title = "Configuración SupportPlus Tools";
      btn.style.cssText = "padding:4px 10px;font-size:14px;cursor:pointer;border:none;border-radius:6px;background:rgba(255,255,255,0.15);color:#fff;margin-right:8px;";
      btn.addEventListener("click", function () {
        // Dispatch custom event to open config
        document.dispatchEvent(new CustomEvent("sp-open-config"));
      });
      userWrapper.parentElement.insertBefore(btn, userWrapper);
    }, 500);

    var panel = document.createElement("div");
    panel.id = "sp-manager-panel";
    panel.style.cssText = "margin-bottom:12px;font-family:system-ui;";
    grid.parentElement.insertBefore(panel, grid);

    var singleGroup = (groups.length === 1);

    // Summary row (no drag) - only if multiple groups
    var summaryDiv = document.createElement("div");
    summaryDiv.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;";
    if (!singleGroup) panel.appendChild(summaryDiv);

    var groupsInfo = groups.map(function (gId) {
      return GROUP_INFO.find(function (g) { return g.id === gId; }) || { id: gId, name: "Grupo " + gId };
    });

    // --- Tag filter component ---
    function createTagFilter(id, items, onChangeCallback) {
      var container = document.createElement("div");
      container.id = id;
      container.style.cssText = "margin-bottom:8px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;position:relative;";

      var selectedIds = []; // Empty = show all

      function render() {
        container.innerHTML = "";
        selectedIds.forEach(function (sid) {
          var item = items.find(function (i) { return String(i.id) === sid; });
          if (!item) return;
          var tag = document.createElement("span");
          tag.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
          tag.innerHTML = item.name + ' <span data-remove="' + sid + '" style="cursor:pointer;color:#D94040;font-weight:700;">✕</span>';
          tag.querySelector("[data-remove]").addEventListener("click", function () {
            selectedIds = selectedIds.filter(function (s) { return s !== sid; });
            render();
            onChangeCallback(selectedIds);
          });
          container.appendChild(tag);
        });
        // Add input for searching
        var input = document.createElement("input");
        input.type = "text";
        input.placeholder = selectedIds.length ? "+ Agregar..." : "🔍 Filtrar grupos...";
        input.style.cssText = "border:none;outline:none;font-size:11px;flex:1;min-width:120px;padding:2px 4px;";

        var dropdown = document.createElement("div");
        dropdown.style.cssText = "position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #ddd;border-radius:4px;max-height:150px;overflow-y:auto;z-index:10;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.1);";

        function showDropdown() {
          var query = input.value.toLowerCase();
          var available = items.filter(function (i) { return !selectedIds.includes(String(i.id)) && i.name.toLowerCase().includes(query); });
          if (!available.length || !query) { dropdown.style.display = "none"; return; }
          dropdown.innerHTML = "";
          available.slice(0, 10).forEach(function (item) {
            var opt = document.createElement("div");
            opt.style.cssText = "padding:6px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid #f0f0f0;";
            opt.textContent = item.name;
            opt.addEventListener("mousedown", function (e) {
              e.preventDefault();
              selectedIds.push(String(item.id));
              input.value = "";
              render();
              onChangeCallback(selectedIds);
            });
            opt.addEventListener("mouseenter", function () { opt.style.background = "#e3f2fd"; });
            opt.addEventListener("mouseleave", function () { opt.style.background = ""; });
            dropdown.appendChild(opt);
          });
          dropdown.style.display = "block";
        }

        input.addEventListener("input", showDropdown);
        input.addEventListener("focus", function () { if (input.value) showDropdown(); });
        input.addEventListener("blur", function () { setTimeout(function () { dropdown.style.display = "none"; }, 150); });

        container.appendChild(input);
        container.appendChild(dropdown);
      }

      render();
      return { element: container, getSelected: function () { return selectedIds; } };
    }

    // Summary filter - only if multiple groups
    if (!singleGroup) {
      var summaryTagFilter = createTagFilter("sp-mgr-summary-filter", groupsInfo, function (selected) {
        summaryDiv.querySelectorAll("[id^='sp-mgr-summary-']").forEach(function (el) {
          var gId = el.id.replace("sp-mgr-summary-", "");
          el.style.display = (!selected.length || selected.includes(gId)) ? "" : "none";
        });
      });
      panel.insertBefore(summaryTagFilter.element, summaryDiv);

      groupsInfo.forEach(function (dept) {
        var col = document.createElement("div");
        col.id = "sp-mgr-summary-" + dept.id;
        col.style.cssText = "min-width:160px;border:2px solid #1976D2;border-radius:8px;overflow:hidden;flex-shrink:0;text-align:center;";
        col.innerHTML = '<div style="background:#1976D2;color:#fff;padding:6px 10px;font-size:10px;font-weight:700;">' + dept.name + '</div>' +
          '<div class="sp-mgr-count" style="padding:12px;font-size:24px;font-weight:700;color:#1976D2;">...</div>';
        summaryDiv.appendChild(col);
      });
    }

    // Collapse filter - only if multiple groups
    if (!singleGroup) {
      var collapseTagFilter = createTagFilter("sp-mgr-collapse-filter", groupsInfo, function (selected) {
        panel.querySelectorAll("[id^='sp-mgr-section-']").forEach(function (el) {
          var gId = el.id.replace("sp-mgr-section-", "");
          el.style.display = (!selected.length || selected.includes(gId)) ? "" : "none";
        });
      });
      panel.appendChild(collapseTagFilter.element);
    }

    // Collapsible detail per group
    groupsInfo.forEach(function (dept) {
      var section = document.createElement("div");
      section.id = "sp-mgr-section-" + dept.id;
      section.style.cssText = "margin-bottom:8px;border:1px solid #ddd;border-radius:8px;overflow:hidden;";

      var header = document.createElement("div");
      header.style.cssText = "padding:8px 12px;background:#f5f5f5;cursor:pointer;font-size:12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;";
      header.innerHTML = '<span>📂 ' + dept.name + '</span><span class="sp-mgr-toggle" style="font-size:14px;">' + (singleGroup ? '▼' : '▶') + '</span>';

      var body = document.createElement("div");
      body.className = "sp-mgr-body";
      body.style.cssText = (singleGroup ? "display:block;" : "display:none;") + "padding:8px;overflow-x:auto;";
      body.innerHTML = '<div class="sp-mgr-columns" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;"></div>';

      // If single group, auto-load and hide header
      if (singleGroup) {
        body.dataset.loaded = "true";
        header.style.display = "none";
        loadManagerGroupDetail(dept.id, body.querySelector(".sp-mgr-columns"), spToken, canDrag);
      }

      header.addEventListener("click", function () {
        var isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        header.querySelector(".sp-mgr-toggle").textContent = isOpen ? "▶" : "▼";
        if (!isOpen && !body.dataset.loaded) {
          body.dataset.loaded = "true";
          loadManagerGroupDetail(dept.id, body.querySelector(".sp-mgr-columns"), spToken, canDrag);
        }
      });

      section.appendChild(header);
      section.appendChild(body);
      panel.appendChild(section);
    });

    // Fetch summary counts
    groupsInfo.forEach(function (dept) {
      Promise.all([
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=Asignado", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function (r) { return r.json(); }),
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=En%20atenci%C3%B3n", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function (r) { return r.json(); })
      ]).then(function (results) {
        var count = ((results[0].data || results[0]).content || []).length + ((results[1].data || results[1]).content || []).length;
        var col = document.getElementById("sp-mgr-summary-" + dept.id);
        if (col) col.querySelector(".sp-mgr-count").textContent = count;
      }).catch(function () { });
    });

    // Auto-refresh summary every 60s (with cleanup reference)
    var _summaryInterval = setInterval(function () {
      if (!document.getElementById("sp-manager-panel")) { clearInterval(_summaryInterval); return; }
      groupsInfo.forEach(function (dept) {
        Promise.all([
          fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=Asignado", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function (r) { return r.json(); }),
          fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=En%20atenci%C3%B3n", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function (r) { return r.json(); })
        ]).then(function (results) {
          var count = ((results[0].data || results[0]).content || []).length + ((results[1].data || results[1]).content || []).length;
          var col = document.getElementById("sp-mgr-summary-" + dept.id);
          if (col) col.querySelector(".sp-mgr-count").textContent = count;
        }).catch(function () { });
      });
    }, 60000);

    // Refresh open collapsibles on focus or after actions (smooth, no flash)
    function refreshOpenCollapsibles() {
      panel.querySelectorAll(".sp-mgr-body").forEach(function (body) {
        if (body.style.display !== "none" && body.dataset.loaded) {
          var section = body.parentElement;
          var groupId = section.id.replace("sp-mgr-section-", "");
          // Re-fetch tickets for each profile column without clearing
          body.querySelectorAll(".sp-mgr-ptickets").forEach(function (listEl) {
            var profileId = listEl.dataset.profileId;
            var gId = listEl.dataset.groupId || groupId;
            if (profileId === "unassigned") {
              // Refresh unassigned
              fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + gId + "&ticketStatusName=En%20espera&page=0&size=100", {
                headers: { accept: "application/json", authorization: "Bearer " + spToken }
              }).then(function (r) { return r.json(); }).then(function (json) {
                var tickets = (json.data || json).content || [];
                updateTicketList(listEl, tickets, true);
              }).catch(function () { });
            } else {
              // Refresh assigned per profile
              Promise.all([
                fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + profileId + "&ticketStatusName=Asignado", {
                  headers: { accept: "application/json", authorization: "Bearer " + spToken }
                }).then(function (r) { return r.json(); }),
                fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + profileId + "&ticketStatusName=En%20atenci%C3%B3n", {
                  headers: { accept: "application/json", authorization: "Bearer " + spToken }
                }).then(function (r) { return r.json(); })
              ]).then(function (results) {
                var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);
                updateTicketList(listEl, tickets, false);
              }).catch(function () { });
            }
          });
        }
      });
    }

    // Update ticket list without clearing (smooth diff)
    function updateTicketList(listEl, tickets, isUnassigned) {
      var countEl = listEl.previousElementSibling ? listEl.previousElementSibling.querySelector(".sp-mgr-pcount") : null;
      if (countEl) countEl.textContent = "(" + tickets.length + ")";
      if (!tickets.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
        return;
      }
      // Build new HTML and only replace if different
      var html = "";
      tickets.forEach(function (t) {
        var statusColor = t.ticketStatusName === "En espera" ? "#FF8F00" : t.ticketStatusName === "Asignado" ? "#1976D2" : "#4CAF50";
        html += '<div ' + (canDrag ? 'draggable="true" ' : '') + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:9px;line-height:1.3;' + (canDrag ? 'cursor:grab;' : '') + '">';
        html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
        html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + esc((t.subject || "").substring(0, 25)) + '</div>';
        html += '<div style="display:flex;justify-content:space-between;"><span style="color:' + statusColor + ';font-weight:600;font-size:8px;">' + (t.ticketStatusName || "") + '</span><span style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;" title="' + (isUnassigned ? (t.requesterName || "") : (t.requesterName || "")) + '">' + esc((t.requesterName || "").split(" ")[0]) + '</span></div>';
        html += '</div>';
      });
      if (listEl.innerHTML !== html) listEl.innerHTML = html;
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refreshOpenCollapsibles();
    });
    document.addEventListener("sp-refresh-panel", refreshOpenCollapsibles);
  }

  function loadManagerGroupDetail(groupId, container, spToken, canDrag) {
    // Fetch members of this group
    fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      var profiles = json.data || json;
      if (!Array.isArray(profiles)) { container.innerHTML = '<div style="color:#888;font-size:11px;">Sin miembros</div>'; return; }

      // Read blacklist: first from memory, fallback to storage
      function applyBlacklistAndRender(blacklistNotionIds) {
        if (blacklistNotionIds.length > 0) {
          Promise.all(blacklistNotionIds.map(function (pageId) {
            return new Promise(function (resolve) {
              chrome.runtime.sendMessage({ type: "notion-page", pageId: pageId }, function (resp) {
                if (resp && resp.success) {
                  resolve(resp.data.properties?.["Id Support Plus"]?.number || null);
                } else { resolve(null); }
              });
            });
          })).then(function (blacklistedProfileIds) {
            blacklistedProfileIds = blacklistedProfileIds.filter(Boolean);
            if (blacklistedProfileIds.length > 0) {
              profiles = profiles.filter(function (p) {
                return !blacklistedProfileIds.includes(p.profileId);
              });
            }
            renderGroupDetail(groupId, container, profiles, spToken, canDrag);
          });
        } else {
          renderGroupDetail(groupId, container, profiles, spToken, canDrag);
        }
      }

      var blacklist = _userConfig.blacklist || [];
      if (blacklist.length > 0) {
        applyBlacklistAndRender(blacklist);
      } else {
        // Fallback: read from storage in case _userConfig hasn't been set yet
        chrome.storage.local.get("userConfig", function (stored) {
          var storedCfg = stored.userConfig || {};
          applyBlacklistAndRender(storedCfg.blacklist || []);
        });
      }
    }).catch(function () { container.innerHTML = '<div style="color:#888;font-size:11px;">Error al cargar</div>'; });
  }

  function renderGroupDetail(groupId, container, profiles, spToken, canDrag) {

    // Create "Sin asignar" column at the left
    var unassignedCol = document.createElement("div");
    unassignedCol.style.cssText = "min-width:160px;max-width:200px;border:1px solid #FF8F00;border-radius:6px;overflow:hidden;flex-shrink:0;";
    unassignedCol.innerHTML = '<div style="background:#FF8F00;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">⏳ Sin asignar <span class="sp-mgr-pcount">(...)</span></div>' +
      '<div class="sp-mgr-ptickets" data-profile-id="unassigned" data-group-id="' + groupId + '" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
    container.appendChild(unassignedCol);

    // Create columns per member
    profiles.forEach(function (p) {
      var col = document.createElement("div");
      col.style.cssText = "min-width:160px;max-width:200px;border:1px solid #ddd;border-radius:6px;overflow:hidden;flex-shrink:0;";
      col.innerHTML = '<div style="background:#2196F3;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">' + esc(p.profileFullName.split(" ")[0]) + ' <span class="sp-mgr-pcount">(...)</span></div>' +
        '<div class="sp-mgr-ptickets" data-profile-id="' + p.profileId + '" data-group-id="' + groupId + '" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
      container.appendChild(col);
    });

    // Click on ticket opens modal (only if not dragging)
    var isDragging = false;
    container.addEventListener("mousedown", function (e) { isDragging = false; });
    container.addEventListener("mousemove", function (e) { if (e.buttons) isDragging = true; });
    container.addEventListener("click", function (e) {
      if (isDragging) return;
      if (Date.now() - _lastDropTime < 1500) return;
      var ticket = e.target.closest(".sp-mgr-ticket");
      if (!ticket) return;
      var ticketId = ticket.dataset.ticketId;
      if (ticketId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(ticketId) } }));
    });

    // Setup drag and drop if allowed
    if (canDrag) {
      container.addEventListener("dragstart", function (e) {
        var ticket = e.target.closest(".sp-mgr-ticket");
        if (!ticket) return;
        e.dataTransfer.setData("text/plain", ticket.dataset.ticketId);
        ticket.style.opacity = "0.4";
      });
      container.addEventListener("dragend", function (e) {
        var ticket = e.target.closest(".sp-mgr-ticket");
        if (ticket) ticket.style.opacity = "1";
      });
      container.addEventListener("dragover", function (e) {
        e.preventDefault();
        var col = e.target.closest("[style*='border-radius:6px']");
        var zone = e.target.closest(".sp-mgr-ptickets") || (col ? col.querySelector(".sp-mgr-ptickets") : null);
        if (zone) { zone.style.background = "#e3f2fd"; zone.style.outline = "2px dashed #1976D2"; }
      });
      container.addEventListener("dragleave", function (e) {
        var col = e.target.closest("[style*='border-radius:6px']");
        var zone = e.target.closest(".sp-mgr-ptickets") || (col ? col.querySelector(".sp-mgr-ptickets") : null);
        if (zone && !zone.contains(e.relatedTarget)) { zone.style.background = "#fafafa"; zone.style.outline = "none"; }
      });
      container.addEventListener("drop", async function (e) {
        e.preventDefault();
        var zone = e.target.closest(".sp-mgr-ptickets") || (e.target.closest("[style*='border-radius:6px']") ? e.target.closest("[style*='border-radius:6px']").querySelector(".sp-mgr-ptickets") : null);
        if (!zone) return;
        zone.style.background = "#fafafa";
        zone.style.outline = "none";
        var ticketId = e.dataTransfer.getData("text/plain");
        var targetProfileId = zone.dataset.profileId;
        var targetGroupId = zone.dataset.groupId;
        if (!ticketId || !targetProfileId) return;

        // Check same column
        var src = container.querySelector('.sp-mgr-ticket[data-ticket-id="' + ticketId + '"]');
        if (src) {
          var srcZone = src.closest(".sp-mgr-ptickets");
          if (srcZone && srcZone.dataset.profileId === targetProfileId) return;
        }

        // Move ticket visually immediately (optimistic UI)
        var srcZoneRef = src ? src.closest(".sp-mgr-ptickets") : null;
        if (src) {
          src._srcZone = srcZoneRef;
          src.style.opacity = "0.5";
          src.style.border = "1px dashed #1976D2";
        }
        _lastDropTime = Date.now();

        // API call
        try {
          var res = await fetch("https://macropayapi.supportplus.mx/tickets/web/reassign/" + ticketId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify({ resolutionGroupId: parseInt(targetGroupId), serviceId: null, responsibleProfileId: parseInt(targetProfileId), resolutionGroup: { label: "", value: parseInt(targetGroupId) } }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json2 = await res.json();
          if (json2.success) {
            // Move ticket to target column visually (no reload)
            if (src) {
              src.style.opacity = "1";
              src.style.border = "1px solid #eee";
              var targetZone = container.querySelector('.sp-mgr-ptickets[data-profile-id="' + targetProfileId + '"]');
              if (targetZone) {
                // Remove "Sin tickets" placeholder if present
                var placeholder = targetZone.querySelector('div[style*="color:#aaa"]');
                if (placeholder) placeholder.remove();
                targetZone.appendChild(src);
              }
              // Update source count
              var srcZone = src._srcZone;
              if (srcZone) {
                var srcCount = srcZone.querySelectorAll(".sp-mgr-ticket").length;
                var srcCountEl = srcZone.previousElementSibling?.querySelector(".sp-mgr-pcount");
                if (srcCountEl) srcCountEl.textContent = "(" + srcCount + ")";
                if (!srcCount) srcZone.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
              }
              // Update target count
              if (targetZone) {
                var tgtCount = targetZone.querySelectorAll(".sp-mgr-ticket").length;
                var tgtCountEl = targetZone.previousElementSibling?.querySelector(".sp-mgr-pcount");
                if (tgtCountEl) tgtCountEl.textContent = "(" + tgtCount + ")";
              }
            }
          }
        } catch (err) {
          // Revert visual on error
          if (src) { src.style.opacity = "1"; src.style.border = "1px solid #eee"; }
        }
      });
    }

    // Fetch tickets per member
    profiles.forEach(function (p) {
      Promise.all([
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId + "&ticketStatusName=Asignado", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function (r) { return r.json(); }),
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId + "&ticketStatusName=En%20atenci%C3%B3n", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function (r) { return r.json(); })
      ]).then(function (results) {
        var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);
        var listEl = container.querySelector('.sp-mgr-ptickets[data-profile-id="' + p.profileId + '"]');
        if (!listEl) return;
        var countEl = listEl.previousElementSibling.querySelector(".sp-mgr-pcount");
        if (countEl) countEl.textContent = "(" + tickets.length + ")";

        // Hide column if "only with tickets" is enabled and no tickets
        if (!tickets.length && _userConfig.onlyWithTickets) {
          var col = listEl.parentElement;
          if (col) col.style.display = "none";
        }

        if (!tickets.length) {
          listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
        } else {
          var html = "";
          tickets.forEach(function (t) {
            html += '<div ' + (canDrag ? 'draggable="true" ' : '') + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:9px;line-height:1.3;' + (canDrag ? 'cursor:grab;' : '') + '">';
            html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
            html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + esc((t.subject || "").substring(0, 25)) + '</div>';
            html += '<div style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</div>';
            html += '</div>';
          });
          listEl.innerHTML = html;
        }
      }).catch(function () { });
    });

    // Fetch "Sin asignar" (En espera)
    fetch("https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups?page=0&size=50&resolutionGroupId=" + groupId + "&ticketStatusName=En%20espera", {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      var tickets = (json.data || json).content || [];
      var listEl = container.querySelector('.sp-mgr-ptickets[data-profile-id="unassigned"]');
      if (!listEl) return;
      var countEl = listEl.previousElementSibling.querySelector(".sp-mgr-pcount");
      if (countEl) countEl.textContent = "(" + tickets.length + ")";
      if (!tickets.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
      } else {
        var html = "";
        tickets.forEach(function (t) {
          html += '<div ' + (canDrag ? 'draggable="true" ' : '') + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;' + (canDrag ? 'cursor:grab;' : '') + '">';
          html += '<div style="font-weight:600;color:#E65100;">' + (t.uniqueCode || "") + '</div>';
          html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + esc((t.subject || "").substring(0, 25)) + '</div>';
          html += '<div style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</div>';
          html += '</div>';
        });
        listEl.innerHTML = html;
      }
    }).catch(function () { });

    // Create "Cerrados hoy" column at the right
    var today = new Date();
    var todayStart = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T00:00";
    var todayEnd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T23:59";

    var closedCol = document.createElement("div");
    closedCol.style.cssText = "min-width:160px;max-width:200px;border:1px solid #2E7D32;border-radius:6px;overflow:hidden;flex-shrink:0;";
    closedCol.innerHTML = '<div style="background:#2E7D32;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-mgr-closed-count">(...)</span></div>' +
      '<div class="sp-mgr-closed-list" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
    closedCol.addEventListener("click", function (e) {
      var ticket = e.target.closest(".sp-mgr-ticket");
      if (!ticket) return;
      var ticketId = ticket.dataset.ticketId;
      if (ticketId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(ticketId) } }));
    });
    container.appendChild(closedCol);

    // Fetch closed today
    fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + groupId + "&ticketStatusName=Cerrado&initDate=" + todayStart + "&endDate=" + todayEnd + "&page=0&size=100", {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      var tickets = (json.data || json).content || [];
      var countEl = closedCol.querySelector(".sp-mgr-closed-count");
      if (countEl) countEl.textContent = "(" + tickets.length + ")";
      var listEl = closedCol.querySelector(".sp-mgr-closed-list");
      if (!listEl) return;
      if (!tickets.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
      } else {
        var html = "";
        tickets.forEach(function (t) {
          html += '<div style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #2E7D32;font-size:9px;line-height:1.3;">';
          html += '<div style="font-weight:600;color:#2E7D32;">' + (t.uniqueCode || "") + '</div>';
          html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + esc((t.subject || "").substring(0, 25)) + '</div>';
          html += '<div style="color:#888;font-size:8px;">' + (t.responsibleName || "").split(" ")[0] + '</div>';
          html += '</div>';
        });
        listEl.innerHTML = html;
      }
    }).catch(function () { });
  }

  function initExtension() {
    _showQuickDetailModal = showQuickDetailModal;

    // Inject basic buttons with retry (deferred via setTimeout to avoid temporal dead zone)
    // NOTE: Also triggered independently below (outside session check)
    setTimeout(function () {
      (function retryInjectHeader(attempts) {
        var wrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
        if (wrapper || attempts >= 20) {
          injectConfigButton();
          injectSearchButton();
          injectQuickSearch();
          injectUpdateButton();
        } else {
          setTimeout(function () { retryInjectHeader(attempts + 1); }, 100);
        }
      })(0);
    }, 0);

    // --- Toast helpers (from components.js window globals) ---
    const ensureToastStyles = window.ensureToastStyles;
    const showLoadingToast = window.showLoadingToast;
    const showSuccessToast = window.showSuccessToast;
    const showErrorToast = window.showErrorToast;

    const SP_API = window.SP_CONFIG.SP_API;
    const MONDAY_API = "https://api.monday.com/v2";
    const BTN_CLASS = "sp-monday-btn";
    const SYNCED_CLASS = "sp-monday-synced";
    const TAKE_BTN_CLASS = "sp-take-btn";
    const STEAL_BTN_CLASS = "sp-steal-btn";
    const CLOSE_BTN_CLASS = "sp-close-btn";
    const BULK_BTN_ID = "sp-monday-bulk";
    const BULK_CLOSE_BTN_ID = "sp-close-bulk";
    const BASE_URL = "https://macropay.supportplus.mx/es/dashboard/tickets";
    const CACHE_KEY = "sp_monday_synced";
    const CACHE_TTL = 1000 * 60 * 30;

    const PRIORITY_MAP = window.SP_CONFIG.PRIORITY_MAP;

    const MONTH_NAMES = window.SP_CONFIG.MONTH_NAMES;

    // Extract month (0-indexed) and year from board name like "Tickets DBA - Abril - 2026"
    function parseBoardDate(boardName) {
      const m = boardName.match(/- (\w+) - (\d{4})/);
      if (!m) return null;
      const monthIdx = MONTH_NAMES.indexOf(m[1]);
      if (monthIdx === -1) return null;
      return { month: monthIdx, year: parseInt(m[2]) };
    }

    // Check if a ticket date matches the configured board period
    async function canMigrateTicket(ticketCreatedAt) {
      try {
        var mondayToken = await getMondayToken();
        var boardId = await getMondayBoardId();
        if (!mondayToken || !boardId) return false;
        var boardData = await mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { name } }', { boardId });
        var boardName = boardData.boards[0]?.name || "";
        var boardDate = parseBoardDate(boardName);
        if (!boardDate) return true; // No date pattern, allow
        var ticketDate = new Date(ticketCreatedAt);
        return ticketDate.getMonth() === boardDate.month && ticketDate.getFullYear() === boardDate.year;
      } catch (e) { return true; } // On error, allow
    }

    function getToken() { return localStorage.getItem("token"); }
    var _mondayTokenCache = "";
    function getMondayToken() {
      if (_mondayTokenCache) return Promise.resolve(_mondayTokenCache);
      return new Promise(function (resolve) {
        chrome.storage.local.get("mondayToken", function (r) {
          _mondayTokenCache = r.mondayToken || "";
          resolve(_mondayTokenCache);
        });
      });
    }
    var _mondayWorkspaceCache = "";
    function getMondayWorkspaceId() {
      if (_mondayWorkspaceCache) return Promise.resolve(_mondayWorkspaceCache);
      return new Promise(function (resolve) {
        chrome.storage.local.get(["groupMondayConfig"], function (r) {
          var config = r.groupMondayConfig || {};
          // Get first group that has monday config
          var groupId = currentTeamArea || (currentUserGroups.length ? currentUserGroups[0] : "");
          if (groupId && config[groupId]) {
            _mondayWorkspaceCache = config[groupId].workspaceId;
          }
          resolve(_mondayWorkspaceCache);
        });
      });
    }

    // Get Monday config for a specific group (workspace, folder, etiqueta)
    function getMondayConfigForGroup(groupId) {
      return new Promise(function (resolve) {
        chrome.storage.local.get(["groupMondayConfig"], function (r) {
          var config = r.groupMondayConfig || {};
          resolve(config[groupId] || null);
        });
      });
    }
    var _mondayBoardsCache = {}; // month -> boardId

    // Get all ticket boards for the user's workspace (filters by configured groups' etiquetas)
    async function getMondayTicketBoards(mondayToken) {
      var wsId = await getMondayWorkspaceId();
      if (!wsId) return [];
      var boardsData = await mondayQuery(mondayToken, '{ boards(workspace_ids: [' + wsId + '], limit: 50) { id name } }', {});
      return (boardsData.boards || []).filter(function (b) { return !b.name.includes("Subelementos"); });
    }

    // Check if a ticket already exists in Monday (by uniqueCode). Returns itemId if found, null if not.
    async function checkTicketExistsInMonday(mondayToken, uniqueCode) {
      if (!uniqueCode) return null;
      var boards = await getMondayTicketBoards(mondayToken);
      for (var b of boards) {
        try {
          var res = await mondayQuery(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: uniqueCode });
          var items = res.items_page_by_column_values?.items || [];
          if (items.length) return items[0].id;
        } catch (e) { continue; }
      }
      return null;
    }

    async function getMondayBoardForMonth(year, month, groupId) {
      var gId = groupId || currentTeamArea || (currentUserGroups.length ? currentUserGroups[0] : "");
      var mondayConfig = await getMondayConfigForGroup(gId);
      if (!mondayConfig || !mondayConfig.etiqueta) return null;
      var key = gId + "-" + year + "-" + String(month + 1).padStart(2, "0");
      if (_mondayBoardsCache[key]) return _mondayBoardsCache[key];
      var mondayToken = await getMondayToken();
      if (!mondayToken) return null;
      var meses = window.SP_CONFIG.MONTH_NAMES;
      var boardName = mondayConfig.etiqueta + " - " + meses[month] + " - " + year;
      var boards = await getMondayTicketBoards(mondayToken);
      var board = boards.find(function (b) { return b.name.trim().toLowerCase() === boardName.trim().toLowerCase(); });
      if (board) { _mondayBoardsCache[key] = board.id; return board.id; }
      return null;
    }

    function getMondayBoardId(groupId) {
      var now = new Date();
      return getMondayBoardForMonth(now.getFullYear(), now.getMonth(), groupId);
    }

    // Parse "19/03/2026 - 17:51" → board name using group's EtiquetaMonday
    function dateToBoardName(dateStr) {
      const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return null;
      const monthIdx = parseInt(m[2]) - 1;
      return `${MONTH_NAMES[monthIdx]} - ${m[3]}`;
    }

    // --- Cache ---
    function getCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        if (Date.now() - cache.ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
        return cache.ids;
      } catch { return null; }
    }
    function setCache(ids) { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ids })); }
    function addToCache(ticketId, mondayItemId) {
      const ids = getCache() || {};
      ids[ticketId] = mondayItemId;
      setCache(ids);
    }

    // --- Monday API ---
    async function mondayQuery(token, query, variables) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage({ type: "monday-query", token: token, query: query, variables: variables }, function (resp) {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp || !resp.success) return reject(new Error(resp?.error || "Monday query failed"));
          resolve(resp.data);
        });
      });
    }

    // --- Sync ---
    let syncPromise = null;
    async function fetchSyncedTickets() {
      const cached = getCache();
      if (cached) return cached;
      const mondayToken = await getMondayToken();
      if (!mondayToken) return {};
      try {
        // Always search ALL ticket boards
        const ticketBoards = await getMondayTicketBoards(mondayToken);
        const boardIds = ticketBoards.map((b) => b.id);
        if (!boardIds.length) return {};
        const synced = {};
        for (const boardId of boardIds) {
          const firstPage = await mondayQuery(mondayToken,
            'query ($boardId: [ID!]!) { boards(ids: $boardId) { items_page(limit: 500) { cursor items { id column_values(ids: ["text_mm2c9nhc"]) { text } } } } }',
            { boardId });
          let page = firstPage.boards[0].items_page;
          for (const item of page.items) {
            const code = (item.column_values[0]?.text || "").trim();
            if (code) synced[code] = item.id;
          }
          let cursor = page.cursor;
          while (cursor) {
            const next = await mondayQuery(mondayToken,
              'query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id column_values(ids: ["text_mm2c9nhc"]) { text } } } }',
              { cursor });
            for (const item of next.next_items_page.items) {
              const code = (item.column_values[0]?.text || "").trim();
              if (code) synced[code] = item.id;
            }
            cursor = next.next_items_page.cursor;
          }
        }
        setCache(synced);
        return synced;
      } catch (err) {
        console.warn("[SP Monday] Sync error:", err);
        return {};
      }
    }
    function ensureSyncStarted() {
      if (!syncPromise) syncPromise = fetchSyncedTickets();
      return syncPromise;
    }

    // --- Monday users & boards cache ---
    let mondayUsersPromise = null;
    async function getMondayUsers(token) {
      if (!mondayUsersPromise) {
        mondayUsersPromise = mondayQuery(token, `{ users(limit:500) { id email } }`)
          .then((d) => {
            var map = (d.users || []).reduce((m, u) => { if (u.email) m[u.email.toLowerCase()] = u.id; return m; }, {});
            console.log("[SP] Monday users loaded:", Object.keys(map).length);
            return map;
          })
          .catch(function (e) { console.log("[SP] Monday users failed:", e.message); mondayUsersPromise = null; return {}; });
      }
      return mondayUsersPromise;
    }

    let mondayBoardsCache = null;
    async function getMondayBoards(token) {
      if (!mondayBoardsCache) {
        const data = await mondayQuery(token, `{ boards(limit:500) { id name } }`);
        mondayBoardsCache = data.boards.filter((b) => b.name.startsWith("Tickets DBA") && !b.name.includes("Subelementos"));
        console.log("[SP Monday] Boards:", mondayBoardsCache.map(b => b.name));
      }
      return mondayBoardsCache;
    }

    // --- UI ---
    function createSyncedBadge(mondayItemId) {
      // Instead of a badge, we return a small link that sits next to the ticket button
      // The green border is applied to the row's uniqueCode cell
      const link = document.createElement("a");
      link.className = SYNCED_CLASS;
      link.href = "https://macropay7.monday.com/boards/18402162782/pulses/" + mondayItemId;
      link.target = "_blank";
      link.textContent = "↗";
      link.title = "Ver en Monday";
      link.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:0;opacity:0;overflow:hidden;font-size:11px;font-weight:700;color:#fff;background:#2E7D32;border-radius:0 4px 4px 0;text-decoration:none;transition:width 0.25s cubic-bezier(0.4,0,0.2,1),opacity 0.25s ease,padding 0.25s ease;padding:4px 0;margin-left:-1px;cursor:pointer;height:100%;box-sizing:border-box;vertical-align:middle;";
      link.addEventListener("click", function (e) { e.stopPropagation(); });
      return link;
    }

    function createCopyButton(text) {
      const btn = document.createElement("button");
      btn.className = "sp-copy-btn";
      btn.innerHTML = "📋";
      btn.title = "Copiar folio";
      btn.style.cssText = "padding:1px 4px;font-size:12px;cursor:pointer;border:none;background:transparent;margin-left:4px;opacity:0.6;";
      btn.addEventListener("mouseenter", function () { btn.style.opacity = "1"; });
      btn.addEventListener("mouseleave", function () { btn.style.opacity = "0.6"; });
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(text).then(function () {
          btn.innerHTML = "✅";
          setTimeout(function () { btn.innerHTML = "📋"; }, 1500);
        });
      });
      return btn;
    }

    function createButton(ticketId) {
      const btn = document.createElement("button");
      btn.className = BTN_CLASS;
      btn.textContent = "🙂 Migrar";
      btn.title = "Migrar a Monday";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #D94040;border-radius:4px;background:#D94040;color:#fff;margin-left:6px;white-space:nowrap;";
      btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.textContent = "🫡 Migrar"; });
      btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.textContent = "🙂 Migrar"; });
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); e.preventDefault();
        btn.textContent = "⏳";
        btn.disabled = true;
        handleMondayClick(ticketId).finally(() => { btn.textContent = "🙂 Migrar"; btn.disabled = false; });
      });
      return btn;
    }

    // --- Get pending ticket IDs from visible rows ---
    function getPendingRows() {
      const synced = getCache() || {};
      const pending = [];
      document.querySelectorAll(".MuiDataGrid-row").forEach((row) => {
        // Skip if already has synced badge
        if (row.querySelector("." + SYNCED_CLASS)) return;
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const statusCell = row.querySelector('[data-field="ticketStatusName"]');
        if (!statusCell || statusCell.textContent.trim() !== "Cerrado") return;
        const dateCell = row.querySelector('[data-field="createdAt"]');
        const dateText = dateCell?.textContent?.trim() || "";
        pending.push({ ticketId, dateText, row });
      });
      return pending;
    }

    // --- Bulk button ---
    const DETAIL_BTN_ID = "sp-monday-detail";

    function isDetailView() {
      return /\/tickets\/\d+/.test(window.location.pathname);
    }

    function getDetailTicketId() {
      const m = window.location.pathname.match(/\/tickets\/(\d+)/);
      return m ? m[1] : null;
    }

    let detailLoading = false;
    async function injectDetailButton() {
      if (document.querySelectorAll("#" + DETAIL_BTN_ID).length > 0) return;
      if (detailLoading) return;
      detailLoading = true;
      try {
        const ticketId = getDetailTicketId();
        if (!ticketId) return;

        // Find the box with uniqueCode and status chip (right sidebar)
        let container = null;
        document.querySelectorAll(".MuiChip-label").forEach((chip) => {
          if (container) return;
          const box = chip.closest(".MuiBox-root");
          if (box && box.querySelector("p.MuiTypography-body1")) container = box;
        });
        if (!container) return;

        const spToken = getToken();
        if (!spToken) return;

        let uniqueCode = "";
        let isClosed = false;
        let isWaiting = false;
        let isAssigned = false;
        let holderName = "";
        let ticketGroupId = null;
        try {
          const res = await fetch(SP_API + "/" + ticketId, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken },
          });
          if (!res.ok) return;
          const json = await res.json();
          const ticket = json.data || json;
          uniqueCode = ticket.uniqueCode || "";
          isClosed = ticket.ticketStatus?.type?.name === "Cerrado" || ticket.ticketStatus?.name === "Cerrado";
          isWaiting = ticket.ticketStatus?.name === "En espera";
          isAssigned = ticket.ticketStatus?.name === "Asignado" || ticket.ticketStatus?.name === "En atención";
          holderName = ticket.ticketHolder?.ticketHolderLog?.fullName || "";
          ticketGroupId = ticket.resolutionGroup?.id || null;
          console.log("[SP Monday] Detail ticket status:", ticket.ticketStatus?.name, "| type:", ticket.ticketStatus?.type?.name, "| closed:", isClosed, "| waiting:", isWaiting, "| assigned:", isAssigned, "| holder:", holderName, "| groupId:", ticketGroupId);
        } catch (e) { return; }

        const synced = await ensureSyncStarted();

        // Add copy button in detail view
        if (!container.querySelector(".sp-copy-btn") && uniqueCode) {
          var copyBtn = createCopyButton(uniqueCode);
          copyBtn.style.fontSize = "14px";
          copyBtn.style.padding = "2px 6px";
          var chipEl = container.querySelector(".MuiChip-root");
          if (chipEl) container.insertBefore(copyBtn, chipEl);
          else container.appendChild(copyBtn);
        }

        if (uniqueCode && synced[uniqueCode]) {
          const mondayItemId = synced[uniqueCode];
          const badge = document.createElement("span");
          badge.id = DETAIL_BTN_ID;
          badge.textContent = "✅ Migrado";
          badge.style.cssText =
            "padding:6px 14px;font-size:12px;border-radius:6px;background:#E8F5E9;color:#2E7D32;font-weight:600;white-space:nowrap;cursor:pointer;";
          badge.addEventListener("mouseenter", () => { badge.textContent = "🔗 Monday"; });
          badge.addEventListener("mouseleave", () => { badge.textContent = "✅ Migrado"; });
          badge.addEventListener("click", () => {
            window.open("https://macropay7.monday.com/boards/18402162782/pulses/" + mondayItemId, "_blank");
          });
          const chip = container.querySelector(".MuiChip-root");
          container.insertBefore(badge, chip);
        } else if (isAssigned || isWaiting) {
          // Show buttons only if ticket belongs to my area (or gerente)
          var myArea3 = getTeamConfig();
          var ticketBelongsToMe3 = !ticketGroupId || ticketGroupId === myArea3.resolutionGroupId || isMultiGroup();
          if (ticketBelongsToMe3) {
            const myName = getLoggedUserName();
            const chip4 = container.querySelector(".MuiChip-root");

            // Show take button if waiting
            if (isWaiting && !container.querySelector(".sp-detail-take")) {
              const takeBtn = document.createElement("button");
              takeBtn.className = "sp-detail-take";
              takeBtn.textContent = "🤚 Tomar ticket";
              takeBtn.style.cssText =
                "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;white-space:nowrap;margin-right:6px;";
              takeBtn.addEventListener("mouseenter", () => { if (!takeBtn.disabled) takeBtn.textContent = "✊ Tomar ticket"; });
              takeBtn.addEventListener("mouseleave", () => { if (!takeBtn.disabled) takeBtn.textContent = "🤚 Tomar ticket"; });
              takeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                showTakeModal(ticketId, takeBtn);
              });
              container.insertBefore(takeBtn, chip4);
            }

            // Show steal button if assigned to someone else
            if (isAssigned && holderName && myName && holderName !== myName && !container.querySelector(".sp-detail-steal")) {
              const stealBtn = document.createElement("button");
              stealBtn.className = "sp-detail-steal";
              stealBtn.textContent = "🥷 Robar ticket";
              stealBtn.title = "Asignado a: " + holderName;
              stealBtn.style.cssText =
                "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#E65100;color:#fff;font-weight:600;white-space:nowrap;margin-right:6px;";
              stealBtn.addEventListener("mouseenter", () => { if (!stealBtn.disabled) stealBtn.textContent = "💀 Robar ticket"; });
              stealBtn.addEventListener("mouseleave", () => { if (!stealBtn.disabled) stealBtn.textContent = "🥷 Robar ticket"; });
              stealBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                showTakeModal(ticketId, stealBtn);
              });
              container.insertBefore(stealBtn, chip4);
            }
          }
        }

        // Show close button independently for non-closed tickets (even if migrated)
        if (!isClosed && !container.querySelector(".sp-detail-close-btn")) {
          var myAreaClose = getTeamConfig();
          var canClose = !ticketGroupId || ticketGroupId === myAreaClose.resolutionGroupId || isMultiGroup();
          if (canClose) {
            const closeBtnIndep = document.createElement("button");
            closeBtnIndep.className = "sp-detail-close-btn";
            closeBtnIndep.textContent = "🔒 Cerrar ticket";
            closeBtnIndep.style.cssText =
              "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#616161;color:#fff;font-weight:600;white-space:nowrap;margin-left:6px;";
            closeBtnIndep.addEventListener("mouseenter", () => { if (!closeBtnIndep.disabled) closeBtnIndep.textContent = "🔐 Cerrar ticket"; });
            closeBtnIndep.addEventListener("mouseleave", () => { if (!closeBtnIndep.disabled) closeBtnIndep.textContent = "🔒 Cerrar ticket"; });
            closeBtnIndep.addEventListener("click", async (e) => {
              e.stopPropagation();
              e.preventDefault();
              closeBtnIndep.disabled = true;
              closeBtnIndep.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
              await showCloseModal(ticketId, closeBtnIndep);
              closeBtnIndep.textContent = "🔒 Cerrar ticket";
              closeBtnIndep.disabled = false;
            });
            var chipClose = container.querySelector(".MuiChip-root");
            container.insertBefore(closeBtnIndep, chipClose);
          }
        }

        // Show reopen button independently for closed tickets (even if migrated)
        if (isClosed && !container.querySelector(".sp-reopen-btn")) {
          var myAreaReopen = getTeamConfig();
          var canReopen = !ticketGroupId || ticketGroupId === myAreaReopen.resolutionGroupId || isMultiGroup();
          if (canReopen) {
            const reopenBtn = document.createElement("button");
            reopenBtn.className = "sp-reopen-btn";
            reopenBtn.textContent = "🔓 Reabrir";
            reopenBtn.style.cssText =
              "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#FF8F00;color:#fff;font-weight:600;white-space:nowrap;margin-left:6px;";
            reopenBtn.addEventListener("mouseenter", () => { if (!reopenBtn.disabled) reopenBtn.textContent = "🔄 Reabrir"; });
            reopenBtn.addEventListener("mouseleave", () => { if (!reopenBtn.disabled) reopenBtn.textContent = "🔓 Reabrir"; });
            reopenBtn.addEventListener("click", () => { showReopenModal(ticketId, holderName); });
            var chipReopen = container.querySelector(".MuiChip-root");
            container.insertBefore(reopenBtn, chipReopen);
          }
        }
      } finally { detailLoading = false; }
    }

    const IAM_BTN_ID = "sp-iam-btn";
    const IAM_PROFILES = [296, 126, 128];
    const IAM_API = "https://macropayapi.supportplus.mx/ticket-participants/assign-visitor-participant";

    const IAM_NAMES = ["Carlos Alberto Lopez Mata", "Crhistian Uziel Sanchez Alvarez", "Leyver Adair Vasquez Velasco"];

    function injectIamButton() {
      if (!_btnAddIAM) return;
      if (document.getElementById(IAM_BTN_ID)) return;
      if (!isDetailView()) return;
      var ticketId = getDetailTicketId();
      if (!ticketId) return;

      // Find the "Agregar usuarios" card
      var cards = document.querySelectorAll(".MuiCardHeader-content .MuiTypography-body1");
      var targetCard = null;
      cards.forEach(function (el) {
        if (el.textContent.trim() === "Agregar usuarios") targetCard = el.closest(".MuiCard-root");
      });
      if (!targetCard) return;

      // Check if all IAMcitos already exist in the list
      var existingNames = [];
      targetCard.querySelectorAll("p[aria-label]").forEach(function (p) {
        existingNames.push(p.getAttribute("aria-label"));
      });
      var allExist = IAM_NAMES.every(function (name) {
        return existingNames.indexOf(name) !== -1;
      });
      if (allExist) return;

      var btn = document.createElement("button");
      btn.id = IAM_BTN_ID;
      btn.textContent = "👥 Agregar IAMcitos";
      btn.style.cssText = "width:100%;padding:10px;font-size:13px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;margin-top:8px;";
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Agregando...';
        ensureToastStyles();

        // Re-check existing names at click time
        var currentNames = [];
        targetCard.querySelectorAll("p[aria-label]").forEach(function (p) {
          currentNames.push(p.getAttribute("aria-label"));
        });
        var missing = [];
        for (var j = 0; j < IAM_NAMES.length; j++) {
          if (currentNames.indexOf(IAM_NAMES[j]) === -1) missing.push(IAM_PROFILES[j]);
        }
        if (!missing.length) {
          showSuccessToast("Todos los IAMcitos ya existen");
          btn.remove();
          return;
        }

        showLoadingToast("Agregando " + missing.length + " IAMcito(s)...");
        var spToken = getToken();
        var ok = 0, fail = 0;
        for (var i = 0; i < missing.length; i++) {
          try {
            var res = await fetch(IAM_API, {
              method: "POST",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({ profileId: missing[i], ticketId: parseInt(ticketId), isParticipant: false }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            ok++;
          } catch (e) { fail++; }
        }

        if (fail === 0) {
          showSuccessToast("IAMcitos agregados");
          setTimeout(function () { window.location.reload(); }, 1500);
        } else {
          showErrorToast("Algunos fallaron: " + ok + " ok, " + fail + " errores");
          btn.textContent = "👥 Agregar IAMcitos";
          btn.disabled = false;
        }
      });

      targetCard.appendChild(btn);
    }

    const DETAIL_DETECTIONS_ID = "sp-detail-detections";

    function injectDetailDetections() {
      if (document.getElementById(DETAIL_DETECTIONS_ID)) return;
      if (!isDetailView()) return;

      // Find "Evidencias" h2 to insert before it
      var evidenciasH2 = null;
      document.querySelectorAll("h2.MuiTypography-h2").forEach(function (h2) {
        if (h2.textContent.trim() === "Evidencias") evidenciasH2 = h2;
      });
      if (!evidenciasH2) return;

      // Read description and subject from the page
      var descEl = document.querySelector(".MuiBox-root.mui-se5hlr");
      var subjectEl = document.querySelector(".MuiBox-root.mui-81wn4v");
      var descText = descEl ? descEl.textContent : "";
      var subjectText = subjectEl ? subjectEl.textContent : "";
      var fullText = subjectText + " " + descText;

      // Detect SL and PR codes
      var slMatches = [];
      var slRaw = fullText.match(/(?:SL|PR)\d{10,}/g);
      if (slRaw) slMatches = slRaw.filter(function (v, i, a) { return a.indexOf(v) === i; });

      // Detect users
      var userMatches = [];
      var userRaw = fullText.match(/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g);
      if (userRaw) {
        var seen = {};
        userMatches = userRaw.map(function (v) {
          var m = v.match(/(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i);
          return m ? m[1] : v;
        }).filter(function (v) { var low = v.toLowerCase(); if (seen[low]) return false; seen[low] = true; return true; });
      }

      // Detect DB objects (tables, views, stored procedures, functions)
      var dbMatches = [];
      // Pattern 1: schema.object (e.g. HANA_Plata.HN_ZVW_PEDIDOS_CENT)
      var dbSchemaRaw = fullText.match(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]{3,}/g);
      if (dbSchemaRaw) dbSchemaRaw.forEach(function (v) {
        // Exclude common false positives (emails, urls, file extensions)
        if (v.match(/\.(com|mx|net|org|jpg|png|pdf|xlsx|csv|txt|html|js|css)$/i)) return;
        dbMatches.push(v);
      });
      // Pattern 2: SP/USP prefixed (stored procedures)
      var dbSpRaw = fullText.match(/\b(?:sp_|usp_|SP_|USP_)[A-Za-z0-9_]{3,}/g);
      if (dbSpRaw) dbSpRaw.forEach(function (v) { dbMatches.push(v); });
      // Pattern 3: Common DB prefixes (HN_, VW_, ZVW_, FN_, TBL_, V_, T_)
      var dbPrefixRaw = fullText.match(/\b(?:HN_|VW_|ZVW_|FN_|TBL_|V_|T_)[A-Za-z0-9_]{3,}/g);
      if (dbPrefixRaw) dbPrefixRaw.forEach(function (v) { dbMatches.push(v); });
      // Pattern 4: Contextual - word after "tabla", "vista", "procedimiento", "store procedure", "view", "trigger", "function"
      var dbContextRaw = fullText.match(/(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*([A-Za-z_][A-Za-z0-9_.]{3,})/gi);
      if (dbContextRaw) {
        dbContextRaw.forEach(function (match) {
          var obj = match.replace(/^(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*/i, "").trim();
          if (obj && obj.length > 3) dbMatches.push(obj);
        });
      }
      // Pattern 5: UPPER_CASE words with underscores (3+ segments, likely DB objects)
      var dbUpperRaw = fullText.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g);
      if (dbUpperRaw) dbUpperRaw.forEach(function (v) {
        // Exclude things that are clearly not DB objects
        if (v.length < 8) return;
        dbMatches.push(v);
      });
      // Deduplicate
      var dbSeen = {};
      dbMatches = dbMatches.filter(function (v) { var low = v.toLowerCase(); if (dbSeen[low]) return false; dbSeen[low] = true; return true; });

      if (!slMatches.length && !userMatches.length && !dbMatches.length) return;

      var container = document.createElement("div");
      container.id = DETAIL_DETECTIONS_ID;
      container.style.cssText = "margin-bottom:12px;";

      if (slMatches.length && _canShowLabels) {
        var slDiv = document.createElement("div");
        slDiv.style.cssText = "padding:8px 10px;background:#E3F2FD;border-radius:6px;margin-bottom:8px;";
        slDiv.innerHTML = '<b style="font-size:12px;color:#1976D2;">SL/PR detectadas:</b> ';
        slMatches.forEach(function (sl) {
          var span = document.createElement("span");
          span.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #1976D2;border-radius:4px;font-weight:600;font-size:12px;";
          span.textContent = sl;
          span.appendChild(createCopyButton(sl));
          slDiv.appendChild(span);
        });
        container.appendChild(slDiv);
      }

      if (userMatches.length) {
        var userDiv = document.createElement("div");
        userDiv.style.cssText = "padding:8px 10px;background:#FFF3E0;border-radius:6px;margin-bottom:8px;";
        userDiv.innerHTML = '<b style="font-size:12px;color:#E65100;">Usuarios detectados:</b> ';
        userMatches.forEach(function (u) {
          var span = document.createElement("span");
          span.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #E65100;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;";
          span.textContent = u;
          span.appendChild(createCopyButton(u));
          userDiv.appendChild(span);
        });
        container.appendChild(userDiv);
      }

      if (dbMatches.length && _canShowLabels) {
        var dbDiv = document.createElement("div");
        dbDiv.style.cssText = "padding:8px 10px;background:#E8F5E9;border-radius:6px;margin-bottom:8px;";
        dbDiv.innerHTML = '<b style="font-size:12px;color:#2E7D32;">🗄️ Objetos de BD detectados:</b> ';
        dbMatches.forEach(function (obj) {
          var span = document.createElement("span");
          span.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #2E7D32;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;";
          span.textContent = obj;
          span.appendChild(createCopyButton(obj));
          dbDiv.appendChild(span);
        });
        container.appendChild(dbDiv);
      }

      evidenciasH2.parentElement.insertBefore(container, evidenciasH2);
    }

    const REASSIGN_APP_BTN_ID = "sp-reassign-app-btn";

    function injectReassignAppButton() {
      if (!_btnReassignApp) return;
      if (document.getElementById(REASSIGN_APP_BTN_ID)) return;
      if (!isDetailView()) return;
      var ticketId = getDetailTicketId();
      if (!ticketId) return;

      // Don't show if ticket is closed
      var chipLabels = document.querySelectorAll(".MuiChip-label");
      var isClosed = false;
      chipLabels.forEach(function (el) { if (el.textContent.trim() === "Cerrado") isClosed = true; });
      if (isClosed) return;

      // Find "Información del ticket" h1
      var h1 = null;
      document.querySelectorAll("h1.MuiTypography-h1").forEach(function (el) {
        if (el.textContent.trim() === "Información del ticket") h1 = el;
      });
      if (!h1) return;

      var btn = document.createElement("button");
      btn.id = REASSIGN_APP_BTN_ID;
      btn.textContent = "🔀 Reasignar a Aplicaciones";
      btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#C62828;color:#fff;font-weight:600;white-space:nowrap;margin-left:12px;vertical-align:middle;";
      btn.addEventListener("click", function () { showReassignAppModal(ticketId); });
      h1.parentElement.appendChild(btn);
    }

    function showReassignAppModal(ticketId) {
      var m = createModal({
        id: "sp-reassign-app-modal",
        title: "⚠️ Reasignar a Aplicaciones",
        content: '<p style="font-size:14px;color:#555;margin:0 0 8px;">Este ticket será reasignado al equipo de Aplicaciones.</p>' +
          '<p style="font-size:13px;color:#888;margin:0 0 20px;">El ticket dejará de estar bajo nuestra responsabilidad.</p>' +
          '<div id="sp-reassign-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-reassign-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:14px;">Sí, reasignar</button>' +
          '<button id="sp-reassign-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          '</div>',
        options: { maxWidth: "420px", textAlign: "center" }
      });
      var overlay = m.overlay;

      document.getElementById("sp-reassign-cancel").addEventListener("click", m.close);

      document.getElementById("sp-reassign-confirm").addEventListener("click", async function () {
        overlay.remove();
        showLoadingToast("Tomando ticket para reasignar...");

        var spToken = getToken();
        try {
          // Step 1: Take the ticket first
          var profileId = await getMyProfileId();
          if (!profileId) throw new Error("No se pudo obtener tu perfil");
          var takeRes = await fetch(SP_API + "/reassign/" + ticketId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify({
              resolutionGroupId: getTeamConfig().resolutionGroupId,
              serviceId: null,
              responsibleProfileId: profileId,
              resolutionGroup: { label: getTeamConfig().resolutionGroupLabel, value: getTeamConfig().resolutionGroupId }
            }),
          });
          if (!takeRes.ok) throw new Error("Error al tomar: HTTP " + takeRes.status);
          var takeJson = await takeRes.json();
          if (!takeJson.success) throw new Error("No se pudo tomar el ticket");

          // Step 2: Reassign to Aplicaciones
          showLoadingToast("Reasignando a Aplicaciones...");
          var res = await fetch(SP_API + "/reassign/" + ticketId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify({
              ticketCommentRequest: { internal: false, content: "Se reasigna ticket" },
              resolutionGroupId: 53,
              serviceId: null,
              responsibleProfileId: null,
              resolutionGroup: { label: "Soporte Aplicativos y Sistemas (general)", value: 53 }
            }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          if (json.success) {
            var sm = createModal({
              id: "sp-reassign-success",
              title: "✅ Ticket reasignado",
              content: '<p style="font-size:14px;color:#555;margin:0 0 16px;">El ticket fue reasignado a Aplicaciones exitosamente.</p>' +
                '<button id="sp-reassign-ok" style="width:100%;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">Aceptar</button>',
              options: { maxWidth: "360px", textAlign: "center", closeOnBackdrop: false }
            });
            document.getElementById("sp-reassign-ok").addEventListener("click", function () {
              window.location.href = "/es/dashboard/tickets-mesa";
            });
          } else {
            throw new Error("No success");
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
        }
      });
    }

    function injectBulkButton() {
      if (!canMigrateMonday) return;
      if (document.getElementById(BULK_BTN_ID)) return;
      let container = document.querySelector(".MuiBox-root .MuiStack-root");
      let insertMethod = "prepend";
      if (!container) {
        // Search view: insert before the search icon button
        const searchBtn = document.querySelector('button[aria-label="Buscar"]');
        if (searchBtn) {
          container = searchBtn.parentElement;
          insertMethod = "beforeSearch";
        }
      }
      if (!container) return;

      const btn = createHeaderButton({ id: BULK_BTN_ID, icon: "🔄", label: "Sync Monday", color: "#1565C0" });
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.innerHTML = '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Sincronizando...</span>';
        try {
          var spToken = getToken();
          var mondayToken = await getMondayToken();
          if (!spToken || !mondayToken) throw new Error("Sin token");

          // Get all ticket IDs visible in the DataGrid
          var rows = document.querySelectorAll(".MuiDataGrid-row");
          var ticketIds = [];
          rows.forEach(function (row) {
            var idCell = row.querySelector('[data-field="id"]');
            var id = idCell ? idCell.textContent.trim() : row.getAttribute("data-id");
            if (id) ticketIds.push(id);
          });
          if (!ticketIds.length) throw new Error("Sin tickets visibles");

          // Direct fetch helper for Monday
          async function mFetch(query, variables) {
            var r = await fetch("https://api.monday.com/v2", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": mondayToken }, body: JSON.stringify({ query: query, variables: variables }) });
            var d = await r.json();
            return d.data;
          }

          // Get boards and users
          var wsId = await getMondayWorkspaceId();
          var boardsData = await mFetch('{ boards(workspace_ids: [' + wsId + '], limit: 50) { id name } }', {});
          var ticketBoards = (boardsData.boards || []).filter(function (b) { return b.name.includes("Tickets DBA -") && !b.name.includes("Subelementos"); });
          var usersData = await mFetch('{ users(limit:500) { id email } }', {});
          var mondayUsersMap = {};
          (usersData.users || []).forEach(function (u) { if (u.email) mondayUsersMap[u.email.toLowerCase()] = u.id; });

          var synced = 0;
          for (var ti = 0; ti < ticketIds.length; ti++) {
            try {
              // Fetch individual ticket for full data (email del analista)
              var tRes = await fetch(SP_API + "/" + ticketIds[ti], { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
              if (!tRes.ok) continue;
              var tJson = await tRes.json();
              var ticket = tJson.data || tJson;
              if (!ticket.uniqueCode) continue;

              var spStatus = (ticket.ticketStatus?.name || "").toLowerCase();
              var holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";

              // Find in Monday
              var mondayItemId = null, foundBoardId = null;
              for (var b of ticketBoards) {
                var itemData = await mFetch('query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: ticket.uniqueCode });
                var items = itemData.items_page_by_column_values?.items || [];
                if (items.length) { mondayItemId = items[0].id; foundBoardId = b.id; break; }
              }
              if (!mondayItemId) continue;

              // Map status
              var mondayStatusIndex = mapStatusToMonday(spStatus);

              var colValues = { status: { index: mondayStatusIndex } };
              if (holderEmail) {
                var uId = mondayUsersMap[holderEmail.toLowerCase()];
                if (uId) colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(uId), kind: "person" }] };
              }

              await mFetch('mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: foundBoardId, itemId: mondayItemId, columnValues: JSON.stringify(colValues) });
              synced++;
            } catch (e) { continue; }
          }
          btn.innerHTML = '<span class="sp-btn-icon">✅</span><span class="sp-btn-label"> ' + synced + ' actualizados</span>';
          setTimeout(function () { btn.innerHTML = '<span class="sp-btn-icon">🔄</span><span class="sp-btn-label"> Sync Monday</span>'; btn.disabled = false; }, 3000);
        } catch (e) {
          btn.innerHTML = '<span class="sp-btn-icon">❌</span><span class="sp-btn-label"> Error</span>';
          setTimeout(function () { btn.innerHTML = '<span class="sp-btn-icon">🔄</span><span class="sp-btn-label"> Sync Monday</span>'; btn.disabled = false; }, 3000);
        }
      });

      if (insertMethod === "beforeSearch") {
        const searchBtn = container.querySelector('button[aria-label="Buscar"]');
        container.insertBefore(btn, searchBtn);
      } else {
        container.prepend(btn);
      }
    }

    // --- Inject buttons ---
    const HIGHLIGHT_CLASS = "sp-my-row";

    function getLoggedUserName() {
      const el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
      return el ? el.textContent.trim() : "";
    }

    var _loggedUserEmail = "";
    function getLoggedUserEmail() {
      if (_loggedUserEmail) return _loggedUserEmail;
      // Read from storage synchronously (set during checkSession)
      chrome.storage.local.get("userEmail", function (r) { _loggedUserEmail = r.userEmail || ""; });
      return _loggedUserEmail;
    }
    // Pre-load email
    chrome.storage.local.get("userEmail", function (r) { _loggedUserEmail = (r.userEmail || "").toLowerCase(); });

    function highlightMyRows() {
      const myName = getLoggedUserName();
      if (!myName) return;
      document.querySelectorAll(".MuiDataGrid-row").forEach((row) => {
        if (row.classList.contains(HIGHLIGHT_CLASS)) return;
        const responsibleCell = row.querySelector('[data-field="responsibleName"]');
        if (responsibleCell && responsibleCell.textContent.trim() === myName) {
          row.classList.add(HIGHLIGHT_CLASS);
          row.style.position = "relative";
          var indicator = document.createElement("span");
          indicator.textContent = "❗";
          indicator.style.cssText = "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
          row.appendChild(indicator);
        }
      });
    }

    const STATUS_COLORS = {
      "Asignado": "rgba(33, 150, 243, 0.18)",
      "En validación": "rgba(156, 39, 176, 0.18)",
      "En atención": "rgba(255, 152, 0, 0.18)",
      "Por aprobador": "rgba(121, 85, 72, 0.18)",
      "Por ejecutar": "rgba(0, 150, 136, 0.18)",
      "Por revisar": "rgba(63, 81, 181, 0.18)",
      "En aplicaciones": "rgba(233, 30, 99, 0.18)",
      "Por confirmar": "rgba(255, 193, 7, 0.20)",
      "Cerrado": "rgba(76, 175, 80, 0.18)",
      "Rechazado": "rgba(244, 67, 54, 0.18)",
      "Cancelado": "rgba(158, 158, 158, 0.20)",
      "Reabierto": "rgba(255, 87, 34, 0.18)",
      "En espera": "rgba(255, 235, 59, 0.20)"
    };

    const STATUS_TEXT_COLORS = {
      "Asignado": "#1565C0",
      "En validación": "#7B1FA2",
      "En atención": "#E65100",
      "Por aprobador": "#5D4037",
      "Por ejecutar": "#00796B",
      "Por revisar": "#283593",
      "En aplicaciones": "#C2185B",
      "Por confirmar": "#F9A825",
      "Cerrado": "#2E7D32",
      "Rechazado": "#C62828",
      "Cancelado": "#616161",
      "Reabierto": "#D84315",
      "En espera": "#F57F17"
    };

    function colorRowsByStatus() {
      document.querySelectorAll(".MuiDataGrid-row").forEach(function (row) {
        var statusCell = row.querySelector('[data-field="ticketStatusName"]');
        if (!statusCell) return;
        var status = statusCell.textContent.trim();
        var color = STATUS_COLORS[status] || "transparent";
        if (row.dataset.spStatus !== status) {
          row.style.backgroundColor = color;
          row.dataset.spStatus = status;
        }
      });
    }

    // --- Team panel ---
    const TEAM_PANEL_ID = "sp-team-panel";
    var teamPanelLoading = false;
    var hasMondayConfig = false;
    var mondayBoardConfigured = false;

    // Check if current group has Monday config
    try {
      chrome.storage.local.get(["groupMondayConfig"], function (r) {
        var config = r.groupMondayConfig || {};
        var groupId = currentTeamArea || (currentUserGroups.length ? currentUserGroups[0] : "");
        mondayBoardConfigured = !!(groupId && config[groupId] && config[groupId].etiqueta);
        hasMondayConfig = mondayBoardConfigured && canMigrateMonday;
      });
    } catch (e) { }

    // Re-check hasMondayConfig after role is loaded (called from initByRole)
    function updateMondayConfig() {
      hasMondayConfig = mondayBoardConfigured && canMigrateMonday;
    }

    const TEAM_AREAS = {};
    // Build TEAM_AREAS dynamically from GROUP_INFO
    GROUP_INFO.forEach(function (g) {
      TEAM_AREAS[g.id] = {
        resolutionGroupId: g.id,
        resolutionGroupLabel: g.name,
        profiles: [] // loaded dynamically
      };
    });

    var currentTeamArea = ""; // Set dynamically from user's groups

    function isMultiGroup() {
      return currentUserGroups.length > 1;
    }

    function getTeamConfig() {
      return TEAM_AREAS[currentTeamArea] || TEAM_AREAS[currentUserGroups[0]] || { resolutionGroupId: currentUserGroups[0] || 0, resolutionGroupLabel: "", profiles: [] };
    }

    // Returns all areas if gerente, otherwise just the configured one
    function getActiveAreas() {
      return currentUserGroups.map(function (gId) { return TEAM_AREAS[gId]; }).filter(Boolean);
    }

    function loadTeamArea() {
      return new Promise(function (resolve) {
        try {
          chrome.storage.local.get("teamArea", function (result) {
            var val = result.teamArea || "";
            if (val) currentTeamArea = val;
            // Resolve profileId in background (non-blocking)
            resolveSessionProfileId();
            resolve();
          });
        } catch (e) { resolve(); }
      });
    }

    // Load profiles dynamically for a group
    var profilesCache = {};
    var _pendingProfileRequests = {};

    function loadProfilesForGroup(groupId) {
      if (profilesCache[groupId]) return Promise.resolve(profilesCache[groupId]);
      if (_pendingProfileRequests[groupId]) return _pendingProfileRequests[groupId];
      var spToken = localStorage.getItem("token");
      if (!spToken) return Promise.resolve([]);
      _pendingProfileRequests[groupId] = fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      }).then(function (r) { return r.json(); }).then(function (json) {
        var profiles = json.data || json;
        if (!Array.isArray(profiles)) profiles = [];
        // Filter by blacklist: memory first, storage fallback
        var blacklist = _userConfig.blacklist || [];
        function applyBlacklist(blacklistIds) {
          if (blacklistIds.length > 0) {
            return Promise.all(blacklistIds.map(function (pageId) {
              return new Promise(function (resolve) {
                chrome.runtime.sendMessage({ type: "notion-page", pageId: pageId }, function (resp) {
                  if (resp && resp.success) resolve(resp.data.properties?.["Id Support Plus"]?.number || null);
                  else resolve(null);
                });
              });
            })).then(function (pids) {
              pids = pids.filter(Boolean);
              if (pids.length > 0) {
                profiles = profiles.filter(function (p) { return !pids.includes(p.profileId || p.id); });
              }
              profilesCache[groupId] = profiles;
              if (TEAM_AREAS[groupId]) TEAM_AREAS[groupId].profiles = profiles;
              return profiles;
            });
          }
          profilesCache[groupId] = profiles;
          if (TEAM_AREAS[groupId]) TEAM_AREAS[groupId].profiles = profiles;
          return profiles;
        }
        if (blacklist.length > 0) {
          return applyBlacklist(blacklist);
        }
        return new Promise(function (resolve) {
          chrome.storage.local.get("userConfig", function (stored) {
            var storedBlacklist = (stored.userConfig || {}).blacklist || [];
            applyBlacklist(storedBlacklist).then ? applyBlacklist(storedBlacklist).then(resolve) : resolve(applyBlacklist(storedBlacklist));
          });
        });
      }).catch(function () { delete _pendingProfileRequests[groupId]; return []; }).then(function (result) { delete _pendingProfileRequests[groupId]; return result; });
      return _pendingProfileRequests[groupId];
    }

    // Build a global profile name map (populated as profiles load)
    var ALL_PROFILE_NAMES = {};

    async function loadTeamPanel() {
      if (isDetailView()) return;
      if (teamPanelLoading) return;
      if (!currentTeamArea) return;
      if (document.getElementById("sp-manager-panel")) return;
      if (document.getElementById(TEAM_PANEL_ID)) return;
      if (window.location.pathname.includes("/tickets-mesa")) return;
      // Double-check: mark loading BEFORE any async work
      teamPanelLoading = true;
      // Extra safety: if panel appeared while we were waiting, abort
      await new Promise(function(r) { setTimeout(r, 50); });
      if (document.getElementById(TEAM_PANEL_ID)) { teamPanelLoading = false; return; }
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid) { teamPanelLoading = false; return; }

      var spToken = getToken();
      if (!spToken) { teamPanelLoading = false; return; }

      // Get or create panel container
      var panel = document.getElementById(TEAM_PANEL_ID);
      if (!panel) {
        panel = document.createElement("div");
        panel.id = TEAM_PANEL_ID;
        panel.style.cssText = "margin-bottom:12px;overflow-x:auto;font-family:system-ui;";
        grid.parentElement.insertBefore(panel, grid);
      }

      try {
        var areas = getActiveAreas();
        var myName = getLoggedUserName();

        // Load profiles dynamically for each area
        await Promise.all(areas.map(function (area) {
          return loadProfilesForGroup(area.resolutionGroupId).then(function (profiles) {
            area.profiles = profiles;
            profiles.forEach(function (p) { ALL_PROFILE_NAMES[p.profileId] = p.profileFullName; });
          });
        }));

        // Render empty columns immediately
        var containerDiv = document.createElement("div");
        containerDiv.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
        panel.innerHTML = "";
        panel.appendChild(containerDiv);

        // "Sin asignar" column at the left (for each area)
        areas.forEach(function (area, areaIdx) {
          if (areaIdx > 0) {
            var sep = document.createElement("div");
            sep.style.cssText = "width:3px;background:#ddd;border-radius:2px;margin:0 4px;align-self:stretch;";
            containerDiv.appendChild(sep);
          }

          // Area label if gerente
          if (areas.length > 1) {
            var areaLabel = document.createElement("div");
            areaLabel.style.cssText = "min-width:180px;max-width:220px;display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0;";
            areaLabel.innerHTML = '<div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;color:#555;letter-spacing:1px;">' + (areaIdx === 0 ? '🗄️ DBA' : '📦 APPS') + '</div>';
            containerDiv.appendChild(areaLabel);
          }

          var unassignedCol = document.createElement("div");
          unassignedCol.id = "sp-team-col-unassigned-" + area.resolutionGroupId;
          unassignedCol.style.cssText = "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;";
          unassignedCol.innerHTML = '<div class="sp-team-header" data-profile-id="unassigned" style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">⏳ Sin asignar <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
            '<div class="sp-team-tickets" data-profile-id="unassigned" data-area-group="' + area.resolutionGroupId + '" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
          containerDiv.appendChild(unassignedCol);

          area.profiles.forEach(function (p) {
            var isMe = myName && p.profileFullName === myName;
            var borderColor = isMe ? "#D94040" : "#ddd";
            var headerBg = isMe ? "#D94040" : (areaIdx === 0 ? "#2196F3" : "#7B1FA2");
            var firstName = p.profileFullName.split(" ")[0];

            var col = document.createElement("div");
            col.id = "sp-team-col-" + p.profileId;
            col.style.cssText = "min-width:180px;max-width:220px;border:2px solid " + borderColor + ";border-radius:8px;overflow:hidden;flex-shrink:0;";
            col.innerHTML = '<div class="sp-team-header" data-profile-id="' + p.profileId + '" style="background:' + headerBg + ';color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">' + esc(firstName) + ' <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
              '<div class="sp-team-tickets" data-profile-id="' + p.profileId + '" data-area-group="' + area.resolutionGroupId + '" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
            containerDiv.appendChild(col);
          });
        });

        // "Cerrados hoy" column at the right
        var closedCol = document.createElement("div");
        closedCol.id = "sp-team-col-closed";
        closedCol.style.cssText = "min-width:180px;max-width:220px;border:2px solid #2E7D32;border-radius:8px;overflow:hidden;flex-shrink:0;";
        closedCol.innerHTML = '<div class="sp-team-header" data-profile-id="closed" style="background:#2E7D32;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
          '<div class="sp-team-tickets" data-profile-id="closed" data-area-group="closed" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
        containerDiv.appendChild(closedCol);

        // Setup drag and drop + click to open
        var dragStartPos = null;
        panel.addEventListener("click", function (e) {
          var ticket = e.target.closest(".sp-team-ticket");
          if (!ticket) return;
          // Only open if it wasn't a drag (mouse didn't move much)
          if (dragStartPos && (Math.abs(e.clientX - dragStartPos.x) > 5 || Math.abs(e.clientY - dragStartPos.y) > 5)) return;
          var ticketId = ticket.dataset.ticketId;
          if (ticketId) showQuickDetailModal(ticketId);
        });
        panel.addEventListener("mousedown", function (e) {
          dragStartPos = { x: e.clientX, y: e.clientY };
        });
        panel.addEventListener("dragstart", function (e) {
          var ticket = e.target.closest(".sp-team-ticket");
          if (!ticket) return;
          e.dataTransfer.setData("text/plain", ticket.dataset.ticketId);
          ticket.style.opacity = "0.4";
          dragStartPos = null; // Nullify so click doesn't fire after drag
        });
        panel.addEventListener("dragend", function (e) {
          var ticket = e.target.closest(".sp-team-ticket");
          if (ticket) ticket.style.opacity = "1";
        });
        panel.addEventListener("dragover", function (e) {
          e.preventDefault();
          var col = e.target.closest("[id^='sp-team-col-']");
          if (!col) return;
          var dropZone = col.querySelector(".sp-team-tickets");
          if (dropZone) dropZone.style.background = "#e3f2fd";
        });
        panel.addEventListener("dragleave", function (e) {
          var col = e.target.closest("[id^='sp-team-col-']");
          if (!col) return;
          // Only reset if actually leaving the column
          if (col.contains(e.relatedTarget)) return;
          var dropZone = col.querySelector(".sp-team-tickets");
          if (dropZone) dropZone.style.background = "#fafafa";
        });
        panel.addEventListener("drop", async function (e) {
          e.preventDefault();
          var col = e.target.closest("[id^='sp-team-col-']");
          if (!col) return;
          var dropZone = col.querySelector(".sp-team-tickets");
          if (!dropZone) return;
          dropZone.style.background = "#fafafa";
          var ticketId = e.dataTransfer.getData("text/plain");
          var targetProfileId = dropZone.dataset.profileId;
          if (!ticketId || !targetProfileId) return;

          // Can't drop onto "Sin asignar" column
          if (targetProfileId === "unassigned") return;

          // Handle drop onto "Cerrados hoy" column
          if (targetProfileId === "closed") {
            showLoadingToast("Cerrando ticket...");
            try {
              // Check if ticket has someone assigned by looking at source
              var needsAssign = !sourceProfileId || sourceProfileId === "unassigned";
              if (needsAssign) {
                // Assign to logged user first
                var myProfId = await getMyProfileId();
                if (myProfId) {
                  await fetch(SP_API + "/reassign/" + ticketId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ resolutionGroupId: getTeamConfig().resolutionGroupId, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: getTeamConfig().resolutionGroupLabel, value: getTeamConfig().resolutionGroupId } }),
                  });
                }
              }
              // Close the ticket
              var closeRes = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO, ticketCommentRequest: null }),
              });
              if (!closeRes.ok) throw new Error("HTTP " + closeRes.status);
              showSuccessToast("Ticket cerrado");
              if (sourceProfileId && sourceProfileId !== "unassigned") refreshTeamColumn(sourceProfileId);
              if (sourceProfileId === "unassigned" || fromTable) refreshUnassignedColumn();
              refreshClosedColumn();
            } catch (err) {
              showErrorToast("Error: " + err.message);
            }
            return;
          }

          // Don't reassign if dropped on the same column it came from
          var sourceCol = panel.querySelector('.sp-team-ticket[data-ticket-id="' + ticketId + '"]');
          var sourceProfileId = null;
          var fromTable = false;
          if (sourceCol) {
            var sourceZone = sourceCol.closest(".sp-team-tickets");
            if (sourceZone && sourceZone.dataset.profileId === targetProfileId) return;
            sourceProfileId = sourceZone ? sourceZone.dataset.profileId : null;
          } else {
            // Drag came from the main table
            fromTable = true;
          }

          // Optimistic UI: move the ticket element immediately
          if (sourceCol) {
            dropZone.appendChild(sourceCol);
          }

          // Determine area from the drop zone
          var dropAreaGroupId = parseInt(dropZone.dataset.areaGroup) || getTeamConfig().resolutionGroupId;
          var dropAreaConfig = Object.values(TEAM_AREAS).find(function (a) { return a.resolutionGroupId === dropAreaGroupId; }) || getTeamConfig();

          showLoadingToast("Reasignando ticket...");
          try {
            var res = await fetch(SP_API + "/reassign/" + ticketId, {
              method: "PUT",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({
                resolutionGroupId: dropAreaConfig.resolutionGroupId,
                serviceId: null,
                responsibleProfileId: parseInt(targetProfileId),
                resolutionGroup: { label: dropAreaConfig.resolutionGroupLabel, value: dropAreaConfig.resolutionGroupId }
              }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            var json = await res.json();
            if (json.success) {
              showSuccessToast("Ticket reasignado");

              // Only refresh the two affected columns
              refreshTeamColumn(targetProfileId);
              if (sourceProfileId && sourceProfileId !== "unassigned") refreshTeamColumn(sourceProfileId);
              if (sourceProfileId === "unassigned" || fromTable) refreshUnassignedColumn();
              // If from table, also refresh the main table buttons
              if (fromTable) {
                var tableRow = document.querySelector('.MuiDataGrid-row[data-id="' + ticketId + '"]');
                if (tableRow) {
                  var statusCell = tableRow.querySelector('[data-field="ticketStatusName"]');
                  if (statusCell) statusCell.textContent = "Asignado";
                  var takeBtn = tableRow.querySelector("." + TAKE_BTN_CLASS);
                  if (takeBtn) takeBtn.remove();
                  var folioEl = tableRow.querySelector('[data-field="uniqueCode"] p.MuiTypography-body1');
                  if (folioEl) { folioEl.removeAttribute("draggable"); folioEl.style.cursor = ""; }
                  tableRow.style.opacity = "1";
                }
              }
            } else { throw new Error("No success"); }
          } catch (err) {
            showErrorToast("Error: " + err.message);
            // Revert: refresh both columns to restore correct state
            refreshTeamColumn(targetProfileId);
            if (sourceProfileId && sourceProfileId !== "unassigned") refreshTeamColumn(sourceProfileId);
            if (sourceProfileId === "unassigned" || fromTable) refreshUnassignedColumn();
            if (fromTable) {
              var tableRow = document.querySelector('.MuiDataGrid-row[data-id="' + ticketId + '"]');
              if (tableRow) tableRow.style.opacity = "1";
            }
          }
        });

        // Fetch tickets for each member individually and update as they arrive
        areas.forEach(function (area) {
          area.profiles.forEach(function (p) {
            var TEAM_API = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId;
            Promise.all([
              fetch(TEAM_API + "&ticketStatusName=Asignado", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function (r) { return r.json(); }),
              fetch(TEAM_API + "&ticketStatusName=En%20atenci%C3%B3n", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function (r) { return r.json(); })
            ]).then(function (results) {
              var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);

              var col = document.getElementById("sp-team-col-" + p.profileId);
              if (!col) return;

              var countEl = col.querySelector(".sp-team-count");
              if (countEl) countEl.textContent = "(" + tickets.length + ")";

              var listEl = col.querySelector(".sp-team-tickets");
              if (!listEl) return;

              if (!tickets.length) {
                listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets</div>';
              } else {
                var html = "";
                tickets.forEach(function (t) {
                  var statusColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
                  html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:10px;line-height:1.3;cursor:grab;">';
                  html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
                  html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
                  html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:' + statusColor + ';font-weight:600;font-size:9px;">' + t.ticketStatusName + '</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</span></div>';
                  html += '</div>';
                });
                listEl.innerHTML = html;
              }
            }).catch(function () {
              var col = document.getElementById("sp-team-col-" + p.profileId);
              if (col) {
                var listEl = col.querySelector(".sp-team-tickets");
                if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#D94040;font-size:10px;">Error</div>';
              }
            });
          });

          // Fetch unassigned tickets (En espera) per area
          fetch(SP_SEARCH_API + "?page=0&size=50&resolutionGroupId=" + area.resolutionGroupId + "&ticketStatusName=En%20espera", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken },
          }).then(function (r) { return r.json(); }).then(function (json) {
            var tickets = (json.data || json).content || [];
            var col = document.getElementById("sp-team-col-unassigned-" + area.resolutionGroupId);
            if (!col) return;
            var countEl = col.querySelector(".sp-team-count");
            if (countEl) countEl.textContent = "(" + tickets.length + ")";
            var listEl = col.querySelector(".sp-team-tickets");
            if (!listEl) return;
            if (!tickets.length) {
              listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets</div>';
            } else {
              var html = "";
              tickets.forEach(function (t) {
                html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:10px;line-height:1.3;cursor:grab;">';
                html += '<div style="font-weight:600;color:#E65100;">' + (t.uniqueCode || "") + '</div>';
                html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#FF8F00;font-weight:600;font-size:9px;">En espera</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</span></div>';
                html += '</div>';
              });
              listEl.innerHTML = html;
            }
          }).catch(function () { });
        });

        // Fetch closed tickets today
        refreshClosedColumn();

      } catch (err) {
        panel.innerHTML = '<div style="color:#D94040;padding:8px;font-size:12px;">Error: ' + err.message + '</div>';
      }
      teamPanelLoading = false;
    }

    var teamRefreshing = false;

    function refreshTeamPanel() {
      if (teamRefreshing) return;
      teamRefreshing = true;
      var panel = document.getElementById(TEAM_PANEL_ID);
      if (!panel) { teamRefreshing = false; loadTeamPanel(); return; }

      var spToken = getToken();
      if (!spToken) return;

      var areas = getActiveAreas();
      var allProfiles = [];
      areas.forEach(function (a) { allProfiles = allProfiles.concat(a.profiles); });

      var pending = allProfiles.length;
      allProfiles.forEach(function (p) {
        var TEAM_API = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId;
        Promise.all([
          fetch(TEAM_API + "&ticketStatusName=Asignado", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function (r) { return r.json(); }),
          fetch(TEAM_API + "&ticketStatusName=En%20atenci%C3%B3n", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function (r) { return r.json(); })
        ]).then(function (results) {
          var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);

          var col = document.getElementById("sp-team-col-" + p.profileId);
          if (!col) return;

          var countEl = col.querySelector(".sp-team-count");
          if (countEl) countEl.textContent = "(" + tickets.length + ")";

          var listEl = col.querySelector(".sp-team-tickets");
          if (!listEl) return;

          if (!tickets.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets</div>';
          } else {
            var html = "";
            tickets.forEach(function (t) {
              var statusColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
              html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:10px;line-height:1.3;cursor:grab;">';
              html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
              html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
              html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:' + statusColor + ';font-weight:600;font-size:9px;">' + t.ticketStatusName + '</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</span></div>';
              html += '</div>';
            });
            listEl.innerHTML = html;
          }
        }).catch(function () { }).finally(function () { pending--; if (pending <= 0) teamRefreshing = false; });
      });

      // Also refresh unassigned and closed columns
      refreshUnassignedColumn();
      refreshClosedColumn();
    }

    function refreshTeamColumn(profileId) {
      var spToken = getToken();
      if (!spToken) return;
      var name = ALL_PROFILE_NAMES[profileId];
      if (!name) return;
      var TEAM_API = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + profileId;
      Promise.all([
        fetch(TEAM_API + "&ticketStatusName=Asignado", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function (r) { return r.json(); }),
        fetch(TEAM_API + "&ticketStatusName=En%20atenci%C3%B3n", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function (r) { return r.json(); })
      ]).then(function (results) {
        var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);

        var col = document.getElementById("sp-team-col-" + profileId);
        if (!col) return;

        var countEl = col.querySelector(".sp-team-count");
        if (countEl) countEl.textContent = "(" + tickets.length + ")";

        var listEl = col.querySelector(".sp-team-tickets");
        if (!listEl) return;

        if (!tickets.length) {
          listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets</div>';
        } else {
          var html = "";
          tickets.forEach(function (t) {
            var statusColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
            html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:10px;line-height:1.3;cursor:grab;">';
            html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
            html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:' + statusColor + ';font-weight:600;font-size:9px;">' + t.ticketStatusName + '</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</span></div>';
            html += '</div>';
          });
          listEl.innerHTML = html;
        }
      }).catch(function () { });
    }

    function refreshUnassignedColumn() {
      var spToken = getToken();
      if (!spToken) return;
      var areas = getActiveAreas();
      areas.forEach(function (area) {
        fetch(SP_SEARCH_API + "?page=0&size=50&resolutionGroupId=" + area.resolutionGroupId + "&ticketStatusName=En%20espera", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken },
        }).then(function (r) { return r.json(); }).then(function (json) {
          var tickets = (json.data || json).content || [];
          var col = document.getElementById("sp-team-col-unassigned-" + area.resolutionGroupId);
          if (!col) return;
          var countEl = col.querySelector(".sp-team-count");
          if (countEl) countEl.textContent = "(" + tickets.length + ")";
          var listEl = col.querySelector(".sp-team-tickets");
          if (!listEl) return;
          if (!tickets.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets</div>';
          } else {
            var html = "";
            tickets.forEach(function (t) {
              html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:10px;line-height:1.3;cursor:grab;">';
              html += '<div style="font-weight:600;color:#E65100;">' + (t.uniqueCode || "") + '</div>';
              html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
              html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#FF8F00;font-weight:600;font-size:9px;">En espera</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + esc(t.requesterName || "") + '">' + esc((t.requesterName || "").split(" ")[0]) + '</span></div>';
              html += '</div>';
            });
            listEl.innerHTML = html;
          }
        }).catch(function () { });
      });
    }

    function refreshClosedColumn() {
      var spToken = getToken();
      if (!spToken) return;
      var today = new Date();
      var todayStart = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T00:00";
      var todayEnd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T23:59";
      var areas = getActiveAreas();
      var allClosed = [];
      var pending = areas.length;

      areas.forEach(function (area) {
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + area.resolutionGroupId + "&ticketStatusName=Cerrado&initDate=" + todayStart + "&endDate=" + todayEnd + "&page=0&size=100", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken },
        }).then(function (r) { return r.json(); }).then(function (json) {
          var tickets = (json.data || json).content || [];
          allClosed = allClosed.concat(tickets);
        }).catch(function () { }).finally(function () {
          pending--;
          if (pending <= 0) renderClosedColumn(allClosed);
        });
      });
    }

    function renderClosedColumn(tickets) {
      var col = document.getElementById("sp-team-col-closed");
      if (!col) return;
      var countEl = col.querySelector(".sp-team-count");
      if (countEl) countEl.textContent = "(" + tickets.length + ")";
      var listEl = col.querySelector(".sp-team-tickets");
      if (!listEl) return;
      if (!tickets.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets cerrados hoy</div>';
      } else {
        var html = "";
        tickets.forEach(function (t) {
          html += '<div class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #2E7D32;font-size:10px;line-height:1.3;">';
          html += '<div style="font-weight:600;color:#2E7D32;">' + (t.uniqueCode || "") + '</div>';
          html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#2E7D32;font-weight:600;font-size:9px;">Cerrado</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + (t.responsibleName || "") + '">' + (t.responsibleName || "").split(" ")[0] + '</span></div>';
          html += '</div>';
        });
        listEl.innerHTML = html;
      }
    }

    // --- Take ticket (reassign) ---
    let myProfileId = null;
    async function getMyProfileId() {
      // Use cached sessionProfileId if available
      if (sessionProfileId) return sessionProfileId;
      if (myProfileId) return myProfileId;
      const spToken = getToken();
      if (!spToken) return null;
      const myName = getLoggedUserName();
      if (!myName) return null;
      try {
        const res = await fetch(SP_API.replace("/tickets/web", "") + "/tickets/web/active-profiles-by-resolution-group/" + getTeamConfig().resolutionGroupId, {
          headers: { accept: "application/json", authorization: "Bearer " + spToken },
        });
        if (!res.ok) return null;
        const json = await res.json();
        const profiles = json.data || json;
        const me = profiles.find(function (p) { return p.profileFullName === myName; });
        if (me) {
          myProfileId = me.profileId;
          sessionProfileId = me.profileId; // Also cache globally
        }
        return myProfileId;
      } catch (e) { return null; }
    }

    function createTakeButton(ticketId) {
      const btn = document.createElement("button");
      btn.className = TAKE_BTN_CLASS;
      btn.textContent = "🤚 Tomar";
      btn.title = "Tomar ticket";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #1976D2;border-radius:4px;background:#1976D2;color:#fff;margin-left:6px;white-space:nowrap;";
      btn.addEventListener("mouseenter", function () { if (!btn.disabled) btn.textContent = "✊ Tomar"; });
      btn.addEventListener("mouseleave", function () { if (!btn.disabled) btn.textContent = "🤚 Tomar"; });
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        e.preventDefault();
        btn.disabled = true;
        var origText = btn.textContent;
        btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
        await showTakeModal(ticketId, btn);
        btn.textContent = origText;
        btn.disabled = false;
      });
      return btn;
    }

    // --- Ticket summary helpers ---
    async function fetchTicketInfo(ticketId) {
      var spToken = getToken();
      if (!spToken) return null;
      try {
        var res = await fetch(SP_API + "/" + ticketId, {
          headers: { accept: "application/json", authorization: "Bearer " + spToken },
        });
        if (!res.ok) return null;
        var json = await res.json();
        var t = json.data || json;
        return {
          uniqueCode: t.uniqueCode || "N/A",
          subject: t.subject || "Sin asunto",
          desc: (t.description || "").replace(/<[^>]*>/g, "").substring(0, 200),
          holder: t.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar",
          holderEmail: t.ticketHolder?.ticketHolderLog?.email || "",
          priority: t.incidentPriority?.name || "",
          status: t.ticketStatus?.name || "",
          requester: t.ticketInfo?.fullName || "",
          createdAt: t.createdAt || "",
          createdAtFormatted: t.createdAt ? t.createdAt.replace("T", " ").substring(0, 16) : ""
        };
      } catch (e) { return null; }
    }

    function ticketSummaryHTML(info) {
      if (!info) return "";
      var fullText = (info.subject || "") + " " + (info.desc || "");

      // Detect SL and PR codes
      var slMatches = [];
      var slRaw = fullText.match(/(?:SL|PR)\d{10,}/g);
      if (slRaw) slMatches = slRaw.filter(function (v, i, a) { return a.indexOf(v) === i; });

      // Detect DB users
      var userMatches = [];
      var userRaw = fullText.match(/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g);
      if (userRaw) {
        var seen = {};
        userMatches = userRaw.map(function (v) {
          var m = v.match(/(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i);
          return m ? m[1] : v;
        }).filter(function (v) { var low = v.toLowerCase(); if (seen[low]) return false; seen[low] = true; return true; });
      }

      var statusColor = STATUS_COLORS[info.status] || "rgba(0,0,0,0.05)";
      var rowStyle = 'padding:10px 14px;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;gap:8px;';

      var cardBorderColor = STATUS_TEXT_COLORS[info.status] || "#2196F3";

      var card = '<div style="border:2px solid ' + cardBorderColor + ';border-top:5px solid ' + cardBorderColor + ';border-radius:10px;overflow:hidden;margin-bottom:16px;font-size:13px;font-family:system-ui;background:#fff;">' +
        // Folio + Fecha
        '<div style="' + rowStyle + 'justify-content:space-between;">' +
        '<span>📁 <b>Folio:</b> <span style="color:#1976D2;font-weight:700;">' + info.uniqueCode + '</span></span>' +
        '<span>📅 <b>Fecha:</b> ' + (info.createdAtFormatted || "N/A") + '</span>' +
        '</div>' +
        // Asunto
        '<div style="' + rowStyle + '">' +
        '<span>✉️ <b>Asunto:</b> ' + info.subject + '</span>' +
        '</div>' +
        // Solicitante
        '<div style="' + rowStyle + '">' +
        '<span>👤 <b>Solicitante:</b> ' + (info.requester || "N/A") + '</span>' +
        '</div>' +
        // Analista
        '<div style="' + rowStyle + '">' +
        '<span>🔍 <b>Analista:</b> ' + info.holder + (info.holderEmail ? ' <span style="color:#888;">(' + info.holderEmail + ')</span>' : '') + '</span>' +
        '</div>' +
        // Estatus
        '<div style="' + rowStyle + '">' +
        '<span>✅ <b>Estatus:</b> <span style="color:' + (STATUS_TEXT_COLORS[info.status] || '#333') + ';font-weight:700;">' + (info.status || "N/A") + '</span></span>' +
        '</div>' +
        // Descripcion
        (info.desc ? '<div style="' + rowStyle + 'flex-direction:column;align-items:flex-start;">' +
          '<b>📝 Descripción:</b>' +
          '<div style="margin-top:4px;max-height:60px;overflow:auto;font-size:12px;color:#555;width:100%;">' + info.desc + '</div>' +
          '</div>' : '') +
        '</div>';

      // SL and users outside the card
      var slHTML = "";
      if (slMatches.length && _canShowLabels) {
        slHTML = '<div style="margin-bottom:8px;padding:8px 10px;background:#E3F2FD;border-radius:6px;border-left:4px solid #1976D2;">' +
          '<b style="font-size:11px;color:#1976D2;">📋 SL/PR detectadas:</b> ';
        slMatches.forEach(function (sl) {
          slHTML += '<span class="sp-sl-copy" data-sl="' + sl + '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #1976D2;border-radius:4px;font-weight:600;font-size:12px;">' + sl + '</span>';
        });
        slHTML += '</div>';
      }

      var userHTML = "";
      if (userMatches.length) {
        userHTML = '<div style="margin-bottom:8px;padding:8px 10px;background:#FFF3E0;border-radius:6px;border-left:4px solid #E65100;">' +
          '<b style="font-size:11px;color:#E65100;">🖥️ Usuarios detectados:</b> ';
        userMatches.forEach(function (u) {
          userHTML += '<span class="sp-user-copy" data-user="' + u + '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #E65100;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">' + u + '</span>';
        });
        userHTML += '</div>';
      }

      // Detect DB objects
      var dbMatches = [];
      var dbSchemaRaw = fullText.match(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]{3,}/g);
      if (dbSchemaRaw) dbSchemaRaw.forEach(function (v) { if (!v.match(/\.(com|mx|net|org|jpg|png|pdf|xlsx|csv|txt|html|js|css)$/i)) dbMatches.push(v); });
      var dbSpRaw = fullText.match(/\b(?:sp_|usp_|SP_|USP_)[A-Za-z0-9_]{3,}/g);
      if (dbSpRaw) dbSpRaw.forEach(function (v) { dbMatches.push(v); });
      var dbPrefixRaw = fullText.match(/\b(?:HN_|VW_|ZVW_|FN_|TBL_|V_|T_)[A-Za-z0-9_]{3,}/g);
      if (dbPrefixRaw) dbPrefixRaw.forEach(function (v) { dbMatches.push(v); });
      var dbContextRaw = fullText.match(/(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*([A-Za-z_][A-Za-z0-9_.]{3,})/gi);
      if (dbContextRaw) { dbContextRaw.forEach(function (match) { var obj = match.replace(/^(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*/i, "").trim(); if (obj && obj.length > 3) dbMatches.push(obj); }); }
      var dbUpperRaw = fullText.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g);
      if (dbUpperRaw) dbUpperRaw.forEach(function (v) { if (v.length >= 8) dbMatches.push(v); });
      var dbSeen = {};
      dbMatches = dbMatches.filter(function (v) { var low = v.toLowerCase(); if (dbSeen[low]) return false; dbSeen[low] = true; return true; });

      var dbHTML = "";
      if (dbMatches.length && _canShowLabels) {
        dbHTML = '<div style="margin-bottom:8px;padding:8px 10px;background:#E8F5E9;border-radius:6px;border-left:4px solid #2E7D32;">' +
          '<b style="font-size:11px;color:#2E7D32;">🗄️ Objetos de BD:</b> ';
        dbMatches.forEach(function (obj) {
          dbHTML += '<span class="sp-db-copy" data-db="' + obj + '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #2E7D32;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">' + obj + '</span>';
        });
        dbHTML += '</div>';
      }

      return card + slHTML + userHTML + dbHTML;
    }

    function injectSLCopyButtons(container) {
      container.querySelectorAll(".sp-sl-copy").forEach(function (span) {
        if (span.querySelector(".sp-copy-btn")) return;
        var sl = span.dataset.sl;
        if (sl) span.appendChild(createCopyButton(sl));
      });
      container.querySelectorAll(".sp-user-copy").forEach(function (span) {
        if (span.querySelector(".sp-copy-btn")) return;
        var user = span.dataset.user;
        if (user) span.appendChild(createCopyButton(user));
      });
      container.querySelectorAll(".sp-db-copy").forEach(function (span) {
        if (span.querySelector(".sp-copy-btn")) return;
        var db = span.dataset.db;
        if (db) span.appendChild(createCopyButton(db));
      });
    }

    // --- Ticket card for list modals ---
    // --- Render ticket list as table ---
    function renderTicketCards(container, tickets, myName, synced, boardDate) {
      var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:rgba(0,0,0,0.05);text-align:left;">' +
        '<th style="padding:6px;">Folio</th>' +
        '<th style="padding:6px;">Fecha</th>' +
        '<th style="padding:6px;">Asunto</th>' +
        '<th style="padding:6px;">Solicitante</th>' +
        '<th style="padding:6px;">Estado</th>' +
        '<th style="padding:6px;">Analista</th>' +
        '<th style="padding:6px;min-width:200px;">Acciones</th>' +
        '</tr></thead><tbody>';

      tickets.forEach(function (t) {
        var statusColor = STATUS_COLORS[t.ticketStatusName] || "transparent";
        var textColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
        var date = (t.createdAt || "").replace("T", " ").substring(0, 16);
        var subject = (t.subject || "").substring(0, 40) + ((t.subject || "").length > 40 ? "..." : "");
        html += '<tr style="background:' + statusColor + ';border-bottom:1px solid #eee;">';
        html += '<td style="padding:6px;font-weight:600;white-space:nowrap;"><a href="/es/dashboard/tickets/' + t.id + '" target="_blank" style="color:inherit;text-decoration:none;">' + (t.uniqueCode || t.id) + '</a><span class="sp-card-copy" data-code="' + (t.uniqueCode || "") + '"></span></td>';
        html += '<td style="padding:6px;font-size:11px;">' + date + '</td>';
        html += '<td style="padding:6px;" title="' + esc(t.subject || "") + '">' + subject + '</td>';
        html += '<td style="padding:6px;">' + (t.requesterName || "") + '</td>';
        html += '<td style="padding:6px;font-size:11px;font-weight:700;color:' + textColor + ';">' + (t.ticketStatusName || "") + '</td>';
        html += '<td style="padding:6px;">' + (t.responsibleName || "Sin asignar") + '</td>';
        html += '<td style="padding:8px;white-space:nowrap;display:flex;align-items:center;gap:6px;flex-wrap:wrap;" class="sp-card-actions" data-id="' + t.id + '" data-status="' + (t.ticketStatusName || "") + '" data-responsible="' + (t.responsibleName || "") + '" data-code="' + (t.uniqueCode || "") + '"></td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      // Inject copy buttons
      container.querySelectorAll(".sp-card-copy").forEach(function (span) {
        var code = span.dataset.code;
        if (code) span.appendChild(createCopyButton(code));
      });

      // Inject action buttons
      container.querySelectorAll(".sp-card-actions").forEach(function (cell) {
        var id = cell.dataset.id;
        var status = cell.dataset.status;
        var responsible = cell.dataset.responsible;
        var code = cell.dataset.code;

        if (status === "En espera") cell.appendChild(createTakeButton(id));
        if ((status === "Asignado" || status === "En atención") && responsible && myName && responsible === myName) cell.appendChild(createCloseButton(id));
        if ((status === "Asignado" || status === "En atención") && responsible && myName && responsible !== myName) cell.appendChild(createStealButton(id, responsible));
        if (status === "Cerrado") {
          if (code && synced[code]) {
            // Green border on ticket button + expandable Monday link
            var ticketBtn = cell.querySelector("p.MuiTypography-body1") || cell.querySelector("a") || cell;
            if (ticketBtn) ticketBtn.style.cssText += ";border:2px solid #2E7D32;border-radius:4px;padding:2px 6px;";
            var mondayLink = createSyncedBadge(synced[code]);
            cell.appendChild(mondayLink);
            // Hover on the cell expands the link
            cell.addEventListener("mouseenter", function () { mondayLink.style.width = "24px"; mondayLink.style.opacity = "1"; mondayLink.style.padding = "4px 6px"; });
            cell.addEventListener("mouseleave", function () { mondayLink.style.width = "0"; mondayLink.style.opacity = "0"; mondayLink.style.padding = "4px 0"; });
            row.style.borderLeft = "3px solid #2E7D32";
          }
          else {
            // Check if ticket date matches board
            var dateCell = cell.closest("tr")?.querySelector("td:nth-child(2)");
            var dText = dateCell ? dateCell.textContent.trim() : "";
            var dMatch = dText.match(/(\d{4})-(\d{2})/);
            var matches = !boardDate || !dMatch || (parseInt(dMatch[2]) - 1 === boardDate.month && parseInt(dMatch[1]) === boardDate.year);
            if (matches) cell.appendChild(createButton(id));
          }
        }

        // Ir al ticket button
        var link = document.createElement("a");
        link.href = "/es/dashboard/tickets/" + id;
        link.target = "_blank";
        link.textContent = "Ir al ticket";
        link.style.cssText = "display:inline-block;padding:4px 12px;background:#2196F3;color:#fff;font-size:11px;font-weight:600;text-decoration:none;border-radius:4px;white-space:nowrap;";
        cell.appendChild(link);
      });
    }

    async function showTakeModal(ticketId, originalBtn) {
      var existing = document.getElementById("sp-take-modal");
      if (existing) existing.remove();

      // Fetch info and Monday groups
      var info = await fetchTicketInfo(ticketId);
      var summaryHTML = ticketSummaryHTML(info);
      var mondayToken = await getMondayToken();
      var boardId = await getMondayBoardId();
      var groups = [];
      if (mondayToken && boardId) {
        try {
          var gData = await mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }', { boardId });
          groups = gData.boards[0]?.groups || [];
        } catch (e) { }
      }
      var groupOpts = '<option value="">-- No migrar --</option>' + groups.map(function (g) { return '<option value="' + g.id + '">' + g.title + '</option>'; }).join("");

      var overlay = document.createElement("div");
      overlay.id = "sp-take-modal";
      var m = createModal({
        id: "sp-take-modal",
        title: "🤚 Tomar ticket #" + ticketId,
        content: summaryHTML +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario al tomar</label>' +
          '<textarea id="sp-take-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="se revisa"></textarea>' +
          '<div style="margin-bottom:12px;"><label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="sp-take-done"> <b>Ticket realizado</b></label></div>' +
          '<div id="sp-take-close-comment-section" style="display:none;margin-bottom:12px;">' +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario antes de cerrar (opcional)</label>' +
          '<textarea id="sp-take-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;" placeholder="Comentario de cierre..."></textarea>' +
          '</div>' +
          '<div id="sp-take-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-take-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">✊ Tomar ticket</button>' +
          '<button id="sp-take-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          '</div>',
        options: { maxWidth: "420px" }
      });
      overlay = m.overlay;
      injectSLCopyButtons(overlay);

      // Inject spinner keyframes if not present
      if (!document.getElementById("sp-spinner-style")) {
        var style = document.createElement("style");
        style.id = "sp-spinner-style";
        style.textContent = "@keyframes sp-spin { to { transform: rotate(360deg); } }";
        document.head.appendChild(style);
      }

      var confirmBtn = document.getElementById("sp-take-confirm");
      var cancelBtn = document.getElementById("sp-take-cancel");
      var msg = document.getElementById("sp-take-msg");
      var doneCheck = document.getElementById("sp-take-done");
      var migrateSection = document.getElementById("sp-take-migrate-section");
      var closeCommentSection = document.getElementById("sp-take-close-comment-section");
      var takeGroupSelect = document.getElementById("sp-take-group");

      doneCheck.addEventListener("change", function () {
        migrateSection.style.display = doneCheck.checked ? "block" : "none";
        closeCommentSection.style.display = doneCheck.checked ? "block" : "none";
        if (doneCheck.checked && takeGroupSelect.value) {
          confirmBtn.textContent = "Tomar, cerrar y migrar";
        } else if (doneCheck.checked) {
          confirmBtn.textContent = "Tomar y cerrar";
        } else {
          confirmBtn.textContent = "✊ Tomar ticket";
        }
      });
      takeGroupSelect.addEventListener("change", function () {
        if (doneCheck.checked && takeGroupSelect.value) {
          confirmBtn.textContent = "Tomar, cerrar y migrar";
        } else if (doneCheck.checked) {
          confirmBtn.textContent = "Tomar y cerrar";
        }
      });

      cancelBtn.addEventListener("click", function () { m.close(); });

      confirmBtn.addEventListener("click", async function () {
        var comment = document.getElementById("sp-take-comment").value.trim() || "se revisa";
        var closeComment = doneCheck.checked ? (document.getElementById("sp-take-close-comment").value.trim()) : "";
        overlay.remove();
        originalBtn.disabled = true;
        originalBtn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
        showLoadingToast("Tomando ticket...");

        var profileId = await getMyProfileId();
        if (!profileId) {
          showErrorToast("No se pudo obtener tu perfil");
          originalBtn.textContent = "🤚 Tomar";
          originalBtn.disabled = false;
          return;
        }

        var spToken = getToken();
        try {
          var body = {
            resolutionGroupId: getTeamConfig().resolutionGroupId,
            serviceId: null,
            responsibleProfileId: profileId,
            resolutionGroup: { label: getTeamConfig().resolutionGroupLabel, value: getTeamConfig().resolutionGroupId }
          };
          body.ticketCommentRequest = { internal: false, content: comment };
          var res = await fetch(SP_API + "/reassign/" + ticketId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          if (json.success) {
            // If "Ticket realizado" is checked, also close and optionally migrate
            if (doneCheck.checked) {
              // Add close comment if provided
              if (closeComment) {
                await fetch(SP_API + "/comment/" + ticketId, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ content: "<p>" + closeComment + "</p>", internal: false }),
                });
              }
              // Close ticket
              var closeRes = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO, ticketCommentRequest: null }),
              });
              if (!closeRes.ok) throw new Error("Error al cerrar: HTTP " + closeRes.status);

              // Migrate if group selected and ticket matches board period
              var selectedGroup = takeGroupSelect.value;
              var canMigrateTake = selectedGroup ? await canMigrateTicket(info.createdAt) : false;
              if (selectedGroup && !canMigrateTake) {
                showErrorToast("Ticket tomado y cerrado, pero NO migrado: no corresponde al mes del board.");
              }
              if (selectedGroup && canMigrateTake && mondayToken && boardId) {
                // Check if already exists in Monday before creating
                var existingItemId = await checkTicketExistsInMonday(mondayToken, ticket?.uniqueCode || "");
                if (!existingItemId) {
                  var ticketRes = await fetch(SP_API + "/" + ticketId, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
                  var ticketJson = await ticketRes.json();
                  var ticket = ticketJson.data || ticketJson;
                  var holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
                  var users = await getMondayUsers(mondayToken);
                  var personValue = {};
                  if (holderEmail) { var userId = users[holderEmail.toLowerCase()]; if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] }; }
                  var url = BASE_URL + "/" + ticketId;
                  var desc = (ticket.description || "").replace(/<[^>]*>/g, "");
                  var itemName = ticket.subject || "Sin asunto";
                  var createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
                  var spPriority = (ticket.incidentPriorityName || ticket.incidentPriority?.name || "").toLowerCase().trim();
                  var priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];
                  var columnValues = JSON.stringify({
                    descripci_n_mkn9e5f4: { text: desc }, ...(personValue.personsAndTeams ? { multiple_person_mm25nvfq: personValue } : {}),
                    status: { index: 1 }, priority_mkn9kbe9: { index: priorityIndex },
                    cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
                    link_mknkdctz: { url: url, text: ticket.uniqueCode || url }, text_mm2c9nhc: ticket.uniqueCode || ticketId,
                  });
                  var result = await mondayQuery(mondayToken, 'mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }', { boardId: boardId, groupId: selectedGroup, itemName: itemName, columnValues: columnValues });
                  addToCache(ticket.uniqueCode || ticketId, result.create_item.id);
                } else {
                  addToCache(ticket?.uniqueCode || ticketId, existingItemId);
                }
              }

              // Update UI
              var row = originalBtn.closest(".MuiDataGrid-row");
              if (row) {
                var synced = getCache() || {};
                var uc = info?.uniqueCode || ticketId;
                if (selectedGroup && synced[uc]) { originalBtn.replaceWith(createSyncedBadge(synced[uc])); }
                else { originalBtn.replaceWith(createButton(ticketId)); }
                var oldSteal = row.querySelector("." + STEAL_BTN_CLASS); if (oldSteal) oldSteal.remove();
                var oldTake = row.querySelector("." + TAKE_BTN_CLASS); if (oldTake) oldTake.remove();
                var oldClose = row.querySelector("." + CLOSE_BTN_CLASS); if (oldClose) oldClose.remove();
                var statusCell = row.querySelector('[data-field="ticketStatusName"]'); if (statusCell) statusCell.textContent = "Cerrado";
              }
              showSuccessToast(selectedGroup && canMigrateTake ? "Ticket tomado, cerrado y migrado" : "Ticket tomado y cerrado");
            } else {
              // Just take
              var newCloseBtn = createCloseButton(ticketId);
              originalBtn.replaceWith(newCloseBtn);
              var row = newCloseBtn.closest(".MuiDataGrid-row");
              if (row) {
                var oldSteal = row.querySelector("." + STEAL_BTN_CLASS); if (oldSteal) oldSteal.remove();
                var oldTake = row.querySelector("." + TAKE_BTN_CLASS); if (oldTake) oldTake.remove();
                row.classList.add(HIGHLIGHT_CLASS);
                row.style.position = "relative";
                var indicator = document.createElement("span");
                indicator.textContent = "❗";
                indicator.style.cssText = "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
                row.appendChild(indicator);
                var statusCell = row.querySelector('[data-field="ticketStatusName"]'); if (statusCell) statusCell.textContent = "Asignado";
              }
              showSuccessToast("Ticket tomado");
            }
            if (isDetailView()) {
              if (doneCheck.checked) {
                // Show close tab / stay modal
                var successM = createModal({
                  id: "sp-take-success",
                  title: "✅ Ticket tomado, cerrado y migrado",
                  content: '<p style="font-size:13px;color:#555;margin:0 0 16px;">El ticket fue procesado correctamente.</p>' +
                    '<div style="display:flex;gap:8px;">' +
                    '<button id="sp-take-close-tab" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Cerrar pestaña</button>' +
                    '<button id="sp-take-stay-tab" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Quedarme</button>' +
                    '</div>',
                  options: { maxWidth: "360px", textAlign: "center", closeOnBackdrop: false }
                });
                document.getElementById("sp-take-close-tab").addEventListener("click", function () { window.close(); });
                document.getElementById("sp-take-stay-tab").addEventListener("click", function () { successM.close(); window.location.reload(); });
              } else {
                setTimeout(function () { window.location.reload(); }, 1500);
              }
            } else if (!doneCheck.checked) {
              window.open("/es/dashboard/tickets/" + ticketId, "_blank");
            }
          } else {
            throw new Error("No success");
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
          originalBtn.textContent = "🤚 Tomar";
          originalBtn.disabled = false;
        }
      });
    }

    function createStealButton(ticketId, responsibleName) {
      const btn = document.createElement("button");
      btn.className = STEAL_BTN_CLASS;
      btn.textContent = "🥷 Robar";
      btn.title = responsibleName ? "Asignado a: " + responsibleName : "Robar ticket";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #E65100;border-radius:4px;background:#E65100;color:#fff;margin-left:6px;white-space:nowrap;";
      btn.addEventListener("mouseenter", function () { if (!btn.disabled) btn.textContent = "💀 Robar"; });
      btn.addEventListener("mouseleave", function () { if (!btn.disabled) btn.textContent = "🥷 Robar"; });
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        e.preventDefault();
        btn.disabled = true;
        var origText = btn.textContent;
        btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
        await showTakeModal(ticketId, btn);
        btn.textContent = origText;
        btn.disabled = false;
      });
      return btn;
    }

    // --- Close ticket ---
    function createCloseButton(ticketId) {
      const btn = document.createElement("button");
      btn.className = CLOSE_BTN_CLASS;
      btn.textContent = "🔒 Cerrar";
      btn.title = "Cerrar ticket";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #616161;border-radius:4px;background:#616161;color:#fff;margin-left:6px;white-space:nowrap;";
      btn.addEventListener("mouseenter", function () { if (!btn.disabled) btn.textContent = "🔐 Cerrar"; });
      btn.addEventListener("mouseleave", function () { if (!btn.disabled) btn.textContent = "🔒 Cerrar"; });
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        e.preventDefault();
        btn.disabled = true;
        var origText = btn.textContent;
        btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
        await showCloseModal(ticketId, btn);
        btn.textContent = origText;
        btn.disabled = false;
      });
      return btn;
    }

    async function showCloseModal(ticketId, originalBtn) {
      var existing = document.getElementById("sp-close-modal-single");
      if (existing) existing.remove();

      // Fetch ticket info and Monday groups in parallel
      var mondayToken = await getMondayToken();
      var boardId = await getMondayBoardId();
      var [info, groupsData] = await Promise.all([
        fetchTicketInfo(ticketId),
        (mondayToken && boardId) ? mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { name groups { id title } } }', { boardId }).catch(function () { return null; }) : Promise.resolve(null)
      ]);
      var summaryHTML = ticketSummaryHTML(info);
      var groups = groupsData?.boards?.[0]?.groups || [];
      var groupOpts = '<option value="">-- Selecciona destino --</option>' + groups.map(function (g) { return '<option value="' + g.id + '">' + g.title + '</option>'; }).join("");

      var m = createModal({
        id: "sp-close-modal-single",
        title: "🔒 Cerrar ticket #" + ticketId,
        content: summaryHTML +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario (opcional)</label>' +
          '<textarea id="sp-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe un comentario..."></textarea>' +
          '<div id="sp-close-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar ticket</button>' +
          '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          '</div>',
        options: { maxWidth: "420px" }
      });
      var overlay = m.overlay;
      injectSLCopyButtons(overlay);

      if (!document.getElementById("sp-spinner-style")) {
        var style = document.createElement("style");
        style.id = "sp-spinner-style";
        style.textContent = "@keyframes sp-spin { to { transform: rotate(360deg); } }";
        document.head.appendChild(style);
      }

      var confirmBtn = document.getElementById("sp-close-confirm");
      var cancelBtn = document.getElementById("sp-close-cancel");
      var msg = document.getElementById("sp-close-msg");
      var groupSelect = document.getElementById("sp-close-group");

      // Update button text when group selection changes
      groupSelect.addEventListener("change", function () {
        if (groupSelect.value) {
          confirmBtn.innerHTML = "🔐 Cerrar y migrar";
        } else {
          confirmBtn.innerHTML = "🔐 Cerrar ticket";
        }
      });

      cancelBtn.addEventListener("click", function () { m.close(); });

      confirmBtn.addEventListener("click", async function () {
        var selectedGroup = groupSelect.value;
        if (!selectedGroup) {
          msg.textContent = "Selecciona un destino en Monday para migrar.";
          return;
        }
        var commentText = document.getElementById("sp-close-comment").value.trim();
        overlay.remove();
        originalBtn.disabled = true;
        originalBtn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
        showLoadingToast(selectedGroup ? "Cerrando y migrando..." : "Cerrando ticket...");

        var spToken = getToken();
        try {
          // Step 1: Add comment if provided
          if (commentText) {
            var commentRes = await fetch(SP_API + "/comment/" + ticketId, {
              method: "POST",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({ content: "<p>" + commentText + "</p>", internal: false }),
            });
            if (!commentRes.ok) throw new Error("Error al agregar comentario: HTTP " + commentRes.status);
          }

          // Step 1.5: If no one is assigned, assign to logged user first
          if (!info.holder || info.holder === "Sin asignar") {
            var myProfId = await getMyProfileId();
            if (myProfId) {
              var assignRes = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({
                  resolutionGroupId: getTeamConfig().resolutionGroupId,
                  serviceId: null,
                  responsibleProfileId: myProfId,
                  resolutionGroup: { label: getTeamConfig().resolutionGroupLabel, value: getTeamConfig().resolutionGroupId }
                }),
              });
              if (!assignRes.ok) throw new Error("Error al asignar: HTTP " + assignRes.status);
            }
          }

          // Step 2: Close ticket
          var res = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify({ nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO, ticketCommentRequest: null }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);

          // Check if ticket matches board period before migrating
          var canMigrate = selectedGroup ? await canMigrateTicket(info.createdAt) : false;
          if (selectedGroup && !canMigrate) {
            showErrorToast("Ticket cerrado, pero NO migrado: no corresponde al mes del board configurado.");
          }

          if (selectedGroup && canMigrate && mondayToken && boardId && info) {
            var ticketRes = await fetch(SP_API + "/" + ticketId, {
              headers: { accept: "application/json", authorization: "Bearer " + spToken },
            });
            var ticketJson = await ticketRes.json();
            var ticket = ticketJson.data || ticketJson;

            // Check if already exists in Monday
            var existingItemId = await checkTicketExistsInMonday(mondayToken, ticket.uniqueCode || "");
            if (!existingItemId) {
              var holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
              var users = await getMondayUsers(mondayToken);
              var personValue = {};
              if (holderEmail) {
                var userId = users[holderEmail.toLowerCase()];
                if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
              }

              var url = BASE_URL + "/" + ticketId;
              var desc = (ticket.description || "").replace(/<[^>]*>/g, "");
              var itemName = ticket.subject || "Sin asunto";
              var createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
              var spPriority = (ticket.incidentPriorityName || ticket.incidentPriority?.name || "").toLowerCase().trim();
              var priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];

              var columnValues = JSON.stringify({
                descripci_n_mkn9e5f4: { text: desc },
                ...(personValue.personsAndTeams ? { multiple_person_mm25nvfq: personValue } : {}),
                status: { index: 1 },
                priority_mkn9kbe9: { index: priorityIndex },
                cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
                link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
                text_mm2c9nhc: ticket.uniqueCode || ticketId,
              });

              var result = await mondayQuery(mondayToken,
                'mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }',
                { boardId: boardId, groupId: selectedGroup, itemName: itemName, columnValues: columnValues }
              );
              var newItemId = result.create_item.id;
              addToCache(ticket.uniqueCode || ticketId, newItemId);
            } else {
              addToCache(ticket.uniqueCode || ticketId, existingItemId);
            }
          }

          var row = originalBtn.closest(".MuiDataGrid-row");
          if (selectedGroup) {
            var synced = getCache() || {};
            var uc = info?.uniqueCode || ticketId;
            if (synced[uc]) {
              originalBtn.replaceWith(createSyncedBadge(synced[uc]));
            } else {
              originalBtn.replaceWith(createButton(ticketId));
            }
          } else {
            originalBtn.replaceWith(createButton(ticketId));
          }
          if (row) {
            var oldSteal = row.querySelector("." + STEAL_BTN_CLASS);
            if (oldSteal) oldSteal.remove();
            var oldClose = row.querySelector("." + CLOSE_BTN_CLASS);
            if (oldClose) oldClose.remove();
            var statusCell = row.querySelector('[data-field="ticketStatusName"]');
            if (statusCell) statusCell.textContent = "Cerrado";
          }
          showSuccessToast(selectedGroup ? "Ticket cerrado y migrado" : "Ticket cerrado");
          if (isDetailView()) {
            var successM = createModal({
              id: "sp-close-success",
              title: "✅ Ticket cerrado",
              content: '<p style="font-size:13px;color:#555;margin:0 0 16px;">' + (selectedGroup ? 'El ticket fue cerrado y migrado a Monday.' : 'El ticket fue cerrado correctamente.') + '</p>' +
                '<div style="display:flex;gap:8px;">' +
                '<button id="sp-close-tab" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Cerrar pestaña</button>' +
                '<button id="sp-stay-tab" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Quedarme</button>' +
                '</div>',
              options: { maxWidth: "360px", textAlign: "center", closeOnBackdrop: false }
            });
            document.getElementById("sp-close-tab").addEventListener("click", function () { window.close(); });
            document.getElementById("sp-stay-tab").addEventListener("click", function () { successM.close(); window.location.reload(); });
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
          originalBtn.textContent = "🔒 Cerrar";
          originalBtn.disabled = false;
        }
      });
    }

    function showReopenModal(ticketId, currentHolder) {
      var existing = document.getElementById("sp-reopen-modal");
      if (existing) existing.remove();

      var profiles = getTeamConfig().profiles;
      var opts = profiles.map(function (p) {
        return '<option value="' + p.profileId + '">' + p.profileFullName + '</option>';
      }).join("");

      var m = createModal({
        id: "sp-reopen-modal",
        title: "🔓 Reabrir ticket #" + ticketId,
        content: '<p style="font-size:13px;color:#555;margin:0 0 12px;">Al reasignar un ticket cerrado a otra persona, se reabrirá automáticamente.</p>' +
          (currentHolder && currentHolder !== "Sin asignar" ? '<p style="font-size:12px;color:#888;margin:0 0 12px;">Asignado actualmente a: <b>' + currentHolder + '</b></p>' : '') +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Reasignar a:</label>' +
          '<select id="sp-reopen-person" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">' +
          '<option value="">-- Selecciona --</option>' + opts +
          '</select>' +
          '<div id="sp-reopen-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;color:#D94040;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-reopen-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:14px;">🔄 Reabrir</button>' +
          '<button id="sp-reopen-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          '</div>',
        options: { maxWidth: "400px" }
      });
      var overlay = m.overlay;

      document.getElementById("sp-reopen-cancel").addEventListener("click", m.close);

      document.getElementById("sp-reopen-confirm").addEventListener("click", async function () {
        var personId = document.getElementById("sp-reopen-person").value;
        var msg = document.getElementById("sp-reopen-msg");
        if (!personId) { msg.textContent = "Selecciona a quién reasignar."; return; }

        overlay.remove();
        showLoadingToast("Reabriendo ticket...");

        var spToken = getToken();
        try {
          var res = await fetch(SP_API + "/reassign/" + ticketId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify({
              resolutionGroupId: getTeamConfig().resolutionGroupId,
              serviceId: null,
              responsibleProfileId: parseInt(personId),
              resolutionGroup: { label: getTeamConfig().resolutionGroupLabel, value: getTeamConfig().resolutionGroupId }
            }),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          if (json.success) {
            showSuccessToast("Ticket reabierto y reasignado");
            setTimeout(function () { window.location.reload(); }, 1500);
          } else { throw new Error("No se pudo reabrir"); }
        } catch (err) {
          showErrorToast("Error: " + err.message);
        }
      });
    }

    function getAssignedRows() {
      const rows = [];
      document.querySelectorAll(".MuiDataGrid-row").forEach(function (row) {
        var ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        var statusCell = row.querySelector('[data-field="ticketStatusName"]');
        if (!statusCell || statusCell.textContent.trim() !== "Asignado") return;
        var codeCell = row.querySelector('[data-field="uniqueCode"]');
        var code = codeCell ? codeCell.textContent.trim() : ticketId;
        var subjectCell = row.querySelector('[data-field="subject"]');
        var subject = subjectCell ? subjectCell.textContent.trim() : "";
        var responsibleCell = row.querySelector('[data-field="responsibleName"]');
        var responsible = responsibleCell ? responsibleCell.textContent.trim() : "";
        rows.push({ ticketId: ticketId, code: code, subject: subject, responsible: responsible, row: row });
      });
      return rows;
    }

    async function handleBulkClose() {
      var bulkCloseBtn = document.getElementById(BULK_CLOSE_BTN_ID);
      if (bulkCloseBtn) {
        bulkCloseBtn.disabled = true;
        bulkCloseBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Cargando...';
      }
      function restoreCloseBtn() {
        if (bulkCloseBtn) { bulkCloseBtn.disabled = false; bulkCloseBtn.textContent = "🔒 Cerrar varios"; }
      }

      var spToken = getToken();
      if (!spToken) { restoreCloseBtn(); return alert("No se encontro token de SupportPlus."); }

      var assigned = getAssignedRows();
      if (!assigned.length) { restoreCloseBtn(); return alert("No hay tickets asignados en esta pagina."); }

      // Build ticket rows with checkboxes
      var ticketRows = assigned.map(function (p, i) {
        var label = p.code + (p.subject ? " - " + p.subject.substring(0, 35) + (p.subject.length > 35 ? "..." : "") : "");
        var resp = p.responsible ? ' <span style="color:#888;font-size:10px;">(' + p.responsible + ')</span>' : "";
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
          '<input type="checkbox" data-idx="' + i + '" class="sp-close-check" style="cursor:pointer;">' +
          '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + label + resp + '</span>' +
          '</div>';
      }).join("");

      restoreCloseBtn();

      var m = createModal({
        id: "sp-close-modal",
        title: "🔒 Cerrar tickets (" + assigned.length + " asignados)",
        content: '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<label style="font-size:12px;color:#555;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="sp-close-all"> Seleccionar todos</label>' +
          '</div>' +
          '<div style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px;">' + ticketRows + '</div>' +
          '<div id="sp-close-msg" style="font-size:13px;margin-bottom:8px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-close-start" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar seleccionados</button>' +
          '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          '</div>',
        options: { maxWidth: "560px", maxHeight: "85vh" }
      });
      var overlay = m.overlay;

      // Select all toggle
      document.getElementById("sp-close-all").addEventListener("change", function () {
        var checked = this.checked;
        overlay.querySelectorAll(".sp-close-check").forEach(function (cb) { cb.checked = checked; });
      });

      var startBtn = document.getElementById("sp-close-start");
      var cancelBtn = document.getElementById("sp-close-cancel");
      var msg = document.getElementById("sp-close-msg");

      cancelBtn.addEventListener("click", function () { m.close(); });

      startBtn.addEventListener("click", async function () {
        var selected = [];
        overlay.querySelectorAll(".sp-close-check").forEach(function (cb) {
          if (cb.checked) selected.push(parseInt(cb.dataset.idx));
        });
        if (!selected.length) { msg.textContent = "Selecciona al menos un ticket."; return; }

        startBtn.disabled = true;
        startBtn.style.background = "#999";
        startBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Cerrando...';
        cancelBtn.style.display = "none";

        var ok = 0, fail = 0;
        for (var i = 0; i < selected.length; i++) {
          var idx = selected[i];
          var t = assigned[idx];
          msg.textContent = "Cerrando " + (i + 1) + " / " + selected.length + "...";
          try {
            var res = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + t.ticketId, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({
                nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO,
                ticketCommentRequest: null
              }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            ok++;
            // Update row UI: replace close button with migrate button
            var closeBtn = t.row.querySelector("." + CLOSE_BTN_CLASS);
            if (closeBtn) closeBtn.replaceWith(createButton(t.ticketId));
            var stealBtn = t.row.querySelector("." + STEAL_BTN_CLASS);
            if (stealBtn) stealBtn.remove();
          } catch (err) {
            fail++;
          }
        }

        msg.textContent = "Completado: " + ok + " cerrados, " + fail + " errores";
        startBtn.innerHTML = "✅ Listo";
        startBtn.style.background = "#2E7D32";
        cancelBtn.style.display = "";
        cancelBtn.textContent = "Cerrar";
        cancelBtn.addEventListener("click", function () { overlay.remove(); });
      });
    }

    function injectBulkCloseButton() {
      if (document.getElementById(BULK_CLOSE_BTN_ID)) return;
      var bulkMigrateBtn = document.getElementById(BULK_BTN_ID);
      if (!bulkMigrateBtn) return;
      var parent = bulkMigrateBtn.parentElement;
      if (!parent) return;

      var btn = document.createElement("button");
      btn.id = BULK_CLOSE_BTN_ID;
      btn.textContent = "🔒 Cerrar varios";
      btn.style.cssText =
        "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#616161;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
      btn.addEventListener("mouseenter", function () { if (!btn.disabled) btn.textContent = "🔐 Cerrar varios"; });
      btn.addEventListener("mouseleave", function () { if (!btn.disabled) btn.textContent = "🔒 Cerrar varios"; });
      btn.addEventListener("click", handleBulkClose);
      parent.insertBefore(btn, bulkMigrateBtn.nextSibling);
    }

    const NEW_TICKET_BTN_ID = "sp-new-ticket";

    function injectNewTicketButton() {
      if (document.getElementById(NEW_TICKET_BTN_ID)) return;
      var bulkMigrateBtn = document.getElementById(BULK_BTN_ID);
      if (!bulkMigrateBtn) return;
      var parent = bulkMigrateBtn.parentElement;
      if (!parent) return;

      var btn = document.createElement("button");
      btn.id = NEW_TICKET_BTN_ID;
      btn.textContent = "➕ Nuevo ticket";
      btn.style.cssText =
        "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
      btn.addEventListener("click", function () {
        window.location.href = "/es/dashboard/tickets/nuevo";
      });
      parent.insertBefore(btn, bulkMigrateBtn);
    }

    // --- Custom search ---
    const SEARCH_BTN_ID = "sp-search-btn";
    const SP_SEARCH_API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
    var activeModalRefresh = null;

    // --- Config button ---
    const CONFIG_BTN_ID = "sp-config-btn";

    function injectConfigButton() {
      if (document.getElementById(CONFIG_BTN_ID)) return;
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper) return;

      var btn = document.createElement("button");
      btn.id = CONFIG_BTN_ID;
      btn.textContent = "⚙️";
      btn.title = "Configuración SupportPlus Tools";
      btn.style.cssText = "padding:4px 10px;font-size:14px;cursor:pointer;border:none;border-radius:6px;background:rgba(255,255,255,0.15);color:#fff;margin-right:8px;";
      btn.addEventListener("click", showConfigModal);
      userWrapper.parentElement.insertBefore(btn, userWrapper);
    }

    // Allow opening config from outside initExtension
    _showConfigModal = showConfigModal;

    function showConfigModal() {
      var existing = document.getElementById("sp-config-modal");
      if (existing) existing.remove();

      // Load current values
      chrome.storage.local.get(["mondayToken", "mondayBoardId", "mondayBoardName", "teamArea", "ignoredEmails", "myProfileId"], function (stored) {
        var currentToken = stored.mondayToken || "";
        var currentBoardId = stored.mondayBoardId || "";
        var currentBoardName = stored.mondayBoardName || "";
        var currentArea = stored.teamArea || "dba";

        var cfgM = createModal({
          id: "sp-config-modal",
          title: "⚙️ Configuración",
          content: '<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #eee;">' +
            '<button id="sp-cfg-tab-area" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid #D94040;color:#D94040;">Área de trabajo</button>' +
            '<button id="sp-cfg-tab-monday" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;color:#888;">Monday.com</button>' +
            '</div>' +
            '<div id="sp-cfg-panel-area">' +
            '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Área de trabajo</label>' +
            '<select id="sp-cfg-area" style="width:100%;padding:8px;font-size:13px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">' +
            '<option value="">-- Selecciona tu grupo --</option>' +
            (currentUserGroups.length > 0 ? currentUserGroups : GROUP_INFO.map(function (g) { return g.id; })).map(function (gId) { var g = GROUP_INFO.find(function (gi) { return gi.id === gId; }) || { id: gId, name: "Grupo " + gId }; return '<option value="' + g.id + '"' + (String(currentArea) === String(g.id) ? ' selected' : '') + '>' + g.name + '</option>'; }).join("") +
            '</select>' +
            '<div id="sp-cfg-members" style="margin-bottom:8px;max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:6px;display:' + (currentArea ? 'block' : 'none') + ';"><div style="color:#888;font-size:11px;">Cargando miembros...</div></div>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:12px;cursor:pointer;"><input type="checkbox" id="sp-cfg-only-with-tickets"> Solo mostrar personas con tickets</label>' +
            '</div>' +
            '<div id="sp-cfg-panel-monday" style="display:none;">' +
            '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Token de Monday</label>' +
            '<input id="sp-cfg-monday-token" type="password" value="' + (currentToken ? '••••••••' : '') + '" placeholder="Pega tu token de Monday aquí..." style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:4px;">' +
            '<div style="font-size:10px;color:#999;margin-bottom:12px;">Tu token personal de Monday. Se guarda encriptado.</div>' +
            (canMigrateMonday ? '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Board</label>' +
              '<div style="position:relative;margin-bottom:4px;">' +
              '<input id="sp-cfg-board-search" type="text" value="' + currentBoardName.replace(/"/g, '&quot;') + '" placeholder="Buscar board..." style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;">' +
              '<div id="sp-cfg-board-results" style="position:absolute;top:100%;left:0;right:0;max-height:180px;overflow-y:auto;background:#fff;border:1px solid #ddd;border-radius:4px;display:none;z-index:10;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>' +
              '</div>' +
              '<div id="sp-cfg-board-status" style="font-size:11px;color:#888;margin-bottom:12px;min-height:16px;">' + (currentBoardName ? "✅ " + currentBoardName : "Carga los boards primero") + '</div>' +
              '<button id="sp-cfg-load-boards" style="width:100%;padding:8px;font-size:12px;cursor:pointer;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;margin-bottom:12px;">🔄 Cargar boards</button>' +
              '<input type="hidden" id="sp-cfg-board-id" value="' + currentBoardId + '">' : '') +
            '</div>' +
            '<div style="display:flex;gap:8px;margin-top:12px;">' +
            '<button id="sp-cfg-save" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">💾 Guardar</button>' +
            '<button id="sp-cfg-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
            '</div>',
          options: { maxWidth: "450px" }
        });
        var overlay = cfgM.overlay;

        // Events
        document.getElementById("sp-cfg-cancel").addEventListener("click", function () { cfgM.close(); });

        // Tab switching
        var tabArea = document.getElementById("sp-cfg-tab-area");
        var tabMonday = document.getElementById("sp-cfg-tab-monday");
        var panelArea = document.getElementById("sp-cfg-panel-area");
        var panelMonday = document.getElementById("sp-cfg-panel-monday");
        tabArea.addEventListener("click", function () {
          panelArea.style.display = "block"; panelMonday.style.display = "none";
          tabArea.style.borderBottom = "2px solid #D94040"; tabArea.style.color = "#D94040";
          tabMonday.style.borderBottom = "none"; tabMonday.style.color = "#888";
        });
        tabMonday.addEventListener("click", function () {
          panelArea.style.display = "none"; panelMonday.style.display = "block";
          tabMonday.style.borderBottom = "2px solid #D94040"; tabMonday.style.color = "#D94040";
          tabArea.style.borderBottom = "none"; tabArea.style.color = "#888";
        });

        // Members checkboxes
        var membersDiv = document.getElementById("sp-cfg-members");
        var onlyWithTicketsEl = document.getElementById("sp-cfg-only-with-tickets");

        // Load user config
        // Load user config from memory
        if (_userConfig.onlyWithTickets) onlyWithTicketsEl.checked = true;

        function loadMembersForConfig(groupId) {
          if (!groupId) { membersDiv.style.display = "none"; return; }
          membersDiv.style.display = "block";
          membersDiv.innerHTML = '<div style="color:#888;font-size:11px;">Cargando...</div>';
          var spToken = localStorage.getItem("token");
          fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function (r) { return r.json(); }).then(function (json) {
            var profiles = json.data || json;
            if (!Array.isArray(profiles) || !profiles.length) { membersDiv.innerHTML = '<div style="color:#888;font-size:11px;">Sin miembros</div>'; return; }
            // Read blacklist from _userConfig (memory)
            var blacklistNotionIds = _userConfig.blacklist || [];
            if (blacklistNotionIds.length > 0) {
              Promise.all(blacklistNotionIds.map(function (pageId) {
                return new Promise(function (resolve) {
                  chrome.runtime.sendMessage({ type: "notion-page", pageId: pageId }, function (resp) {
                    if (resp && resp.success) resolve(resp.data.properties?.["Id Support Plus"]?.number || null);
                    else resolve(null);
                  });
                });
              })).then(function (blacklistedProfileIds) {
                blacklistedProfileIds = blacklistedProfileIds.filter(Boolean);
                membersDiv.innerHTML = '<div style="font-size:10px;color:#888;margin-bottom:4px;">Desmarca los que no quieras ver:</div>';
                profiles.forEach(function (p) {
                  var isVisible = !blacklistedProfileIds.includes(p.profileId);
                  var label = document.createElement("label");
                  label.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;cursor:pointer;";
                  label.innerHTML = '<input type="checkbox" data-pid="' + p.profileId + '"' + (isVisible ? ' checked' : '') + '> ' + esc(p.profileFullName);
                  membersDiv.appendChild(label);
                });
              });
            } else {
              membersDiv.innerHTML = '<div style="font-size:10px;color:#888;margin-bottom:4px;">Desmarca los que no quieras ver:</div>';
              profiles.forEach(function (p) {
                var label = document.createElement("label");
                label.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;cursor:pointer;";
                label.innerHTML = '<input type="checkbox" data-pid="' + p.profileId + '" checked> ' + esc(p.profileFullName);
                membersDiv.appendChild(label);
              });
            }
          }).catch(function () { membersDiv.innerHTML = '<div style="color:#D94040;font-size:11px;">Error</div>'; });
        }

        // Load on area change
        document.getElementById("sp-cfg-area").addEventListener("change", function () {
          loadMembersForConfig(this.value);
        });
        // Load initially if area set
        if (currentArea) loadMembersForConfig(currentArea);

        // Load boards (only if board elements exist)
        var allBoards = [];
        var loadBoardsBtn = document.getElementById("sp-cfg-load-boards");
        var boardSearchEl = document.getElementById("sp-cfg-board-search");
        if (loadBoardsBtn) {
          loadBoardsBtn.addEventListener("click", async function () {
            var token = await getMondayToken();
            if (!token) { document.getElementById("sp-cfg-board-status").textContent = "⚠️ Token de Monday no configurado"; return; }
            document.getElementById("sp-cfg-board-status").textContent = "Cargando...";
            try {
              var res = await fetch("https://api.monday.com/v2", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: token },
                body: JSON.stringify({ query: "{ boards(limit:500) { id name } }" }),
              });
              var json = await res.json();
              if (json.errors) throw new Error(json.errors[0].message);
              allBoards = json.data.boards.sort(function (a, b) { return a.name.localeCompare(b.name); });
              document.getElementById("sp-cfg-board-status").textContent = allBoards.length + " boards cargados. Escribe para buscar.";
            } catch (e) {
              document.getElementById("sp-cfg-board-status").textContent = "❌ " + e.message;
            }
          });
        }

        // Board search
        function filterCfgBoards() {
          if (!boardSearchEl) return;
          var query = boardSearchEl.value.toLowerCase().trim();
          var results = document.getElementById("sp-cfg-board-results");
          if (!results) return;
          if (!query || !allBoards.length) { results.style.display = "none"; return; }
          var filtered = allBoards.filter(function (b) { return b.name.toLowerCase().includes(query); }).slice(0, 15);
          if (!filtered.length) { results.innerHTML = '<div style="padding:6px 8px;color:#888;">Sin resultados</div>'; results.style.display = "block"; return; }
          results.innerHTML = filtered.map(function (b) {
            return '<div class="sp-cfg-board-opt" data-id="' + b.id + '" data-name="' + b.name.replace(/"/g, '&quot;') + '" style="padding:8px;cursor:pointer;border-bottom:1px solid #f0f0f0;">' + b.name + '</div>';
          }).join("");
          results.style.display = "block";
        }
        if (boardSearchEl) {
          boardSearchEl.addEventListener("input", filterCfgBoards);
          boardSearchEl.addEventListener("focus", filterCfgBoards);
        }
        var boardResultsEl = document.getElementById("sp-cfg-board-results");
        if (boardResultsEl) {
          boardResultsEl.addEventListener("click", function (e) {
            var opt = e.target.closest(".sp-cfg-board-opt");
            if (!opt) return;
            document.getElementById("sp-cfg-board-id").value = opt.dataset.id;
            document.getElementById("sp-cfg-board-search").value = opt.dataset.name;
            document.getElementById("sp-cfg-board-status").textContent = "✅ " + opt.dataset.name;
            boardResultsEl.style.display = "none";
          });
        }

        // Save
        document.getElementById("sp-cfg-save").addEventListener("click", async function () {
          var token = await getMondayToken();
          var mondayTokenInput = document.getElementById("sp-cfg-monday-token").value.trim();
          var boardIdEl = document.getElementById("sp-cfg-board-id");
          var boardSearchEl = document.getElementById("sp-cfg-board-search");
          var boardId = boardIdEl ? boardIdEl.value : "";
          var boardName = boardSearchEl ? boardSearchEl.value.trim() : "";
          var area = document.getElementById("sp-cfg-area").value;
          var onlyWithTickets = onlyWithTicketsEl.checked;

          // If user entered a new Monday token (not the placeholder), save it to Notion
          if (mondayTokenInput && mondayTokenInput !== "••••••••") {
            token = mondayTokenInput;
            var encoded = btoa(mondayTokenInput);
            // Update token_monday column in user's Notion page
            chrome.storage.local.get(["notionUsers", "userEmail"], function (nd) {
              var email = (nd.userEmail || "").toLowerCase();
              var users = nd.notionUsers || {};
              var user = users[email];
              if (user && user.notionPageId) {
                chrome.runtime.sendMessage({ type: "notion-update", pageId: user.notionPageId, body: { properties: { "token_monday": { rich_text: [{ text: { content: encoded } }] } } } });
              }
            });
            // Update local cache immediately
            _mondayTokenCache = mondayTokenInput;
          }

          var saveData = { mondayToken: token, mondayBoardId: boardId, mondayBoardName: boardName, teamArea: area };
          // Collect blacklisted profileIds (unchecked = blacklisted)
          // ONLY update blacklist if members were actually loaded (prevent accidental wipe)
          var memberChecks = membersDiv.querySelectorAll('input[data-pid]');
          var blacklistProfileIds = null; // null = don't update
          if (memberChecks.length > 0 && area) {
            blacklistProfileIds = [];
            memberChecks.forEach(function (cb) {
              if (!cb.checked) blacklistProfileIds.push(parseInt(cb.dataset.pid));
            });
          }
          // Save to Notion user config
          chrome.storage.local.get(["userConfig", "notionUsers", "userEmail"], function (nd) {
            var userCfg = nd.userConfig || {};
            var notionPageId = userCfg.pageId;
            var email = (nd.userEmail || "").toLowerCase();
            var users = nd.notionUsers || {};
            var user = users[email];
            var userNotionId = user?.notionPageId || "";
            // Build blacklist relations (convert profileIds to Notion page IDs)
            var blacklistRelations = [];
            if (blacklistProfileIds !== null) {
              blacklistRelations = blacklistProfileIds.map(function (pid) {
                var found = null;
                Object.values(users).forEach(function (u) { if (u.profileId === pid && u.notionPageId) found = u.notionPageId; });
                return found ? { id: found } : null;
              }).filter(Boolean);
            }
            var props = {
              "MostrarSoloConTickets": { checkbox: onlyWithTickets }
            };
            // Only update BlackList if members were loaded
            if (blacklistProfileIds !== null) {
              props["BlackList"] = { relation: blacklistRelations };
            }

            // Always search for existing config page to ensure we have the right ID
            chrome.runtime.sendMessage({ type: "notion-query", dbId: "37320e0684b9806b84ecc4aae906f645", body: { filter: { property: "Nombre", title: { equals: email } }, page_size: 1 } }, function (searchResp) {
              if (searchResp && searchResp.success && searchResp.data.results && searchResp.data.results.length) {
                var existingId = searchResp.data.results[0].id;
                chrome.runtime.sendMessage({ type: "notion-update", pageId: existingId, body: { properties: props } });
                notionPageId = existingId;
              } else if (notionPageId) {
                chrome.runtime.sendMessage({ type: "notion-update", pageId: notionPageId, body: { properties: props } });
              } else if (userNotionId) {
                chrome.runtime.sendMessage({
                  type: "notion-create", body: {
                    parent: { database_id: "37320e0684b9806b84ecc4aae906f645" },
                    properties: Object.assign({ "Nombre": { title: [{ text: { content: email } }] }, "Usuario": { relation: [{ id: userNotionId }] } }, props)
                  }
                });
              }
            });
            // Save blacklist locally as Notion page IDs for immediate use
            var blacklistNotionIds = blacklistProfileIds !== null ? blacklistRelations.map(function (r) { return r.id; }) : (_userConfig.blacklist || []);
            _userConfig = { pageId: notionPageId || userCfg.pageId, onlyWithTickets: onlyWithTickets, blacklist: blacklistNotionIds };
            saveData.userConfig = _userConfig;
            chrome.storage.local.set(saveData, function () {
              overlay.remove();
              showSuccessToast("Configuración guardada");
              currentTeamArea = area;
              profilesCache = {};
              var panel = document.getElementById(TEAM_PANEL_ID);
              if (panel) panel.remove();
              teamPanelLoading = false;
              loadTeamPanel();
            });
          });
        });
      });
    }

    function injectSearchButton() {
      if (document.getElementById(SEARCH_BTN_ID)) return;
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper) return;

      var btn = createHeaderButton({ id: SEARCH_BTN_ID, icon: "🔍", label: "Buscar", color: "#7B1FA2", onClick: showSearchModal });
      btn.style.marginRight = "12px";
      userWrapper.parentElement.insertBefore(btn, userWrapper);
    }

    const DASHBOARD_BTN_ID = "sp-dashboard-btn";

    const DASHBOARD_CACHE_KEY = "sp_dashboard_cache";

    function loadDashboardCache() {
      try {
        var raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) { return null; }
    }

    function saveDashboardCache(data, from, to, groupId) {
      localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ data: data, from: from, to: to, groupId: groupId || "", ts: Date.now() }));
    }

    function clearDashboardCache() {
      localStorage.removeItem(DASHBOARD_CACHE_KEY);
    }

    var cached = loadDashboardCache();
    // Invalidate cache if not from today
    if (cached) {
      var cacheDate = new Date(cached.ts).toDateString();
      var todayDate = new Date().toDateString();
      if (cacheDate !== todayDate) { clearDashboardCache(); cached = null; }
    }
    var dashboardData = (cached && cached.data && cached.data.length) ? cached.data : null;
    var dashboardFrom = cached ? cached.from : "";
    var dashboardTo = cached ? cached.to : "";

    // Auto-generate dashboard in background if no cache
    function autoGenerateDashboard() {
      var spToken = localStorage.getItem("token");
      if (!spToken) return;
      // Determine date range: yesterday, or full previous month if today is the 1st
      var today = new Date();
      var fromDate, toDate;
      if (today.getDate() === 1) {
        // First of month: load entire previous month
        var prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        var lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
        fromDate = prevMonth.getFullYear() + "-" + String(prevMonth.getMonth() + 1).padStart(2, "0") + "-01";
        toDate = prevMonth.getFullYear() + "-" + String(prevMonth.getMonth() + 1).padStart(2, "0") + "-" + String(lastDayPrev).padStart(2, "0");
      } else {
        // Yesterday
        var yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        fromDate = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
        toDate = fromDate;
      }
      dashboardFrom = fromDate;
      dashboardTo = toDate;

      var allTickets = [];
      var page = 0;
      var groupId = getTeamConfig().resolutionGroupId;

      (async function () {
        try {
          while (true) {
            var url = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=" + page + "&size=100&resolutionGroupId=" + groupId;
            url += "&initDate=" + fromDate + "&endDate=" + toDate;
            var res = await fetch(url, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
            if (!res.ok) break;
            var json = await res.json();
            var data = json.data || json;
            var tickets = data.content || [];
            tickets.forEach(function (t) { if (t.ticketStatusName === "Cerrado") allTickets.push(t); });
            if (page >= (data.totalPages || 1) - 1) break;
            page++;
          }
          dashboardData = allTickets;
          saveDashboardCache(allTickets, fromDate, toDate);
          var btn = document.getElementById(DASHBOARD_BTN_ID);
          if (btn) btn.textContent = "📊 Ver dashboard";
          console.log("[SP] Dashboard auto-generated:", allTickets.length, "tickets");
        } catch (e) { console.log("[SP] Dashboard auto-gen failed:", e.message); }
      })();
    }

    if (!dashboardData) {
      // Delay auto-generation to not block page load
      setTimeout(autoGenerateDashboard, 5000);
    }

    function injectUpdateButton() {
      if (document.getElementById("sp-update-btn")) return;
      var refBtn = document.getElementById(DASHBOARD_BTN_ID) || document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;
      // Only show if there's a newer version
      if (!_latestVersion || _latestVersion === _currentVersion || !_latestZipUrl) return;

      var btn = createHeaderButton({ id: "sp-update-btn", icon: "📥", label: "Actualizar v" + _latestVersion, color: "#5D4037", onClick: showUpdateModal });
      refBtn.parentElement.insertBefore(btn, refBtn);
    }

    function showUpdateModal() {
      chrome.storage.local.get("allVersions", function (r) {
        var allVersions = r.allVersions || [];
        if (!allVersions.length) { showErrorToast("No hay versiones disponibles"); return; }

        // Filter versions newer than current
        var curParts = _currentVersion.split(".").map(Number);
        function isNewer(v) {
          var p = v.split(".").map(Number);
          return p[0] > curParts[0] || (p[0] === curParts[0] && p[1] > curParts[1]) || (p[0] === curParts[0] && p[1] === curParts[1] && p[2] > curParts[2]);
        }
        var newerVersions = allVersions.filter(function (v) { return isNewer(v.version); });
        var changelogHTML = newerVersions.length ?
          newerVersions.map(function (v) { return '<div style="padding:6px 0;border-bottom:1px solid #eee;"><b style="color:#1976D2;">v' + v.version + '</b> <span style="font-size:0.85rem;color:#555;">— ' + (v.changes || "Sin descripción") + '</span></div>'; }).join("") :
          '<div style="color:#888;padding:8px;">Estás en la versión más reciente.</div>';

        // Version select options
        var selectOpts = allVersions.map(function (v) {
          return '<option value="' + v.version + '"' + (v.version === _latestVersion ? ' selected' : '') + '>' + v.version + (v.version === _latestVersion ? ' (última)' : '') + '</option>';
        }).join("");

        var m = createModal({
          id: "sp-update-modal",
          title: "📥 Actualización disponible",
          content: '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.85rem;color:#888;margin-bottom:8px;">Versión instalada: <b>' + _currentVersion + '</b> → Última: <b>' + _latestVersion + '</b></div>' +
            '<div style="font-size:0.9rem;font-weight:600;margin-bottom:6px;">📋 Cambios desde tu versión:</div>' +
            '<div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;">' + changelogHTML + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
            '<label style="font-size:0.85rem;white-space:nowrap;">Descargar versión:</label>' +
            '<select id="sp-update-version-select" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;">' + selectOpts + '</select>' +
            '</div>' +
            '<div id="sp-update-selected-changes" style="margin-bottom:12px;font-size:0.85rem;color:#555;min-height:20px;"></div>' +
            '<button id="sp-update-download" style="width:100%;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">📥 Descargar</button>' +
            '<a id="sp-update-direct-link" href="#" target="_blank" style="display:block;text-align:center;margin-top:8px;font-size:0.8rem;color:#666;text-decoration:underline;">Si no descarga, clic aquí para abrir enlace directo</a>',
          options: { maxWidth: "500px" }
        });

        var vSelect = document.getElementById("sp-update-version-select");
        var changesDiv = document.getElementById("sp-update-selected-changes");
        var downloadBtn = document.getElementById("sp-update-download");
        var directLink = document.getElementById("sp-update-direct-link");

        function updateSelectedChanges() {
          var selected = allVersions.find(function (v) { return v.version === vSelect.value; });
          changesDiv.textContent = selected ? (selected.changes || "Sin descripción") : "";
          if (directLink && selected && selected.zipUrl) directLink.href = selected.zipUrl;
        }
        vSelect.addEventListener("change", updateSelectedChanges);
        updateSelectedChanges();

        downloadBtn.addEventListener("click", function () {
          var selected = allVersions.find(function (v) { return v.version === vSelect.value; });
          if (!selected || !selected.zipUrl) { showErrorToast("No hay archivo para esta versión"); return; }
          downloadBtn.textContent = "⏳ Descargando...";
          downloadBtn.disabled = true;
          downloadZip(selected.zipUrl, selected.version);
          setTimeout(function () { downloadBtn.textContent = "📥 Descargar"; downloadBtn.disabled = false; }, 5000);
        });
      });
    }

    function injectDashboardButton() {
      if (!_btnDashboard) return;
      if (document.getElementById(DASHBOARD_BTN_ID)) return;
      var searchBtn = document.getElementById(SEARCH_BTN_ID);
      if (!searchBtn) return;

      if (!dashboardFrom || !dashboardTo) {
        var now = new Date();
        dashboardFrom = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01T00:00";
        dashboardTo = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + "T23:59";
      }

      var btn = createHeaderButton({ id: DASHBOARD_BTN_ID, icon: "📊", label: dashboardData ? "Ver dashboard" : "Dashboard", color: "#00796B", onClick: handleDashboardClick });
      searchBtn.parentElement.insertBefore(btn, searchBtn);

      var sep = document.createElement("span");
      sep.style.cssText = "color:rgba(255,255,255,0.4);font-size:16px;margin-right:8px;";
      sep.textContent = "|";
      searchBtn.parentElement.insertBefore(sep, searchBtn);
    }

    async function handleDashboardClick() {
      var btn = document.getElementById(DASHBOARD_BTN_ID);
      if (!btn) return;

      // If user has multiple groups
      if (currentUserGroups.length > 1) {
        // If there's cached data, show it with a group selector at top
        if (dashboardData && dashboardData.length) {
          showDashboardModal();
          return;
        }
        // No data - show group selection modal
        var groupOpts = currentUserGroups.map(function (gId) {
          var g = GROUP_INFO.find(function (gi) { return gi.id === gId; }) || { id: gId, name: "Grupo " + gId };
          return '<option value="' + g.id + '">' + g.name + '</option>';
        }).join("");
        var m = createModal({
          id: "sp-dashboard-group-modal",
          title: "📊 Generar Dashboard",
          content: '<p style="margin:0 0 12px;font-size:0.85rem;color:#555;">Selecciona el grupo del cual quieres generar el dashboard:</p>' +
            '<select id="sp-dash-group-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:0.9rem;margin-bottom:12px;">' + groupOpts + '</select>' +
            '<div style="background:#FFF3E0;border:1px solid #FF8F00;border-radius:6px;padding:10px;margin-bottom:12px;font-size:0.8rem;color:#E65100;">⚠️ La generación del dashboard puede tardar varios minutos. Puedes seguir trabajando con normalidad, se te avisará cuando esté listo.</div>' +
            '<button id="sp-dash-group-confirm" style="width:100%;padding:10px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Generar</button>',
          options: { maxWidth: "400px" }
        });
        document.getElementById("sp-dash-group-confirm").addEventListener("click", function () {
          var selectedGroup = document.getElementById("sp-dash-group-select").value;
          m.close();
          dashboardData = null;
          generateDashboard(btn, parseInt(selectedGroup));
        });
        return;
      }

      // Single group
      if (dashboardData && dashboardData.length) {
        showDashboardModal();
        return;
      }
      generateDashboard(btn, getTeamConfig().resolutionGroupId);
    }

    async function generateDashboard(btn, groupId) {
      // Ensure dates are initialized
      if (!dashboardFrom || !dashboardTo) {
        var now = new Date();
        dashboardFrom = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01T00:00";
        dashboardTo = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + "T23:59";
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Creando dashboard...</span>';
      btn.style.background = "#999";

      var spToken = getToken();
      if (!spToken) { showErrorToast("No hay token"); btn.innerHTML = '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>'; btn.style.background = "#00796B"; btn.disabled = false; return; }

      var allTickets = [];
      var page = 0;
      try {
        while (true) {
          var url = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=" + page + "&size=100&resolutionGroupId=" + groupId;
          if (dashboardFrom) url += "&initDate=" + dashboardFrom;
          if (dashboardTo) url += "&endDate=" + dashboardTo;
          var res = await fetch(url, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var data = json.data || json;
          var tickets = data.content || [];
          tickets.forEach(function (t) { if (t.ticketStatusName === "Cerrado") allTickets.push(t); });
          btn.innerHTML = '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> ' + allTickets.length + ' tickets...</span>';
          if (page >= (data.totalPages || 1) - 1) break;
          page++;
        }
      } catch (err) {
        showErrorToast("Error: " + err.message);
        btn.innerHTML = '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>';
        btn.style.background = "#00796B";
        btn.disabled = false;
        return;
      }

      dashboardData = allTickets;
      saveDashboardCache(allTickets, dashboardFrom, dashboardTo, groupId);
      btn.innerHTML = '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Ver dashboard</span>';
      btn.style.background = "#00796B";
      btn.disabled = false;
      showSuccessToast("Dashboard listo: " + allTickets.length + " tickets cerrados");
    }

    function buildDashboardChart(allTickets) {
      if (!allTickets.length) return '<div style="text-align:center;padding:40px;color:#888;">Sin tickets cerrados en este periodo</div>';

      var counts = {};
      allTickets.forEach(function (t) {
        var name = t.responsibleName || "Sin asignar";
        counts[name] = (counts[name] || 0) + 1;
      });
      var sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
      var maxCount = sorted[0][1];
      var colors = ["#1976D2", "#2E7D32", "#D94040", "#7B1FA2", "#E65100", "#00796B", "#C2185B", "#F57F17", "#283593", "#5D4037"];

      var html = '<div style="margin-bottom:12px;font-size:13px;color:#888;">Total: <b>' + allTickets.length + '</b> tickets cerrados</div>';
      sorted.forEach(function (entry, i) {
        var name = entry[0];
        var count = entry[1];
        var pct = Math.round((count / maxCount) * 100);
        var color = colors[i % colors.length];
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
          '<div style="width:180px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + name + '">' + name + '</div>' +
          '<div style="flex:1;background:#eee;border-radius:4px;height:24px;overflow:hidden;">' +
          '<div style="width:' + pct + '%;background:' + color + ';height:100%;border-radius:4px;transition:width 0.5s;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">' +
          '<span style="color:#fff;font-size:11px;font-weight:700;">' + count + '</span>' +
          '</div>' +
          '</div>' +
          '</div>';
      });
      return html;
    }

    function showDashboardModal() {
      var existing = document.getElementById("sp-dashboard-modal");
      if (existing) existing.remove();

      // Group selector for multi-group users
      var groupSelectorHTML = "";
      if (currentUserGroups.length > 1) {
        var cached = loadDashboardCache();
        var currentGroupId = cached?.groupId || currentUserGroups[0];
        var gOpts = currentUserGroups.map(function (gId) {
          var g = GROUP_INFO.find(function (gi) { return gi.id === gId; }) || { id: gId, name: "Grupo " + gId };
          return '<option value="' + g.id + '"' + (String(g.id) === String(currentGroupId) ? ' selected' : '') + '>' + g.name + '</option>';
        }).join("");
        groupSelectorHTML = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
          '<label style="font-size:12px;white-space:nowrap;">Grupo:</label>' +
          '<select id="sp-dash-group-change" style="flex:1;padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' + gOpts + '</select>' +
          '</div>';
      }

      var m = createModal({
        id: "sp-dashboard-modal",
        title: "📊 Tickets cerrados por analista",
        content: groupSelectorHTML +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">' +
          '<label style="font-size:12px;">Desde:</label>' +
          '<input id="sp-dash-from" type="datetime-local" value="' + dashboardFrom + '" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
          '<label style="font-size:12px;">Hasta:</label>' +
          '<input id="sp-dash-to" type="datetime-local" value="' + dashboardTo + '" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
          '<button id="sp-dash-refresh" style="padding:5px 14px;font-size:12px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-weight:600;">Regenerar</button>' +
          '</div>' +
          '<div id="sp-dash-results" style="flex:1;overflow:auto;min-height:200px;"></div>',
        options: { maxWidth: "700px", width: "95%", maxHeight: "90vh" }
      });
      var overlay = m.overlay;

      document.getElementById("sp-dash-results").innerHTML = buildDashboardChart(dashboardData || []);

      // Group change handler
      var groupChangeEl = document.getElementById("sp-dash-group-change");
      if (groupChangeEl) {
        groupChangeEl.addEventListener("change", function () {
          var newGroupId = parseInt(groupChangeEl.value);
          // Check if there's cached data for this group
          var cached = loadDashboardCache();
          if (cached && cached.data && cached.data.length && String(cached.groupId) === String(newGroupId)) {
            // Load from cache
            dashboardData = cached.data;
            dashboardFrom = cached.from || dashboardFrom;
            dashboardTo = cached.to || dashboardTo;
            document.getElementById("sp-dash-from").value = dashboardFrom;
            document.getElementById("sp-dash-to").value = dashboardTo;
            document.getElementById("sp-dash-results").innerHTML = buildDashboardChart(dashboardData);
          } else {
            // No cache for this group - show empty with message
            dashboardData = null;
            document.getElementById("sp-dash-results").innerHTML = '<div style="text-align:center;padding:40px;color:#888;">No hay datos para este grupo. Presiona <b>Regenerar</b> para generar el dashboard.</div>';
          }
        });
      }

      document.getElementById("sp-dash-refresh").addEventListener("click", function () {
        dashboardFrom = document.getElementById("sp-dash-from").value;
        dashboardTo = document.getElementById("sp-dash-to").value;
        dashboardData = null;
        clearDashboardCache();
        var selectedGroupId = groupChangeEl ? parseInt(groupChangeEl.value) : getTeamConfig().resolutionGroupId;
        m.close();
        var btn = document.getElementById(DASHBOARD_BTN_ID);
        generateDashboard(btn, selectedGroupId);
      });
    }

    // --- Water Role Button ---
    const WATER_BTN_ID = "sp-water-btn";
    const SUBGRUPO_DB = window.SP_CONFIG.NOTION_SUBGRUPO_DB;
    function injectWaterButton() {
      if (document.getElementById(WATER_BTN_ID)) return;
      var refBtn = document.getElementById(DASHBOARD_BTN_ID) || document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;
      // Only show if user is in at least one sub-group
      chrome.storage.local.get("userEmail", function (r) {
        var email = (r.userEmail || "").toLowerCase();
        if (!email) return;
        // Get sub-groups
        chrome.runtime.sendMessage({ type: "notion-query", dbId: SUBGRUPO_DB, body: {} }, function (sgResp) {
          if (!sgResp || !sgResp.success || !sgResp.data.results) return;
          // Collect all unique member IDs
          var allMemberIds = {};
          sgResp.data.results.forEach(function (sg) {
            (sg.properties.MSP_Usuarios?.relation || []).forEach(function (m) { allMemberIds[m.id] = true; });
          });
          var uniqueIds = Object.keys(allMemberIds);
          if (uniqueIds.length === 0) return;
          // Fetch all members to check email
          chrome.runtime.sendMessage({ type: "notion-pages-batch", pageIds: uniqueIds }, function (resp) {
            if (!resp || !resp.success) return;
            var found = resp.data.some(function (page) {
              var correo = (page.properties.Correo?.rich_text?.[0]?.plain_text || page.properties.Correo?.title?.[0]?.plain_text || "").toLowerCase();
              return correo === email;
            });
            if (!found) return;
            if (document.getElementById(WATER_BTN_ID)) return;
            var btn = createHeaderButton({ id: WATER_BTN_ID, icon: "🏠", label: "DBA Info", color: "#0288D1", onClick: showWaterModal });
            refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
          });
        });
      });
    }

    function showWaterModal() {
      var existing = document.getElementById("sp-water-modal");
      if (existing) { existing.remove(); return; }
      showLoadingToast("Cargando DBA Info...");

      var PRODUCTS_DB = "36c20e0684b980b7984bc6c5751a1057";
      var LOG_DB = "36c20e0684b98030b292c088101e8184";
      var today = new Date();
      var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

      var products = [], todayLog = [], subGroups = [];
      var pending = 3;

      function onReady() {
        pending--;
        if (pending > 0) return;

        // Collect all unique member pageIds from sub-groups
        var memberIds = {};
        subGroups.forEach(function (sg) { sg.members.forEach(function (id) { memberIds[id] = true; }); });
        var uniqueIds = Object.keys(memberIds);

        if (uniqueIds.length === 0) {
          var lt = document.getElementById("sp-loading-toast"); if (lt) lt.remove();
          showErrorToast("No hay miembros en los sub-grupos");
          return;
        }

        // Fetch member details in batch
        chrome.runtime.sendMessage({ type: "notion-pages-batch", pageIds: uniqueIds }, function (resp) {
          var lt = document.getElementById("sp-loading-toast"); if (lt) lt.remove();
          if (!resp || !resp.success) { showErrorToast("Error al cargar miembros"); return; }

          var allUserPages = {};
          resp.data.forEach(function (page) {
            var p = page.properties;
            var cumpleDate = p["Cumpleaños"]?.date?.start || "";
            var cumpleDisplay = "", cumpleColor = "";
            if (cumpleDate) {
              var parts = cumpleDate.split("-");
              var day = parseInt(parts[2]);
              var month = parseInt(parts[1]) - 1;
              var meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
              cumpleDisplay = day + " de " + meses[month];
              var now = new Date();
              var thisYearBday = new Date(now.getFullYear(), month, day);
              var diffDays = Math.floor((thisYearBday - now) / (1000 * 60 * 60 * 24));
              if (diffDays < 0) cumpleColor = "#D32F2F";
              else if (diffDays <= 30) cumpleColor = "#F9A825";
              else cumpleColor = "#2E7D32";
            }
            allUserPages[page.id] = {
              id: page.id,
              nombre: p.Nombre?.title?.[0]?.plain_text || "",
              correo: (p.Correo?.rich_text?.[0]?.plain_text || p.Correo?.title?.[0]?.plain_text || "").toLowerCase(),
              cumple: cumpleDisplay,
              cumpleColor: cumpleColor
            };
          });

          renderDBAInfoModal(products, todayLog, subGroups, allUserPages, todayStr, PRODUCTS_DB, LOG_DB);
        });
      }

      // 1. Get products
      chrome.runtime.sendMessage({ type: "notion-query", dbId: PRODUCTS_DB, body: {} }, function (resp) {
        if (resp && resp.success && resp.data.results) {
          products = resp.data.results.map(function (p) {
            return {
              id: p.id,
              name: p.properties.Nombre?.title?.[0]?.plain_text || "",
              producto: p.properties.Producto?.rich_text?.[0]?.plain_text || "",
              cantidad: p.properties.Cantidad?.number || 1,
              subGrupoId: p.properties.MSP_SubGrupo?.relation?.[0]?.id || ""
            };
          });
        }
        onReady();
      });

      // 2. Get ALL active log entries (Activo = true)
      chrome.runtime.sendMessage({ type: "notion-query", dbId: LOG_DB, body: { filter: { property: "Activo", checkbox: { equals: true } }, sorts: [{ property: "Fecha de creación", direction: "ascending" }] } }, function (resp) {
        if (resp && resp.success && resp.data.results) {
          todayLog = resp.data.results.map(function (p) {
            return {
              id: p.id,
              productId: p.properties.DBA_cat_Productos?.relation?.[0]?.id || "",
              userId: p.properties.MSP_Usuarios?.relation?.[0]?.id || "",
              name: p.properties.Nombre?.title?.[0]?.plain_text || "",
              date: p.properties["Fecha de creación"]?.created_time || ""
            };
          });
        }
        onReady();
      });

      // 3. Get sub-groups
      chrome.runtime.sendMessage({ type: "notion-query", dbId: SUBGRUPO_DB, body: {} }, function (resp) {
        if (resp && resp.success && resp.data.results) {
          subGroups = resp.data.results.map(function (sg) {
            return {
              id: sg.id,
              name: sg.properties.Nombre?.title?.[0]?.plain_text || "",
              members: (sg.properties.MSP_Usuarios?.relation || []).map(function (m) { return m.id; })
            };
          });
        }
        onReady();
      });
    }

    function renderDBAInfoModal(products, todayLog, subGroups, allUserPages, todayStr, PRODUCTS_DB, LOG_DB) {
      chrome.storage.local.get("userEmail", function (stored) {
        var currentEmail = (stored.userEmail || "").toLowerCase();

        // Find current user's pageId from the batch data
        var userPageId = "";
        Object.keys(allUserPages).forEach(function (pid) {
          if (allUserPages[pid].correo === currentEmail) userPageId = pid;
        });

        // Determine which sub-groups the current user belongs to
        var sgAgua = subGroups.find(function (sg) { return sg.name.toLowerCase().includes("agua"); });
        var sgChesco = subGroups.find(function (sg) { return sg.name.toLowerCase().includes("chesco"); });
        var sgCumple = subGroups.find(function (sg) { return sg.name.toLowerCase().includes("cumple"); });
        var sgGuardias = subGroups.find(function (sg) { return sg.name.toLowerCase().includes("guardias"); });

        var userInAgua = sgAgua && sgAgua.members.includes(userPageId);
        var userInChesco = sgChesco && sgChesco.members.includes(userPageId);
        var userInCumple = sgCumple && sgCumple.members.includes(userPageId);
        var userInGuardias = sgGuardias && sgGuardias.members.includes(userPageId);

        // Determine visible columns based on user's sub-groups
        var showCumple = userInCumple;

        // Show ALL products if user is in any sub-group (except cumpleaños-only)
        var userInAnyProductGroup = subGroups.some(function (sg) {
          return !sg.name.toLowerCase().includes("cumple") && sg.members.includes(userPageId);
        });

        // Build columns from products dynamically using Cantidad
        products.sort(function (a, b) { return a.name.localeCompare(b.name); });

        var visibleProducts = userInAnyProductGroup ? products : [];

        // Generate columns: each product has N columns based on Cantidad
        var columns = [];
        visibleProducts.forEach(function (p) {
          for (var i = 0; i < p.cantidad; i++) {
            columns.push({
              productId: p.id,
              productName: p.name,
              colName: p.cantidad > 1 ? p.name + " " + (i + 1) : p.producto,
              colIndex: i
            });
          }
        });

        // Get all unique members respecting the order from the water sub-group
        var orderedMemberIds = [];
        var seenIds = {};
        // First: use the water sub-group order as primary
        if (sgAgua && userInAgua) sgAgua.members.forEach(function (id) { if (!seenIds[id]) { orderedMemberIds.push(id); seenIds[id] = true; } });
        // Then add members from other sub-groups that aren't already in the list
        if (sgChesco && userInChesco) sgChesco.members.forEach(function (id) { if (!seenIds[id]) { orderedMemberIds.push(id); seenIds[id] = true; } });
        if (sgCumple && userInCumple) sgCumple.members.forEach(function (id) { if (!seenIds[id]) { orderedMemberIds.push(id); seenIds[id] = true; } });

        // Build user list from members in order
        var users = orderedMemberIds.map(function (id) { return allUserPages[id]; }).filter(Boolean);

        // Build table
        var overlay = document.createElement("div");
        overlay.id = "sp-water-modal";
        overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";

        // Build a map: userId+productId -> count of active logs
        var logCountMap = {};
        todayLog.forEach(function (l) {
          var key = l.userId + "_" + l.productId;
          logCountMap[key] = (logCountMap[key] || 0) + 1;
        });

        var productHeaders = columns.map(function (col) { return '<th style="padding:6px 10px;text-align:center;">' + col.colName + '</th>'; }).join("");

        // Map products to their sub-group members using the MSP_SubGrupo relation
        var productSubGroupMap = {}; // productId -> [memberIds]
        visibleProducts.forEach(function (p) {
          var sgRelation = p.subGrupoId || "";
          var matchedSg = subGroups.find(function (sg) { return sg.id === sgRelation; });
          productSubGroupMap[p.id] = matchedSg ? matchedSg.members : [];
        });

        // Check if all MEMBERS of the sub-group completed all columns of each product
        var productCompletionMap = {};
        visibleProducts.forEach(function (p) {
          var members = productSubGroupMap[p.id];
          if (members.length === 0) {
            productCompletionMap[p.id] = false;
          } else {
            productCompletionMap[p.id] = members.every(function (uid) { return (logCountMap[uid + "_" + p.id] || 0) >= p.cantidad; });
          }
        });

        var tableRows = users.map(function (u, idx) {
          var cells = columns.map(function (col) {
            var userCount = logCountMap[u.id + "_" + col.productId] || 0;
            var producto = visibleProducts.find(function (p) { return p.id === col.productId; });
            var cantidad = producto ? producto.cantidad : 1;
            // Check if user is member of this product's sub-group
            var productMembers = productSubGroupMap[col.productId] || [];
            var isMember = productMembers.length === 0 || productMembers.includes(u.id);
            if (!isMember) {
              return '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;"><span style="color:#bbb;font-size:10px;" title="No participa en este producto">⊘</span></td>';
            }
            var isMarked = userCount > col.colIndex;
            var isMe = u.id === userPageId;
            var timesMarked = isMarked ? Math.floor((userCount - col.colIndex - 1) / cantidad) + 1 : 0;
            var nextColIndex = userCount % cantidad;
            if (isMe && !isMarked && col.colIndex === userCount) {
              return '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;"><input type="checkbox" class="sp-dba-check" data-product-id="' + col.productId + '" data-product-name="' + col.colName + '" data-user-name="' + u.nombre + '" style="cursor:pointer;width:16px;height:16px;"></td>';
            } else if (isMe && isMarked && userCount >= cantidad && col.colIndex === nextColIndex) {
              return '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">\u2705' + (timesMarked > 1 ? ' <span style="font-size:9px;color:#888;">(x' + timesMarked + ')</span>' : '') + '</td>';
            } else {
              var display = isMarked ? '\u2705' + (timesMarked > 1 ? ' <span style="font-size:9px;color:#888;">(x' + timesMarked + ')</span>' : '') : '\u2014';
              return '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">' + display + '</td>';
            }
          }).join("");

          var cumpleCell = showCumple ? '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:' + (u.cumpleColor || '#333') + ';font-weight:600;">' + (u.cumple || '-') + '</td>' : '';

          return '<tr>' +
            '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' + (idx + 1) + '</td>' +
            '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">' + u.nombre + '</td>' +
            cells +
            cumpleCell +
            '</tr>';
        }).join("");

        var cumpleHeader = showCumple ? '<th style="padding:6px 10px;text-align:center;">🎂</th>' : '';

        // Reset buttons HTML - one per completed product
        var resetBtnsHTML = '';
        visibleProducts.forEach(function (p) {
          if (productCompletionMap[p.id]) {
            resetBtnsHTML += '<button class="sp-dba-reset-btn" data-product-id="' + p.id + '" data-product-name="' + p.name + '" style="padding:6px 14px;border:none;border-radius:6px;background:#1565C0;color:#fff;cursor:pointer;font-size:12px;font-weight:600;margin-right:8px;margin-bottom:4px;">\uD83D\uDD04 Reiniciar ' + p.name + '</button>';
          }
        });

        // Adelantó section
        var adelantoHTML = '<div style="margin-top:12px;padding:8px;border:1px solid #e0e0e0;border-radius:6px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span style="font-size:12px;font-weight:600;">⏩ Adelantó:</span>' +
          '<select id="sp-dba-adelanto-user" style="padding:4px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;"><option value="">-- Persona --</option></select>' +
          '<select id="sp-dba-adelanto-product" style="padding:4px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;" disabled><option value="">-- Producto --</option></select>' +
          '<button id="sp-dba-adelanto-btn" style="padding:4px 12px;border:none;border-radius:4px;background:#FF8F00;color:#fff;cursor:pointer;font-size:11px;font-weight:600;" disabled>Registrar</button>' +
          '</div>' +
          '</div>';

        overlay.innerHTML = '<div style="background:#fff;padding:20px;border-radius:12px;max-width:900px;width:95%;max-height:90vh;overflow:auto;font-family:system-ui;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<h3 style="margin:0;font-size:16px;">🏠 DBA Info</h3>' +
          '<button id="sp-water-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">✕</button>' +
          '</div>' +
          '<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #e0e0e0;">' +
          '<button id="sp-dba-tab-current" style="padding:8px 16px;border:none;border-bottom:2px solid #1976D2;background:transparent;color:#1976D2;font-weight:600;font-size:12px;cursor:pointer;margin-bottom:-2px;">Actual</button>' +
          '<button id="sp-dba-tab-history" style="padding:8px 16px;border:none;border-bottom:2px solid transparent;background:transparent;color:#888;font-weight:600;font-size:12px;cursor:pointer;margin-bottom:-2px;">Histórico</button>' +
          (userInGuardias ? '<button id="sp-dba-tab-guardias" style="padding:8px 16px;border:none;border-bottom:2px solid transparent;background:transparent;color:#888;font-weight:600;font-size:12px;cursor:pointer;margin-bottom:-2px;">📅 Guardias</button>' : '') +
          '</div>' +
          '<div id="sp-dba-tab-content-current">' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          '<thead><tr style="background:#f5f5f5;">' +
          '<th style="padding:6px 10px;text-align:left;">#</th>' +
          '<th style="padding:6px 10px;text-align:left;">Nombre</th>' +
          productHeaders +
          cumpleHeader +
          '</tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
          '</table>' +
          (resetBtnsHTML ? '<div style="margin-top:12px;text-align:center;">' + resetBtnsHTML + '</div>' : '') +
          adelantoHTML +
          '</div>' +
          '<div id="sp-dba-tab-content-history" style="display:none;">' +
          '<div id="sp-dba-history-content" style="text-align:center;color:#888;padding:20px;">Cargando...</div>' +
          '<div id="sp-dba-history-nav" style="display:flex;justify-content:center;gap:12px;margin-top:12px;align-items:center;"></div>' +
          '</div>' +
          (userInGuardias ? '<div id="sp-dba-tab-content-guardias" style="display:none;">' +
            '<div id="sp-dba-guardias-content" style="min-height:200px;text-align:center;color:#888;padding:20px;">Cargando...</div>' +
            '<div style="display:flex;justify-content:center;gap:12px;margin-top:12px;align-items:center;">' +
            '<button id="sp-dba-guardias-prev" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">← Anterior</button>' +
            '<button id="sp-dba-guardias-next" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">Siguiente →</button>' +
            '</div>' +
            '</div>' : '') +
          '</div>';
        document.body.appendChild(overlay);
        document.getElementById("sp-water-close").addEventListener("click", function () { overlay.remove(); });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });

        // Tab switching
        var tabCurrent = document.getElementById("sp-dba-tab-current");
        var tabHistory = document.getElementById("sp-dba-tab-history");
        var tabGuardias = document.getElementById("sp-dba-tab-guardias");
        var contentCurrent = document.getElementById("sp-dba-tab-content-current");
        var contentHistory = document.getElementById("sp-dba-tab-content-history");
        var contentGuardias = document.getElementById("sp-dba-tab-content-guardias");

        function switchTab(active) {
          [tabCurrent, tabHistory, tabGuardias].forEach(function (t) { if (t) { t.style.borderBottomColor = "transparent"; t.style.color = "#888"; } });
          [contentCurrent, contentHistory, contentGuardias].forEach(function (c) { if (c) c.style.display = "none"; });
          active.tab.style.borderBottomColor = "#1976D2"; active.tab.style.color = "#1976D2";
          active.content.style.display = "";
        }

        tabCurrent.addEventListener("click", function () { switchTab({ tab: tabCurrent, content: contentCurrent }); });

        tabHistory.addEventListener("click", function () {
          switchTab({ tab: tabHistory, content: contentHistory });
          loadHistory(0);
        });

        if (tabGuardias && contentGuardias) {
          tabGuardias.addEventListener("click", function () {
            switchTab({ tab: tabGuardias, content: contentGuardias });
            loadGuardias(0);
          });
        }

        var historyMonthOffset = 0;
        function loadHistory(offset) {
          historyMonthOffset = offset;
          var histContent = document.getElementById("sp-dba-history-content");
          var histNav = document.getElementById("sp-dba-history-nav");
          histContent.innerHTML = '<div style="color:#888;padding:20px;text-align:center;">Cargando...</div>';

          var now = new Date();
          var targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
          var startDate = targetDate.getFullYear() + "-" + String(targetDate.getMonth() + 1).padStart(2, "0") + "-01";
          var endMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
          var endDate = endMonth.getFullYear() + "-" + String(endMonth.getMonth() + 1).padStart(2, "0") + "-" + String(endMonth.getDate()).padStart(2, "0");

          var meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
          var monthLabel = meses[targetDate.getMonth()] + " " + targetDate.getFullYear();

          chrome.runtime.sendMessage({
            type: "notion-query", dbId: LOG_DB, body: {
              filter: {
                and: [
                  { property: "Fecha de creación", created_time: { on_or_after: startDate } },
                  { property: "Fecha de creación", created_time: { on_or_before: endDate + "T23:59:59" } }
                ]
              },
              sorts: [{ property: "Fecha de creación", direction: "descending" }]
            }
          }, function (resp) {
            var logs = [];
            var mesesFecha = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            if (resp && resp.success && resp.data.results) {
              logs = resp.data.results.map(function (p) {
                var producto = p.properties.DBA_cat_Productos?.relation?.[0]?.id || "";
                var usuario = p.properties.MSP_Usuarios?.relation?.[0]?.id || "";
                var prodName = visibleProducts.find(function (vp) { return vp.id === producto; });
                var userName = allUserPages[usuario];
                var displayProduct = prodName ? prodName.producto : "Producto";
                var displayPerson = userName ? userName.nombre.split(" ")[0] : "Usuario";
                var rawDate = p.properties["Fecha de creación"]?.created_time || "";
                var formattedDate = "";
                if (rawDate) {
                  var parts = rawDate.split("-");
                  formattedDate = parseInt(parts[2]) + " de " + mesesFecha[parseInt(parts[1]) - 1] + " del " + parts[0];
                }
                return {
                  product: displayProduct,
                  person: displayPerson,
                  date: formattedDate,
                  active: p.properties.Activo?.checkbox
                };
              });
            }

            if (logs.length === 0) {
              histContent.innerHTML = '<div style="color:#888;padding:20px;text-align:center;">Sin registros en ' + monthLabel + '</div>';
            } else {
              var rows = logs.map(function (l) {
                var statusIcon = l.active ? '\u2705' : '\u274C';
                return '<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center;">' + l.date + '</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center;">' + l.product + '</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;text-align:center;">' + l.person + '</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">' + statusIcon + '</td></tr>';
              }).join("");
              histContent.innerHTML = '<div style="text-align:center;font-weight:600;margin-bottom:8px;font-size:13px;">' + monthLabel + '</div>' +
                '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f5f5f5;"><th style="padding:4px 8px;text-align:center;font-size:11px;">Fecha</th><th style="padding:4px 8px;text-align:center;font-size:11px;">Producto</th><th style="padding:4px 8px;text-align:center;font-size:11px;">Persona</th><th style="padding:4px 8px;text-align:center;font-size:11px;">Activo</th></tr></thead><tbody>' + rows + '</tbody></table>';
            }

            // Navigation
            // Check if there are records in previous month
            var prevStart = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
            var prevStartStr = prevStart.getFullYear() + "-" + String(prevStart.getMonth() + 1).padStart(2, "0") + "-01";
            var canGoForward = offset < 0;

            histNav.innerHTML = '<button id="sp-dba-hist-prev" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">← Anterior</button>' +
              '<span style="font-size:12px;color:#555;">' + monthLabel + '</span>' +
              '<button id="sp-dba-hist-next" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;"' + (!canGoForward ? ' disabled style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;color:#ccc;cursor:not-allowed;font-size:11px;"' : '') + '>Siguiente →</button>';

            document.getElementById("sp-dba-hist-prev").addEventListener("click", function () { loadHistory(offset - 1); });
            var nextBtn = document.getElementById("sp-dba-hist-next");
            if (canGoForward) nextBtn.addEventListener("click", function () { loadHistory(offset + 1); });
          });
        }

        // Guardias tab logic
        var guardiasMonthOffset = 0;
        function loadGuardias(offset) {
          guardiasMonthOffset = offset;
          var gContent = document.getElementById("sp-dba-guardias-content");
          if (!gContent) return;
          gContent.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Cargando...</div>';

          var today = new Date();
          var targetMonth = new Date(today.getFullYear(), today.getMonth() + offset, 1);
          var year = targetMonth.getFullYear();
          var month = targetMonth.getMonth();
          var startStr = year + "-" + String(month + 1).padStart(2, "0") + "-01";
          var lastDay = new Date(year, month + 1, 0).getDate();
          var endStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");

          var meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

          chrome.runtime.sendMessage({
            type: "notion-query", dbId: GUARDIAS_DB, body: {
              filter: {
                and: [
                  { property: "Fecha", date: { on_or_after: startStr } },
                  { property: "Fecha", date: { on_or_before: endStr } }
                ]
              },
              sorts: [{ property: "Fecha", direction: "ascending" }]
            }
          }, function (resp) {
            var entries = {};
            if (resp && resp.success && resp.data.results) {
              resp.data.results.forEach(function (p) {
                var date = p.properties.Fecha?.date?.start || "";
                var name = p.properties.Nombre?.title?.[0]?.plain_text || "";
                if (date) entries[date] = name;
              });
            }

            var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

            // Build calendar grid (7 days including weekends)
            var firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
            // Adjust to Mon=0
            var startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

            var headerHTML = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:2px;">';
            var dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
            dias.forEach(function (d, i) { headerHTML += '<div style="text-align:center;font-size:10px;font-weight:600;color:' + (i >= 5 ? '#E65100' : '#888') + ';padding:4px;">' + d + '</div>'; });
            headerHTML += '</div>';

            var calHTML = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
            // Fill empty cells for days before the 1st
            for (var s = 0; s < startOffset; s++) {
              calHTML += '<div style="padding:6px;min-height:50px;"></div>';
            }

            // Get current user's name to highlight their days
            var currentUserName = "";
            Object.keys(allUserPages).forEach(function (pid) {
              if (allUserPages[pid].correo === currentEmail) currentUserName = allUserPages[pid].nombre;
            });

            for (var day = 1; day <= lastDay; day++) {
              var d = new Date(year, month, day);
              var dow = d.getDay();

              var dStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
              var entry = entries[dStr] || "";
              var isToday = dStr === todayStr;
              var isWeekend = dow === 0 || dow === 6;
              var isMyDay = entry && currentUserName && entry.toLowerCase().includes(currentUserName.split(" ")[0].toLowerCase());
              var bgColor = isToday ? "#E3F2FD" : isMyDay ? "#E8F5E9" : isWeekend ? "#FFF3E0" : "#f9f9f9";
              var borderColor = isToday ? "#1976D2" : isMyDay ? "#4CAF50" : "#e0e0e0";
              var firstName = entry ? entry.split(" ")[0] : "";

              calHTML += '<div style="padding:4px 6px;min-height:50px;background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                '<div style="font-size:13px;font-weight:' + (isToday ? '700' : '600') + ';color:' + (isToday ? '#1976D2' : isWeekend ? '#E65100' : '#333') + ';">' + day + '</div>' +
                '<div style="font-size:9px;color:#555;text-align:center;margin-top:2px;' + (isMyDay ? 'font-weight:700;color:#2E7D32;' : '') + '">' + firstName + '</div>' +
                '</div>';
            }
            calHTML += '</div>';

            gContent.innerHTML = '<div style="text-align:center;font-weight:600;margin-bottom:10px;font-size:14px;">' + meses[month] + ' ' + year + '</div>' + headerHTML + calHTML;

            var prevBtn = document.getElementById("sp-dba-guardias-prev");
            var nextBtn = document.getElementById("sp-dba-guardias-next");
            if (prevBtn) { prevBtn.onclick = function () { loadGuardias(guardiasMonthOffset - 1); }; }
            if (nextBtn) { nextBtn.onclick = function () { loadGuardias(guardiasMonthOffset + 1); }; }
          });
        }

        // Handle check clicks
        overlay.querySelectorAll(".sp-dba-check").forEach(function (cb) {
          cb.addEventListener("change", function () {
            if (!cb.checked) return;
            cb.disabled = true;
            var productId = cb.dataset.productId;
            var productName = cb.dataset.productName;
            var userName = cb.dataset.userName;
            var nombreConcat = productName + "-" + userName.split(" ")[0] + "_" + todayStr.replace(/-/g, "");

            var createProps = {
              "Nombre": { title: [{ text: { content: nombreConcat } }] },
              "DBA_cat_Productos": { relation: [{ id: productId }] },
              "Activo": { checkbox: true }
            };
            if (userPageId) createProps["MSP_Usuarios"] = { relation: [{ id: userPageId }] };

            chrome.runtime.sendMessage({
              type: "notion-create", body: {
                parent: { database_id: LOG_DB },
                properties: createProps
              }
            }, function (resp) {
              if (resp && resp.success) {
                cb.parentElement.innerHTML = '✅';
                showSuccessToast("✅ " + productName + " registrado");
              } else {
                showErrorToast("Error al registrar");
                cb.checked = false;
                cb.disabled = false;
              }
            });
          });
        });

        // Reset buttons - dynamic per product
        overlay.querySelectorAll(".sp-dba-reset-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var productId = btn.dataset.productId;
            var productName = btn.dataset.productName;
            if (!confirm("¿Reiniciar el conteo de " + productName + "? Se desactivará el registro más antiguo de cada persona.")) return;
            btn.disabled = true;
            btn.textContent = "⏳ Reiniciando...";
            var toDeactivate = [];
            users.forEach(function (u) {
              var oldest = todayLog.find(function (l) { return l.userId === u.id && l.productId === productId; });
              if (oldest) toDeactivate.push(oldest.id);
            });
            var done = 0;
            if (toDeactivate.length === 0) { overlay.remove(); showWaterModal(); return; }
            toDeactivate.forEach(function (pageId) {
              chrome.runtime.sendMessage({ type: "notion-update", pageId: pageId, body: { properties: { "Activo": { checkbox: false } } } }, function () {
                done++;
                if (done >= toDeactivate.length) {
                  showSuccessToast("✅ Conteo de " + productName + " reiniciado");
                  overlay.remove();
                  showWaterModal();
                }
              });
            });
          });
        });

        // Adelantó logic
        var adelantoUserSelect = document.getElementById("sp-dba-adelanto-user");
        var adelantoProductSelect = document.getElementById("sp-dba-adelanto-product");
        var adelantoBtn = document.getElementById("sp-dba-adelanto-btn");

        if (adelantoUserSelect) {
          // Only show users that have at least 1 active log entry
          adelantoUserSelect.innerHTML = '<option value="">-- Persona --</option>';
          users.forEach(function (u) {
            var hasAnyLog = todayLog.some(function (l) { return l.userId === u.id; });
            if (hasAnyLog) {
              var opt = document.createElement("option");
              opt.value = u.id;
              opt.textContent = u.nombre;
              adelantoUserSelect.appendChild(opt);
            }
          });

          adelantoUserSelect.addEventListener("change", function () {
            var selectedUserId = adelantoUserSelect.value;
            adelantoProductSelect.innerHTML = '<option value="">-- Producto --</option>';
            adelantoProductSelect.disabled = true;
            adelantoBtn.disabled = true;
            if (!selectedUserId) return;

            // Determine next product for this user - check all products
            var availableProducts = [];
            visibleProducts.forEach(function (p) {
              var userCount = todayLog.filter(function (l) {
                return l.userId === selectedUserId && l.productId === p.id;
              }).length;
              if (userCount > 0) {
                // Can adelantar: show next column name
                var nextColName = p.cantidad > 1 ? p.name + " " + ((userCount % p.cantidad) + 1) : p.producto;
                availableProducts.push({ id: p.id, name: nextColName });
              }
            });

            if (availableProducts.length === 0) {
              adelantoProductSelect.innerHTML = '<option value="">Sin productos disponibles</option>';
              return;
            }

            availableProducts.forEach(function (p) {
              var opt = document.createElement("option");
              opt.value = p.id;
              opt.textContent = p.name;
              adelantoProductSelect.appendChild(opt);
            });
            adelantoProductSelect.disabled = false;
          });

          adelantoProductSelect.addEventListener("change", function () {
            adelantoBtn.disabled = !adelantoProductSelect.value;
          });

          adelantoBtn.addEventListener("click", function () {
            var selectedUserId = adelantoUserSelect.value;
            var selectedProductId = adelantoProductSelect.value;
            if (!selectedUserId || !selectedProductId) return;
            adelantoBtn.disabled = true;
            adelantoBtn.textContent = "⏳...";

            var selectedUser = allUserPages[selectedUserId];
            var selectedProduct = visibleProducts.find(function (p) { return p.id === selectedProductId; }) || { name: "Producto" };
            var nombreConcat = selectedProduct.name + "-" + (selectedUser ? selectedUser.nombre.split(" ")[0] : "User") + "_" + todayStr.replace(/-/g, "");

            var createProps = {
              "Nombre": { title: [{ text: { content: nombreConcat } }] },
              "DBA_cat_Productos": { relation: [{ id: selectedProductId }] },
              "MSP_Usuarios": { relation: [{ id: selectedUserId }] },
              "Activo": { checkbox: true }
            };

            chrome.runtime.sendMessage({
              type: "notion-create", body: {
                parent: { database_id: LOG_DB },
                properties: createProps
              }
            }, function (resp) {
              if (resp && resp.success) {
                showSuccessToast("✅ Adelanto registrado: " + selectedProduct.name);
                overlay.remove();
                showWaterModal();
              } else {
                showErrorToast("Error al registrar adelanto");
                adelantoBtn.disabled = false;
                adelantoBtn.textContent = "Registrar";
              }
            });
          });
        }
      });
    }

    // --- Guardias DB constant ---
    const GUARDIAS_DB = "36d20e0684b98004b687c452ab2367a2";

    // --- Suggested Comments Button ---
    const SUGGESTED_BTN_ID = "sp-suggested-btn";
    function injectSuggestedCommentsButton() {
      if (!_btnComments) return;
      if (document.getElementById(SUGGESTED_BTN_ID)) return;
      var refBtn = document.getElementById(DASHBOARD_BTN_ID) || document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;
      var btn = createHeaderButton({ id: SUGGESTED_BTN_ID, icon: "💬", label: "Comentarios", color: "#00897B", onClick: showSuggestedCommentsModal });
      refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
    }

    function showSuggestedCommentsModal() {
      var existing = document.getElementById("sp-suggested-modal");
      if (existing) { existing.remove(); return; }

      var m = createModal({
        id: "sp-suggested-modal",
        title: "💬 Comentarios sugeridos",
        content: '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
          '<input id="sp-sug-new-input" type="text" placeholder="Nuevo comentario sugerido..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;">' +
          '<button id="sp-sug-add" style="padding:6px 12px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">+ Agregar</button>' +
          '</div>' +
          '<div id="sp-sug-list" style="flex:1;overflow:auto;"></div>',
        options: { maxWidth: "600px", width: "95%", maxHeight: "80vh", zIndex: 99998 }
      });
      var overlay = m.overlay;

      var groupId = getTeamConfig().resolutionGroupId;
      var groupPageId = null;
      var userPageId = null;
      var today = new Date().toISOString().slice(0, 10);

      // Get group page ID and user page ID
      chrome.storage.local.get(["notionUsers", "userEmail"], function (stored) {
        var email = (stored.userEmail || "").toLowerCase();
        var users = stored.notionUsers || {};
        // Find user pageId by searching Notion users DB
        chrome.runtime.sendMessage({ type: "notion-query", dbId: "36620e0684b98051a190e51d38d97288", body: {} }, function (resp) {
          if (resp && resp.success && resp.data.results) {
            var foundUser = resp.data.results.find(function (p) {
              var correo = (p.properties.Correo?.rich_text?.[0]?.plain_text || "").toLowerCase();
              return correo === email;
            });
            if (foundUser) userPageId = foundUser.id;
          }
        });
        chrome.runtime.sendMessage({ type: "notion-query", dbId: "36620e0684b9800e9a57df46019a03e0", body: {} }, function (resp) {
          if (resp && resp.success && resp.data.results) {
            var found = resp.data.results.find(function (p) {
              var idSP = p.properties.IdSupportPlus?.rich_text?.[0]?.plain_text || p.properties.IdSupportPlus?.title?.[0]?.plain_text;
              return idSP === String(groupId);
            });
            if (found) groupPageId = found.id;
          }
        });
      });

      function loadList() {
        var listDiv = document.getElementById("sp-sug-list");
        if (!listDiv) return;
        chrome.storage.local.get("suggestedComments", function (r) {
          var comments = r.suggestedComments || {};
          var items = comments[groupId] || [];
          if (!items.length) { listDiv.innerHTML = '<div style="text-align:center;color:#888;padding:20px;font-size:12px;">No hay comentarios sugeridos para este grupo</div>'; return; }
          listDiv.innerHTML = items.map(function (c) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;" data-id="' + c.id + '">' +
              '<span style="flex:1;font-size:12px;">' + c.text + '</span>' +
              '<button class="sp-sug-edit" data-id="' + c.id + '" data-text="' + c.text.replace(/"/g, '&quot;') + '" style="padding:3px 8px;border:1px solid #1976D2;border-radius:4px;background:#fff;color:#1976D2;cursor:pointer;font-size:10px;">✏️</button>' +
              '<button class="sp-sug-del" data-id="' + c.id + '" style="padding:3px 8px;border:1px solid #D32F2F;border-radius:4px;background:#fff;color:#D32F2F;cursor:pointer;font-size:10px;">🗑️</button>' +
              '</div>';
          }).join("");

          // Edit handlers
          listDiv.querySelectorAll(".sp-sug-edit").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var newText = prompt("Editar comentario:", btn.dataset.text);
              if (!newText || newText === btn.dataset.text) return;
              btn.textContent = "⏳";
              var updateProps = { "Comentario": { rich_text: [{ text: { content: newText } }] } };
              chrome.runtime.sendMessage({ type: "notion-update", pageId: btn.dataset.id, body: { properties: updateProps } }, function () {
                btn.textContent = "✅";
                chrome.runtime.sendMessage({ type: "sync-notion" }, function () { loadList(); });
              });
            });
          });

          // Delete handlers (logical delete)
          listDiv.querySelectorAll(".sp-sug-del").forEach(function (btn) {
            btn.addEventListener("click", function () {
              if (!confirm("¿Eliminar este comentario sugerido?")) return;
              btn.textContent = "⏳";
              var deleteProps = { "Activo": { checkbox: false }, "FechaEliminacion": { date: { start: today } } };
              if (userPageId) deleteProps["UsuarioEliminacion"] = { relation: [{ id: userPageId }] };
              chrome.runtime.sendMessage({ type: "notion-update", pageId: btn.dataset.id, body: { properties: deleteProps } }, function () {
                var row = btn.closest("[data-id]");
                if (row) row.remove();
                chrome.runtime.sendMessage({ type: "sync-notion" }, function () { loadList(); });
              });
            });
          });
        });
      }

      // Sync first, then load list
      chrome.runtime.sendMessage({ type: "sync-notion" }, function () { loadList(); });

      // Add new comment
      document.getElementById("sp-sug-add").addEventListener("click", function () {
        var input = document.getElementById("sp-sug-new-input");
        var text = input.value.trim();
        if (!text) return;
        if (!groupPageId) { showErrorToast("No se pudo determinar el grupo"); return; }
        var addBtn = document.getElementById("sp-sug-add");
        addBtn.disabled = true;
        addBtn.textContent = "⏳";
        var createProps = {
          "Nombre": { title: [{ text: { content: "" } }] },
          "Comentario": { rich_text: [{ text: { content: text } }] },
          "MSP_cat_Grupos": { relation: [{ id: groupPageId }] },
          "Activo": { checkbox: true }
        };
        chrome.runtime.sendMessage({
          type: "notion-create", body: {
            parent: { database_id: "36920e0684b980a19fdbd27302a65feb" },
            properties: createProps
          }
        }, function () {
          input.value = "";
          addBtn.disabled = false;
          addBtn.textContent = "+ Agregar";
          showSuccessToast("Comentario agregado");
          chrome.runtime.sendMessage({ type: "sync-notion" }, function () { loadList(); });
        });
      });
    }

    // --- Report Excel ---
    const REPORT_BTN_ID = "sp-report-btn";
    var reportGenerating = false;

    function injectReportButton() {
      if (!_btnReports) return;
      if (document.getElementById(REPORT_BTN_ID)) return;
      var refBtn = document.getElementById(DASHBOARD_BTN_ID) || document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;

      var btn = createHeaderButton({ id: REPORT_BTN_ID, icon: "📥", label: "Reporte Excel", color: "#1565C0", onClick: handleReportClick });
      refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
    }

    async function handleReportClick() {
      if (reportGenerating) return;
      reportGenerating = true;
      var btn = document.getElementById(REPORT_BTN_ID);
      if (!btn) return;

      var now = new Date();
      var fromDate = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01T00:00";
      var toDate = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + "T23:59";

      btn.disabled = true;
      btn.style.background = "#999";
      btn.textContent = "⏳ Obteniendo grupos...";

      var spToken = getToken();
      if (!spToken) { showErrorToast("No hay token"); btn.textContent = "📥 Reporte Excel"; btn.style.background = "#1565C0"; btn.disabled = false; reportGenerating = false; return; }

      try {
        // Step 1: Get all resolution groups
        var groupsRes = await fetch("https://macropayapi.supportplus.mx/resolution-groups/actives-by-attention-channel-id/1", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        });
        if (!groupsRes.ok) throw new Error("HTTP " + groupsRes.status);
        var groupsJson = await groupsRes.json();
        var groups = groupsJson.data || groupsJson;
        if (!Array.isArray(groups)) groups = Object.values(groups);

        // Step 2: For each group, fetch all tickets in date range
        var workbookData = {};

        for (var i = 0; i < groups.length; i++) {
          var group = groups[i];
          var groupName = group.name || group.label || ("Grupo " + (group.id || i));
          var groupId = group.id || group.value;
          btn.textContent = "⏳ (" + (i + 1) + "/" + groups.length + ") " + groupName.substring(0, 20);

          var allTickets = [];
          var page = 0;
          var url = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + groupId + "&page=0&size=100";
          url += "&initDate=" + fromDate + "&endDate=" + toDate;
          var res = await fetch(url, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
          if (res.ok) {
            var json = await res.json();
            var data = json.data || json;
            allTickets = data.content || [];
          }

          if (allTickets.length > 0) {
            workbookData[groupName] = allTickets;
          }
        }

        btn.textContent = "⏳ Generando Excel...";

        // Step 3: Load SheetJS and generate Excel
        await loadSheetJS();

        var wb = XLSX.utils.book_new();
        var sheetNames = Object.keys(workbookData);

        if (!sheetNames.length) {
          showErrorToast("No se encontraron tickets en el rango seleccionado.");
          btn.textContent = "📥 Reporte Excel";
          btn.style.background = "#1565C0";
          btn.disabled = false;
          reportGenerating = false;
          return;
        }

        sheetNames.forEach(function (name) {
          var tickets = workbookData[name];
          var rows = tickets.map(function (t) {
            return {
              "Folio": t.uniqueCode || "",
              "Asunto": t.subject || "",
              "Solicitante": t.requesterName || "",
              "Responsable": t.responsibleName || "",
              "Estado": t.ticketStatusName || "",
              "Prioridad": t.incidentPriorityName || "",
              "Tipo": t.reportTypeName || "",
              "Fecha Creación": t.createdAt ? t.createdAt.replace("T", " ").substring(0, 16) : "",
              "Descripción": (t.description || "").replace(/<[^>]*>/g, "").substring(0, 500)
            };
          });
          var sheetName = name.substring(0, 31);
          var ws = XLSX.utils.json_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        var fileName = "Reporte_SupportPlus_" + fromDate.substring(0, 10) + "_a_" + toDate.substring(0, 10) + ".xlsx";
        XLSX.writeFile(wb, fileName);

        var totalTickets = Object.values(workbookData).reduce(function (sum, arr) { return sum + arr.length; }, 0);
        showSuccessToast("📥 Reporte listo: " + sheetNames.length + " hojas, " + totalTickets + " tickets");

      } catch (err) {
        showErrorToast("Error: " + err.message);
      }

      btn.textContent = "📥 Reporte Excel";
      btn.style.background = "#1565C0";
      btn.disabled = false;
      reportGenerating = false;
    }

    var sheetJSLoaded = false;
    function loadSheetJS() {
      if (sheetJSLoaded) return Promise.resolve();
      return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = "https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js";
        script.onload = function () { sheetJSLoaded = true; resolve(); };
        script.onerror = function () { reject(new Error("No se pudo cargar SheetJS")); };
        document.head.appendChild(script);
      });
    }

    // --- Monday Stats ---
    const MONDAY_STATS_BTN_ID = "sp-monday-stats-btn";

    function injectMondayStatsButton() {
      if (!canMigrateMonday) return;
      if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
      var refBtn = document.getElementById(REPORT_BTN_ID) || document.getElementById(DASHBOARD_BTN_ID) || document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;

      // Only show if Monday token is configured
      getMondayToken().then(function (token) {
        if (!token) return;
        getMondayBoardId().then(function (boardId) {
          if (!boardId) return;
          if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
          var btn = createHeaderButton({ id: MONDAY_STATS_BTN_ID, icon: "📈", label: "Monday Stats", color: "#1565C0", onClick: handleMondayStats });
          refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
        });
      });
    }

    async function handleMondayStats() {
      var btn = document.getElementById(MONDAY_STATS_BTN_ID);
      if (!btn || btn.disabled) return;

      btn.disabled = true;
      btn.textContent = "⏳ Cargando...";
      btn.style.background = "#999";

      try {
        var mondayToken = await getMondayToken();
        var boardId = await getMondayBoardId();
        if (!mondayToken || !boardId) throw new Error("Configura Monday en el popup");

        // Fetch all items from the board
        var allItems = [];
        var firstPage = await mondayQuery(mondayToken,
          'query ($boardId: [ID!]!) { boards(ids: $boardId) { name items_page(limit: 500) { cursor items { id name column_values { id text value } } } } }',
          { boardId });
        var board = firstPage.boards[0];
        var boardName = board.name;
        var page = board.items_page;
        allItems = allItems.concat(page.items);

        var cursor = page.cursor;
        while (cursor) {
          btn.textContent = "⏳ " + allItems.length + " items...";
          var next = await mondayQuery(mondayToken,
            'query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values { id text value } } } }',
            { cursor });
          allItems = allItems.concat(next.next_items_page.items);
          cursor = next.next_items_page.cursor;
        }

        // Parse items: extract person and status
        var statsByPerson = {};
        var statusCounts = {};
        var totalItems = allItems.length;

        allItems.forEach(function (item) {
          var person = "Sin asignar";
          var status = "Sin estado";

          item.column_values.forEach(function (col) {
            if (col.id === "multiple_person_mm25nvfq" && col.text) {
              person = col.text;
            }
            if (col.id === "status" && col.text) {
              status = col.text;
            }
          });

          // Count by status
          statusCounts[status] = (statusCounts[status] || 0) + 1;

          // Count by person + status
          if (!statsByPerson[person]) statsByPerson[person] = { total: 0, statuses: {} };
          statsByPerson[person].total++;
          statsByPerson[person].statuses[status] = (statsByPerson[person].statuses[status] || 0) + 1;
        });

        // Show modal with stats
        showMondayStatsModal(boardName, totalItems, statusCounts, statsByPerson);

      } catch (err) {
        showErrorToast("Error: " + err.message);
      }

      btn.textContent = "📈 Monday Stats";
      btn.style.background = "#1565C0";
      btn.disabled = false;
    }

    function showMondayStatsModal(boardName, totalItems, statusCounts, statsByPerson) {
      var existing = document.getElementById("sp-monday-stats-modal");
      if (existing) existing.remove();

      var personSorted = Object.entries(statsByPerson).sort(function (a, b) { return b[1].total - a[1].total; });
      var maxTotal = personSorted[0] ? personSorted[0][1].total : 1;

      var colors = ["#1976D2", "#2E7D32", "#D94040", "#7B1FA2", "#E65100", "#00796B", "#C2185B", "#F57F17", "#283593", "#5D4037"];

      // --- Bar chart per person ---
      var barsHTML = '';
      personSorted.forEach(function (entry, idx) {
        var name = entry[0];
        var data = entry[1];
        var barWidth = Math.round((data.total / maxTotal) * 100);
        var color = colors[idx % colors.length];

        barsHTML += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
        barsHTML += '<div style="width:140px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + name + '">' + name + '</div>';
        barsHTML += '<div style="flex:1;background:#f0f0f0;border-radius:4px;height:30px;overflow:hidden;">';
        barsHTML += '<div style="width:' + barWidth + '%;background:' + color + ';height:100%;border-radius:4px;transition:width 0.5s;"></div>';
        barsHTML += '</div>';
        barsHTML += '<div style="width:35px;font-size:13px;font-weight:700;text-align:center;">' + data.total + '</div>';
        barsHTML += '</div>';
      });

      var m = createModal({
        id: "sp-monday-stats-modal",
        title: '📈 ' + boardName + ' <span style="font-size:13px;color:#888;font-weight:400;">(' + totalItems + ' tickets migrados)</span>',
        content: '<h4 style="margin:0 0 12px;font-size:14px;color:#555;">Tickets por persona</h4>' +
          '<div style="flex:1;overflow:auto;">' + barsHTML + '</div>',
        options: { maxWidth: "700px", width: "95%", maxHeight: "90vh" }
      });
    }

    const QUICK_SEARCH_ID = "sp-quick-search";

    function injectQuickSearch() {
      if (document.getElementById(QUICK_SEARCH_ID)) return;
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper) return;
      var parent = userWrapper.parentElement;

      var wrapper = document.createElement("div");
      wrapper.id = QUICK_SEARCH_ID;
      wrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-right:12px;";

      var input = document.createElement("input");
      input.id = "sp-quick-search-input";
      input.type = "text";
      input.placeholder = "Folio o ID...";
      input.style.cssText = "padding:5px 10px;font-size:12px;border:1px solid #ccc;border-radius:6px;width:130px;outline:none;";
      var goBtn = document.createElement("button");
      goBtn.textContent = "→";
      goBtn.style.cssText = "padding:5px 10px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#4CAF50;color:#fff;font-weight:600;";

      async function doQuickSearch() {
        var val = input.value.trim();
        if (!val) return;
        goBtn.disabled = true;
        goBtn.textContent = "...";

        var spToken = getToken();
        if (!spToken) { showErrorToast("No hay token"); goBtn.textContent = "→"; goBtn.disabled = false; return; }

        try {
          var res = await fetch(SP_SEARCH_API + "?uniqueCode=" + encodeURIComponent(val) + "&page=0&size=1", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken },
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var tickets = (json.data || json).content || [];
          if (tickets.length > 0) {
            showQuickDetailModal(tickets[0].id);
          } else {
            showErrorToast("Ticket no encontrado: " + val);
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
        }
        goBtn.textContent = "→";
        goBtn.disabled = false;
        input.value = "";
      }

      goBtn.addEventListener("click", doQuickSearch);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") doQuickSearch(); });

      wrapper.appendChild(input);
      wrapper.appendChild(goBtn);
      parent.insertBefore(wrapper, userWrapper);
    }

    const QUICK_FILTER_ID = "sp-quick-filter";

    function injectQuickFilterButton() {
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper) return;
      var parent = userWrapper.parentElement;

      if (!document.getElementById(QUICK_FILTER_ID)) {
        var btn = document.createElement("button");
        btn.id = QUICK_FILTER_ID;
        btn.textContent = "⏳ En espera";
        btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#FF8F00;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
        btn.addEventListener("click", function () { showQuickFilterModal("En espera"); });
        parent.insertBefore(btn, userWrapper);
      }
    }

    async function showQuickFilterModal(statusName, extraParams, title, customApiUrl) {
      var existing = document.getElementById("sp-search-modal");
      if (existing) existing.remove();

      var modalTitle = title || ("Tickets: " + statusName);

      var m = createModal({
        id: "sp-search-modal",
        title: modalTitle,
        content: '<div id="sp-qf-results" style="flex:1;overflow:auto;min-height:100px;"><div style="text-align:center;padding:20px;color:#888;">Buscando...</div></div>' +
          '<div id="sp-qf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
        options: {
          maxWidth: "900px", width: "95%", maxHeight: "90vh",
          headerActions: '<button id="sp-qf-refresh" style="padding:6px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:13px;">🔄 Actualizar</button>'
        },
        onClose: function () { activeModalRefresh = null; }
      });
      var overlay = m.overlay;

      document.getElementById("sp-qf-refresh").addEventListener("click", function () { if (activeModalRefresh) activeModalRefresh(); });

      var currentPage = 1;
      activeModalRefresh = doQuickSearch;
      await doQuickSearch();

      async function doQuickSearch() {
        var results = document.getElementById("sp-qf-results");
        var paging = document.getElementById("sp-qf-paging");
        results.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
        paging.innerHTML = "";

        var spToken = getToken();
        if (!spToken) { results.innerHTML = '<div style="color:#D94040;padding:12px;">No hay token</div>'; return; }

        try {
          var baseUrl = customApiUrl || SP_SEARCH_API;
          var url = baseUrl + "?page=" + (currentPage - 1) + "&size=25";
          if (!customApiUrl) url += "&resolutionGroupId=" + getTeamConfig().resolutionGroupId;
          if (statusName) url += "&ticketStatusName=" + encodeURIComponent(statusName);
          if (extraParams) url += "&" + extraParams;
          var res = await fetch(url, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken },
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var data = json.data || json;
          var tickets = data.content || [];
          var totalPages = data.totalPages || 1;
          var totalElements = data.totalElements || 0;

          if (!tickets.length) {
            var emptyMsg = customApiUrl && modalTitle.indexOf("pendientes") !== -1
              ? 'Sin tickets pendientes por atender'
              : 'Sin tickets con estado: ' + (statusName || "todos");
            results.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">' + emptyMsg + '</div>';
            return;
          }

          var myName = getLoggedUserName();
          var synced = getCache() || {};
          renderTicketCards(results, tickets, myName, synced, cachedBoardDate);

          paging.innerHTML = '<span>' + totalElements + ' tickets | Pag ' + currentPage + ' de ' + totalPages + '</span>' +
            '<div style="display:flex;gap:4px;">' +
            '<button id="sp-qf-prev" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' + (currentPage <= 1 ? ' disabled' : '') + '>&lt;</button>' +
            '<button id="sp-qf-next" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' + (currentPage >= totalPages ? ' disabled' : '') + '>&gt;</button>' +
            '</div>';

          var prev = document.getElementById("sp-qf-prev");
          var next = document.getElementById("sp-qf-next");
          if (prev) prev.addEventListener("click", function () { if (currentPage > 1) { currentPage--; doQuickSearch(); } });
          if (next) next.addEventListener("click", function () { if (currentPage < totalPages) { currentPage++; doQuickSearch(); } });
        } catch (err) {
          results.innerHTML = '<div style="color:#D94040;padding:12px;">Error: ' + err.message + '</div>';
        }
      }
    }

    function showSearchModal() {
      var existing = document.getElementById("sp-search-modal");
      if (existing) existing.remove();

      var statusOpts = '<option value="">Todos</option><option value="Asignado">Asignado</option><option value="En espera">En espera</option><option value="En atención">En atención</option><option value="En validación">En validación</option><option value="Por confirmar">Por confirmar</option><option value="Por ejecutar">Por ejecutar</option><option value="Por revisar">Por revisar</option><option value="En aplicaciones">En aplicaciones</option><option value="Cerrado">Cerrado</option><option value="Rechazado">Rechazado</option><option value="Cancelado">Cancelado</option><option value="Reabierto">Reabierto</option>';
      var typeOpts = '<option value="">Todos</option><option value="5">Solicitud</option><option value="6">Incidente</option>';
      var priorityOpts = '<option value="">Todas</option><option value="6">Critico</option><option value="7">Alto</option><option value="8">Medio</option><option value="9">Bajo</option>';

      var inputStyle = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';

      var m = createModal({
        id: "sp-search-modal",
        title: "🔍 Buscar tickets",
        content: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
          '<div><label style="font-size:11px;color:#888;">Folio</label><input id="sp-sf-code" style="' + inputStyle + '" placeholder="Ej: 123"></div>' +
          '<div><label style="font-size:11px;color:#888;">Solicitante</label><input id="sp-sf-requester" style="' + inputStyle + '" placeholder="Nombre"></div>' +
          '<div><label style="font-size:11px;color:#888;">Estado</label><select id="sp-sf-status" style="' + inputStyle + '">' + statusOpts + '</select></div>' +
          '<div><label style="font-size:11px;color:#888;">Tipo</label><select id="sp-sf-type" style="' + inputStyle + '">' + typeOpts + '</select></div>' +
          '<div><label style="font-size:11px;color:#888;">Prioridad</label><select id="sp-sf-priority" style="' + inputStyle + '">' + priorityOpts + '</select></div>' +
          '<div><label style="font-size:11px;color:#888;">Desde</label><input id="sp-sf-from" type="datetime-local" style="' + inputStyle + '"></div>' +
          '<div><label style="font-size:11px;color:#888;">Hasta</label><input id="sp-sf-to" type="datetime-local" style="' + inputStyle + '"></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
          '<button id="sp-sf-search" style="flex:1;padding:10px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:14px;">🔍 Buscar</button>' +
          '<button id="sp-sf-refresh" style="padding:10px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:14px;">🔄</button>' +
          '</div>' +
          '<div id="sp-sf-results" style="flex:1;overflow:auto;min-height:100px;"></div>' +
          '<div id="sp-sf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
        options: { maxWidth: "900px", width: "95%", maxHeight: "90vh" },
        onClose: function () { activeModalRefresh = null; }
      });
      var overlay = m.overlay;

      document.getElementById("sp-sf-refresh").addEventListener("click", function () { if (activeModalRefresh) activeModalRefresh(); });

      var currentPage = 1;
      document.getElementById("sp-sf-search").addEventListener("click", function () { currentPage = 1; activeModalRefresh = doSearch; doSearch(); });

      async function doSearch() {
        var results = document.getElementById("sp-sf-results");
        var paging = document.getElementById("sp-sf-paging");
        results.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
        paging.innerHTML = "";

        var spToken = getToken();
        if (!spToken) { results.innerHTML = '<div style="color:#D94040;padding:12px;">No hay token de SupportPlus</div>'; return; }

        var params = "page=" + (currentPage - 1) + "&size=25&resolutionGroupId=" + getTeamConfig().resolutionGroupId;
        var code = document.getElementById("sp-sf-code").value.trim();
        var requester = document.getElementById("sp-sf-requester").value.trim();
        var status = document.getElementById("sp-sf-status").value;
        var type = document.getElementById("sp-sf-type").value;
        var priority = document.getElementById("sp-sf-priority").value;
        var from = document.getElementById("sp-sf-from").value;
        var to = document.getElementById("sp-sf-to").value;

        if (code) params += "&uniqueCode=" + encodeURIComponent(code);
        if (requester) params += "&requesterName=" + encodeURIComponent(requester);
        if (status) params += "&ticketStatusName=" + encodeURIComponent(status);
        if (type) params += "&reportTypeId=" + type;
        if (priority) params += "&priorityId=" + priority;
        if (from) params += "&initDate=" + from;
        if (to) params += "&endDate=" + to;

        try {
          var res = await fetch(SP_SEARCH_API + "?" + params, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken },
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var data = json.data || json;
          var tickets = data.content || [];
          var totalPages = data.totalPages || 1;
          var totalElements = data.totalElements || 0;

          if (!tickets.length) {
            results.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Sin resultados</div>';
            return;
          }

          var myName2 = getLoggedUserName();
          var synced2 = getCache() || {};
          renderTicketCards(results, tickets, myName2, synced2, cachedBoardDate);

          paging.innerHTML = '<span>' + totalElements + ' resultados | Pag ' + currentPage + ' de ' + totalPages + '</span>' +
            '<div style="display:flex;gap:4px;">' +
            '<button id="sp-sf-prev" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' + (currentPage <= 1 ? ' disabled' : '') + '>&lt;</button>' +
            '<button id="sp-sf-next" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' + (currentPage >= totalPages ? ' disabled' : '') + '>&gt;</button>' +
            '</div>';

          var prev = document.getElementById("sp-sf-prev");
          var next = document.getElementById("sp-sf-next");
          if (prev) prev.addEventListener("click", function () { if (currentPage > 1) { currentPage--; doSearch(); } });
          if (next) next.addEventListener("click", function () { if (currentPage < totalPages) { currentPage++; doSearch(); } });

        } catch (err) {
          results.innerHTML = '<div style="color:#D94040;padding:12px;">Error: ' + err.message + '</div>';
        }
      }
    }

    const STATUS_FILTER_ID = "sp-status-filter";

    var cachedBoardDate = null;
    var boardDateLoaded = false;

    async function getBoardDate() {
      if (boardDateLoaded) return cachedBoardDate;
      try {
        var mondayToken = await getMondayToken();
        var boardId = await getMondayBoardId();
        if (mondayToken && boardId) {
          var bd = await mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { name } }', { boardId });
          cachedBoardDate = parseBoardDate(bd.boards[0]?.name || "");
        }
      } catch (e) { }
      boardDateLoaded = true;
      return cachedBoardDate;
    }

    function ticketMatchesBoard(dateText, boardDate) {
      if (!boardDate) return true;
      var m = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return true;
      var month = parseInt(m[2]) - 1;
      var year = parseInt(m[3]);
      return month === boardDate.month && year === boardDate.year;
    }

    // --- Quick detail button ---
    const DETAIL_QUICK_CLASS = "sp-quick-detail-btn";

    var _qdCommentsInterval = null;
    var _qdLastOpen = 0;
    async function showQuickDetailModal(ticketId) {
      // Debounce: prevent double-open within 500ms
      if (Date.now() - _qdLastOpen < 500) return;
      _qdLastOpen = Date.now();
      // Clear any previous interval from a prior modal
      if (_qdCommentsInterval) { clearInterval(_qdCommentsInterval); _qdCommentsInterval = null; }
      var existing = document.getElementById("sp-quick-detail-modal");
      if (existing) existing.remove();
      // Refresh panel when modal reloads (after actions)
      document.dispatchEvent(new CustomEvent("sp-refresh-panel"));

      showLoadingToast("Cargando detalle...");

      var spToken = getToken();
      if (!spToken) { showErrorToast("No hay token"); return; }

      try {
        var res = await fetch(SP_API + "/" + ticketId, {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        var t = json.data || json;

        // Sync status and person to Monday (non-blocking, reuses ticket data)
        (async function () {
          try {
            var mondayToken = await getMondayToken();
            if (!mondayToken) {
              // Force sync and retry once
              await new Promise(function (r) { chrome.runtime.sendMessage({ type: "sync-notion" }, r); });
              await new Promise(function (r) { setTimeout(r, 2000); });
              mondayToken = await getMondayToken();
            }
            if (!mondayToken || !t.uniqueCode) return;
            var spStatus = (t.ticketStatus?.name || "").toLowerCase();
            var hEmail = t.ticketHolder?.ticketHolderLog?.email || "";
            var mondayStatusIndex = mapStatusToMonday(spStatus);

            // Direct fetch to Monday (no background proxy needed)
            async function mFetch(query, variables) {
              var r = await fetch("https://api.monday.com/v2", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": mondayToken }, body: JSON.stringify({ query: query, variables: variables }) });
              var d = await r.json();
              return d.data;
            }

            // Find ticket in Monday boards
            var wsId2 = await getMondayWorkspaceId();
            var boardsData = await mFetch('{ boards(workspace_ids: [' + wsId2 + '], limit: 50) { id name } }', {});
            var ticketBoards = (boardsData.boards || []).filter(function (b) { return b.name.includes("Tickets DBA -") && !b.name.includes("Subelementos"); });
            for (var b of ticketBoards) {
              var itemData = await mFetch('query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: t.uniqueCode });
              var items = itemData.items_page_by_column_values?.items || [];
              if (items.length) {
                var colValues = { status: { index: mondayStatusIndex } };
                if (hEmail) {
                  var usersData = await mFetch('{ users(limit:500) { id email } }', {});
                  var uId = (usersData.users || []).find(function (u) { return u.email && u.email.toLowerCase() === hEmail.toLowerCase(); });
                  if (uId) colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(uId.id), kind: "person" }] };
                }
                await mFetch('mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: b.id, itemId: items[0].id, columnValues: JSON.stringify(colValues) });
                console.log("[SP] Monday synced from modal:", t.uniqueCode, spStatus, hEmail);
                break;
              }
            }
          } catch (e) { console.log("[SP] Modal Monday sync error:", e.message); }
        })();
        var loadingToast = document.getElementById("sp-loading-toast");
        if (loadingToast) loadingToast.remove();

        // Build modal content
        var desc = (t.description || "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
        var holderName = t.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar";
        var holderEmail = t.ticketHolder?.ticketHolderLog?.email || "";
        var requesterName = t.ticketInfo?.fullName || "";
        var requesterEmail = t.ticketInfo?.email || "";
        var statusName = t.ticketStatus?.name || "";
        var priorityName = t.incidentPriority?.name || "";
        var serviceName = t.service?.name || "";
        var groupName = t.resolutionGroup?.name || "";

        // Subgroup permissions already loaded in checkSession from Notion directly
        var _canCommentClosedResolved = _canCommentClosed;
        var _canReopenTicketsResolved = _canReopenTickets;
        // Fallback: read from storage if not loaded yet
        if (!_canReopenTicketsResolved || !_canCommentClosedResolved) {
          try {
            var permsData = await new Promise(function(r) { chrome.storage.local.get("subgroupPerms", function(d) { r(d.subgroupPerms || {}); }); });
            if (!_canReopenTicketsResolved) _canReopenTicketsResolved = !!permsData.canReopenTickets;
            if (!_canCommentClosedResolved) _canCommentClosedResolved = !!permsData.canCommentClosed;
          } catch(e) {}
        }
        var reportType = t.reportType?.name || "";
        var createdAt = t.createdAt ? t.createdAt.replace("T", " ").substring(0, 16) : "";
        var updatedAt = t.updatedAt ? t.updatedAt.replace("T", " ").substring(0, 16) : "";
        var location = t.ticketInfo?.location || "";
        var department = t.ticketInfo?.departmentName || "";
        var channel = t.attentionChannel?.name || "";

        // Attachments
        var attachments = t.ticketAttachments?.attachments || [];
        var attachHTML = "";
        if (attachments.length) {
          attachHTML = '<div style="margin-top:12px;"><b style="font-size:12px;">📎 Adjuntos (' + attachments.length + '):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">';
          attachments.forEach(function (a) {
            var fileName = a.file?.name || "archivo";
            var fileId = a.file?.id || "";
            attachHTML += '<button class="sp-qd-download" data-file-id="' + fileId + '" data-file-name="' + fileName.replace(/"/g, '&quot;') + '" style="padding:4px 8px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:11px;cursor:pointer;color:#1976D2;">📎 ' + esc(fileName) + '</button>';
          });
          attachHTML += '</div></div>';
        }

        // Comments
        var comments = t.ticketComments || [];
        var commentsHTML = "";
        if (comments.length) {
          commentsHTML = '<div style="margin-top:12px;"><b style="font-size:12px;">💬 Comentarios (' + comments.length + '):</b>';
          comments.forEach(function (c) {
            var cDate = c.createdAt ? c.createdAt.replace("T", " ").substring(0, 16) : "";
            var cContent = (c.content || "").replace(/<[^>]*>/g, "");
            commentsHTML += '<div style="margin-top:6px;padding:6px 8px;background:#f9f9f9;border-left:3px solid #1976D2;border-radius:4px;font-size:11px;">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:2px;"><b>' + (c.fullName || "") + '</b><span style="color:#888;">' + cDate + '</span></div>' +
              '<div style="color:#555;">' + cContent + '</div></div>';
          });
          commentsHTML += '</div>';
        }

        // Participants
        var participants = t.participants || [];
        var participantsHTML = "";
        if (participants.length) {
          participantsHTML = '<div style="margin-top:12px;"><b style="font-size:12px;">👥 Participantes (' + participants.length + '):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">';
          participants.forEach(function (p) {
            participantsHTML += '<span style="padding:2px 6px;background:#e8f5e9;border:1px solid #2E7D32;border-radius:4px;font-size:10px;">' + (p.profileFullName || p.email || "") + '</span>';
          });
          participantsHTML += '</div></div>';
        }

        var rowStyle = 'padding:4px 10px;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;font-size:12px;';

        var overlay = document.createElement("div");
        overlay.id = "sp-quick-detail-modal";
        overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:99999;display:flex;align-items:center;justify-content:center;transition:background 0.3s ease,backdrop-filter 0.3s ease;backdrop-filter:blur(0px);";
        overlay.innerHTML = '<div style="background:#fff;padding:clamp(16px, 2vw, 28px);border-radius:12px;width:92vw;max-width:900px;height:85vh;max-height:85vh;display:flex;flex-direction:column;overflow-y:auto;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);transform:scale(0.95);opacity:0;transition:transform 0.2s ease,opacity 0.2s ease;box-shadow:0 8px 40px rgba(0,0,0,0.25);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<h3 style="margin:0;font-size:1.1rem;">📋 ' + (t.uniqueCode || ticketId) + ' <span class="sp-qd-copy-folio" data-copy="' + (t.uniqueCode || ticketId) + '" style="cursor:pointer;font-size:0.85rem;opacity:0.6;" title="Copiar folio">⧉</span> <span style="font-weight:400;color:' + (STATUS_TEXT_COLORS[statusName] || '#333') + ';font-size:0.85rem;">(' + statusName + ')</span></h3>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
          '<span id="sp-qd-actions" style="display:flex;gap:4px;"></span>' +
          '<a href="/es/dashboard/tickets/' + ticketId + '" target="_blank" style="padding:5px 10px;border:1px solid #1976D2;border-radius:6px;font-size:0.9rem;text-decoration:none;color:#1976D2;">Abrir ↗</a>' +
          '<button id="sp-qd-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.9rem;">✕</button>' +
          '</div>' +
          '</div>' +
          '<div style="flex:1;overflow:auto;">' +
          // Subject + info grid
          '<div style="background:#f5f5f5;padding:8px 10px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:8px;">' + (t.subject || "Sin asunto") + '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px;font-size:0.9rem;">' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;">' + (statusName === "Cerrado" ? '<span style="color:#2E7D32;font-weight:700;font-size:0.9rem;">Cerrado</span>' : '<span style="color:#888;">Estado:</span> <select id="sp-qd-status-select" style="font-size:0.9rem;border:none;background:transparent;color:' + (STATUS_TEXT_COLORS[statusName] || '#333') + ';font-weight:700;cursor:pointer;"><option value="" selected>' + statusName + '</option><option value="" disabled>Cargando...</option></select>') + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Prioridad:</span> ' + priorityName + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Tipo:</span> ' + reportType + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Canal:</span> ' + channel + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Grupo:</span> ' + groupName + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Servicio:</span> ' + serviceName + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Creado:</span> ' + createdAt + '</div>' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Actualizado:</span> ' + updatedAt + '</div>' +
          '</div>' +
          // Assign row (only if "En espera" / unassigned)
          (statusName === "En espera" ? '<div style="margin-bottom:8px;">' +
            '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
            '<button id="sp-qd-take-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🤚 Tomar</button>' +
            (_canRejectTickets ? '<button id="sp-qd-reject-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D32F2F;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">❌ Rechazar</button>' : '') +
            '<select id="sp-qd-assign-select" style="flex:1;padding:6px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:6px;"><option value="">-- Asignar a --</option></select>' +
            '</div>' +
            '<div id="sp-qd-take-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:0.9rem;">' +
            '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario al tomar</label>' +
            '<div style="display:flex;gap:4px;align-items:flex-start;"><textarea id="sp-qd-take-comment" style="flex:1;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;">se revisa</textarea><label style="padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-take-attach" type="file" multiple style="display:none;"></label></div>' +
            '<div id="sp-qd-take-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
            '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.9rem;"><input type="checkbox" id="sp-qd-take-done"> <b>Ticket realizado</b></label>' +
            '<div id="sp-qd-take-extra" style="display:none;margin-top:6px;">' +
            '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario antes de cerrar (opcional)</label>' +
            '<div style="display:flex;gap:4px;align-items:flex-start;"><textarea id="sp-qd-take-close-comment" placeholder="Comentario de cierre..." style="flex:1;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;"></textarea><label style="padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-take-close-attach" type="file" multiple style="display:none;"></label></div>' +
            '<div id="sp-qd-take-close-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;margin-top:8px;"><button id="sp-qd-take-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Confirmar</button><button id="sp-qd-take-cancel" style="padding:6px 12px;border:1px solid #999;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:0.9rem;font-weight:600;">Cancelar</button></div>' +
            '<div id="sp-qd-take-suggested" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
            '</div>' +
            '</div>' : '') +
          // Action row - only if not closed and not waiting
          (function () {
            if (statusName === "En espera" || statusName === "Cerrado") return '';
            var isMigrated = t.uniqueCode && getCache() && getCache()[t.uniqueCode];
            var showMondayOption = hasMondayConfig && !isMigrated;
            var closeHTML = '<div style="margin-bottom:8px;">' +
              '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
              '<button id="sp-qd-close-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔒 Cerrar</button>' +
              (holderEmail && holderEmail.toLowerCase() !== getLoggedUserEmail().toLowerCase() ? '<button id="sp-qd-steal-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🤚 Tomar</button>' : '') +
              '</div>' +
              '<div id="sp-qd-close-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:0.9rem;">' +
              '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario antes de cerrar (opcional)</label>' +
              '<div style="display:flex;gap:4px;align-items:flex-start;"><textarea id="sp-qd-close-comment" placeholder="Comentario de cierre..." style="flex:1;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;"></textarea><label style="padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-close-attach" type="file" multiple style="display:none;"></label></div>' +
              '<div id="sp-qd-close-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
              '<div style="display:flex;gap:6px;"><button id="sp-qd-close-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Confirmar</button><button id="sp-qd-close-cancel" style="padding:6px 12px;border:1px solid #999;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:0.9rem;font-weight:600;">Cancelar</button></div>' +
              '<div id="sp-qd-close-suggested" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
              '</div>' +
              '</div>';
            return closeHTML;
          })() +
          // Migrate only (if closed, not migrated, and Monday configured)
          (statusName === "Cerrado" && hasMondayConfig && !(t.uniqueCode && getCache() && getCache()[t.uniqueCode]) ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
            '<button id="sp-qd-migrate-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🙂 Migrar a Monday</button>' +
            '</div>' : '') +
          // Reopen row (if closed) - no select, reopen assigns to current holder
          (statusName === "Cerrado" && _canReopenTicketsResolved ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
            '<button id="sp-qd-reopen-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔓 Reabrir</button>' +
            '</div>' : '') +
          // People row
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.9rem;">' +
          '<b style="color:#888;">👤 Solicitante:</b> ' + requesterName + ' <span class="sp-qd-copy-name" data-copy="' + requesterName + '" style="cursor:pointer;font-size:0.8rem;opacity:0.6;" title="Copiar nombre">📋</span>' + (requesterEmail ? '<br><span style="color:#888;">(' + requesterEmail + ') <span class="sp-qd-copy-email" data-copy="' + requesterEmail + '" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>' : '') +
          (department ? '<br><span style="color:#aaa;">' + department + ' | ' + location + '</span>' : '') +
          '</div>' +
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.9rem;">' +
          '<b style="color:#888;">🔍 Analista:</b> ' + holderName + (holderEmail ? '<br><span style="color:#888;">(' + holderEmail + ') <span class="sp-qd-copy-email" data-copy="' + holderEmail + '" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>' : '') +
          '</div>' +
          '</div>' +
          // Description (compact)
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;margin-bottom:8px;">' +
          '<b style="font-size:0.8rem;color:#888;">📝 Descripción</b>' +
          '<div style="margin:4px 0 0;font-size:0.9rem;line-height:1.5;color:#333;max-height:200px;overflow:auto;">' + desc + '</div>' +
          '</div>' +
          attachHTML +
          participantsHTML +
          // Comments section
          '<div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px;">' +
          '<b style="font-size:12px;">💬 Comentarios (' + comments.length + ')</b>' +
          '<div id="sp-qd-comments-list" style="max-height:250px;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column-reverse;">' +
          (comments.length ? comments.map(function (c) {
            var cDate = c.createdAt ? c.createdAt.replace("T", " ").substring(0, 16) : "";
            var cContent = (c.content || "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
            var cAttachments = c.attachments || [];
            var cAttachHTML = "";
            if (cAttachments.length) {
              cAttachHTML = '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">';
              cAttachments.forEach(function (a) {
                cAttachHTML += '<button class="sp-qd-download" data-file-id="' + a.id + '" data-file-name="' + (a.name || "archivo").replace(/"/g, '&quot;') + '" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:0.8rem;cursor:pointer;color:#1976D2;">📎 ' + esc(a.name || "archivo") + '</button>';
              });
              cAttachHTML += '</div>';
            }
            var myName = getLoggedUserName();
            var myEmail = getLoggedUserEmail();
            var isMyComment = (c.email && myEmail && c.email.toLowerCase() === myEmail.toLowerCase()) || c.fullName === myName;
            var addAttachBtn = isMyComment ? ' <label class="sp-qd-add-attach" data-comment-id="' + c.id + '" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar evidencia">📎<input type="file" multiple style="display:none;"></label>' : '';
            var align = isMyComment ? "flex-end" : "flex-start";
            var userColor = isMyComment ? null : stringToColor(c.fullName || "user");
            var bgColor = isMyComment ? "#e3f2fd" : userColor.bg;
            var borderSide = isMyComment ? "border-right:3px solid #1976D2;" : "border-left:3px solid " + userColor.border + ";";
            return '<div style="display:flex;justify-content:' + align + ';margin-bottom:6px;">' +
              '<div class="sp-comment-bubble" style="max-width:85%;padding:6px 10px;background:' + bgColor + ';' + borderSide + 'border-radius:6px;font-size:0.85rem;">' +
              '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;' + (isMyComment ? 'justify-content:flex-end;' : '') + '">' + '<span style="font-weight:600;font-size:0.8rem;">' + (c.fullName || "") + '</span>' + '<span style="color:#888;font-size:0.75rem;">' + cDate + '</span>' + addAttachBtn + '</div>' +
              '<div style="color:#333;">' + cContent + '</div>' + cAttachHTML +
              '</div></div>';
          }).join("") : '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>') +
          '</div>' +
          // Add comment form (hide if closed, unless in "Comentar con ticket cerrado" sub-group)
          (statusName !== "Cerrado" || _canCommentClosedResolved ? (
            '<div id="sp-qd-comment-section">' +
            '<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">' +
            '<textarea id="sp-qd-comment-input" placeholder="Escribe un comentario..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;outline:none;min-height:36px;resize:vertical;font-family:system-ui;"></textarea>' +
            '<label style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-attach-input" type="file" multiple style="display:none;"></label>' +
            '<button id="sp-qd-comment-send" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">Enviar</button>' +
            '</div>' +
            '<div id="sp-qd-attach-list" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
            '<div id="sp-qd-suggested" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
            '</div>'
          ) : '') +
          '</div>' +
          '</div></div>';
        document.body.appendChild(overlay);

        // Trigger open animation
        requestAnimationFrame(function () {
          overlay.style.background = "rgba(0,0,0,0.5)";
          overlay.style.backdropFilter = "blur(6px)";
          var modalBox = overlay.querySelector("div");
          if (modalBox) { modalBox.style.transform = "scale(1)"; modalBox.style.opacity = "1"; }
        });

        function closeQdModal() {
          if (_qdCommentsInterval) { clearInterval(_qdCommentsInterval); _qdCommentsInterval = null; }
          var modalBox = overlay.querySelector("div");
          if (modalBox) { modalBox.style.transform = "scale(0.9) translateY(10px)"; modalBox.style.opacity = "0"; }
          overlay.style.background = "rgba(0,0,0,0)";
          overlay.style.backdropFilter = "blur(0px)";
          setTimeout(function () { overlay.remove(); }, 250);
        }

        document.getElementById("sp-qd-close").addEventListener("click", closeQdModal);
        document.addEventListener("keydown", function escHandler(e) {
          if (e.key === "Escape" && document.getElementById("sp-quick-detail-modal") && !document.getElementById("sp-carousel-modal")) { closeQdModal(); document.removeEventListener("keydown", escHandler); }
        });

        // Auto-refresh comments every 30s
        _qdCommentsInterval = setInterval(function () {
          if (!document.getElementById("sp-quick-detail-modal")) { clearInterval(_qdCommentsInterval); _qdCommentsInterval = null; return; }
          fetch(SP_API + "/" + ticketId, { headers: { accept: "application/json", authorization: "Bearer " + spToken } })
            .then(function (r) { return r.json(); })
            .then(function (json) {
              var ticket = json.data || json;
              var newComments = ticket.ticketComments || [];
              var list = document.getElementById("sp-qd-comments-list");
              if (!list) return;
              var currentCount = list.querySelectorAll("[style*='border-left']").length;
              if (newComments.length === currentCount) return; // No changes
              // Re-render comments
              var html = newComments.map(function (c) {
                var cDate = c.createdAt ? c.createdAt.replace("T", " ").substring(0, 16) : "";
                var cContent = (c.content || "").replace(/<script[^>]*>.*?<\/script>/gi, "");
                var myName = getLoggedUserName();
                var myEmail = getLoggedUserEmail();
                var isMyComment = (c.email && myEmail && c.email.toLowerCase() === myEmail.toLowerCase()) || c.fullName === myName;
                var cAttachHTML = "";
                if (c.attachments && c.attachments.length) {
                  cAttachHTML = '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">';
                  c.attachments.forEach(function (a) {
                    cAttachHTML += '<button class="sp-qd-download" data-file-id="' + a.id + '" data-file-name="' + (a.name || "archivo").replace(/"/g, '&quot;') + '" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:0.8rem;cursor:pointer;color:#1976D2;">📎 ' + esc(a.name || "archivo") + '</button>';
                  });
                  cAttachHTML += '</div>';
                }
                var addAttachBtn = isMyComment ? ' <label class="sp-qd-add-attach" data-comment-id="' + c.id + '" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar evidencia">📎<input type="file" multiple style="display:none;"></label>' : '';
                var align = isMyComment ? "flex-end" : "flex-start";
                var userColor = isMyComment ? null : stringToColor(c.fullName || "user");
                var bgColor = isMyComment ? "#e3f2fd" : userColor.bg;
                var borderSide = isMyComment ? "border-right:3px solid #1976D2;" : "border-left:3px solid " + userColor.border + ";";
                return '<div style="display:flex;justify-content:' + align + ';margin-bottom:6px;">' +
                  '<div class="sp-comment-bubble" style="max-width:85%;padding:6px 10px;background:' + bgColor + ';' + borderSide + 'border-radius:6px;font-size:0.85rem;">' +
                  '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;' + (isMyComment ? 'justify-content:flex-end;' : '') + '">' + '<span style="font-weight:600;font-size:0.8rem;">' + (c.fullName || "") + '</span>' + '<span style="color:#888;font-size:0.75rem;">' + cDate + '</span>' + addAttachBtn + '</div>' +
                  '<div style="color:#333;">' + cContent + '</div>' + cAttachHTML +
                  '</div></div>';
              }).join("");
              list.innerHTML = html || '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>';
            }).catch(function () { });
        }, 30000);

        // Move action buttons to header
        var actionsContainer = document.getElementById("sp-qd-actions");
        if (actionsContainer) {
          var closeBtn = document.getElementById("sp-qd-close-btn");
          if (closeBtn) { closeBtn.style.padding = "5px 10px"; closeBtn.style.fontSize = "11px"; actionsContainer.appendChild(closeBtn); }
          var stealBtn = document.getElementById("sp-qd-steal-btn");
          if (stealBtn) { stealBtn.style.padding = "5px 10px"; stealBtn.style.fontSize = "11px"; actionsContainer.appendChild(stealBtn); }
          var takeBtn = document.getElementById("sp-qd-take-btn");
          if (takeBtn) { takeBtn.style.padding = "5px 10px"; takeBtn.style.fontSize = "11px"; actionsContainer.appendChild(takeBtn); }
          var rejectBtn = document.getElementById("sp-qd-reject-btn");
          if (rejectBtn) { rejectBtn.style.padding = "5px 10px"; rejectBtn.style.fontSize = "11px"; actionsContainer.appendChild(rejectBtn); }
          var migrateBtn = document.getElementById("sp-qd-migrate-btn");
          if (migrateBtn) { migrateBtn.style.padding = "5px 10px"; migrateBtn.style.fontSize = "11px"; actionsContainer.appendChild(migrateBtn); }
          var reopenBtn = document.getElementById("sp-qd-reopen-btn");
          if (reopenBtn) { reopenBtn.style.padding = "5px 10px"; reopenBtn.style.fontSize = "11px"; actionsContainer.appendChild(reopenBtn); }

          // Reassign to Aplicaciones button (conditions: department=Mesa de Ayuda, group=Infraestructura DBA, user in subgroup)
          if (_btnReassignApp && department.toLowerCase().includes("mesa de ayuda") && groupName.toLowerCase().includes("infraestructura dba") && statusName !== "Cerrado") {
            var reassignAppBtn = document.createElement("button");
            reassignAppBtn.id = "sp-qd-reassign-app-btn";
            reassignAppBtn.textContent = "🔀 Aplicaciones";
            reassignAppBtn.style.cssText = "padding:5px 10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;";
            reassignAppBtn.addEventListener("click", function () {
              showReassignAppModal(ticketId);
            });
            actionsContainer.insertBefore(reassignAppBtn, actionsContainer.firstChild);
          }
        }

        // Copy folio button
        var copyFolioBtn = overlay.querySelector(".sp-qd-copy-folio");
        if (copyFolioBtn) {
          copyFolioBtn.addEventListener("click", function () {
            navigator.clipboard.writeText(copyFolioBtn.dataset.copy).then(function () {
              copyFolioBtn.textContent = "✅";
              setTimeout(function () { copyFolioBtn.textContent = "⧉"; }, 1500);
            });
          });
        }

        // Copy requester name button
        var copyNameBtn = overlay.querySelector(".sp-qd-copy-name");
        if (copyNameBtn) {
          copyNameBtn.addEventListener("click", function () {
            navigator.clipboard.writeText(copyNameBtn.dataset.copy).then(function () {
              copyNameBtn.textContent = "✅";
              setTimeout(function () { copyNameBtn.textContent = "📋"; }, 1500);
            });
          });
        }

        // Copy email buttons
        overlay.querySelectorAll(".sp-qd-copy-email").forEach(function (btn) {
          btn.addEventListener("click", function () {
            navigator.clipboard.writeText(btn.dataset.copy).then(function () {
              btn.textContent = "✅";
              setTimeout(function () { btn.textContent = "📋"; }, 1500);
            });
          });
        });

        // Attach files - multiple with remove
        var attachInput = document.getElementById("sp-qd-attach-input");
        var attachListDiv = document.getElementById("sp-qd-attach-list");
        var pendingFiles = [];

        function renderPendingFiles() {
          attachListDiv.innerHTML = "";
          pendingFiles.forEach(function (f, idx) {
            var chip = document.createElement("span");
            chip.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
            chip.innerHTML = '📎 ' + esc(f.name) + ' <span data-idx="' + idx + '" style="cursor:pointer;color:#D94040;font-weight:700;margin-left:2px;">✕</span>';
            chip.querySelector("[data-idx]").addEventListener("click", function () {
              pendingFiles.splice(idx, 1);
              renderPendingFiles();
            });
            attachListDiv.appendChild(chip);
          });
        }

        if (attachInput) {
          attachInput.addEventListener("change", function () {
            for (var i = 0; i < attachInput.files.length; i++) {
              pendingFiles.push(attachInput.files[i]);
            }
            attachInput.value = "";
            renderPendingFiles();
          });
        }

        // Send comment (with optional attachments)
        var commentSendBtn = document.getElementById("sp-qd-comment-send");
        if (commentSendBtn) {
          commentSendBtn.addEventListener("click", async function () {
            var input = document.getElementById("sp-qd-comment-input");
            var text = input.value.trim();
            if (!text && !pendingFiles.length) return;
            var sendBtn = document.getElementById("sp-qd-comment-send");
            sendBtn.disabled = true;
            sendBtn.textContent = "...";
            try {
              // Step 1: Post comment
              var commentText = text || "(archivo adjunto)";
              var commentRes = await fetch(SP_API + "/comment/" + ticketId, {
                method: "POST",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ content: "<p>" + commentText + "</p>", internal: false }),
              });
              if (!commentRes.ok) throw new Error("HTTP " + commentRes.status);
              var commentJson = await commentRes.json();
              var commentId = commentJson.data?.id || commentJson.id;

              // Step 2: Upload files if present
              var uploadedFileNames = [];
              if (pendingFiles.length && commentId) {
                var formData = new FormData();
                pendingFiles.forEach(function (f) { formData.append("files", f); });
                var fileRes = await fetch("https://macropayapi.supportplus.mx/files", {
                  method: "POST",
                  headers: { authorization: "Bearer " + spToken },
                  body: formData,
                });
                if (!fileRes.ok) throw new Error("Error subiendo archivos: HTTP " + fileRes.status);
                var fileJson = await fileRes.json();
                var uploadedFiles = fileJson.data || fileJson;
                if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                  // Step 3: Attach files to comment
                  var attachPayload = uploadedFiles.map(function (f) { uploadedFileNames.push(f.name); return { fileId: f.id }; });
                  await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ attachments: attachPayload, commentId: commentId, isInternal: false }),
                  });
                }
              }

              // Update UI
              var now = new Date();
              var nowStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + " " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
              var myName = getLoggedUserName() || "Yo";
              var list = document.getElementById("sp-qd-comments-list");
              var noComments = list.querySelector('[style*="color:#aaa"]');
              if (noComments) noComments.remove();
              var attachLabel = uploadedFileNames.length ? ' <div style="margin-top:3px;">' + uploadedFileNames.map(function (n) { return '<span style="color:#1976D2;font-size:10px;">📎 ' + n + '</span>'; }).join(" ") + '</div>' : '';
              list.innerHTML += '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">' +
                '<div style="max-width:85%;padding:6px 10px;background:#e3f2fd;border-right:3px solid #1976D2;border-radius:6px;font-size:0.85rem;">' +
                '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;"><span style="font-weight:600;font-size:0.8rem;">' + myName.split(" ")[0] + '</span><span style="color:#888;font-size:0.75rem;">' + nowStr + '</span></div>' +
                '<div style="color:#333;">' + commentText + '</div>' + attachLabel +
                '</div></div>';
              list.scrollTop = list.scrollHeight;
              input.value = "";
              pendingFiles = [];
              renderPendingFiles();
            } catch (err) {
              showErrorToast("Error: " + err.message);
            }
            sendBtn.disabled = false;
            sendBtn.textContent = "Enviar";
          });
        } // end if commentSendBtn

        // Allow Enter to send
        var commentInputEl = document.getElementById("sp-qd-comment-input");
        if (commentInputEl) {
          commentInputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter") document.getElementById("sp-qd-comment-send").click();
          });
          // Paste image from clipboard - show preview with send button
          commentInputEl.addEventListener("paste", function (e) {
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (var i = 0; i < items.length; i++) {
              if (items[i].type.indexOf("image") !== -1) {
                var file = items[i].getAsFile();
                if (file) {
                  e.preventDefault();
                  // Remove existing preview if any
                  var existingPreview = document.getElementById("sp-qd-paste-preview");
                  if (existingPreview) existingPreview.remove();
                  // Create preview
                  var previewDiv = document.createElement("div");
                  previewDiv.id = "sp-qd-paste-preview";
                  previewDiv.style.cssText = "margin:8px 0;padding:8px;border:1px solid #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
                  var imgUrl = URL.createObjectURL(file);
                  previewDiv.innerHTML = '<img src="' + imgUrl + '" style="max-width:80px;max-height:60px;border-radius:4px;border:1px solid #ddd;">' +
                    '<span style="flex:1;font-size:0.85rem;color:#333;">📋 Imagen del portapapeles</span>' +
                    '<button id="sp-qd-paste-send" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;">📎 Enviar imagen</button>' +
                    '<button id="sp-qd-paste-cancel" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>';
                  commentInputEl.parentElement.insertAdjacentElement("afterend", previewDiv);
                  // Send button
                  document.getElementById("sp-qd-paste-send").addEventListener("click", async function () {
                    var sendBtn = document.getElementById("sp-qd-paste-send");
                    sendBtn.textContent = "⏳ Subiendo...";
                    sendBtn.disabled = true;
                    try {
                      var timestamp = new Date().getTime();
                      var namedFile = new File([file], "clipboard_" + timestamp + ".png", { type: file.type });
                      // Post empty comment to get commentId, then attach file
                      var commentText = commentInputEl.value.trim() || "📎 Imagen adjunta";
                      var commentRes = await fetch(SP_API + "/" + ticketId + "/comment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                        body: JSON.stringify({ content: commentText, internal: false })
                      });
                      var commentJson = await commentRes.json();
                      var commentId = commentJson.data?.id || commentJson.id;
                      if (commentId) {
                        var formData = new FormData();
                        formData.append("file", namedFile);
                        await fetch(SP_API.replace("/tickets/web", "") + "/files", {
                          method: "POST",
                          headers: { authorization: "Bearer " + spToken },
                          body: formData
                        }).then(function (r) { return r.json(); }).then(async function (fileJson) {
                          var fileId = fileJson.data?.id || fileJson.id;
                          if (fileId) {
                            await fetch(SP_API + "/" + ticketId + "/comment/" + commentId + "/attachments", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", authorization: "Bearer " + spToken },
                              body: JSON.stringify({ fileIds: [fileId] })
                            });
                          }
                        });
                      }
                      commentInputEl.value = "";
                      previewDiv.remove();
                      URL.revokeObjectURL(imgUrl);
                      showSuccessToast("✅ Imagen enviada");
                      // Refresh comments
                      showQuickDetailModal(ticketId);
                    } catch (err) {
                      sendBtn.textContent = "❌ Error";
                      setTimeout(function () { sendBtn.textContent = "📎 Enviar imagen"; sendBtn.disabled = false; }, 2000);
                    }
                  });
                  // Cancel button
                  document.getElementById("sp-qd-paste-cancel").addEventListener("click", function () {
                    previewDiv.remove();
                    URL.revokeObjectURL(imgUrl);
                  });
                }
                break;
              }
            }
          });
          // Load suggested comments into all containers
          var suggestedContainers = ["sp-qd-suggested", "sp-qd-take-suggested", "sp-qd-close-suggested"];
          chrome.storage.local.get("suggestedComments", function (r) {
            var comments = r.suggestedComments || {};
            var groupId = getTeamConfig().resolutionGroupId;
            var groupComments = comments[groupId] || [];
            suggestedContainers.forEach(function (containerId) {
              var container = document.getElementById(containerId);
              if (!container) return;
              groupComments.forEach(function (c) {
                var chip = document.createElement("button");
                chip.textContent = c.text.substring(0, 40) + (c.text.length > 40 ? "..." : "");
                chip.title = c.text;
                var colors = stringToColor(c.text); chip.style.cssText = "padding:3px 8px;font-size:0.8rem;border:1px solid " + colors.border + ";border-radius:12px;background:" + colors.bg + ";color:" + colors.text + ";cursor:pointer;white-space:nowrap;";
                chip.addEventListener("click", function () {
                  var takeComment = document.getElementById("sp-qd-take-comment");
                  var takeCloseComment = document.getElementById("sp-qd-take-close-comment");
                  var closeComment = document.getElementById("sp-qd-close-comment");
                  if (takeCloseComment && takeCloseComment.offsetParent !== null) {
                    takeCloseComment.value = c.text;
                    takeCloseComment.focus();
                  } else if (closeComment && closeComment.offsetParent !== null) {
                    closeComment.value = c.text;
                    closeComment.focus();
                  } else if (takeComment && takeComment.offsetParent !== null) {
                    takeComment.value = c.text;
                    takeComment.focus();
                  } else if (commentInputEl) {
                    commentInputEl.value = c.text;
                    commentInputEl.focus();
                  }
                });
                container.appendChild(chip);
              });
            });
          });
        }

        // Add attachment to existing comment
        var _selectedCommentId = null;
        overlay.querySelectorAll(".sp-qd-add-attach").forEach(function (label) {
          var fileInput = label.querySelector("input[type=file]");
          var commentId = label.dataset.commentId;
          var commentDiv = label.closest(".sp-comment-bubble");

          // Make comment clickable to select it for paste
          if (commentDiv) {
            commentDiv.style.cursor = "pointer";
            commentDiv.addEventListener("click", function (e) {
              if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL" || e.target.tagName === "BUTTON") return;
              // Deselect others
              overlay.querySelectorAll("[data-sp-selected-comment]").forEach(function (el) {
                el.style.outline = "";
                el.removeAttribute("data-sp-selected-comment");
              });
              // Remove existing paste preview
              var existingPreview = document.getElementById("sp-qd-comment-paste-preview");
              if (existingPreview) existingPreview.remove();
              // Select this one
              if (_selectedCommentId === commentId) {
                _selectedCommentId = null;
                return;
              }
              _selectedCommentId = commentId;
              commentDiv.setAttribute("data-sp-selected-comment", "1");
              commentDiv.style.outline = "2px solid #1976D2";
            });
          }

          fileInput.addEventListener("change", async function () {
            if (!fileInput.files.length) return;
            var commentId = label.dataset.commentId;
            label.innerHTML = "⏳";
            try {
              var formData = new FormData();
              for (var i = 0; i < fileInput.files.length; i++) {
                formData.append("files", fileInput.files[i]);
              }
              var fileRes = await fetch("https://macropayapi.supportplus.mx/files", {
                method: "POST",
                headers: { authorization: "Bearer " + spToken },
                body: formData,
              });
              if (!fileRes.ok) throw new Error("HTTP " + fileRes.status);
              var fileJson = await fileRes.json();
              var uploadedFiles = fileJson.data || fileJson;
              if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                var attachPayload = uploadedFiles.map(function (f) { return { fileId: f.id }; });
                await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ attachments: attachPayload, commentId: parseInt(commentId), isInternal: false }),
                });
                showSuccessToast("Evidencia adjuntada");
                // Reload modal to show new attachments
                overlay.remove();
                showQuickDetailModal(ticketId);
              }
            } catch (err) {
              showErrorToast("Error: " + err.message);
              label.innerHTML = '📎<input type="file" multiple style="display:none;">';
            }
          });
        });

        // Paste image into selected comment
        overlay.addEventListener("paste", function (e) {
          if (!_selectedCommentId) return;
          var items = (e.clipboardData || e.originalEvent.clipboardData).items;
          for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
              var file = items[i].getAsFile();
              if (file) {
                e.preventDefault();
                // Remove existing preview
                var ep = document.getElementById("sp-qd-comment-paste-preview");
                if (ep) ep.remove();
                // Show preview below selected comment
                var selectedEl = overlay.querySelector("[data-sp-selected-comment]");
                if (!selectedEl) return;
                var imgUrl = URL.createObjectURL(file);
                var previewDiv = document.createElement("div");
                previewDiv.id = "sp-qd-comment-paste-preview";
                previewDiv.style.cssText = "margin:4px 0 8px;padding:8px;border:1px dashed #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
                previewDiv.innerHTML = '<img src="' + imgUrl + '" style="max-width:60px;max-height:50px;border-radius:4px;">' +
                  '<span style="flex:1;font-size:0.85rem;">Adjuntar al comentario</span>' +
                  '<button id="sp-qd-cpaste-send" style="padding:5px 10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;">📎 Enviar</button>' +
                  '<button id="sp-qd-cpaste-cancel" style="padding:5px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>';
                selectedEl.insertAdjacentElement("afterend", previewDiv);
                document.getElementById("sp-qd-cpaste-send").addEventListener("click", async function () {
                  var sendBtn = document.getElementById("sp-qd-cpaste-send");
                  sendBtn.textContent = "⏳";
                  sendBtn.disabled = true;
                  try {
                    var namedFile = new File([file], "clipboard_" + Date.now() + ".png", { type: file.type });
                    var formData = new FormData();
                    formData.append("files", namedFile);
                    var fileRes = await fetch("https://macropayapi.supportplus.mx/files", {
                      method: "POST",
                      headers: { authorization: "Bearer " + spToken },
                      body: formData,
                    });
                    var fileJson = await fileRes.json();
                    var uploadedFiles = fileJson.data || fileJson;
                    if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                      await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                        body: JSON.stringify({ attachments: [{ fileId: uploadedFiles[0].id }], commentId: parseInt(_selectedCommentId), isInternal: false }),
                      });
                      showSuccessToast("✅ Imagen adjuntada al comentario");
                      URL.revokeObjectURL(imgUrl);
                      overlay.remove();
                      showQuickDetailModal(ticketId);
                    }
                  } catch (err) {
                    sendBtn.textContent = "❌";
                    showErrorToast("Error: " + err.message);
                  }
                });
                document.getElementById("sp-qd-cpaste-cancel").addEventListener("click", function () {
                  previewDiv.remove();
                  URL.revokeObjectURL(imgUrl);
                });
              }
              break;
            }
          }
        });

        // Status change - load valid options from API
        var statusSelect = document.getElementById("sp-qd-status-select");
        var currentStatusId = t.ticketStatus?.id || 34;
        var isUnassigned = statusName === "En espera";

        if (!statusSelect) {
          // Closed state - no status select
        } else if (isUnassigned) {
          statusSelect.disabled = true;
          statusSelect.title = "Toma o asigna el ticket primero";
          statusSelect.innerHTML = '<option value="">' + statusName + '</option>';
        } else {
          fetch("https://macropayapi.supportplus.mx/ticket-status/next-status-options/" + currentStatusId, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function (r) { return r.json(); }).then(function (statusJson) {
            var options = (statusJson.data || []);
            statusSelect.innerHTML = '<option value="" data-id="">' + statusName + ' (actual)</option>';
            options.forEach(function (opt) {
              var ns = opt.nextStatus || {};
              statusSelect.innerHTML += '<option value="' + ns.id + '" data-name="' + (ns.name || opt.name) + '">' + (ns.name || opt.name) + '</option>';
            });
          }).catch(function () {
            statusSelect.innerHTML = '<option value="">' + statusName + '</option>';
          });
        }

        if (statusSelect) statusSelect.addEventListener("change", async function () {
          var selectedOpt = statusSelect.options[statusSelect.selectedIndex];
          var newStatusId = statusSelect.value;
          var newStatusName = selectedOpt.dataset.name || selectedOpt.textContent;
          if (!newStatusId) return;
          statusSelect.disabled = true;
          showLoadingToast("Cambiando estatus...");
          try {
            var statusRes = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({ nextTicketStatusId: parseInt(newStatusId), ticketCommentRequest: null }),
            });
            if (!statusRes.ok) throw new Error("HTTP " + statusRes.status);
            showSuccessToast("Estatus cambiado a: " + newStatusName);
            updateMondayStatus(ticketId, t.uniqueCode, newStatusName);
            statusSelect.style.color = STATUS_TEXT_COLORS[newStatusName] || "#333";
            // Reload valid options for new status
            var newOptRes = await fetch("https://macropayapi.supportplus.mx/ticket-status/next-status-options/" + newStatusId, {
              headers: { accept: "application/json", authorization: "Bearer " + spToken }
            });
            var newOptJson = await newOptRes.json();
            var newOptions = (newOptJson.data || []);
            statusSelect.innerHTML = '<option value="" data-id="">' + newStatusName + ' (actual)</option>';
            newOptions.forEach(function (opt) {
              var ns = opt.nextStatus || {};
              statusSelect.innerHTML += '<option value="' + ns.id + '" data-name="' + (ns.name || opt.name) + '">' + (ns.name || opt.name) + '</option>';
            });
          } catch (err) {
            showErrorToast("Error: " + err.message);
          }
          statusSelect.disabled = false;
        });

        // Take / Assign logic (only when unassigned)
        if (isUnassigned) {
          var assignSelect = document.getElementById("sp-qd-assign-select");
          var takeBtn = document.getElementById("sp-qd-take-btn");
          var takeDoneCheck = document.getElementById("sp-qd-take-done");
          var takeExtraDiv = document.getElementById("sp-qd-take-extra");
          var takeGroupSelect = document.getElementById("sp-qd-take-group");

          // Load team members from the ticket's resolution group
          var ticketGroupId = t.resolutionGroup?.id || getTeamConfig().resolutionGroupId;
          fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + ticketGroupId, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function (r) { return r.json(); }).then(function (json) {
            var profiles = json.data || json;
            if (Array.isArray(profiles)) {
              profiles.forEach(function (p) {
                var opt = document.createElement("option");
                opt.value = p.profileId;
                opt.textContent = p.profileFullName;
                opt.dataset.email = p.email || "";
                assignSelect.appendChild(opt);
              });
            }
          }).catch(function () { });

          // Toggle "Ticket realizado" extras
          takeDoneCheck.addEventListener("change", function () {
            takeExtraDiv.style.display = takeDoneCheck.checked ? "block" : "none";
            if (takeDoneCheck.checked) {
              var takeCloseCommentEl = document.getElementById("sp-qd-take-close-comment");
              if (takeCloseCommentEl) setTimeout(function () { takeCloseCommentEl.focus(); }, 50);
            }
          });

          // Load Monday groups for the select
          getMondayToken().then(function (mondayToken) {
            if (!mondayToken) return;
            getMondayBoardId().then(function (boardId) {
              if (!boardId) return;
              mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }', { boardId }).then(function (gData) {
                var groups = gData.boards[0]?.groups || [];
                groups.forEach(function (g) {
                  var opt = document.createElement("option");
                  opt.value = g.id;
                  opt.textContent = g.title;
                  takeGroupSelect.appendChild(opt);
                });
              }).catch(function () { });
            });
          });

          // Take button - just show the form, hide bottom comments
          var takeFormShown = false;
          takeBtn.addEventListener("click", function () {
            if (takeFormShown) return;
            takeFormShown = true;
            // Show take form
            var takeForm = document.getElementById("sp-qd-take-form");
            if (takeForm) takeForm.style.display = "block";
            // Hide assign select
            if (assignSelect) assignSelect.style.display = "none";
            // Hide bottom comment section
            var bottomComment = document.getElementById("sp-qd-comment-section");
            if (bottomComment) bottomComment.style.display = "none";
            // Change button appearance
            takeBtn.textContent = "🤚 Tomar";
            takeBtn.style.background = "#0D47A1";
            takeBtn.disabled = true;
            // Focus comment textarea
            var takeCommentEl = document.getElementById("sp-qd-take-comment");
            if (takeCommentEl) setTimeout(function () { takeCommentEl.focus(); takeCommentEl.select(); }, 50);
          });

          // Reject button - change status to Rechazado directly
          var rejectBtn = document.getElementById("sp-qd-reject-btn");
          if (rejectBtn) {
            rejectBtn.addEventListener("click", async function () {
              if (!confirm("¿Rechazar este ticket?")) return;
              rejectBtn.disabled = true;
              rejectBtn.textContent = "⏳...";
              try {
                var res = await fetch(SP_API + "/change-status/" + ticketId, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.RECHAZADO, ticketCommentRequest: null })
                });
                if (!res.ok) throw new Error("HTTP " + res.status);
                showSuccessToast("Ticket rechazado");
                overlay.remove();
                showQuickDetailModal(ticketId);
              } catch (err) {
                showErrorToast("Error: " + err.message);
                rejectBtn.disabled = false;
                rejectBtn.textContent = "❌ Rechazar";
              }
            });
          }

          // Cancel button - restore original state
          var takeCancelBtn = document.getElementById("sp-qd-take-cancel");
          if (takeCancelBtn) {
            takeCancelBtn.addEventListener("click", function () {
              takeFormShown = false;
              var takeForm = document.getElementById("sp-qd-take-form");
              if (takeForm) takeForm.style.display = "none";
              if (assignSelect) assignSelect.style.display = "";
              var bottomComment = document.getElementById("sp-qd-comment-section");
              if (bottomComment) bottomComment.style.display = "";
              takeBtn.textContent = "🤚 Tomar";
              takeBtn.style.background = "#1976D2";
              takeBtn.disabled = false;
            });
          }

          // File attachments for take form
          var takePendingFiles = [];
          var takeCloseFiles = [];
          var takeAttachInput = document.getElementById("sp-qd-take-attach");
          var takeAttachList = document.getElementById("sp-qd-take-attach-list");
          var takeCloseAttachInput = document.getElementById("sp-qd-take-close-attach");
          var takeCloseAttachList = document.getElementById("sp-qd-take-close-attach-list");

          function renderTakeFiles() {
            if (takeAttachList) {
              takeAttachList.innerHTML = "";
              takePendingFiles.forEach(function (f, idx) {
                var chip = document.createElement("span");
                chip.style.cssText = "padding:2px 6px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:3px;font-size:9px;color:#1565C0;display:flex;align-items:center;gap:3px;";
                chip.innerHTML = '📎 ' + f.name + ' <span style="cursor:pointer;color:#D32F2F;" data-idx="' + idx + '">✕</span>';
                chip.querySelector("span").addEventListener("click", function () { takePendingFiles.splice(idx, 1); renderTakeFiles(); });
                takeAttachList.appendChild(chip);
              });
            }
          }
          function renderTakeCloseFiles() {
            if (takeCloseAttachList) {
              takeCloseAttachList.innerHTML = "";
              takeCloseFiles.forEach(function (f, idx) {
                var chip = document.createElement("span");
                chip.style.cssText = "padding:2px 6px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:3px;font-size:9px;color:#1565C0;display:flex;align-items:center;gap:3px;";
                chip.innerHTML = '📎 ' + f.name + ' <span style="cursor:pointer;color:#D32F2F;" data-idx="' + idx + '">✕</span>';
                chip.querySelector("span").addEventListener("click", function () { takeCloseFiles.splice(idx, 1); renderTakeCloseFiles(); });
                takeCloseAttachList.appendChild(chip);
              });
            }
          }
          if (takeAttachInput) { takeAttachInput.addEventListener("change", function () { for (var i = 0; i < takeAttachInput.files.length; i++) takePendingFiles.push(takeAttachInput.files[i]); takeAttachInput.value = ""; renderTakeFiles(); }); }
          if (takeCloseAttachInput) { takeCloseAttachInput.addEventListener("change", function () { for (var i = 0; i < takeCloseAttachInput.files.length; i++) takeCloseFiles.push(takeCloseAttachInput.files[i]); takeCloseAttachInput.value = ""; renderTakeCloseFiles(); }); }

          // Paste image from clipboard into take textareas
          var takeCommentEl = document.getElementById("sp-qd-take-comment");
          var takeCloseCommentEl = document.getElementById("sp-qd-take-close-comment");
          if (takeCommentEl) {
            takeCommentEl.addEventListener("paste", function (e) {
              var items = (e.clipboardData || e.originalEvent.clipboardData).items;
              for (var i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") !== -1) { var f = items[i].getAsFile(); if (f) { takePendingFiles.push(new File([f], "clipboard_" + Date.now() + ".png", { type: f.type })); renderTakeFiles(); } e.preventDefault(); break; } }
            });
          }
          if (takeCloseCommentEl) {
            takeCloseCommentEl.addEventListener("paste", function (e) {
              var items = (e.clipboardData || e.originalEvent.clipboardData).items;
              for (var i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") !== -1) { var f = items[i].getAsFile(); if (f) { takeCloseFiles.push(new File([f], "clipboard_" + Date.now() + ".png", { type: f.type })); renderTakeCloseFiles(); } e.preventDefault(); break; } }
            });
          }

          // Confirm button - executes the take action
          var takeConfirmBtn = document.getElementById("sp-qd-take-confirm");
          if (takeConfirmBtn) {
            takeConfirmBtn.addEventListener("click", async function () {
              var comment = document.getElementById("sp-qd-take-comment").value.trim() || "se revisa";
              takeConfirmBtn.disabled = true;
              takeConfirmBtn.textContent = "⏳...";
              try {
                var myProfId = await getMyProfileId();
                if (!myProfId) throw new Error("No se pudo obtener tu perfil");

                // If there are files, post comment separately to get commentId for attachments
                if (takePendingFiles.length > 0) {
                  // Reassign without comment
                  var res = await fetch(SP_API + "/reassign/" + ticketId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ resolutionGroupId: t.resolutionGroup?.id, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: t.resolutionGroup?.name || "", value: t.resolutionGroup?.id } }),
                  });
                  if (!res.ok) throw new Error("HTTP " + res.status);
                  // Post comment separately
                  var commentRes = await fetch(SP_API + "/comment/" + ticketId, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ content: "<p>" + comment + "</p>", internal: false }),
                  });
                  var commentJson = await commentRes.json();
                  var commentId = commentJson.data?.id || commentJson.id;
                  // Upload files
                  if (commentId) {
                    var formData = new FormData();
                    takePendingFiles.forEach(function (f) { formData.append("files", f); });
                    var fileRes = await fetch("https://macropayapi.supportplus.mx/files", { method: "POST", headers: { authorization: "Bearer " + spToken }, body: formData });
                    if (fileRes.ok) {
                      var fileJson = await fileRes.json();
                      var uploadedFiles = fileJson.data || fileJson;
                      if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                        var attachPayload = uploadedFiles.map(function (f) { return { fileId: f.id }; });
                        await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", { method: "POST", headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken }, body: JSON.stringify({ attachments: attachPayload, commentId: commentId, isInternal: false }) });
                      }
                    }
                  }
                } else {
                  // No files - reassign with comment inline
                  var res = await fetch(SP_API + "/reassign/" + ticketId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ resolutionGroupId: t.resolutionGroup?.id, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: t.resolutionGroup?.name || "", value: t.resolutionGroup?.id }, ticketCommentRequest: { internal: false, content: comment } }),
                  });
                  if (!res.ok) throw new Error("HTTP " + res.status);
                  var json2 = await res.json();
                  if (!json2.success) throw new Error("No success");
                }

                if (takeDoneCheck.checked) {
                  var closeComment = document.getElementById("sp-qd-take-close-comment").value.trim();
                  if (closeComment || takeCloseFiles.length > 0) {
                    var closeCommentRes = await fetch(SP_API + "/comment/" + ticketId, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                      body: JSON.stringify({ content: "<p>" + (closeComment || "(archivo adjunto)") + "</p>", internal: false }),
                    });
                    // Upload close files if any
                    if (takeCloseFiles.length > 0) {
                      var closeCommentJson = await closeCommentRes.json();
                      var closeCommentId = closeCommentJson.data?.id || closeCommentJson.id;
                      if (closeCommentId) {
                        var formData2 = new FormData();
                        takeCloseFiles.forEach(function (f) { formData2.append("files", f); });
                        var fileRes2 = await fetch("https://macropayapi.supportplus.mx/files", { method: "POST", headers: { authorization: "Bearer " + spToken }, body: formData2 });
                        if (fileRes2.ok) {
                          var fileJson2 = await fileRes2.json();
                          var uploadedFiles2 = fileJson2.data || fileJson2;
                          if (Array.isArray(uploadedFiles2) && uploadedFiles2.length) {
                            var attachPayload2 = uploadedFiles2.map(function (f) { return { fileId: f.id }; });
                            await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", { method: "POST", headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken }, body: JSON.stringify({ attachments: attachPayload2, commentId: closeCommentId, isInternal: false }) });
                          }
                        }
                      }
                    }
                  }
                  await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO, ticketCommentRequest: null }),
                  });
                  var selectedGroup = takeGroupSelect ? takeGroupSelect.value : "";
                  showSuccessToast("Ticket tomado y cerrado");
                  updateMondayStatus(ticketId, t.uniqueCode, "Cerrado");
                } else {
                  showSuccessToast("Ticket tomado");
                  updateMondayStatus(ticketId, t.uniqueCode, "Asignado");
                  chrome.storage.local.get("userEmail", function (r) { if (r.userEmail) updateMondayPerson(ticketId, t.uniqueCode, r.userEmail); });
                }
                overlay.remove();
                showQuickDetailModal(ticketId);
              } catch (err) {
                showErrorToast("Error: " + err.message);
                takeConfirmBtn.disabled = false;
                takeConfirmBtn.textContent = "Confirmar";
              }
            });
          }

          // Assign select - assign to selected member
          assignSelect.addEventListener("change", async function () {
            var selectedId = assignSelect.value;
            if (!selectedId) return;
            var comment = document.getElementById("sp-qd-take-comment")?.value?.trim() || "se revisa";
            assignSelect.disabled = true;
            showLoadingToast("Asignando ticket...");
            try {
              var res = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ resolutionGroupId: t.resolutionGroup?.id, serviceId: null, responsibleProfileId: parseInt(selectedId), resolutionGroup: { label: t.resolutionGroup?.name || "", value: t.resolutionGroup?.id }, ticketCommentRequest: { internal: false, content: comment } }),
              });
              if (!res.ok) throw new Error("HTTP " + res.status);
              var json2 = await res.json();
              if (json2.success) {
                showSuccessToast("Ticket asignado");
                updateMondayStatus(ticketId, t.uniqueCode, "Asignado");
                var assignedOpt = assignSelect.options[assignSelect.selectedIndex];
                if (assignedOpt && assignedOpt.dataset.email) updateMondayPerson(ticketId, t.uniqueCode, assignedOpt.dataset.email);
                overlay.remove();
                showQuickDetailModal(ticketId);
              } else throw new Error("No success");
            } catch (err) {
              showErrorToast("Error: " + err.message);
              assignSelect.disabled = false;
              assignSelect.value = "";
            }
          });
        }

        // Close button - toggle inline form
        var closeActionBtn = document.getElementById("sp-qd-close-btn");
        var closeForm = document.getElementById("sp-qd-close-form");
        if (closeActionBtn && closeForm) {
          // Load Monday groups if not migrated
          var closeGroupSelect = document.getElementById("sp-qd-close-group");
          if (closeGroupSelect) {
            getMondayToken().then(function (mondayToken) {
              if (!mondayToken) return;
              getMondayBoardId().then(function (boardId) {
                if (!boardId) return;
                mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }', { boardId }).then(function (gData) {
                  var groups = gData.boards[0]?.groups || [];
                  groups.forEach(function (g) {
                    var opt = document.createElement("option");
                    opt.value = g.id;
                    opt.textContent = g.title;
                    closeGroupSelect.appendChild(opt);
                  });
                }).catch(function () { });
              });
            });
          }

          closeActionBtn.addEventListener("click", function () {
            closeForm.style.display = closeForm.style.display === "none" ? "block" : "none";
            // Hide bottom comment section when close form is shown
            var bottomComment = document.getElementById("sp-qd-comment-section");
            if (closeForm.style.display === "block") {
              if (bottomComment) bottomComment.style.display = "none";
            } else {
              if (bottomComment) bottomComment.style.display = "";
            }
          });

          // Cancel button for close form
          var closeCancelBtn = document.getElementById("sp-qd-close-cancel");
          if (closeCancelBtn) {
            closeCancelBtn.addEventListener("click", function () {
              closeForm.style.display = "none";
              var bottomComment = document.getElementById("sp-qd-comment-section");
              if (bottomComment) bottomComment.style.display = "";
            });
          }

          // File attachments for close form
          var closePendingFiles = [];
          var closeAttachInput = document.getElementById("sp-qd-close-attach");
          var closeAttachList = document.getElementById("sp-qd-close-attach-list");
          function renderCloseFiles() {
            if (closeAttachList) {
              closeAttachList.innerHTML = "";
              closePendingFiles.forEach(function (f, idx) {
                var chip = document.createElement("span");
                chip.style.cssText = "padding:2px 6px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:3px;font-size:9px;color:#1565C0;display:flex;align-items:center;gap:3px;";
                chip.innerHTML = '📎 ' + f.name + ' <span style="cursor:pointer;color:#D32F2F;" data-idx="' + idx + '">✕</span>';
                chip.querySelector("span").addEventListener("click", function () { closePendingFiles.splice(idx, 1); renderCloseFiles(); });
                closeAttachList.appendChild(chip);
              });
            }
          }
          if (closeAttachInput) { closeAttachInput.addEventListener("change", function () { for (var i = 0; i < closeAttachInput.files.length; i++) closePendingFiles.push(closeAttachInput.files[i]); closeAttachInput.value = ""; renderCloseFiles(); }); }

          // Paste image from clipboard into close textarea
          var closeCommentEl = document.getElementById("sp-qd-close-comment");
          if (closeCommentEl) {
            closeCommentEl.addEventListener("paste", function (e) {
              var items = (e.clipboardData || e.originalEvent.clipboardData).items;
              for (var i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") !== -1) { var f = items[i].getAsFile(); if (f) { closePendingFiles.push(new File([f], "clipboard_" + Date.now() + ".png", { type: f.type })); renderCloseFiles(); } e.preventDefault(); break; } }
            });
          }

          // Steal/Take button (when ticket assigned to someone else)
          var stealBtnEl = document.getElementById("sp-qd-steal-btn");
          if (stealBtnEl) {
            stealBtnEl.addEventListener("click", async function () {
              stealBtnEl.disabled = true;
              stealBtnEl.textContent = "⏳ Tomando...";
              try {
                var myProfId = await getMyProfileId();
                if (!myProfId) throw new Error("No se pudo obtener tu perfil");
                await fetch(SP_API + "/reassign/" + ticketId, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ resolutionGroupId: t.resolutionGroup?.id, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: t.resolutionGroup?.name || "", value: t.resolutionGroup?.id } }),
                });
                showSuccessToast("Ticket tomado");
                showQuickDetailModal(ticketId);
              } catch (e) {
                showErrorToast("Error: " + e.message);
                stealBtnEl.textContent = "🤚 Tomar";
                stealBtnEl.disabled = false;
              }
            });
          }

          var closeConfirmBtn = document.getElementById("sp-qd-close-confirm");
          if (closeConfirmBtn) {
            closeConfirmBtn.addEventListener("click", async function () {
              var closeComment = document.getElementById("sp-qd-close-comment").value.trim();
              var selectedGroup = closeGroupSelect ? closeGroupSelect.value : "";
              closeConfirmBtn.disabled = true;
              closeConfirmBtn.textContent = "⏳...";
              showLoadingToast("Cerrando ticket...");
              try {
                // Comment if provided (with file upload)
                if (closeComment || closePendingFiles.length > 0) {
                  var cRes = await fetch(SP_API + "/comment/" + ticketId, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ content: "<p>" + (closeComment || "(archivo adjunto)") + "</p>", internal: false }),
                  });
                  if (closePendingFiles.length > 0 && cRes.ok) {
                    var cJson = await cRes.json();
                    var cId = cJson.data?.id || cJson.id;
                    if (cId) {
                      var fd = new FormData();
                      closePendingFiles.forEach(function (f) { fd.append("files", f); });
                      var fRes = await fetch("https://macropayapi.supportplus.mx/files", { method: "POST", headers: { authorization: "Bearer " + spToken }, body: fd });
                      if (fRes.ok) {
                        var fJson = await fRes.json();
                        var uFiles = fJson.data || fJson;
                        if (Array.isArray(uFiles) && uFiles.length) {
                          await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", { method: "POST", headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken }, body: JSON.stringify({ attachments: uFiles.map(function (f) { return { fileId: f.id }; }), commentId: cId, isInternal: false }) });
                        }
                      }
                    }
                  }
                }
                // If no one assigned, assign to me first
                if (!holderName || holderName === "Sin asignar") {
                  var myProfId = await getMyProfileId();
                  if (myProfId) {
                    await fetch(SP_API + "/reassign/" + ticketId, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                      body: JSON.stringify({ resolutionGroupId: t.resolutionGroup?.id, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: t.resolutionGroup?.name || "", value: t.resolutionGroup?.id } }),
                    });
                  }
                }
                // Close
                var closeRes = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO, ticketCommentRequest: null }),
                });
                if (!closeRes.ok) throw new Error("HTTP " + closeRes.status);
                // Migrate if selected
                showSuccessToast("Ticket cerrado");
                updateMondayStatus(ticketId, t.uniqueCode, "Cerrado");
                overlay.remove();
                showQuickDetailModal(ticketId);
              } catch (err) {
                showErrorToast("Error: " + err.message);
                closeConfirmBtn.disabled = false;
                closeConfirmBtn.textContent = "Confirmar";
              }
            });
          }
        }

        // Migrate only button (removed - auto-migrate handles this)
        var migrateOnlyBtn = document.getElementById("sp-qd-migrate-btn");
        if (migrateOnlyBtn) {
          migrateOnlyBtn.style.display = "none";
        }

        // Reopen button - reassigns to current holder to reopen
        var reopenBtn = document.getElementById("sp-qd-reopen-btn");
        if (reopenBtn) {
          reopenBtn.addEventListener("click", async function () {
            // Get the holder's profileId from the ticket data
            var holderProfileId = t.ticketHolder?.ticketHolderLog ? null : null;
            // We need to find the profileId of the current holder
            var holderEmail = t.ticketHolder?.ticketHolderLog?.email || "";
            var teamConfigReopen = getTeamConfig();
            var holderProfile = teamConfigReopen.profiles ? teamConfigReopen.profiles.find(function (p) { return p.email === holderEmail; }) : null;
            var personId = holderProfile ? holderProfile.profileId : sessionProfileId;
            if (!personId) { showErrorToast("No se pudo determinar el analista"); return; }
            reopenBtn.disabled = true;
            reopenBtn.textContent = "⏳...";
            try {
              var res = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ resolutionGroupId: teamConfigReopen.resolutionGroupId, serviceId: null, responsibleProfileId: parseInt(personId), resolutionGroup: { label: teamConfigReopen.resolutionGroupLabel, value: teamConfigReopen.resolutionGroupId } }),
              });
              if (!res.ok) throw new Error("HTTP " + res.status);
              var json2 = await res.json();
              if (json2.success) {
                showSuccessToast("Ticket reabierto");
                updateMondayStatus(ticketId, t.uniqueCode, "Asignado");
                overlay.remove();
                showQuickDetailModal(ticketId);
              } else throw new Error("No success");
            } catch (err) {
              showErrorToast("Error: " + err.message);
              reopenBtn.disabled = false;
              reopenBtn.textContent = "🔓 Reabrir";
            }
          });
        }

        // View attachments in modal (carousel mode)
        var allAttachBtns = Array.from(overlay.querySelectorAll(".sp-qd-download"));
        console.log("[SP] Registering download listeners (carousel), found:", allAttachBtns.length);

        // Cache for loaded files: { fileId: { url, blob, byteArray, mimeType, fileName } }
        var attachCache = {};

        async function loadFileData(fileId, fileName) {
          if (attachCache[fileId]) return attachCache[fileId];
          var fileRes = await fetch("https://macropayapi.supportplus.mx/files/" + fileId, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          });
          if (!fileRes.ok) throw new Error("HTTP " + fileRes.status);
          var fileJson = await fileRes.json();
          var fileData = fileJson.data || fileJson;
          var base64Content = fileData.content;
          if (!base64Content) throw new Error("Sin contenido");

          var byteChars = atob(base64Content);
          var byteNumbers = new Array(byteChars.length);
          for (var i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          var byteArray = new Uint8Array(byteNumbers);

          var mimeType = "application/octet-stream";
          var ext = fileName.split(".").pop().toLowerCase();
          var mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", pdf: "application/pdf", zip: "application/zip", txt: "text/plain" };
          if (mimeMap[ext]) mimeType = mimeMap[ext];

          var blob = new Blob([byteArray], { type: mimeType });
          var url = URL.createObjectURL(blob);
          attachCache[fileId] = { url: url, blob: blob, byteArray: byteArray, mimeType: mimeType, fileName: fileName };
          return attachCache[fileId];
        }

        function buildFileContentHTML(fileName, url, byteArray) {
          var isImage = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(fileName);
          var isPdf = /\.pdf$/i.test(fileName);
          var isText = /\.(txt|sql|csv|json|xml|log|md|yml|yaml|ini|conf|sh|bat|ps1|py|js|ts|html|css|env)$/i.test(fileName);
          var contentHTML = '';
          var textContent = null;
          if (isImage) {
            contentHTML = '<img src="' + url + '" style="max-width:90vw;max-height:70vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:block;margin:0 auto;">';
          } else if (isPdf) {
            contentHTML = '<div style="display:flex;flex-direction:column;align-items:center;width:90vw;max-width:860px;"><div id="sp-pdf-viewer" style="width:100%;height:68vh;overflow:auto;background:#404040;border-radius:8px 8px 0 0;display:flex;flex-direction:column;align-items:center;padding:16px 0;gap:12px;"></div><div id="sp-pdf-controls" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 16px;background:rgba(30,30,30,0.9);border-radius:0 0 8px 8px;width:100%;box-sizing:border-box;"><button id="sp-pdf-prev-page" style="padding:5px 12px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;font-weight:500;transition:background 0.2s;">◀ Anterior</button><span id="sp-pdf-page-info" style="color:#ddd;font-size:12px;min-width:90px;text-align:center;">Cargando...</span><button id="sp-pdf-next-page" style="padding:5px 12px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;font-weight:500;transition:background 0.2s;">Siguiente ▶</button><span style="width:1px;height:18px;background:rgba(255,255,255,0.2);"></span><button id="sp-pdf-zoom-out" style="padding:5px 8px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;">−</button><span id="sp-pdf-zoom-info" style="color:#ddd;font-size:12px;min-width:40px;text-align:center;">130%</span><button id="sp-pdf-zoom-in" style="padding:5px 8px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;">+</button></div></div>';
          } else if (isText) {
            textContent = new TextDecoder("utf-8").decode(byteArray);
            var escaped = textContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            var extMatch = fileName.match(/\.([^.]+)$/);
            var ext = extMatch ? extMatch[1].toLowerCase() : "";
            var needsHighlight = ext === "sql" || ext === "js" || ext === "ts" || ext === "py" || ext === "json" || ext === "xml" || ext === "html" || ext === "css";

            if (needsHighlight) {
              var highlighted = escaped;
              if (ext === "sql") {
                // --- SQL Linter ---
                var sqlErrors = [];
                var rawLines = textContent.split("\n");
                // Strip comments for analysis
                var cleanedSQL = textContent.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

                // 1. Unbalanced parentheses
                var parenCount = 0;
                rawLines.forEach(function (line, idx) {
                  var lineClean = line.replace(/--.*$/, "").replace(/'[^']*'/g, "");
                  for (var c = 0; c < lineClean.length; c++) {
                    if (lineClean[c] === "(") parenCount++;
                    if (lineClean[c] === ")") parenCount--;
                    if (parenCount < 0) { sqlErrors.push({ line: idx + 1, msg: "Paréntesis ')' sin abrir" }); parenCount = 0; }
                  }
                });
                if (parenCount > 0) sqlErrors.push({ line: rawLines.length, msg: "Faltan " + parenCount + " paréntesis de cierre ')'" });

                // 2. Unclosed strings
                var inString = false;
                rawLines.forEach(function (line, idx) {
                  var lineNoComment = line.replace(/--.*$/, "");
                  for (var c = 0; c < lineNoComment.length; c++) {
                    if (lineNoComment[c] === "'") {
                      if (inString && lineNoComment[c + 1] === "'") { c++; continue; }
                      inString = !inString;
                    }
                  }
                  if (inString) { sqlErrors.push({ line: idx + 1, msg: "String sin cerrar (comilla simple)" }); inString = false; }
                });

                // 3. SELECT without FROM (unless it's SELECT @var or SELECT value with no table)
                var selectMatches = cleanedSQL.match(/\bSELECT\b(?![\s\S]*?\bFROM\b)(?![\s]*@)(?![\s]*\d)(?![\s]*')/gi);
                // Simplified: check each SELECT...FROM pair
                var statements = cleanedSQL.split(/\bGO\b|\b;\s*\n/gi);
                statements.forEach(function (stmt) {
                  var trimmed = stmt.trim().toUpperCase();
                  if (trimmed.match(/^\s*SELECT\b/) && !trimmed.match(/\bFROM\b/) && !trimmed.match(/SELECT\s+@/) && !trimmed.match(/SELECT\s+\d/) && trimmed.length > 20) {
                    var stmtStart = textContent.indexOf(stmt.trim().substring(0, 30));
                    if (stmtStart >= 0) {
                      var lineNum = textContent.substring(0, stmtStart).split("\n").length;
                      sqlErrors.push({ line: lineNum, msg: "SELECT sin FROM" });
                    }
                  }
                });

                // 4. BEGIN without END
                var beginCount = (cleanedSQL.match(/\bBEGIN\b/gi) || []).length;
                var endCount = (cleanedSQL.match(/\bEND\b/gi) || []).length;
                if (beginCount > endCount) sqlErrors.push({ line: rawLines.length, msg: "Faltan " + (beginCount - endCount) + " END para cerrar BEGIN" });
                if (endCount > beginCount) sqlErrors.push({ line: rawLines.length, msg: (endCount - beginCount) + " END sin BEGIN correspondiente" });

                // 5. Trailing comma before FROM or closing paren
                rawLines.forEach(function (line, idx) {
                  var lineClean = line.replace(/--.*$/, "").trim();
                  if (/,\s*$/.test(lineClean)) {
                    var nextLine = (rawLines[idx + 1] || "").replace(/--.*$/, "").trim().toUpperCase();
                    if (/^(FROM|WHERE|\))/.test(nextLine)) {
                      sqlErrors.push({ line: idx + 1, msg: "Coma al final antes de " + nextLine.split(/\s/)[0] });
                    }
                  }
                });

                // 6. UPDATE without SET
                statements.forEach(function (stmt) {
                  var trimmed = stmt.trim().toUpperCase();
                  if (trimmed.match(/^\s*UPDATE\b/) && !trimmed.match(/\bSET\b/)) {
                    var stmtStart = textContent.indexOf(stmt.trim().substring(0, 20));
                    if (stmtStart >= 0) {
                      var lineNum = textContent.substring(0, stmtStart).split("\n").length;
                      sqlErrors.push({ line: lineNum, msg: "UPDATE sin SET" });
                    }
                  }
                });

                // 7. INSERT INTO without VALUES/SELECT/EXEC
                statements.forEach(function (stmt) {
                  var trimmed = stmt.trim().toUpperCase();
                  if (trimmed.match(/^\s*INSERT\s+INTO\b/) && !trimmed.match(/\bVALUES\b/) && !trimmed.match(/\bSELECT\b/) && !trimmed.match(/\bEXEC\b/)) {
                    var stmtStart = textContent.indexOf(stmt.trim().substring(0, 20));
                    if (stmtStart >= 0) {
                      var lineNum = textContent.substring(0, stmtStart).split("\n").length;
                      sqlErrors.push({ line: lineNum, msg: "INSERT INTO sin VALUES/SELECT" });
                    }
                  }
                });

                // Build error line set for highlighting
                var errorLines = {};
                sqlErrors.forEach(function (e) { errorLines[e.line] = e.msg; });

                // Apply syntax highlighting with error lines marked
                var lines = escaped.split("\n");
                highlighted = lines.map(function (line, idx) {
                  var lineNum = idx + 1;
                  var hl = line;
                  // Apply SQL syntax highlighting
                  hl = hl.replace(/\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|BEGIN|END|IF|ELSE|THEN|CASE|WHEN|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|UNION|ALL|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|TOP|VALUES|EXEC|EXECUTE|DECLARE|VARCHAR|INT|BIGINT|NVARCHAR|DATETIME|BIT|FLOAT|DECIMAL|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|IDENTITY|GO|USE|DATABASE|SCHEMA|GRANT|REVOKE|COMMIT|ROLLBACK|TRANSACTION|WITH|NOLOCK|COUNT|SUM|AVG|MAX|MIN|COALESCE|ISNULL|CAST|CONVERT|GETDATE|DATEADD|DATEDIFF|LEN|SUBSTRING|REPLACE|TRIM|UPPER|LOWER|ROW_NUMBER|OVER|PARTITION|RANK|DENSE_RANK|LAG|LEAD|MERGE|OUTPUT|INSERTED|DELETED|CURSOR|FETCH|NEXT|OPEN|CLOSE|DEALLOCATE|PRINT|RAISERROR|TRY|CATCH|THROW|RETURN|WHILE|BREAK|CONTINUE|TEMP|TEMPORARY|TRUNCATE|ASC|DESC|HAVING|EXCEPT|INTERSECT)\b/gi, '<span style="color:#569CD6;">$1</span>');
                  hl = hl.replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#CE9178;">$1</span>');
                  hl = hl.replace(/(--[^\n]*)/g, '<span style="color:#6A9955;">$1</span>');
                  hl = hl.replace(/\b(\d+)\b/g, '<span style="color:#B5CEA8;">$1</span>');

                  if (errorLines[lineNum]) {
                    return '<span style="background:rgba(255,0,0,0.15);border-left:3px solid #F44336;display:inline-block;width:100%;padding-left:4px;" title="⚠️ ' + errorLines[lineNum] + '">' + hl + '</span>';
                  }
                  return hl;
                }).join("\n");

                // Build error panel if there are errors
                var errorPanelHTML = "";
                if (sqlErrors.length) {
                  errorPanelHTML = '<div style="background:#2d1515;border:1px solid #F44336;border-radius:6px;padding:8px 12px;margin-bottom:8px;max-height:120px;overflow:auto;width:90vw;box-sizing:border-box;">' +
                    '<div style="color:#F44336;font-weight:600;font-size:11px;margin-bottom:4px;">⚠️ ' + sqlErrors.length + ' posible' + (sqlErrors.length > 1 ? 's' : '') + ' error' + (sqlErrors.length > 1 ? 'es' : '') + ' de sintaxis:</div>';
                  sqlErrors.forEach(function (e) {
                    errorPanelHTML += '<div style="color:#ef9a9a;font-size:11px;font-family:Consolas,monospace;padding:1px 0;">Línea ' + e.line + ': ' + e.msg + '</div>';
                  });
                  errorPanelHTML += '</div>';
                }

                contentHTML = errorPanelHTML + '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:' + (sqlErrors.length ? '65vh' : '75vh') + ';overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' + highlighted + '</pre></div>';
              } else if (ext === "json") {
                highlighted = highlighted.replace(/(&quot;[^&]*?&quot;)\s*:/g, '<span style="color:#9CDCFE;">$1</span>:');
                highlighted = highlighted.replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span style="color:#CE9178;">$1</span>');
                highlighted = highlighted.replace(/:\s*(true|false|null|\d+\.?\d*)/g, ': <span style="color:#B5CEA8;">$1</span>');
              } else if (ext === "js" || ext === "ts") {
                highlighted = highlighted.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|typeof|instanceof)\b/g, '<span style="color:#569CD6;">$1</span>');
                highlighted = highlighted.replace(/(\/\/[^\n]*)/g, '<span style="color:#6A9955;">$1</span>');
                highlighted = highlighted.replace(/(&quot;[^&]*?&quot;|&apos;[^&]*?&apos;)/g, '<span style="color:#CE9178;">$1</span>');
              } else if (ext === "py") {
                highlighted = highlighted.replace(/\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|True|False|None|self|print|lambda|yield|raise|pass|break|continue)\b/g, '<span style="color:#569CD6;">$1</span>');
                highlighted = highlighted.replace(/(#[^\n]*)/g, '<span style="color:#6A9955;">$1</span>');
              } else if (ext === "xml" || ext === "html") {
                highlighted = highlighted.replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g, '<span style="color:#569CD6;">$1</span>');
                highlighted = highlighted.replace(/(\s[a-zA-Z-]+)=/g, '<span style="color:#9CDCFE;">$1</span>=');
                highlighted = highlighted.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span style="color:#6A9955;">$1</span>');
              } else if (ext === "css") {
                highlighted = highlighted.replace(/([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/g, '<span style="color:#D7BA7D;">$1</span> {');
                highlighted = highlighted.replace(/([a-z-]+)\s*:/g, '<span style="color:#9CDCFE;">$1</span>:');
              }
              if (ext !== "sql") {
                contentHTML = '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:75vh;overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' + highlighted + '</pre></div>';
              }
            } else {
              contentHTML = '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:75vh;overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' + escaped + '</pre></div>';
            }
          } else if (/\.(xlsx|xls)$/i.test(fileName)) {
            // Excel preview using SheetJS (loaded as content script)
            try {
              var wb = XLSX.read(byteArray, { type: "array" });
              var ws = wb.Sheets[wb.SheetNames[0]];
              var htmlTable = XLSX.utils.sheet_to_html(ws, { editable: false });
              contentHTML = '<div style="max-height:75vh;max-width:90vw;overflow:auto;background:#fff;border-radius:8px;padding:8px;">' +
                '<div style="font-size:11px;color:#888;margin-bottom:8px;">Hoja: ' + esc(wb.SheetNames[0]) + (wb.SheetNames.length > 1 ? ' (' + wb.SheetNames.length + ' hojas)' : '') + '</div>' +
                '<style>.sp-excel-table table{border-collapse:collapse;font-size:11px;font-family:Consolas,monospace;} .sp-excel-table td,.sp-excel-table th{border:1px solid #ddd;padding:3px 6px;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;}</style>' +
                '<div class="sp-excel-table">' + htmlTable + '</div></div>';
            } catch (e) {
              contentHTML = '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;color:#D94040;">Error al leer el archivo Excel</div>';
            }
          } else {
            contentHTML = '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 12px;font-size:14px;">No se puede previsualizar: <b>' + esc(fileName) + '</b></p><a href="' + url + '" download="' + fileName + '" style="padding:8px 16px;background:#1976D2;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">📥 Descargar</a></div>';
          }
          return { html: contentHTML, textContent: textContent, isText: isText, isPdf: isPdf, byteArray: byteArray };
        }

        function openCarousel(startIndex) {
          var currentIndex = startIndex;
          var totalFiles = allAttachBtns.length;
          var currentUrl = null;
          var currentTextContent = null;

          var fileModal = document.createElement("div");
          fileModal.id = "sp-carousel-modal";
          fileModal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background 0.3s ease;";
          fileModal.innerHTML = '<div class="sp-file-content" style="transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;display:flex;flex-direction:column;align-items:center;width:100%;"><div id="sp-carousel-header" style="display:flex;justify-content:space-between;align-items:center;width:90vw;margin-bottom:8px;gap:8px;"></div><div id="sp-carousel-body" style="display:flex;align-items:center;justify-content:center;width:100%;position:relative;min-height:200px;"></div></div>';
          document.body.appendChild(fileModal);

          requestAnimationFrame(function () {
            fileModal.style.background = "rgba(0,0,0,.85)";
            var contentEl = fileModal.querySelector(".sp-file-content");
            if (contentEl) { contentEl.style.transform = "scale(1) translateY(0)"; contentEl.style.opacity = "1"; }
          });

          function closeCarousel() {
            var contentEl = fileModal.querySelector(".sp-file-content");
            if (contentEl) { contentEl.style.transform = "scale(0.9) translateY(10px)"; contentEl.style.opacity = "0"; }
            fileModal.style.background = "rgba(0,0,0,0)";
            document.removeEventListener("keydown", handleKeys);
            setTimeout(function () { fileModal.remove(); }, 250);
          }

          function renderHeader(fileName, url, isText) {
            var header = fileModal.querySelector("#sp-carousel-header");
            var counterHTML = totalFiles > 1 ? '<span style="color:#fff;font-size:13px;font-weight:600;">' + (currentIndex + 1) + ' / ' + totalFiles + '</span>' : '';
            var copyBtn = isText ? '<button id="sp-file-copy-text" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">📋 Copiar</button>' : '';
            header.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' + counterHTML + '<span style="color:#ccc;font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(fileName) + '">' + esc(fileName) + '</span></div><div style="display:flex;gap:8px;">' + copyBtn + '<a href="' + url + '" download="' + fileName + '" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;text-decoration:none;">📥 Descargar</a><button id="sp-file-close" style="padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;">✕ Cerrar</button></div>';
            fileModal.querySelector("#sp-file-close").addEventListener("click", closeCarousel);
            var copyTextBtn = fileModal.querySelector("#sp-file-copy-text");
            if (copyTextBtn && currentTextContent) {
              copyTextBtn.addEventListener("click", function () {
                navigator.clipboard.writeText(currentTextContent).then(function () {
                  copyTextBtn.textContent = "✅ Copiado";
                  setTimeout(function () { copyTextBtn.textContent = "📋 Copiar"; }, 2000);
                });
              });
            }
          }

          function renderBody(contentHTML) {
            var body = fileModal.querySelector("#sp-carousel-body");
            var navPrevHTML = totalFiles > 1 ? '<button id="sp-carousel-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.15)\'">◀</button>' : '';
            var navNextHTML = totalFiles > 1 ? '<button id="sp-carousel-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.15)\'">▶</button>' : '';
            body.innerHTML = navPrevHTML + '<div style="display:flex;align-items:center;justify-content:center;width:90vw;">' + contentHTML + '</div>' + navNextHTML;

            var prevBtn = fileModal.querySelector("#sp-carousel-prev");
            var nextBtn = fileModal.querySelector("#sp-carousel-next");
            if (prevBtn) prevBtn.addEventListener("click", function (e) { e.stopPropagation(); navigateTo(currentIndex - 1); });
            if (nextBtn) nextBtn.addEventListener("click", function (e) { e.stopPropagation(); navigateTo(currentIndex + 1); });
          }

          function showLoading() {
            var body = fileModal.querySelector("#sp-carousel-body");
            body.innerHTML = '<div style="color:#fff;font-size:16px;display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.8s linear infinite;"></div><span>Cargando archivo...</span></div>';
            if (!document.getElementById("sp-carousel-spin-style")) {
              var style = document.createElement("style");
              style.id = "sp-carousel-spin-style";
              style.textContent = "@keyframes sp-spin { to { transform: rotate(360deg); } }";
              document.head.appendChild(style);
            }
          }

          async function renderPdfViewer(pdfByteArray) {
            if (typeof pdfjsLib === "undefined") return;
            // Worker code is loaded in same scope (content script), PDF.js will use it directly
            pdfjsLib.GlobalWorkerOptions.workerSrc = "";
            var loadingTask = pdfjsLib.getDocument({ data: pdfByteArray });

            var pdfContainer = fileModal.querySelector("#sp-pdf-viewer");
            var pageInfoEl = fileModal.querySelector("#sp-pdf-page-info");
            var zoomInfoEl = fileModal.querySelector("#sp-pdf-zoom-info");
            var prevPageBtn = fileModal.querySelector("#sp-pdf-prev-page");
            var nextPageBtn = fileModal.querySelector("#sp-pdf-next-page");
            var zoomInBtn = fileModal.querySelector("#sp-pdf-zoom-in");
            var zoomOutBtn = fileModal.querySelector("#sp-pdf-zoom-out");
            if (!pdfContainer) return;

            var pdfDoc = null;
            var currentPage = 1;
            var totalPages = 0;
            var scale = 1.3;

            function updatePageInfo() {
              if (pageInfoEl) pageInfoEl.textContent = "Página " + currentPage + " / " + totalPages;
              if (zoomInfoEl) zoomInfoEl.textContent = Math.round(scale * 100) + "%";
            }

            function renderPage(num) {
              pdfDoc.getPage(num).then(function (page) {
                var viewport = page.getViewport({ scale: scale });
                var canvas = document.createElement("canvas");
                canvas.style.cssText = "display:block;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                var ctx = canvas.getContext("2d");
                page.render({ canvasContext: ctx, viewport: viewport });
                return canvas;
              }).then(function (canvas) {
                // Append canvas (keep all pages rendered)
                pdfContainer.appendChild(canvas);
              });
            }

            function renderAllPages() {
              pdfContainer.innerHTML = "";
              for (var i = 1; i <= totalPages; i++) {
                renderPage(i);
              }
              updatePageInfo();
            }

            function goToPage(num) {
              if (num < 1) num = 1;
              if (num > totalPages) num = totalPages;
              currentPage = num;
              var canvases = pdfContainer.querySelectorAll("canvas");
              if (canvases[num - 1]) {
                canvases[num - 1].scrollIntoView({ behavior: "smooth", block: "start" });
              }
              updatePageInfo();
            }

            // Load PDF
            loadingTask.promise.then(function (pdf) {
              pdfDoc = pdf;
              totalPages = pdf.numPages;
              currentPage = 1;
              renderAllPages();
            }).catch(function (err) {
              pdfContainer.innerHTML = '<p style="color:#fff;text-align:center;padding:20px;">Error al cargar PDF: ' + (err.message || err) + '</p>';
            });

            // Controls
            if (prevPageBtn) prevPageBtn.addEventListener("click", function (e) { e.stopPropagation(); goToPage(currentPage - 1); });
            if (nextPageBtn) nextPageBtn.addEventListener("click", function (e) { e.stopPropagation(); goToPage(currentPage + 1); });
            if (zoomInBtn) zoomInBtn.addEventListener("click", function (e) { e.stopPropagation(); scale = Math.min(scale + 0.25, 3); renderAllPages(); });
            if (zoomOutBtn) zoomOutBtn.addEventListener("click", function (e) { e.stopPropagation(); scale = Math.max(scale - 0.25, 0.5); renderAllPages(); });

            // Scroll tracking to update current page
            pdfContainer.addEventListener("scroll", function () {
              var canvases = pdfContainer.querySelectorAll("canvas");
              var containerTop = pdfContainer.scrollTop;
              for (var i = 0; i < canvases.length; i++) {
                if (canvases[i].offsetTop + canvases[i].height / 2 > containerTop) {
                  currentPage = i + 1;
                  updatePageInfo();
                  break;
                }
              }
            });
          }

          async function navigateTo(index) {
            if (index < 0) index = totalFiles - 1;
            if (index >= totalFiles) index = 0;
            currentIndex = index;

            var btn = allAttachBtns[currentIndex];
            var fileId = btn.dataset.fileId;
            var fileName = btn.dataset.fileName;

            showLoading();
            renderHeader(fileName, "", false);

            try {
              var data = await loadFileData(fileId, fileName);
              var result = buildFileContentHTML(fileName, data.url, data.byteArray);
              currentTextContent = result.textContent;
              currentUrl = data.url;
              renderHeader(fileName, data.url, result.isText);
              renderBody(result.html);

              // Render PDF with PDF.js
              if (result.isPdf && typeof pdfjsLib !== "undefined") {
                await renderPdfViewer(result.byteArray);
              }
            } catch (err) {
              var body = fileModal.querySelector("#sp-carousel-body");
              body.innerHTML = '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 8px;color:#c62828;font-size:14px;">❌ Error al cargar: ' + esc(fileName) + '</p><p style="margin:0;color:#666;font-size:12px;">' + esc(err.message) + '</p></div>';
            }
          }

          function handleKeys(e) {
            if (e.key === "Escape") { closeCarousel(); e.preventDefault(); e.stopImmediatePropagation(); }
            if (e.key === "ArrowLeft" && totalFiles > 1) { navigateTo(currentIndex - 1); e.preventDefault(); }
            if (e.key === "ArrowRight" && totalFiles > 1) { navigateTo(currentIndex + 1); e.preventDefault(); }
          }
          document.addEventListener("keydown", handleKeys);

          fileModal.addEventListener("click", function (e) { if (e.target === fileModal) closeCarousel(); });

          // Load first file
          navigateTo(currentIndex);
        }

        allAttachBtns.forEach(function (btn, idx) {
          btn.addEventListener("click", function () {
            openCarousel(idx);
          });
        });

      } catch (err) {
        showErrorToast("Error: " + err.message);
      }
    }

    function makeWaitingRowsDraggable() {
      document.querySelectorAll(".MuiDataGrid-row").forEach(function (row) {
        var ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        var statusCell = row.querySelector('[data-field="ticketStatusName"]');
        if (!statusCell || statusCell.textContent.trim() !== "En espera") return;
        var folioEl = row.querySelector('[data-field="uniqueCode"] p.MuiTypography-body1');
        if (!folioEl || folioEl.getAttribute("draggable") === "true") return;

        folioEl.setAttribute("draggable", "true");
        folioEl.style.cursor = "grab";
        folioEl.addEventListener("dragstart", function (e) {
          e.dataTransfer.setData("text/plain", ticketId);
          e.dataTransfer.effectAllowed = "move";
          row.style.opacity = "0.4";
        });
        folioEl.addEventListener("dragend", function () {
          row.style.opacity = "1";
        });
      });
    }

    // Inject folio buttons only (clickable folio + copy) - works without session
    function injectFolioButtons() {
      if (isDetailView()) return;
      document.querySelectorAll(".MuiDataGrid-row").forEach(function(row) {
        var ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        var firstCell = row.querySelector('[data-field="uniqueCode"]');
        if (!firstCell) return;
        var container = firstCell.querySelector(".MuiBox-root") || firstCell;
        if (!row.querySelector(".sp-copy-btn")) {
          var codeEl = firstCell.querySelector("p.MuiTypography-body1");
          var codeText = codeEl ? codeEl.textContent.trim() : "";
          if (codeText) container.appendChild(createCopyButton(codeText));
        }
        if (!row.querySelector("." + DETAIL_QUICK_CLASS)) {
          var folioEl = container.querySelector("p.MuiTypography-body1");
          if (folioEl) {
            var folioText = folioEl.textContent.trim();
            var btn = document.createElement("button");
            btn.className = DETAIL_QUICK_CLASS + " MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
            btn.textContent = folioText;
            btn.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
            btn.addEventListener("click", function(e) { e.stopPropagation(); e.preventDefault(); showQuickDetailModal(ticketId); });
            folioEl.replaceWith(btn);
          }
        }
      });
    }
    // Also run on DOM changes for SPA navigation (independent of session)
    var _folioObserver = new MutationObserver(function() { injectFolioButtons(); });
    _folioObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectFolioButtons, 500);

    // Inject row buttons and basic header (no Notion dependency)
    function injectButtonsImmediate() {
      injectConfigButton();
      injectSearchButton();
      injectQuickSearch();
      injectUpdateButton();

      if (isDetailView()) return;

      // Row buttons for the data grid
      const rows = document.querySelectorAll(".MuiDataGrid-row");
      rows.forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const statusCell = row.querySelector('[data-field="ticketStatusName"]');
        const statusText = statusCell ? statusCell.textContent.trim() : "";
        const firstCell = row.querySelector('[data-field="uniqueCode"]');
        if (!firstCell) return;
        var container = firstCell.querySelector(".MuiBox-root") || firstCell;

        // Inject copy button if not present
        if (!row.querySelector(".sp-copy-btn")) {
          const codeEl = firstCell.querySelector("p.MuiTypography-body1");
          const codeText = codeEl ? codeEl.textContent.trim() : "";
          if (codeText) container.appendChild(createCopyButton(codeText));
        }

        // Replace folio text with clickable button
        if (!row.querySelector("." + DETAIL_QUICK_CLASS)) {
          var folioEl = container.querySelector("p.MuiTypography-body1");
          if (folioEl) {
            var folioText = folioEl.textContent.trim();
            var btn = document.createElement("button");
            btn.className = DETAIL_QUICK_CLASS + " MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
            btn.textContent = folioText;
            btn.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              e.preventDefault();
              showQuickDetailModal(ticketId);
            });
            folioEl.replaceWith(btn);
          }
        }
      });
      highlightMyRows();
      colorRowsByStatus();
    }

    async function injectButtons() {
      // Basic buttons + row buttons (immediate)
      injectButtonsImmediate();

      // Then load permission-dependent buttons after sync
      const synced = await ensureSyncStarted();
      var boardDate = await getBoardDate();

      // Permission-dependent header buttons
      injectDashboardButton();
      injectWaterButton();
      injectSuggestedCommentsButton();
      injectReportButton();
      injectQuickFilterButton();

      if (isDetailView()) {
        injectDetailButton();
        injectIamButton();
        injectDetailDetections();
        injectReassignAppButton();
        // Sync this ticket to Monday (detail view)
        var detailTicketId = window.location.pathname.match(/\/tickets\/(\d+)/);
        if (detailTicketId) {
          (async function () {
            try {
              var spToken = getToken();
              var mondayToken = await getMondayToken();
              if (!spToken || !mondayToken) return;
              var res = await fetch(SP_API + "/" + detailTicketId[1], { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
              if (!res.ok) return;
              var ticket = (await res.json()).data;
              if (!ticket || !ticket.uniqueCode) return;
              var spStatus = (ticket.ticketStatusName || "").toLowerCase();
              var holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
              // Find in Monday
              var ticketBoards = await getMondayTicketBoards(mondayToken);
              for (var b of ticketBoards) {
                var itemRes = await mondayQuery(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: ticket.uniqueCode });
                var items = itemRes.items_page_by_column_values?.items || [];
                if (items.length) {
                  var colValues = {};
                  var mondayStatusIndex = mapStatusToMonday(spStatus);
                  colValues.status = { index: mondayStatusIndex };
                  if (holderEmail) {
                    var users = await getMondayUsers(mondayToken);
                    var userId = users[holderEmail.toLowerCase()];
                    if (userId) colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
                  }
                  await mondayQuery(mondayToken, 'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: b.id, itemId: items[0].id, columnValues: JSON.stringify(colValues) });
                  console.log("[SP] Detail view synced to Monday:", ticket.uniqueCode);
                  break;
                }
              }
            } catch (e) { }
          })();
        }
        return;
      }

      const rows = document.querySelectorAll(".MuiDataGrid-row");
      rows.forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const statusCell = row.querySelector('[data-field="ticketStatusName"]');
        const statusText = statusCell ? statusCell.textContent.trim() : "";
        const firstCell = row.querySelector('[data-field="uniqueCode"]');
        if (!firstCell) return;
        const container = firstCell.querySelector(".MuiBox-root") || firstCell;

        // Clean up stale buttons if status changed
        if (statusText !== "En espera") {
          const oldTake = row.querySelector("." + TAKE_BTN_CLASS);
          if (oldTake) oldTake.remove();
        }
        if (statusText !== "Cerrado") {
          const oldMigrate = row.querySelector("." + BTN_CLASS);
          if (oldMigrate) oldMigrate.remove();
        }
        if (statusText !== "Asignado") {
          const oldSteal = row.querySelector("." + STEAL_BTN_CLASS);
          if (oldSteal) oldSteal.remove();
        }
        // Clean up close button if status changed to Cerrado
        if (statusText === "Cerrado") {
          const oldClose = row.querySelector("." + CLOSE_BTN_CLASS);
          if (oldClose) oldClose.remove();
        }

        // Remove any leftover row action buttons (now handled in ticket modal)
        var oldTakeBtn = row.querySelector("." + TAKE_BTN_CLASS); if (oldTakeBtn) oldTakeBtn.remove();
        var oldStealBtn = row.querySelector("." + STEAL_BTN_CLASS); if (oldStealBtn) oldStealBtn.remove();
        var oldCloseBtn = row.querySelector("." + CLOSE_BTN_CLASS); if (oldCloseBtn) oldCloseBtn.remove();

        // Auto-migrate logic
        var rowGroupCell = row.querySelector('[data-field="resolutionGroupName"]');
        var rowGroupName = rowGroupCell ? rowGroupCell.textContent.trim() : "";
        var rowBelongsToMe = !rowGroupName || rowGroupName === getTeamConfig().resolutionGroupLabel || isMultiGroup();

        // Auto-migrate disabled from rows - handled exclusively by monday-sync.js
        // Only show synced badge if ticket is already in cache
        if (rowBelongsToMe) {
          if (row.querySelector("." + SYNCED_CLASS)) return;
          const codeEl = firstCell.querySelector("p.MuiTypography-body1");
          const uniqueCode = codeEl ? codeEl.textContent.trim() : "";
          if (uniqueCode && synced[uniqueCode]) {
            var oldBtn = row.querySelector("." + BTN_CLASS);
            if (oldBtn) oldBtn.remove();
            if (!row.querySelector("." + SYNCED_CLASS)) {
              container.appendChild(createSyncedBadge(synced[uniqueCode]));
            }
          }
        }
      });
      highlightMyRows();
      colorRowsByStatus();
      makeWaitingRowsDraggable();

      injectBulkCloseButton();
      injectNewTicketButton();
      loadTeamPanel();
    }

    // --- Handle single click ---
    async function handleMondayClick(ticketId, autoGroupId) {
      const mondayToken = await getMondayToken();
      if (!mondayToken) return alert("⚠️ Configura tu token de Monday en el popup de la extensión primero.");
      const boardId = await getMondayBoardId();
      if (!boardId) return alert("⚠️ Configura el Board ID en el popup de la extensión primero.");
      const spToken = getToken();
      if (!spToken) return alert("⚠️ No se encontró token de SupportPlus. ¿Estás logueado?");

      let ticketData, boardData, meId;
      try {
        const [ticketRes, mondayData] = await Promise.all([
          fetch(`${SP_API}/${ticketId}`, {
            headers: { accept: "application/json", authorization: `Bearer ${spToken}` },
          }).then((r) => { if (!r.ok) throw new Error(`SP HTTP ${r.status}`); return r.json(); }),
          mondayQuery(mondayToken, `query ($boardId: [ID!]!) { me { id } boards(ids: $boardId) { id name groups { id title } } }`, { boardId }),
        ]);
        ticketData = ticketRes.data || ticketRes;
        meId = mondayData.me.id;
        boardData = mondayData.boards;
      } catch (err) {
        return alert("Error: " + err.message);
      }
      if (!boardData.length) return alert("No se encontró el board. Verifica el Board ID en el popup.");
      if (autoGroupId) {
        await autoMigrateToMonday(ticketData, ticketId, boardData, mondayToken, meId, autoGroupId);
      } else {
        showMondayModal(ticketData, ticketId, boardData, mondayToken, meId);
      }
    }

    // Auto migrate without modal
    async function autoMigrateToMonday(ticket, ticketId, boards, mondayToken, meId, groupId) {
      showLoadingToast("Migrando a Monday...");

      // Check if already exists
      var existingId = await checkTicketExistsInMonday(mondayToken, ticket.uniqueCode || "");
      if (existingId) {
        addToCache(ticket.uniqueCode || ticketId, existingId);
        var lt = document.getElementById("sp-loading-toast"); if (lt) lt.remove();
        showSuccessToast("✅ Ya existe en Monday");
        return;
      }

      const url = BASE_URL + "/" + ticketId;
      const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
      const itemName = ticket.subject || "Sin asunto";
      const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
      const spPriority = (ticket.incidentPriorityName || ticket.incidentPriority?.name || "").toLowerCase().trim();
      const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];
      const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
      let personValue = {};
      if (holderEmail) {
        try {
          const users = await getMondayUsers(mondayToken);
          const userId = users[holderEmail.toLowerCase()];
          if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
        } catch (e) { }
      }
      const columnValues = JSON.stringify({
        descripci_n_mkn9e5f4: { text: desc },
        ...(personValue.personsAndTeams ? { multiple_person_mm25nvfq: personValue } : {}),
        status: { index: 1 },
        priority_mkn9kbe9: { index: priorityIndex },
        cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
        link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
        text_mm2c9nhc: ticket.uniqueCode || ticketId,
      });
      try {
        const result = await mondayQuery(mondayToken,
          "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
          { boardId: boards[0].id, groupId: groupId, itemName: itemName, columnValues: columnValues }
        );
        if (result.errors) throw new Error(result.errors[0].message);
        syncPromise = null;
        localStorage.removeItem(CACHE_KEY);
        var lt = document.getElementById("sp-loading-toast"); if (lt) lt.remove();
        showSuccessToast("✅ Migrado a Monday");
        document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
        injectButtons();
      } catch (err) {
        var lt2 = document.getElementById("sp-loading-toast"); if (lt2) lt2.remove();
        showErrorToast("Error Monday: " + err.message);
      }
    }

    // --- Single modal ---
    function showMondayModal(ticket, ticketId, boards, mondayToken, meId) {
      const existing = document.getElementById("sp-monday-modal");
      if (existing) existing.remove();

      const url = `${BASE_URL}/${ticketId}`;
      const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
      const creatorGroup = ticket.ticketInfo?.departmentName || ticket.resolutionGroup?.name || "Sin grupo";
      const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
      const holderName = ticket.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar";

      // Determine if ticket is from another area - show person selector
      const ticketGroupId = ticket.resolutionGroup?.id || null;
      const myAreaConfig = getTeamConfig();
      const isOtherArea = ticketGroupId && ticketGroupId !== myAreaConfig.resolutionGroupId;
      var personSelectHTML = "";
      if (isOtherArea) {
        var personOpts = '<option value="">-- Mantener: ' + holderName + ' --</option>';
        myAreaConfig.profiles.forEach(function (p) {
          personOpts += '<option value="' + p.profileId + '">' + p.profileFullName + '</option>';
        });
        personSelectHTML = '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Persona asignada en Monday</label>' +
          '<select id="sp-person-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">' + personOpts + '</select>';
      }

      // Resolve board by ticket createdAt
      const createdDate = new Date(ticket.createdAt);

      const mondayM = createModal({
        id: "sp-monday-modal",
        title: "📤 Migrar Ticket a Monday",
        content: `<div style="background:#f5f5f5;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">
          <div><b>Folio:</b> ${ticket.uniqueCode || "N/A"}</div>
          <div><b>Asunto:</b> ${ticket.subject || "N/A"}</div>
          <div><b>Persona:</b> 👤 ${holderName} ${holderEmail ? `(${holderEmail})` : ""}</div>
          <div style="margin-top:4px;max-height:60px;overflow:auto;"><b>Desc:</b> ${desc.substring(0, 200)}${desc.length > 200 ? "..." : ""}</div>
        </div>
        ${personSelectHTML}
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Grupo</label>
        <select id="sp-group-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">
        </select>
        <div id="sp-monday-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>
        <div style="display:flex;gap:8px;">
          <button id="sp-monday-send" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">💾 Crear en Monday</button>
          <button id="sp-monday-close" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cerrar</button>
        </div>`,
        options: { maxWidth: "520px", maxHeight: "85vh" }
      });
      const overlay = mondayM.overlay;
      injectSLCopyButtons(overlay);

      const groupSelect = document.getElementById("sp-group-select");
      const board = boards[0];
      if (board && board.groups) {
        board.groups.forEach(g => {
          const opt = document.createElement("option");
          opt.value = g.id;
          opt.textContent = g.title;
          groupSelect.appendChild(opt);
        });
      }

      const sendBtn = document.getElementById("sp-monday-send");
      const msg = document.getElementById("sp-monday-msg");

      sendBtn.addEventListener("click", async () => {
        sendBtn.disabled = true;
        sendBtn.style.background = "#999";
        sendBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Validando...';
        var closeBtnEl = document.getElementById("sp-monday-close");
        if (closeBtnEl) closeBtnEl.style.display = "none";
        ensureToastStyles();
        msg.textContent = "";

        const boardId = boards[0].id;
        const boardName = boards[0].name;
        const boardDate = parseBoardDate(boardName);
        const ticketDate = new Date(ticket.createdAt);

        if (boardDate && (ticketDate.getMonth() !== boardDate.month || ticketDate.getFullYear() !== boardDate.year)) {
          const ticketMonthName = MONTH_NAMES[ticketDate.getMonth()];
          msg.textContent = "Este ticket es de " + ticketMonthName + " " + ticketDate.getFullYear() + " y el board seleccionado es de " + MONTH_NAMES[boardDate.month] + " " + boardDate.year + ". Selecciona el board correcto.";
          sendBtn.innerHTML = "💾 Crear en Monday";
          sendBtn.style.background = "#D94040";
          sendBtn.disabled = false;
          if (closeBtnEl) closeBtnEl.style.display = "";
          return;
        }

        // Check if already migrated
        syncPromise = null;
        localStorage.removeItem(CACHE_KEY);
        const freshSynced = await ensureSyncStarted();
        if (ticket.uniqueCode && freshSynced[ticket.uniqueCode]) {
          msg.textContent = "Este ticket ya fue migrado a Monday.";
          sendBtn.innerHTML = "✅ Migrado";
          sendBtn.disabled = true;
          sendBtn.style.background = "#2E7D32";
          const detailBtn = document.getElementById(DETAIL_BTN_ID);
          if (detailBtn) {
            const badge = createSyncedBadge(freshSynced[ticket.uniqueCode]);
            badge.id = DETAIL_BTN_ID;
            badge.style.cssText = "padding:6px 14px;font-size:12px;border-radius:6px;background:#E8F5E9;color:#2E7D32;font-weight:600;white-space:nowrap;cursor:pointer;";
            detailBtn.replaceWith(badge);
          }
          return;
        }

        // Read values BEFORE closing modal
        const selectedGroupId = document.getElementById("sp-group-select")?.value || "";
        var selectedPersonId = document.getElementById("sp-person-select")?.value || "";

        // Validations passed - close modal and show loading toast
        const modal = document.getElementById("sp-monday-modal"); if (modal) modal.remove();
        showLoadingToast("Migrando a Monday...");

        const groupId = selectedGroupId;
        const itemName = ticket.subject || "Sin asunto";
        const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
        const spPriority = (ticket.incidentPriorityName || ticket.incidentPriority?.name || "").toLowerCase().trim();
        const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];

        let personValue = {};
        // If a person was selected from the dropdown (other area ticket), use their email
        if (selectedPersonId) {
          var selectedProfile = null;
          Object.values(TEAM_AREAS).forEach(function (area) {
            area.profiles.forEach(function (p) { if (String(p.profileId) === selectedPersonId) selectedProfile = p; });
          });
          if (selectedProfile && selectedProfile.email) {
            try {
              const users = await getMondayUsers(mondayToken);
              var foundUserId = users[selectedProfile.email.toLowerCase()];
              if (!foundUserId) {
                // Fallback: search by partial email match
                var emailPrefix = selectedProfile.email.split("@")[0].toLowerCase();
                Object.entries(users).forEach(function (entry) {
                  if (!foundUserId && entry[0].toLowerCase().includes(emailPrefix)) foundUserId = entry[1];
                });
              }
              if (foundUserId) personValue = { personsAndTeams: [{ id: parseInt(foundUserId), kind: "person" }] };
              console.log("[SP Monday] Person select:", selectedProfile.email, "-> Monday userId:", foundUserId);
            } catch (e) { console.warn("[SP Monday] Error finding user:", e); }
          }
        } else {
          const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
          if (holderEmail) {
            try {
              const users = await getMondayUsers(mondayToken);
              const userId = users[holderEmail.toLowerCase()];
              if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
            } catch (e) { }
          }
        }

        const columnValues = JSON.stringify({
          descripci_n_mkn9e5f4: { text: desc },
          ...(personValue.personsAndTeams ? { multiple_person_mm25nvfq: personValue } : {}),
          status: { index: 1 },
          priority_mkn9kbe9: { index: priorityIndex },
          cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
          link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
          text_mm2c9nhc: ticket.uniqueCode || ticketId,
        });

        try {
          // Check if already exists before creating
          const existingId = await checkTicketExistsInMonday(mondayToken, ticket.uniqueCode || "");
          let newItemId;
          if (existingId) {
            newItemId = existingId;
          } else {
            const result = await mondayQuery(mondayToken,
              `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
            create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
          }`,
              { boardId, groupId, itemName, columnValues }
            );
            newItemId = result.create_item.id;
          }
          addToCache(ticket.uniqueCode || ticketId, newItemId);
          const row = document.querySelector(`.MuiDataGrid-row[data-id="${ticketId}"]`);
          if (row) {
            const btn = row.querySelector(`.${BTN_CLASS}`);
            if (btn) btn.replaceWith(createSyncedBadge(newItemId));
          }
          const detailBtn = document.getElementById(DETAIL_BTN_ID);
          if (detailBtn) {
            const badge = createSyncedBadge(newItemId);
            badge.id = DETAIL_BTN_ID;
            badge.style.cssText = "padding:6px 14px;font-size:12px;border-radius:6px;background:#E8F5E9;color:#2E7D32;font-weight:600;white-space:nowrap;cursor:pointer;";
            detailBtn.replaceWith(badge);
          }
          showSuccessToast("Ticket migrado a Monday");
          document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
          injectButtons();
          if (isDetailView()) {
            var successM = createModal({
              id: "sp-migrate-success",
              title: "✅ Ticket migrado a Monday",
              content: '<p style="font-size:13px;color:#555;margin:0 0 16px;">El ticket fue migrado correctamente.</p>' +
                '<div style="display:flex;gap:8px;">' +
                '<button id="sp-migrate-close-tab" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Cerrar pestaña</button>' +
                '<button id="sp-migrate-stay-tab" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Quedarme</button>' +
                '</div>',
              options: { maxWidth: "360px", textAlign: "center", closeOnBackdrop: false }
            });
            document.getElementById("sp-migrate-close-tab").addEventListener("click", function () { window.close(); });
            document.getElementById("sp-migrate-stay-tab").addEventListener("click", function () { successM.close(); });
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
        }
      });

      document.getElementById("sp-monday-close").addEventListener("click", () => mondayM.close());
    }

    // --- Observer ---
    let injectTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(injectTimeout);
      injectTimeout = setTimeout(injectButtons, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    loadTeamArea().then(function () {
      // Resolve profileId from session name
      var myName = getLoggedUserName();
      if (myName && currentTeamArea) {
        loadProfilesForGroup(currentTeamArea).then(function (profiles) {
          var me = profiles.find(function (p) { return p.profileFullName === myName; });
          if (me) { sessionProfileId = me.profileId; myProfileId = me.profileId; }
        }).catch(function () { });
      }
      ensureSyncStarted().then(() => injectButtons());
      // Also inject immediately (buttons + row buttons that don't need sync)
      injectButtons();
    });

    // --- Re-sync on page focus ---
    window.addEventListener("focus", () => {
      syncPromise = null;
      localStorage.removeItem(CACHE_KEY);
      ensureSyncStarted().then(() => injectButtons());
      if (activeModalRefresh) activeModalRefresh();
      refreshTeamPanel();
    });

    // --- Auto-refresh team panel every 60 seconds ---
    var _teamPanelInterval = setInterval(function () {
      if (!document.getElementById("sp-team-panel")) { clearInterval(_teamPanelInterval); return; }
      if (!isDetailView()) refreshTeamPanel();
    }, 60000);
  } // end initExtension

  // Re-sync Notion on page focus (detect changes without reload)
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      try {
        chrome.runtime.sendMessage({ type: "sync-notion" }, function () {
          // Refresh suggested comments chips if modal is open
          var suggestedDiv = document.getElementById("sp-qd-suggested");
          if (suggestedDiv) {
            chrome.storage.local.get("suggestedComments", function (r) {
              var comments = r.suggestedComments || {};
              var groupId = getTeamConfig().resolutionGroupId;
              var groupComments = comments[groupId] || [];
              suggestedDiv.innerHTML = "";
              var commentInputEl = document.getElementById("sp-qd-comment-input");
              groupComments.forEach(function (c) {
                var chip = document.createElement("button");
                chip.textContent = c.text.substring(0, 40) + (c.text.length > 40 ? "..." : "");
                chip.title = c.text;
                var colors = stringToColor(c.text); chip.style.cssText = "padding:3px 8px;font-size:0.8rem;border:1px solid " + colors.border + ";border-radius:12px;background:" + colors.bg + ";color:" + colors.text + ";cursor:pointer;white-space:nowrap;";
                chip.addEventListener("click", function () {
                  if (commentInputEl) { commentInputEl.value = c.text; commentInputEl.focus(); }
                });
                suggestedDiv.appendChild(chip);
              });
            });
          }
        });
      } catch (e) { }
    }
  });

})();
