(function () {
  SP_Log.info("Extension loading...");

  // ─── Module health check ──────────────────────────────────
  var _modules = [
    "SP_Storage",
    "SP_DOM",
    "SP_Templates",
    "SP_API_Lib",
    "SP_MondayUtils",
    "SP_Session",
    "SP_Header",
    "SP_ManagerView",
    "SP_DetailView",
    "SP_TicketActions",
  ];
  var _missing = _modules.filter(function (m) {
    return !window[m];
  });
  if (_missing.length) {
    SP_Log.error("Missing modules:", _missing.join(", "));
  }

  // ─── Bridge to new modules (backward compatibility) ───────
  // These references allow legacy code in this file to keep working
  // as we progressively extract features to separate modules.
  var createHeaderButton = window.createHeaderButton;
  var esc = window.esc;
  var stringToColor = window.stringToColor;

  // Version check, backdrop CSS, and row coloring are now handled by:
  // - styles.js (CSS injection)
  // - features/header-buttons.js (version check, row coloring, header observer)

  // Row coloring is now handled by features/header-buttons.js (startRowColorObserver)

  // GROUP_INFO: now loaded by features/header-buttons.js (loadGroupInfo)
  var GROUP_INFO = window.SP_GroupInfo || window.SP_CONFIG.GROUP_INFO;

  // ─── State bridge: read from SP_Session.state ──────────────
  // Legacy code in this file reads these variables. They're populated by features/session.js.
  var _ss = window.SP_Session.state;
  var currentUserRole = _ss.userRole;
  var currentUserGroups = _ss.groups;
  // canMigrateMonday removed
  var canDragDrop = _ss.canDragDrop;
  var _btnDashboard = _ss.btnDashboard;
  var _btnComments = _ss.btnComments;
  var _btnReports = _ss.btnReports;
  var _btnReassignApp = _ss.btnReassignApp;
  var _btnAddIAM = _ss.btnAddIAM;
  var _canShowLabels = _ss.canShowLabels;
  var _canReopenTickets = _ss.canReopenTickets;
  var _canCommentClosed = _ss.canCommentClosed;
  var _canRejectTickets = _ss.canRejectTickets;
  var _lastDropTime = 0;
  var _autoMigrateQueue = Promise.resolve();
  var _userConfig = _ss.userConfig;
  var _workSchedule = _ss.workSchedule;

  // isWithinWorkHours: delegate to session module
  function isWithinWorkHours() {
    return window.SP_Session.isWithinWorkHours();
  }

  // Ticket pending close operations: delegate to features/ticket-actions.js
  var saveTicketPendingClose = window.SP_TicketActions.saveTicketPendingClose;
  var removeTicketPendingClose =
    window.SP_TicketActions.removeTicketPendingClose;
  var fetchPendingCloseTickets =
    window.SP_TicketActions.fetchPendingCloseTickets;

  // Persisted state now loaded by features/session.js (loadPersistedState)

  // updateMondayPerson & updateMondayStatus: delegate to lib/monday-utils.js
  // If ticket doesn't exist in Monday, create it first.
  async function ensureTicketInMonday(ticketId, uniqueCode) {
    if (!uniqueCode) return false;
    var mondayToken = await window.SP_API_Lib.getMondayToken();
    if (!mondayToken) return false;
    // Check cache
    var cached = getCache() || {};
    if (cached[uniqueCode]) return true;
    // Check in Monday
    var existingId = await checkTicketExistsInMonday(mondayToken, uniqueCode);
    if (existingId) {
      addToCache(uniqueCode, existingId);
      return true;
    }
    // Doesn't exist — create it
    try {
      var spToken = getToken();
      if (!spToken) return false;
      var res = await fetch(SP_API + "/" + ticketId, {
        headers: {
          accept: "application/json",
          authorization: "Bearer " + spToken,
        },
      });
      if (!res.ok) return false;
      var json = await res.json();
      var t = json.data || json;
      var ticketDate = new Date(t.createdAt);
      var boardId = await getMondayBoardForMonth(
        ticketDate.getFullYear(),
        ticketDate.getMonth(),
      );
      if (!boardId) return false;

      // Get board groups
      var boardData = await mondayQuery(
        mondayToken,
        "query ($boardId: [ID!]!) { boards(ids: $boardId) { id groups { id title } } }",
        { boardId: boardId },
      );
      var boards = boardData.boards || [];
      if (!boards.length) return false;

      // Determine group by department name (default: Macropay)
      var department = (t.ticketInfo && t.ticketInfo.departmentName) || "Macropay";
      var boardGroups = boards[0].groups || [];
      var targetGroup = boardGroups.find(function (g) {
        return g.title.trim().toLowerCase() === department.trim().toLowerCase();
      });

      // If group doesn't exist, create it
      var groupId;
      if (targetGroup) {
        groupId = targetGroup.id;
      } else {
        var createGroupRes = await mondayQuery(
          mondayToken,
          'mutation ($boardId: ID!, $groupName: String!) { create_group(board_id: $boardId, group_name: $groupName) { id } }',
          { boardId: boardId, groupName: department }
        );
        groupId = createGroupRes.create_group && createGroupRes.create_group.id;
        if (!groupId) return false;
      }

      var url = BASE_URL + "/" + ticketId;
      var desc = (t.description || "").replace(/<[^>]*>/g, "");
      var itemName = t.subject || "Sin asunto";
      var createdDate = ticketDate.toISOString().slice(0, 10);
      var spPriority = (
        t.incidentPriorityName ||
        (t.incidentPriority && t.incidentPriority.name) ||
        ""
      )
        .toLowerCase()
        .trim();
      var priorityIndex =
        PRIORITY_MAP[spPriority] !== undefined
          ? PRIORITY_MAP[spPriority]
          : PRIORITY_MAP["medio"];
      var holderEmail =
        t.ticketHolder && t.ticketHolder.ticketHolderLog
          ? t.ticketHolder.ticketHolderLog.email || ""
          : "";
      var personValue = {};
      if (holderEmail) {
        var users = await getMondayUsers(mondayToken);
        var userId = users[holderEmail.toLowerCase()];
        if (userId)
          personValue = {
            personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
          };
      }
      var columnValues = JSON.stringify({
        descripci_n_mkn9e5f4: { text: desc },
        ...(personValue.personsAndTeams
          ? { multiple_person_mm25nvfq: personValue }
          : {}),
        status: { index: 1 },
        priority_mkn9kbe9: { index: priorityIndex },
        cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
        link_mknkdctz: { url: url, text: uniqueCode || url },
        text_mm2c9nhc: uniqueCode || String(ticketId),
        text_mm44vbfc: String(ticketId),
      });
      var result = await mondayQuery(
        mondayToken,
        "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
        {
          boardId: boardId,
          groupId: groupId,
          itemName: itemName,
          columnValues: columnValues,
        },
      );
      if (result.create_item && result.create_item.id) {
        addToCache(uniqueCode, result.create_item.id);
        return true;
      }
    } catch (e) {
      SP_Log.warn("ensureTicketInMonday failed:", e.message);
    }
    return false;
  }

  async function updateMondayPerson(ticketId, uniqueCode, analystEmail) {
    try {
      // canMigrateMonday removed - only token check needed
      var mondayToken = await window.SP_API_Lib.getMondayToken();
      if (!mondayToken || !analystEmail) return;
      var code = uniqueCode || String(ticketId);
      await ensureTicketInMonday(ticketId, code);
      await window.SP_MondayUtils.updateMondayPerson(
        mondayToken,
        code,
        analystEmail,
      );
      SP_Log.info("Monday person updated:", code, "->", analystEmail);
    } catch (e) {
      SP_Log.warn("Monday person update failed:", e.message);
    }
  }

  async function updateMondayStatus(ticketId, uniqueCode, newStatusName) {
    try {
      // canMigrateMonday removed - only token check needed
      var mondayToken = await window.SP_API_Lib.getMondayToken();
      if (!mondayToken) return;
      var code = uniqueCode || String(ticketId);
      await ensureTicketInMonday(ticketId, code);
      await window.SP_MondayUtils.updateMondayStatus(
        mondayToken,
        code,
        newStatusName,
      );
      SP_Log.info("Monday status updated:", code, "->", newStatusName);
    } catch (e) {
      SP_Log.warn("Monday status update failed:", e.message);
    }
  }

  // ─── Session & Header: now delegated to features/session.js and features/header-buttons.js ───
  // Legacy bridges for backward compatibility
  var sessionUserName = "";
  var sessionProfileId = null;

  // Delegate checkSession to SP_Session module
  var checkSession = window.SP_Session.checkSession;

  // Delegate resolveSessionProfileId
  async function resolveSessionProfileId() {
    return window.SP_Session.resolveProfileId();
  }

  // Delegate getLoggedUserNameFromDOM
  function getLoggedUserNameFromDOM() {
    return window.SP_Session.getLoggedUserName();
  }

  // Header injection and SPA observer are now handled by features/header-buttons.js

  // ─── Session initialization ───────────────────────────────
  checkSession().then(function (result) {
    if (result === null) {
      window.SP_Session.showAccessMessage(
        "⚠️ Usuario no registrado en SupportPlus Tools. Solicite su alta con el administrador.",
      );
      return;
    }
    if (result === "inactive") {
      window.SP_Session.showAccessMessage(
        "⚠️ Usuario inactivo en SupportPlus Tools. Solicite su reactivación con el administrador.",
      );
      return;
    }

    // Sync local vars from session state (after checkSession updates them)
    var ss = window.SP_Session.state;
    currentUserRole = ss.userRole;
    currentUserGroups = ss.groups;
    // canMigrateMonday removed
    canDragDrop = ss.canDragDrop;
    _btnDashboard = ss.btnDashboard;
    _btnComments = ss.btnComments;
    _btnReports = ss.btnReports;
    _btnReassignApp = ss.btnReassignApp;
    _btnAddIAM = ss.btnAddIAM;
    _canShowLabels = ss.canShowLabels;
    _canReopenTickets = ss.canReopenTickets;
    _canCommentClosed = ss.canCommentClosed;
    _canRejectTickets = ss.canRejectTickets;
    _userConfig = ss.userConfig;
    _workSchedule = ss.workSchedule;
    sessionUserName = ss.userName;
    sessionProfileId = ss.profileId;

    initByRole();
    window.SP_Session.injectRoleLabel();
  });

  function showAccessMessage(text) {
    window.SP_Session.showAccessMessage(text);
  }

  function initByRole() {
    // Update Monday config based on canMigrateMonday permission and group config
    SP_Storage.get("groupMondayConfig")
      .then(function (config) {
        config = config || {};
        var groupId =
          window.SP_Session.state.teamArea ||
          (currentUserGroups.length ? currentUserGroups[0] : "");
          !!(groupId && config[groupId] && config[groupId].etiqueta) &&
          canMigrateMonday;
      })
      .catch(function () {});

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
  document.addEventListener("sp-open-config", function () {
    if (_showConfigModal) _showConfigModal();
  });
  document.addEventListener("sp-open-ticket", function (e) {
    if (e.detail && e.detail.ticketId && _showQuickDetailModal)
      _showQuickDetailModal(e.detail.ticketId);
  });

  // --- Manager view: delegated to features/manager-view.js ---
  function initManagerView() {
    // Connect fetchPendingCloseTickets to the manager view module
    if (window.SP_ManagerView) {
      window.SP_ManagerView._fetchPendingClose =
        window.SP_TicketActions.fetchPendingCloseTickets;
    }
    window.SP_ManagerView.init();
  }

  // loadManagerPanel, loadManagerGroupDetail, renderGroupDetail: now in features/manager-view.js

  function initExtension() {
    _showQuickDetailModal = showQuickDetailModal;

    // Bridge: downloadZip from header-buttons.js
    var downloadZip = window.SP_Header.downloadZip;

    // Header buttons: inject local buttons once wrapper is available
    SP_DOM.waitForElement('[class*="warapperNameUserAndLogout"]', {
      maxAttempts: 20,
      interval: 150,
    }).then(function () {
      if (typeof injectConfigButton === "function") injectConfigButton();
      if (typeof injectSearchButton === "function") injectSearchButton();
      if (typeof injectQuickSearch === "function") injectQuickSearch();
      if (typeof injectUpdateButton === "function") injectUpdateButton();
    });

    // --- Toast helpers (from components.js window globals) ---
    const showLoadingToast = window.showLoadingToast;
    const showSuccessToast = window.showSuccessToast;
    const showErrorToast = window.showErrorToast;

    const SP_API = window.SP_CONFIG.SP_API;

    // Helper: convert UTC datetime string to UTC-6 (format: YYYY-MM-DD HH:MM)
    function utcToLocal(dateStr) {
      if (!dateStr) return "";
      var d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
      if (isNaN(d.getTime())) return dateStr.replace("T", " ").substring(0, 16);
      d.setHours(d.getHours() - 6);
      var yyyy = d.getUTCFullYear();
      var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      var dd = String(d.getUTCDate()).padStart(2, "0");
      var hh = String(d.getUTCHours()).padStart(2, "0");
      var min = String(d.getUTCMinutes()).padStart(2, "0");
      return yyyy + "-" + mm + "-" + dd + " " + hh + ":" + min;
    }

    // Helper: build auth headers for SP API calls
    function spHeaders(token) {
      return {
        "Content-Type": "application/json",
        accept: "application/json",
        authorization: "Bearer " + (token || getToken()),
      };
    }
    function spGetHeaders(token) {
      return {
        accept: "application/json",
        authorization: "Bearer " + (token || getToken()),
      };
    }

    

    // Helper: add hover text toggle to a button (disabled-aware)
    function hoverText(btn, normal, hover) {
      btn.addEventListener("mouseenter", function () {
        if (!btn.disabled) btn.textContent = hover;
      });
      btn.addEventListener("mouseleave", function () {
        if (!btn.disabled) btn.textContent = normal;
      });
    }

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

    // ─── Monday API: direct aliases to shared lib/api.js ────
    var getToken = window.SP_API_Lib.getSpToken;
    var getMondayToken = window.SP_API_Lib.getMondayToken;
    var getMondayWorkspaceId = window.SP_API_Lib.getMondayWorkspaceId;
    var getMondayConfigForGroup = window.SP_API_Lib.getMondayConfigForGroup;
    var getMondayTicketBoards = window.SP_API_Lib.getMondayTicketBoards;
    var mondayQuery = window.SP_API_Lib.mondayQuery;
    var getMondayUsers = window.SP_API_Lib.getMondayUsers;
    var checkTicketExistsInMonday = window.SP_API_Lib.checkTicketInMonday;

    var getMondayBoardForMonth = function (year, month, groupId) {
      var gId =
        groupId ||
        window.SP_Session.state.teamArea ||
        (currentUserGroups.length ? currentUserGroups[0] : "");
      return window.SP_API_Lib.getMondayBoardForMonth(year, month, gId);
    };
    var getMondayBoardId = function (groupId) {
      var gId =
        groupId ||
        window.SP_Session.state.teamArea ||
        (currentUserGroups.length ? currentUserGroups[0] : "");
      return window.SP_API_Lib.getMondayBoardId(gId);
    };

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
        var boardData = await mondayQuery(
          mondayToken,
          "query ($boardId: [ID!]!) { boards(ids: $boardId) { name } }",
          { boardId },
        );
        var boardName = boardData.boards[0]?.name || "";
        var boardDate = parseBoardDate(boardName);
        if (!boardDate) return true;
        var ticketDate = new Date(ticketCreatedAt);
        return (
          ticketDate.getMonth() === boardDate.month &&
          ticketDate.getFullYear() === boardDate.year
        );
      } catch (e) {
        return true;
      }
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
        if (Date.now() - cache.ts > CACHE_TTL) {
          localStorage.removeItem(CACHE_KEY);
          return null;
        }
        return cache.ids;
      } catch {
        return null;
      }
    }
    function setCache(ids) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ids }));
    }
    function addToCache(ticketId, mondayItemId) {
      const ids = getCache() || {};
      ids[ticketId] = mondayItemId;
      setCache(ids);
    }

    // --- Sync ---
    let syncPromise = null;
    async function fetchSyncedTickets() {
      const cached = getCache();
      if (cached) return cached;
      const mondayToken = await getMondayToken();
      if (!mondayToken) return {};
      try {
        const synced =
          await window.SP_MondayUtils.fetchAllSyncedTickets(mondayToken);
        setCache(synced);
        return synced;
      } catch (err) {
        SP_Log.warn("Monday sync error:", err);
        return {};
      }
    }
    function ensureSyncStarted() {
      if (!syncPromise) syncPromise = fetchSyncedTickets();
      return syncPromise;
    }

    // --- UI ---
    function createSyncedBadge(mondayItemId) {
      // Instead of a badge, we return a small link that sits next to the ticket button
      // The green border is applied to the row's uniqueCode cell
      const link = document.createElement("a");
      link.className = SYNCED_CLASS;
      link.href =
        window.SP_CONFIG.MONDAY_BASE_URL +
        "/boards/" +
        window.SP_CONFIG.MONDAY_BOARD_ID +
        "/pulses/" +
        mondayItemId;
      link.target = "_blank";
      link.textContent = "↗";
      link.title = "Ver en Monday";
      link.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;width:0;opacity:0;overflow:hidden;font-size:11px;font-weight:700;color:#fff;background:#2E7D32;border-radius:0 4px 4px 0;text-decoration:none;transition:width 0.25s cubic-bezier(0.4,0,0.2,1),opacity 0.25s ease,padding 0.25s ease;padding:4px 0;margin-left:-1px;cursor:pointer;height:100%;box-sizing:border-box;vertical-align:middle;";
      link.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      return link;
    }

    var createCopyButton = window.SP_DetailView.createCopyButton;

    function createButton(ticketId) {
      const btn = document.createElement("button");
      btn.className = BTN_CLASS;
      btn.textContent = "🙂 Migrar";
      btn.title = "Migrar a Monday";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #D94040;border-radius:4px;background:#D94040;color:#fff;margin-left:6px;white-space:nowrap;";
      hoverText(btn, "🙂 Migrar", "🫡 Migrar");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        btn.textContent = "⏳";
        btn.disabled = true;
        handleMondayClick(ticketId).finally(() => {
          btn.textContent = "🙂 Migrar";
          btn.disabled = false;
        });
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

    // --- Detail view helpers: delegate to lib/dom-utils.js ---
    const DETAIL_BTN_ID = "sp-monday-detail";

    function isDetailView() {
      return window.SP_DOM.isDetailView();
    }

    function getDetailTicketId() {
      return window.SP_DOM.getDetailTicketId();
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
          if (box && box.querySelector("p.MuiTypography-body1"))
            container = box;
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
            headers: spGetHeaders(),
          });
          if (!res.ok) return;
          const json = await res.json();
          const ticket = json.data || json;
          uniqueCode = ticket.uniqueCode || "";
          isClosed =
            ticket.ticketStatus?.type?.name === "Cerrado" ||
            ticket.ticketStatus?.name === "Cerrado";
          isWaiting = ticket.ticketStatus?.name === "En espera";
          isAssigned =
            ticket.ticketStatus?.name === "Asignado" ||
            ticket.ticketStatus?.name === "En atención";
          holderName = ticket.ticketHolder?.ticketHolderLog?.fullName || "";
          ticketGroupId = ticket.resolutionGroup?.id || null;
          SP_Log.debug(
            "Detail ticket status:",
            ticket.ticketStatus?.name,
            "| closed:",
            isClosed,
            "| waiting:",
            isWaiting,
            "| assigned:",
            isAssigned,
            "| holder:",
            holderName,
          );
        } catch (e) {
          return;
        }

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
          badge.addEventListener("mouseenter", () => {
            badge.textContent = "🔗 Monday";
          });
          badge.addEventListener("mouseleave", () => {
            badge.textContent = "✅ Migrado";
          });
          badge.addEventListener("click", () => {
            window.open(
              window.SP_CONFIG.MONDAY_BASE_URL +
                "/boards/" +
                window.SP_CONFIG.MONDAY_BOARD_ID +
                "/pulses/" +
                mondayItemId,
              "_blank",
            );
          });
          const chip = container.querySelector(".MuiChip-root");
          container.insertBefore(badge, chip);
        } else if (isAssigned || isWaiting) {
          // Show buttons only if ticket belongs to my area (or gerente)
          var myArea3 = getTeamConfig();
          var ticketBelongsToMe3 =
            !ticketGroupId ||
            ticketGroupId === myArea3.resolutionGroupId ||
            isMultiGroup();
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
              takeBtn.addEventListener("mouseenter", () => {
                if (!takeBtn.disabled) takeBtn.textContent = "✊ Tomar ticket";
              });
              takeBtn.addEventListener("mouseleave", () => {
                if (!takeBtn.disabled) takeBtn.textContent = "🤚 Tomar ticket";
              });
              takeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                showTakeModal(ticketId, takeBtn);
              });
              container.insertBefore(takeBtn, chip4);
            }

            // Show steal button if assigned to someone else
            if (
              isAssigned &&
              holderName &&
              myName &&
              holderName !== myName &&
              !container.querySelector(".sp-detail-steal")
            ) {
              const stealBtn = document.createElement("button");
              stealBtn.className = "sp-detail-steal";
              stealBtn.textContent = "🥷 Robar ticket";
              stealBtn.title = "Asignado a: " + holderName;
              stealBtn.style.cssText =
                "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#E65100;color:#fff;font-weight:600;white-space:nowrap;margin-right:6px;";
              stealBtn.addEventListener("mouseenter", () => {
                if (!stealBtn.disabled)
                  stealBtn.textContent = "💀 Robar ticket";
              });
              stealBtn.addEventListener("mouseleave", () => {
                if (!stealBtn.disabled)
                  stealBtn.textContent = "🥷 Robar ticket";
              });
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
          var canClose =
            !ticketGroupId ||
            ticketGroupId === myAreaClose.resolutionGroupId ||
            isMultiGroup();
          if (canClose) {
            const closeBtnIndep = document.createElement("button");
            closeBtnIndep.className = "sp-detail-close-btn";
            closeBtnIndep.textContent = "🔒 Cerrar ticket";
            closeBtnIndep.style.cssText =
              "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#616161;color:#fff;font-weight:600;white-space:nowrap;margin-left:6px;";
            closeBtnIndep.addEventListener("mouseenter", () => {
              if (!closeBtnIndep.disabled)
                closeBtnIndep.textContent = "🔐 Cerrar ticket";
            });
            closeBtnIndep.addEventListener("mouseleave", () => {
              if (!closeBtnIndep.disabled)
                closeBtnIndep.textContent = "🔒 Cerrar ticket";
            });
            closeBtnIndep.addEventListener("click", async (e) => {
              e.stopPropagation();
              e.preventDefault();
              closeBtnIndep.disabled = true;
              closeBtnIndep.innerHTML = spinnerHTML(12);
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
          var canReopen =
            !ticketGroupId ||
            ticketGroupId === myAreaReopen.resolutionGroupId ||
            isMultiGroup();
          if (canReopen) {
            const reopenBtn = document.createElement("button");
            reopenBtn.className = "sp-reopen-btn";
            reopenBtn.textContent = "🔓 Reabrir";
            reopenBtn.style.cssText =
              "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#FF8F00;color:#fff;font-weight:600;white-space:nowrap;margin-left:6px;";
            reopenBtn.addEventListener("mouseenter", () => {
              if (!reopenBtn.disabled) reopenBtn.textContent = "🔄 Reabrir";
            });
            reopenBtn.addEventListener("mouseleave", () => {
              if (!reopenBtn.disabled) reopenBtn.textContent = "🔓 Reabrir";
            });
            reopenBtn.addEventListener("click", () => {
              showReopenModal(ticketId, holderName);
            });
            var chipReopen = container.querySelector(".MuiChip-root");
            container.insertBefore(reopenBtn, chipReopen);
          }
        }
      } finally {
        detailLoading = false;
      }
    }

    const IAM_BTN_ID = "sp-iam-btn";
    const IAM_PROFILES = window.SP_CONFIG.IAM_PROFILES;
    const IAM_API = window.SP_CONFIG.SP_PARTICIPANTS_API;

    const IAM_NAMES = window.SP_CONFIG.IAM_NAMES;

    function injectIamButton() {
      if (!_btnAddIAM) return;
      if (document.getElementById(IAM_BTN_ID)) return;
      if (!isDetailView()) return;
      var ticketId = getDetailTicketId();
      if (!ticketId) return;

      // Find the "Agregar usuarios" card
      var cards = document.querySelectorAll(
        ".MuiCardHeader-content .MuiTypography-body1",
      );
      var targetCard = null;
      cards.forEach(function (el) {
        if (el.textContent.trim() === "Agregar usuarios")
          targetCard = el.closest(".MuiCard-root");
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
      btn.style.cssText =
        "width:100%;padding:10px;font-size:13px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;margin-top:8px;";
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.innerHTML = spinnerHTML(14, "Agregando...");

        // Re-check existing names at click time
        var currentNames = [];
        targetCard.querySelectorAll("p[aria-label]").forEach(function (p) {
          currentNames.push(p.getAttribute("aria-label"));
        });
        var missing = [];
        for (var j = 0; j < IAM_NAMES.length; j++) {
          if (currentNames.indexOf(IAM_NAMES[j]) === -1)
            missing.push(IAM_PROFILES[j]);
        }
        if (!missing.length) {
          showSuccessToast("Todos los IAMcitos ya existen");
          btn.remove();
          return;
        }

        showLoadingToast("Agregando " + missing.length + " IAMcito(s)...");
        var spToken = getToken();
        var ok = 0,
          fail = 0;
        for (var i = 0; i < missing.length; i++) {
          try {
            var res = await fetch(IAM_API, {
              method: "POST",
              headers: spHeaders(),
              body: JSON.stringify({
                profileId: missing[i],
                ticketId: parseInt(ticketId),
                isParticipant: false,
              }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            ok++;
          } catch (e) {
            fail++;
          }
        }

        if (fail === 0) {
          showSuccessToast("IAMcitos agregados");
          setTimeout(function () {
            window.location.reload();
          }, 1500);
        } else {
          showErrorToast(
            "Algunos fallaron: " + ok + " ok, " + fail + " errores",
          );
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

      // Use centralized detection engine
      var detections = window.SP_DetailView.detectAll(fullText);
      var container = window.SP_DetailView.renderDetections(detections, {
        showLabels: _canShowLabels,
      });
      if (!container) return;
      container.id = DETAIL_DETECTIONS_ID;
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
      chipLabels.forEach(function (el) {
        if (el.textContent.trim() === "Cerrado") isClosed = true;
      });
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
      btn.style.cssText =
        "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#C62828;color:#fff;font-weight:600;white-space:nowrap;margin-left:12px;vertical-align:middle;";
      btn.addEventListener("click", function () {
        showReassignAppModal(ticketId);
      });
      h1.parentElement.appendChild(btn);
    }

    function showReassignAppModal(ticketId) {
      SP_Modal.confirm({
        id: "sp-reassign-app-modal",
        title: "⚠️ Reasignar a Aplicaciones",
        message: "Este ticket será reasignado al equipo de Aplicaciones.",
        description: "El ticket dejará de estar bajo nuestra responsabilidad.",
        confirmText: "Sí, reasignar",
        confirmColor: "#C62828",
        onConfirm: async function (api) {
          api.close();
          showLoadingToast("Tomando ticket para reasignar...");

          try {
            // Step 1: Take the ticket first
            const profileId = await getMyProfileId();
            if (!profileId) throw new Error("No se pudo obtener tu perfil");
            const takeRes = await fetch(SP_API + "/reassign/" + ticketId, {
              method: "PUT",
              headers: spHeaders(),
              body: JSON.stringify({
                resolutionGroupId: getTeamConfig().resolutionGroupId,
                serviceId: null,
                responsibleProfileId: profileId,
                resolutionGroup: {
                  label: getTeamConfig().resolutionGroupLabel,
                  value: getTeamConfig().resolutionGroupId,
                },
              }),
            });
            if (!takeRes.ok)
              throw new Error("Error al tomar: HTTP " + takeRes.status);
            const takeJson = await takeRes.json();
            if (!takeJson.success)
              throw new Error("No se pudo tomar el ticket");

            // Step 2: Reassign to Aplicaciones
            showLoadingToast("Reasignando a Aplicaciones...");
            const res = await fetch(SP_API + "/reassign/" + ticketId, {
              method: "PUT",
              headers: spHeaders(),
              body: JSON.stringify({
                ticketCommentRequest: {
                  internal: false,
                  content: "Se reasigna ticket",
                },
                resolutionGroupId: window.SP_CONFIG.APPS_GROUP.id,
                serviceId: null,
                responsibleProfileId: null,
                resolutionGroup: {
                  label: window.SP_CONFIG.APPS_GROUP.label,
                  value: window.SP_CONFIG.APPS_GROUP.id,
                },
              }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const json = await res.json();
            if (!json.success) throw new Error("No success");

            SP_Modal.success({
              id: "sp-reassign-success",
              title: "✅ Ticket reasignado",
              message: "El ticket fue reasignado a Aplicaciones exitosamente.",
              buttons: [
                {
                  text: "Aceptar",
                  color: "#2E7D32",
                  onClick: function () {
                    window.location.href = "/es/dashboard/tickets-mesa";
                  },
                },
              ],
            });
          } catch (err) {
            showErrorToast("Error: " + err.message);
          }
        },
      });
    }

    function injectBulkButton() {
      // canMigrateMonday removed - only token check needed
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

      const btn = createHeaderButton({
        id: BULK_BTN_ID,
        icon: "🔄",
        label: "Sync Monday",
        color: "#1565C0",
      });
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.innerHTML =
          '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Sincronizando...</span>';
        try {
          var spToken = getToken();
          var mondayToken = await getMondayToken();
          if (!spToken || !mondayToken) throw new Error("Sin token");

          // Get all ticket IDs visible in the DataGrid
          var rows = document.querySelectorAll(".MuiDataGrid-row");
          var ticketIds = [];
          rows.forEach(function (row) {
            var idCell = row.querySelector('[data-field="id"]');
            var id = idCell
              ? idCell.textContent.trim()
              : row.getAttribute("data-id");
            if (id) ticketIds.push(id);
          });
          if (!ticketIds.length) throw new Error("Sin tickets visibles");

          // Direct fetch helper for Monday
          async function mFetch(query, variables) {
            var r = await fetch("https://api.monday.com/v2", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: mondayToken,
              },
              body: JSON.stringify({ query: query, variables: variables }),
            });
            var d = await r.json();
            return d.data;
          }

          // Get boards and users
          var wsId = await getMondayWorkspaceId();
          var boardsData = await mFetch(
            "{ boards(workspace_ids: [" + wsId + "], limit: 50) { id name } }",
            {},
          );
          var ticketBoards = (boardsData.boards || []).filter(function (b) {
            return (
              b.name.includes("Tickets DBA -") &&
              !b.name.includes("Subelementos")
            );
          });
          var usersData = await mFetch("{ users(limit:500) { id email } }", {});
          var mondayUsersMap = {};
          (usersData.users || []).forEach(function (u) {
            if (u.email) mondayUsersMap[u.email.toLowerCase()] = u.id;
          });

          var synced = 0;
          for (var ti = 0; ti < ticketIds.length; ti++) {
            try {
              // Fetch individual ticket for full data (email del analista)
              var tRes = await fetch(SP_API + "/" + ticketIds[ti], {
                headers: spGetHeaders(),
              });
              if (!tRes.ok) continue;
              var tJson = await tRes.json();
              var ticket = tJson.data || tJson;
              if (!ticket.uniqueCode) continue;

              var spStatus = (ticket.ticketStatus?.name || "").toLowerCase();
              var holderEmail =
                ticket.ticketHolder?.ticketHolderLog?.email || "";

              // Find in Monday
              var mondayItemId = null,
                foundBoardId = null;
              for (var b of ticketBoards) {
                var itemData = await mFetch(
                  "query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }",
                  {
                    boardId: b.id,
                    columnId: "text_mm2c9nhc",
                    value: ticket.uniqueCode,
                  },
                );
                var items = itemData.items_page_by_column_values?.items || [];
                if (items.length) {
                  mondayItemId = items[0].id;
                  foundBoardId = b.id;
                  break;
                }
              }
              if (!mondayItemId) continue;

              // Map status
              var mondayStatusIndex = mapStatusToMonday(spStatus);

              var colValues = { status: { index: mondayStatusIndex } };
              if (holderEmail) {
                var uId = mondayUsersMap[holderEmail.toLowerCase()];
                if (uId)
                  colValues.multiple_person_mm25nvfq = {
                    personsAndTeams: [{ id: parseInt(uId), kind: "person" }],
                  };
              }

              await mFetch(
                "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
                {
                  boardId: foundBoardId,
                  itemId: mondayItemId,
                  columnValues: JSON.stringify(colValues),
                },
              );
              synced++;
            } catch (e) {
              continue;
            }
          }
          btn.innerHTML =
            '<span class="sp-btn-icon">✅</span><span class="sp-btn-label"> ' +
            synced +
            " actualizados</span>";
          setTimeout(function () {
            btn.innerHTML =
              '<span class="sp-btn-icon">🔄</span><span class="sp-btn-label"> Sync Monday</span>';
            btn.disabled = false;
          }, 3000);
        } catch (e) {
          btn.innerHTML =
            '<span class="sp-btn-icon">❌</span><span class="sp-btn-label"> Error</span>';
          setTimeout(function () {
            btn.innerHTML =
              '<span class="sp-btn-icon">🔄</span><span class="sp-btn-label"> Sync Monday</span>';
            btn.disabled = false;
          }, 3000);
        }
      });

      if (insertMethod === "beforeSearch") {
        const searchBtn = container.querySelector(
          'button[aria-label="Buscar"]',
        );
        container.insertBefore(btn, searchBtn);
      } else {
        container.prepend(btn);
      }
    }

    // --- Inject buttons ---
    const HIGHLIGHT_CLASS = "sp-my-row";

    function getLoggedUserName() {
      const el = document.querySelector(
        '[class*="warapperNameUserAndLogout"] p',
      );
      return el ? el.textContent.trim() : "";
    }

    function getLoggedUserEmail() {
      return window.SP_Session.state.userEmail || "";
    }

    function highlightMyRows() {
      const myName = getLoggedUserName();
      if (!myName) return;
      document.querySelectorAll(".MuiDataGrid-row").forEach((row) => {
        if (row.classList.contains(HIGHLIGHT_CLASS)) return;
        const responsibleCell = row.querySelector(
          '[data-field="responsibleName"]',
        );
        if (responsibleCell && responsibleCell.textContent.trim() === myName) {
          row.classList.add(HIGHLIGHT_CLASS);
          row.style.position = "relative";
          var indicator = document.createElement("span");
          indicator.textContent = "❗";
          indicator.style.cssText =
            "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
          row.appendChild(indicator);
        }
      });
    }

    const STATUS_COLORS = window.SP_CONFIG.STATUS_COLORS;
    const STATUS_TEXT_COLORS = window.SP_CONFIG.STATUS_TEXT_COLORS;

    function colorRowsByStatus() {
      if (window.SP_RowColors) window.SP_RowColors.colorRows();
    }

    // --- Team panel ---
    const TEAM_PANEL_ID = "sp-team-panel";
    var teamPanelLoading = false;
    var mondayBoardConfigured = false;

    // Check if current group has Monday config
    try {
      chrome.storage.local.get(["groupMondayConfig"], function (r) {
        var config = r.groupMondayConfig || {};
        var groupId =
          currentTeamArea ||
          (currentUserGroups.length ? currentUserGroups[0] : "");
        mondayBoardConfigured = !!(
          groupId &&
          config[groupId] &&
          config[groupId].etiqueta
        );
      });
    } catch (e) {}

    function updateMondayConfig() {
    }

    const TEAM_AREAS = {};
    // Build TEAM_AREAS dynamically from GROUP_INFO
    GROUP_INFO.forEach(function (g) {
      TEAM_AREAS[g.id] = {
        resolutionGroupId: g.id,
        resolutionGroupLabel: g.name,
        profiles: [], // loaded dynamically
      };
    });

    var currentTeamArea = ""; // Set dynamically from user's groups

    function isMultiGroup() {
      return currentUserGroups.length > 1;
    }

    function getTeamConfig() {
      return (
        TEAM_AREAS[currentTeamArea] ||
        TEAM_AREAS[currentUserGroups[0]] || {
          resolutionGroupId: currentUserGroups[0] || 0,
          resolutionGroupLabel: "",
          profiles: [],
        }
      );
    }

    // Returns all areas if gerente, otherwise just the configured one
    function getActiveAreas() {
      return currentUserGroups
        .map(function (gId) {
          return TEAM_AREAS[gId];
        })
        .filter(Boolean);
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
        } catch (e) {
          resolve();
        }
      });
    }

    // Load profiles dynamically for a group
    var profilesCache = {};
    var _pendingProfileRequests = {};

    function loadProfilesForGroup(groupId) {
      if (profilesCache[groupId])
        return Promise.resolve(profilesCache[groupId]);
      if (_pendingProfileRequests[groupId])
        return _pendingProfileRequests[groupId];
      var spToken = localStorage.getItem("token");
      if (!spToken) return Promise.resolve([]);
      _pendingProfileRequests[groupId] = fetch(
        "https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" +
          groupId,
        {
          headers: spGetHeaders(),
        },
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          var profiles = json.data || json;
          if (!Array.isArray(profiles)) profiles = [];
          // Filter by blacklist (profileIds from API)
          var blacklist = _userConfig.blacklist || [];
          function applyBlacklist(blacklistProfileIds) {
            if (blacklistProfileIds.length > 0) {
              profiles = profiles.filter(function (p) {
                return !blacklistProfileIds.includes(p.profileId || p.id);
              });
            }
            profilesCache[groupId] = profiles;
            if (TEAM_AREAS[groupId]) TEAM_AREAS[groupId].profiles = profiles;
            return profiles;
          }
          if (blacklist.length > 0) {
            return Promise.resolve(applyBlacklist(blacklist));
          }
          return new Promise(function (resolve) {
            chrome.storage.local.get("userConfig", function (stored) {
              var storedBlacklist = (stored.userConfig || {}).blacklist || [];
              resolve(applyBlacklist(storedBlacklist));
            });
          });
        })
        .catch(function () {
          delete _pendingProfileRequests[groupId];
          return [];
        })
        .then(function (result) {
          delete _pendingProfileRequests[groupId];
          return result;
        });
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
      // Double-check: mark loading BEFORE any async work
      teamPanelLoading = true;
      // Extra safety: if panel appeared while we were waiting, abort
      await new Promise(function (r) {
        setTimeout(r, 50);
      });
      if (document.getElementById(TEAM_PANEL_ID)) {
        teamPanelLoading = false;
        return;
      }
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid) {
        teamPanelLoading = false;
        return;
      }

      var spToken = getToken();
      if (!spToken) {
        teamPanelLoading = false;
        return;
      }

      // Get or create panel container
      var panel = document.getElementById(TEAM_PANEL_ID);
      if (!panel) {
        panel = document.createElement("div");
        panel.id = TEAM_PANEL_ID;
        panel.style.cssText =
          "margin-bottom:12px;overflow-x:auto;font-family:system-ui;";
        grid.parentElement.insertBefore(panel, grid);
      }

      try {
        var areas = getActiveAreas();
        var myName = getLoggedUserName();

        // Load profiles dynamically for each area
        await Promise.all(
          areas.map(function (area) {
            return loadProfilesForGroup(area.resolutionGroupId).then(
              function (profiles) {
                area.profiles = profiles;
                profiles.forEach(function (p) {
                  ALL_PROFILE_NAMES[p.profileId] = p.profileFullName;
                });
              },
            );
          }),
        );

        // Render empty columns immediately
        var containerDiv = document.createElement("div");
        containerDiv.style.cssText =
          "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
        panel.innerHTML = "";
        panel.appendChild(containerDiv);

        // "Sin asignar" column at the left (for each area)
        areas.forEach(function (area, areaIdx) {
          if (areaIdx > 0) {
            var sep = document.createElement("div");
            sep.style.cssText =
              "width:3px;background:#ddd;border-radius:2px;margin:0 4px;align-self:stretch;";
            containerDiv.appendChild(sep);
          }

          // Area label if gerente
          if (areas.length > 1) {
            var areaLabel = document.createElement("div");
            areaLabel.style.cssText =
              "min-width:180px;max-width:220px;display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0;";
            areaLabel.innerHTML =
              '<div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;color:#555;letter-spacing:1px;">' +
              (areaIdx === 0 ? "🗄️ DBA" : "📦 APPS") +
              "</div>";
            containerDiv.appendChild(areaLabel);
          }

          var unassignedCol = document.createElement("div");
          unassignedCol.id = "sp-team-col-unassigned-" + area.resolutionGroupId;
          unassignedCol.style.cssText =
            "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;";
          unassignedCol.innerHTML =
            '<div class="sp-team-header" data-profile-id="unassigned" style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">⏳ Sin asignar <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
            '<div class="sp-team-tickets" data-profile-id="unassigned" data-area-group="' +
            area.resolutionGroupId +
            '" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
          containerDiv.appendChild(unassignedCol);

          area.profiles.forEach(function (p) {
            var isMe = myName && p.profileFullName === myName;
            var borderColor = isMe ? "#D94040" : "#ddd";
            var headerBg = isMe
              ? "#D94040"
              : areaIdx === 0
                ? "#2196F3"
                : "#7B1FA2";
            var firstName = p.profileFullName.split(" ")[0];

            var col = document.createElement("div");
            col.id = "sp-team-col-" + p.profileId;
            col.style.cssText =
              "min-width:180px;max-width:220px;border:2px solid " +
              borderColor +
              ";border-radius:8px;overflow:hidden;flex-shrink:0;";
            col.innerHTML =
              '<div class="sp-team-header" data-profile-id="' +
              p.profileId +
              '" style="background:' +
              headerBg +
              ';color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">' +
              esc(firstName) +
              ' <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
              '<div class="sp-team-tickets" data-profile-id="' +
              p.profileId +
              '" data-area-group="' +
              area.resolutionGroupId +
              '" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
            containerDiv.appendChild(col);
          });
        });

        // "Cerrados hoy" column at the right
        var closedCol = document.createElement("div");
        closedCol.id = "sp-team-col-closed";
        closedCol.style.cssText =
          "min-width:180px;max-width:220px;border:2px solid #2E7D32;border-radius:8px;overflow:hidden;flex-shrink:0;";
        closedCol.innerHTML =
          '<div class="sp-team-header" data-profile-id="closed" style="background:#2E7D32;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
          '<div class="sp-team-tickets" data-profile-id="closed" data-area-group="closed" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
        containerDiv.appendChild(closedCol);

        // "Pendientes por cerrar" column (only shown if there are pending tickets)
        var pendingCloseCol = document.createElement("div");
        pendingCloseCol.id = "sp-team-col-pending-close";
        pendingCloseCol.style.cssText =
          "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;display:none;";
        pendingCloseCol.innerHTML =
          '<div style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">🕐 Pendientes <span id="sp-pending-close-count" style="opacity:0.7;">(...)</span></div>' +
          '<div id="sp-pending-close-list" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
        containerDiv.insertBefore(pendingCloseCol, closedCol);

        // Load pending close tickets
        fetchPendingCloseTickets(currentUserGroups).then(
          function (pendingTickets) {
            if (!pendingTickets.length) return;
            pendingCloseCol.style.display = "";
            var countEl = document.getElementById("sp-pending-close-count");
            if (countEl)
              countEl.textContent = "(" + pendingTickets.length + ")";
            var listEl = document.getElementById("sp-pending-close-list");
            if (!listEl) return;
            var withinHours = isWithinWorkHours();
            var html = "";
            pendingTickets.forEach(function (pt) {
              var cursor = withinHours
                ? "cursor:pointer;"
                : "cursor:not-allowed;opacity:0.6;";
              html +=
                '<div class="sp-mgr-ticket sp-pending-ticket" data-ticket-id="' +
                pt.ticketId +
                '" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;' +
                cursor +
                '">' +
                '<div style="font-weight:600;color:#E65100;">' +
                esc(pt.ticket) +
                "</div>" +
                (!withinHours
                  ? '<div style="color:#888;font-size:8px;">🔒 Fuera de horario</div>'
                  : "") +
                "</div>";
            });
            listEl.innerHTML = html;
            // Click handler
            listEl.addEventListener("click", function (e) {
              if (!isWithinWorkHours()) {
                showErrorToast(
                  "⏰ Fuera de horario laboral. No puedes cerrar tickets ahora.",
                );
                return;
              }
              var ticket = e.target.closest(".sp-pending-ticket");
              if (!ticket) return;
              var tId = ticket.dataset.ticketId;
              if (tId)
                document.dispatchEvent(
                  new CustomEvent("sp-open-ticket", {
                    detail: { ticketId: parseInt(tId) },
                  }),
                );
            });
          },
        );

        // Setup drag and drop + click to open
        var dragStartPos = null;
        panel.addEventListener("click", function (e) {
          var ticket = e.target.closest(".sp-team-ticket");
          if (!ticket) return;
          // Only open if it wasn't a drag (mouse didn't move much)
          if (
            dragStartPos &&
            (Math.abs(e.clientX - dragStartPos.x) > 5 ||
              Math.abs(e.clientY - dragStartPos.y) > 5)
          )
            return;
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
              var needsAssign =
                !sourceProfileId || sourceProfileId === "unassigned";
              if (needsAssign) {
                // Assign to logged user first
                var myProfId = await getMyProfileId();
                if (myProfId) {
                  await fetch(SP_API + "/reassign/" + ticketId, {
                    method: "PUT",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      resolutionGroupId: getTeamConfig().resolutionGroupId,
                      serviceId: null,
                      responsibleProfileId: myProfId,
                      resolutionGroup: {
                        label: getTeamConfig().resolutionGroupLabel,
                        value: getTeamConfig().resolutionGroupId,
                      },
                    }),
                  });
                }
              }
              // Close the ticket
              var closeRes = await fetch(
                SP_API +
                  "/update-ticket-status-with-optional-comment/" +
                  ticketId,
                {
                  method: "PATCH",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO,
                    ticketCommentRequest: null,
                  }),
                },
              );
              if (!closeRes.ok) throw new Error("HTTP " + closeRes.status);
              showSuccessToast("Ticket cerrado");
              if (sourceProfileId && sourceProfileId !== "unassigned")
                refreshTeamColumn(sourceProfileId);
              if (sourceProfileId === "unassigned" || fromTable)
                refreshUnassignedColumn();
              refreshClosedColumn();
            } catch (err) {
              showErrorToast("Error: " + err.message);
            }
            return;
          }

          // Don't reassign if dropped on the same column it came from
          var sourceCol = panel.querySelector(
            '.sp-team-ticket[data-ticket-id="' + ticketId + '"]',
          );
          var sourceProfileId = null;
          var fromTable = false;
          if (sourceCol) {
            var sourceZone = sourceCol.closest(".sp-team-tickets");
            if (sourceZone && sourceZone.dataset.profileId === targetProfileId)
              return;
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
          var dropAreaGroupId =
            parseInt(dropZone.dataset.areaGroup) ||
            getTeamConfig().resolutionGroupId;
          var dropAreaConfig =
            Object.values(TEAM_AREAS).find(function (a) {
              return a.resolutionGroupId === dropAreaGroupId;
            }) || getTeamConfig();

          showLoadingToast("Reasignando ticket...");
          try {
            var res = await fetch(SP_API + "/reassign/" + ticketId, {
              method: "PUT",
              headers: spHeaders(),
              body: JSON.stringify({
                resolutionGroupId: dropAreaConfig.resolutionGroupId,
                serviceId: null,
                responsibleProfileId: parseInt(targetProfileId),
                resolutionGroup: {
                  label: dropAreaConfig.resolutionGroupLabel,
                  value: dropAreaConfig.resolutionGroupId,
                },
              }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            var json = await res.json();
            if (json.success) {
              showSuccessToast("Ticket reasignado");

              // Only refresh the two affected columns
              refreshTeamColumn(targetProfileId);
              if (sourceProfileId && sourceProfileId !== "unassigned")
                refreshTeamColumn(sourceProfileId);
              if (sourceProfileId === "unassigned" || fromTable)
                refreshUnassignedColumn();
              // If from table, also refresh the main table buttons
              if (fromTable) {
                var tableRow = document.querySelector(
                  '.MuiDataGrid-row[data-id="' + ticketId + '"]',
                );
                if (tableRow) {
                  var statusCell = tableRow.querySelector(
                    '[data-field="ticketStatusName"]',
                  );
                  if (statusCell) statusCell.textContent = "Asignado";
                  var takeBtn = tableRow.querySelector("." + TAKE_BTN_CLASS);
                  if (takeBtn) takeBtn.remove();
                  var folioEl = tableRow.querySelector(
                    '[data-field="uniqueCode"] p.MuiTypography-body1',
                  );
                  if (folioEl) {
                    folioEl.removeAttribute("draggable");
                    folioEl.style.cursor = "";
                  }
                  tableRow.style.opacity = "1";
                }
              }
            } else {
              throw new Error("No success");
            }
          } catch (err) {
            showErrorToast("Error: " + err.message);
            // Revert: refresh both columns to restore correct state
            refreshTeamColumn(targetProfileId);
            if (sourceProfileId && sourceProfileId !== "unassigned")
              refreshTeamColumn(sourceProfileId);
            if (sourceProfileId === "unassigned" || fromTable)
              refreshUnassignedColumn();
            if (fromTable) {
              var tableRow = document.querySelector(
                '.MuiDataGrid-row[data-id="' + ticketId + '"]',
              );
              if (tableRow) tableRow.style.opacity = "1";
            }
          }
        });

        // Fetch tickets for each member individually and update as they arrive
        areas.forEach(function (area) {
          area.profiles.forEach(function (p) {
            fetch(
              window.SP_CONFIG.SP_SEARCH_API +
                "?responsibleProfileId=" +
                p.profileId +
                "&ticketStatusName=Asignado",
              { headers: spGetHeaders() },
            )
              .then(function (r) {
                return r.json();
              })
              .then(function (json) {
                var tickets = (json.data || json).content || [];
                var col = document.getElementById("sp-team-col-" + p.profileId);
                if (!col) return;
                var countEl = col.querySelector(".sp-team-count");
                if (countEl) countEl.textContent = "(" + tickets.length + ")";
                var listEl = col.querySelector(".sp-team-tickets");
                if (!listEl) return;
                listEl.innerHTML = SP_Templates.ticketList(tickets, {
                  draggable: true,
                  showStatus: true,
                });
              })
              .catch(function () {
                var col = document.getElementById("sp-team-col-" + p.profileId);
                if (col) {
                  var listEl = col.querySelector(".sp-team-tickets");
                  if (listEl)
                    listEl.innerHTML =
                      '<div style="text-align:center;padding:8px;color:#D94040;font-size:10px;">Error</div>';
                }
              });
          });

          // Fetch unassigned tickets (En espera) per area
          fetch(
            SP_SEARCH_API +
              "?page=0&size=50&resolutionGroupId=" +
              area.resolutionGroupId +
              "&ticketStatusName=En%20espera",
            {
              headers: spGetHeaders(),
            },
          )
            .then(function (r) {
              return r.json();
            })
            .then(function (json) {
              var tickets = (json.data || json).content || [];
              var col = document.getElementById(
                "sp-team-col-unassigned-" + area.resolutionGroupId,
              );
              if (!col) return;
              var countEl = col.querySelector(".sp-team-count");
              if (countEl) countEl.textContent = "(" + tickets.length + ")";
              var listEl = col.querySelector(".sp-team-tickets");
              if (!listEl) return;
              listEl.innerHTML = SP_Templates.ticketList(tickets, {
                draggable: true,
                borderColor: "#FF8F00",
                codeColor: "#E65100",
              });
            })
            .catch(function () {});
        });

        // Fetch closed tickets today
        refreshClosedColumn();
      } catch (err) {
        panel.innerHTML =
          '<div style="color:#D94040;padding:8px;font-size:12px;">Error: ' +
          err.message +
          "</div>";
      }
      teamPanelLoading = false;
      injectGuardiasCalendar();
    }

    // --- Guardias Calendar (below team panel) ---
    const GUARDIAS_PANEL_ID = "sp-guardias-calendar-panel";
    function injectGuardiasCalendar() {
      if (document.getElementById(GUARDIAS_PANEL_ID)) return;
      const panel =
        document.getElementById("sp-manager-panel") ||
        document.getElementById(TEAM_PANEL_ID);
      if (!panel) return;

      const calPanel = document.createElement("div");
      calPanel.id = GUARDIAS_PANEL_ID;
      calPanel.style.cssText =
        "margin-top:12px;padding:16px;border-radius:8px;border:2px solid #1976D2;font-family:system-ui;color:inherit;";
      calPanel.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<button id="sp-dba-guardias-prev" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:14px;">◀</button>' +
        '<h4 style="margin:0;font-size:15px;font-weight:600;">📅 Guardias</h4>' +
        '<button id="sp-dba-guardias-next" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:14px;">▶</button>' +
        "</div>" +
        '<div id="sp-dba-guardias-content"><div style="text-align:center;padding:20px;opacity:.6;">Cargando guardias...</div></div>';

      panel.after(calPanel);

      if (window.SP_Guardias) {
        const userName =
          window.SP_Session.state.userName || getLoggedUserName() || "";
        const userId = String(
          window.SP_Session.state.currentUserId || _state.currentUserId || "",
        );
        window.SP_Guardias.load(0, {
          currentUserName: userName,
          currentUserId: userId,
        });
      }
    }

    let teamRefreshing = false;

    function refreshTeamPanel() {
      if (teamRefreshing) return;
      teamRefreshing = true;
      var panel = document.getElementById(TEAM_PANEL_ID);
      if (!panel) {
        teamRefreshing = false;
        loadTeamPanel();
        return;
      }

      var spToken = getToken();
      if (!spToken) return;

      var areas = getActiveAreas();
      var allProfiles = [];
      areas.forEach(function (a) {
        allProfiles = allProfiles.concat(a.profiles);
      });

      var pending = allProfiles.length;
      allProfiles.forEach(function (p) {
        fetch(
          window.SP_CONFIG.SP_SEARCH_API +
            "?responsibleProfileId=" +
            p.profileId +
            "&ticketStatusName=Asignado",
          { headers: spGetHeaders() },
        )
          .then(function (r) {
            return r.json();
          })
          .then(function (json) {
            var tickets = (json.data || json).content || [];
            var col = document.getElementById("sp-team-col-" + p.profileId);
            if (!col) return;
            var countEl = col.querySelector(".sp-team-count");
            if (countEl) countEl.textContent = "(" + tickets.length + ")";
            var listEl = col.querySelector(".sp-team-tickets");
            if (!listEl) return;
            listEl.innerHTML = SP_Templates.ticketList(tickets, {
              draggable: true,
              showStatus: true,
            });
          })
          .catch(function () {})
          .finally(function () {
            pending--;
            if (pending <= 0) teamRefreshing = false;
          });
      });

      refreshUnassignedColumn();
      refreshClosedColumn();
    }

    function refreshTeamColumn(profileId) {
      var spToken = getToken();
      if (!spToken) return;
      fetch(
        window.SP_CONFIG.SP_SEARCH_API +
          "?responsibleProfileId=" +
          profileId +
          "&ticketStatusName=Asignado",
        { headers: spGetHeaders() },
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          var tickets = (json.data || json).content || [];
          var col = document.getElementById("sp-team-col-" + profileId);
          if (!col) return;
          var countEl = col.querySelector(".sp-team-count");
          if (countEl) countEl.textContent = "(" + tickets.length + ")";
          var listEl = col.querySelector(".sp-team-tickets");
          if (!listEl) return;
          listEl.innerHTML = SP_Templates.ticketList(tickets, {
            draggable: true,
            showStatus: true,
          });
        })
        .catch(function () {});
    }

    function refreshUnassignedColumn() {
      var spToken = getToken();
      if (!spToken) return;
      var areas = getActiveAreas();
      areas.forEach(function (area) {
        fetch(
          SP_SEARCH_API +
            "?page=0&size=50&resolutionGroupId=" +
            area.resolutionGroupId +
            "&ticketStatusName=En%20espera",
          {
            headers: spGetHeaders(),
          },
        )
          .then(function (r) {
            return r.json();
          })
          .then(function (json) {
            var tickets = (json.data || json).content || [];
            var col = document.getElementById(
              "sp-team-col-unassigned-" + area.resolutionGroupId,
            );
            if (!col) return;
            var countEl = col.querySelector(".sp-team-count");
            if (countEl) countEl.textContent = "(" + tickets.length + ")";
            var listEl = col.querySelector(".sp-team-tickets");
            if (!listEl) return;
            listEl.innerHTML = SP_Templates.ticketList(tickets, {
              draggable: true,
              borderColor: "#FF8F00",
              codeColor: "#E65100",
            });
          })
          .catch(function () {});
      });
    }

    function refreshClosedColumn() {
      var spToken = getToken();
      if (!spToken) return;
      var today = new Date();
      var todayStart =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0") +
        "T00:00";
      var todayEnd =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0") +
        "T23:59";
      var areas = getActiveAreas();
      var allClosed = [];
      var pending = areas.length;

      areas.forEach(function (area) {
        fetch(
          "https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" +
            area.resolutionGroupId +
            "&ticketStatusName=Cerrado&initDate=" +
            todayStart +
            "&endDate=" +
            todayEnd +
            "&page=0&size=100",
          {
            headers: spGetHeaders(),
          },
        )
          .then(function (r) {
            return r.json();
          })
          .then(function (json) {
            var tickets = (json.data || json).content || [];
            allClosed = allClosed.concat(tickets);
          })
          .catch(function () {})
          .finally(function () {
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
        listEl.innerHTML =
          '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets cerrados hoy</div>';
      } else {
        var html = "";
        tickets.forEach(function (t) {
          html +=
            '<div class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #2E7D32;font-size:10px;line-height:1.3;">';
          html +=
            '<div style="font-weight:600;color:#2E7D32;">' +
            (t.uniqueCode || "") +
            "</div>";
          html +=
            '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' +
            (t.subject || "").substring(0, 30) +
            "</div>";
          html +=
            '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#2E7D32;font-weight:600;font-size:9px;">Cerrado</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' +
            (t.responsibleName || "") +
            '">' +
            (t.responsibleName || "").split(" ")[0] +
            "</span></div>";
          html += "</div>";
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
      const myEmail = getLoggedUserEmail();
      if (!myName && !myEmail) return null;
      try {
        const res = await fetch(
          SP_API.replace("/tickets/web", "") +
            "/tickets/web/active-profiles-by-resolution-group/" +
            getTeamConfig().resolutionGroupId,
          {
            headers: spGetHeaders(),
          },
        );
        if (!res.ok) return null;
        const json = await res.json();
        const profiles = json.data || json;
        // Priority 1: match by email (most reliable)
        var found = null;
        if (myEmail) {
          found = profiles.find(function (p) {
            return p.email && p.email.toLowerCase() === myEmail.toLowerCase();
          });
        }
        // Priority 2: exact name match
        if (!found && myName) {
          found = profiles.find(function (p) {
            return p.profileFullName === myName;
          });
        }
        // Priority 3: partial name match
        if (!found && myName) {
          var nameLower = myName.toLowerCase();
          found = profiles.find(function (p) {
            var full = (p.profileFullName || "").toLowerCase();
            var parts = nameLower.split(/\s+/);
            var matches = parts.filter(function (w) {
              return w.length > 2 && full.includes(w);
            });
            return matches.length >= 2;
          });
        }
        if (found) {
          myProfileId = found.profileId;
          sessionProfileId = found.profileId; // Also cache globally
        }
        return myProfileId;
      } catch (e) {
        return null;
      }
    }

    function createTakeButton(ticketId) {
      const btn = document.createElement("button");
      btn.className = TAKE_BTN_CLASS;
      btn.textContent = "🤚 Tomar";
      btn.title = "Tomar ticket";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #1976D2;border-radius:4px;background:#1976D2;color:#fff;margin-left:6px;white-space:nowrap;";
      hoverText(btn, "🤚 Tomar", "✊ Tomar");
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        e.preventDefault();
        btn.disabled = true;
        var origText = btn.textContent;
        btn.innerHTML = spinnerHTML(12);
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
          headers: spGetHeaders(),
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
          createdAtFormatted: t.createdAt
            ? t.createdAt.replace("T", " ").substring(0, 16)
            : "",
        };
      } catch (e) {
        return null;
      }
    }

    function ticketSummaryHTML(info) {
      if (!info) return "";
      const fullText = (info.subject || "") + " " + (info.desc || "");

      // Use centralized detection engine for ALL detections
      const detections = window.SP_DetailView.detectAll(fullText);

      const statusColor = STATUS_COLORS[info.status] || "rgba(0,0,0,0.05)";
      const cardBorderColor = STATUS_TEXT_COLORS[info.status] || "#2196F3";
      const rowStyle =
        "padding:10px 14px;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;gap:8px;";

      const card =
        '<div style="border:2px solid ' +
        cardBorderColor +
        ";border-top:5px solid " +
        cardBorderColor +
        ';border-radius:10px;overflow:hidden;margin-bottom:16px;font-size:13px;font-family:system-ui;background:#fff;">' +
        '<div style="' +
        rowStyle +
        'justify-content:space-between;">' +
        '<span>📁 <b>Folio:</b> <span style="color:#1976D2;font-weight:700;">' +
        info.uniqueCode +
        "</span></span>" +
        "<span>📅 <b>Fecha:</b> " +
        (info.createdAtFormatted || "N/A") +
        "</span>" +
        "</div>" +
        '<div style="' +
        rowStyle +
        '"><span>✉️ <b>Asunto:</b> ' +
        info.subject +
        "</span></div>" +
        '<div style="' +
        rowStyle +
        '"><span>👤 <b>Solicitante:</b> ' +
        (info.requester || "N/A") +
        "</span></div>" +
        '<div style="' +
        rowStyle +
        '"><span>🔍 <b>Analista:</b> ' +
        info.holder +
        (info.holderEmail
          ? ' <span style="color:#888;">(' + info.holderEmail + ")</span>"
          : "") +
        "</span></div>" +
        '<div style="' +
        rowStyle +
        '"><span>✅ <b>Estatus:</b> <span style="color:' +
        (STATUS_TEXT_COLORS[info.status] || "#333") +
        ';font-weight:700;">' +
        (info.status || "N/A") +
        "</span></span></div>" +
        (info.desc
          ? '<div style="' +
            rowStyle +
            'flex-direction:column;align-items:flex-start;"><b>📝 Descripción:</b><div style="margin-top:4px;max-height:60px;overflow:auto;font-size:12px;color:#555;width:100%;">' +
            info.desc +
            "</div></div>"
          : "") +
        "</div>";

      // Build detection sections using shared data
      const slHTML =
        detections.slCodes.length && _canShowLabels
          ? '<div style="margin-bottom:8px;padding:8px 10px;background:#E3F2FD;border-radius:6px;border-left:4px solid #1976D2;"><b style="font-size:11px;color:#1976D2;">📋 SL/PR detectadas:</b> ' +
            detections.slCodes
              .map(function (sl) {
                return (
                  '<span class="sp-sl-copy" data-sl="' +
                  sl +
                  '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #1976D2;border-radius:4px;font-weight:600;font-size:12px;">' +
                  sl +
                  "</span>"
                );
              })
              .join("") +
            "</div>"
          : "";

      const userHTML = detections.users.length
        ? '<div style="margin-bottom:8px;padding:8px 10px;background:#FFF3E0;border-radius:6px;border-left:4px solid #E65100;"><b style="font-size:11px;color:#E65100;">🖥️ Usuarios detectados:</b> ' +
          detections.users
            .map(function (u) {
              return (
                '<span class="sp-user-copy" data-user="' +
                u +
                '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #E65100;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">' +
                u +
                "</span>"
              );
            })
            .join("") +
          "</div>"
        : "";

      const dbHTML =
        detections.dbObjects.length && _canShowLabels
          ? '<div style="margin-bottom:8px;padding:8px 10px;background:#E8F5E9;border-radius:6px;border-left:4px solid #2E7D32;"><b style="font-size:11px;color:#2E7D32;">🗄️ Objetos de BD:</b> ' +
            detections.dbObjects
              .map(function (obj) {
                return (
                  '<span class="sp-db-copy" data-db="' +
                  obj +
                  '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #2E7D32;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">' +
                  obj +
                  "</span>"
                );
              })
              .join("") +
            "</div>"
          : "";

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
      var html =
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html +=
        '<thead><tr style="background:rgba(0,0,0,0.05);text-align:left;">' +
        '<th style="padding:6px;">Folio</th>' +
        '<th style="padding:6px;">Fecha</th>' +
        '<th style="padding:6px;">Asunto</th>' +
        '<th style="padding:6px;">Solicitante</th>' +
        '<th style="padding:6px;">Estado</th>' +
        '<th style="padding:6px;">Analista</th>' +
        '<th style="padding:6px;min-width:200px;">Acciones</th>' +
        "</tr></thead><tbody>";

      tickets.forEach(function (t) {
        var statusColor = STATUS_COLORS[t.ticketStatusName] || "transparent";
        var textColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
        var date = (t.createdAt || "").replace("T", " ").substring(0, 16);
        var subject =
          (t.subject || "").substring(0, 40) +
          ((t.subject || "").length > 40 ? "..." : "");
        html +=
          '<tr style="background:' +
          statusColor +
          ';border-bottom:1px solid #eee;">';
        html +=
          '<td style="padding:6px;font-weight:600;white-space:nowrap;"><a href="/es/dashboard/tickets/' +
          t.id +
          '" target="_blank" style="color:inherit;text-decoration:none;">' +
          (t.uniqueCode || t.id) +
          '</a><span class="sp-card-copy" data-code="' +
          (t.uniqueCode || "") +
          '"></span></td>';
        html += '<td style="padding:6px;font-size:11px;">' + date + "</td>";
        html +=
          '<td style="padding:6px;" title="' +
          esc(t.subject || "") +
          '">' +
          subject +
          "</td>";
        html += '<td style="padding:6px;">' + (t.requesterName || "") + "</td>";
        html +=
          '<td style="padding:6px;font-size:11px;font-weight:700;color:' +
          textColor +
          ';">' +
          (t.ticketStatusName || "") +
          "</td>";
        html +=
          '<td style="padding:6px;">' +
          (t.responsibleName || "Sin asignar") +
          "</td>";
        html +=
          '<td style="padding:8px;white-space:nowrap;display:flex;align-items:center;gap:6px;flex-wrap:wrap;" class="sp-card-actions" data-id="' +
          t.id +
          '" data-status="' +
          (t.ticketStatusName || "") +
          '" data-responsible="' +
          (t.responsibleName || "") +
          '" data-code="' +
          (t.uniqueCode || "") +
          '"></td>';
        html += "</tr>";
      });

      html += "</tbody></table>";
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
        if (
          (status === "Asignado" || status === "En atención") &&
          responsible &&
          myName &&
          responsible === myName
        )
          cell.appendChild(createCloseButton(id));
        if (
          (status === "Asignado" || status === "En atención") &&
          responsible &&
          myName &&
          responsible !== myName
        )
          cell.appendChild(createStealButton(id, responsible));
        if (status === "Cerrado") {
          if (code && synced[code]) {
            // Green border on ticket button + expandable Monday link
            var ticketBtn =
              cell.querySelector("p.MuiTypography-body1") ||
              cell.querySelector("a") ||
              cell;
            if (ticketBtn)
              ticketBtn.style.cssText +=
                ";border:2px solid #2E7D32;border-radius:4px;padding:2px 6px;";
            var mondayLink = createSyncedBadge(synced[code]);
            cell.appendChild(mondayLink);
            // Hover on the cell expands the link
            cell.addEventListener("mouseenter", function () {
              mondayLink.style.width = "24px";
              mondayLink.style.opacity = "1";
              mondayLink.style.padding = "4px 6px";
            });
            cell.addEventListener("mouseleave", function () {
              mondayLink.style.width = "0";
              mondayLink.style.opacity = "0";
              mondayLink.style.padding = "4px 0";
            });
            row.style.borderLeft = "3px solid #2E7D32";
          } else {
            // Check if ticket date matches board
            var dateCell = cell.closest("tr")?.querySelector("td:nth-child(2)");
            var dText = dateCell ? dateCell.textContent.trim() : "";
            var dMatch = dText.match(/(\d{4})-(\d{2})/);
            var matches =
              !boardDate ||
              !dMatch ||
              (parseInt(dMatch[2]) - 1 === boardDate.month &&
                parseInt(dMatch[1]) === boardDate.year);
            if (matches && synced[id])
              cell.appendChild(createSyncedBadge(synced[id]));
          }
        }

        // Ir al ticket button
        var link = document.createElement("a");
        link.href = "/es/dashboard/tickets/" + id;
        link.target = "_blank";
        link.textContent = "Ir al ticket";
        link.style.cssText =
          "display:inline-block;padding:4px 12px;background:#2196F3;color:#fff;font-size:11px;font-weight:600;text-decoration:none;border-radius:4px;white-space:nowrap;";
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
          var gData = await mondayQuery(
            mondayToken,
            "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
            { boardId },
          );
          groups = gData.boards[0]?.groups || [];
        } catch (e) {}
      }
      var groupOpts =
        '<option value="">-- No migrar --</option>' +
        groups
          .map(function (g) {
            return '<option value="' + g.id + '">' + g.title + "</option>";
          })
          .join("");

      var overlay = document.createElement("div");
      overlay.id = "sp-take-modal";
      var m = SP_Modal.info({
        id: "sp-take-modal",
        title: "🤚 Tomar ticket #" + ticketId,
        content:
          summaryHTML +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario al tomar</label>' +
          '<textarea id="sp-take-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="se revisa"></textarea>' +
          '<div style="margin-bottom:12px;"><label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="sp-take-done"> <b>Ticket realizado</b></label></div>' +
          '<div id="sp-take-close-comment-section" style="display:none;margin-bottom:12px;">' +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario antes de cerrar (opcional)</label>' +
          '<textarea id="sp-take-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;" placeholder="Comentario de cierre..."></textarea>' +
          "</div>" +
          '<div id="sp-take-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-take-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">✊ Tomar ticket</button>' +
          '<button id="sp-take-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          "</div>",
        maxWidth: "420px",
      });
      overlay = m.overlay;
      injectSLCopyButtons(overlay);

      var confirmBtn = document.getElementById("sp-take-confirm");
      var cancelBtn = document.getElementById("sp-take-cancel");
      var msg = document.getElementById("sp-take-msg");
      var doneCheck = document.getElementById("sp-take-done");
      var migrateSection = document.getElementById("sp-take-migrate-section");
      var closeCommentSection = document.getElementById(
        "sp-take-close-comment-section",
      );
      var takeGroupSelect = document.getElementById("sp-take-group");

      doneCheck.addEventListener("change", function () {
        migrateSection.style.display = doneCheck.checked ? "block" : "none";
        closeCommentSection.style.display = doneCheck.checked
          ? "block"
          : "none";
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

      cancelBtn.addEventListener("click", function () {
        m.close();
      });

      confirmBtn.addEventListener("click", async function () {
        var comment =
          document.getElementById("sp-take-comment").value.trim() ||
          "se revisa";
        var closeComment = doneCheck.checked
          ? document.getElementById("sp-take-close-comment").value.trim()
          : "";
        overlay.remove();
        originalBtn.disabled = true;
        originalBtn.innerHTML = spinnerHTML(12);
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
            resolutionGroup: {
              label: getTeamConfig().resolutionGroupLabel,
              value: getTeamConfig().resolutionGroupId,
            },
          };
          body.ticketCommentRequest = { internal: false, content: comment };
          var res = await fetch(SP_API + "/reassign/" + ticketId, {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          if (json.success) {
            // If "Ticket realizado" is checked, also close and optionally migrate
            if (doneCheck.checked) {
              // Check work hours before closing
              if (!isWithinWorkHours()) {
                // Save as pending close
                try {
                  var storedP = await new Promise(function (r) {
                    chrome.storage.local.get(
                      ["usersMap", "userEmail"],
                      function (d) {
                        r(d);
                      },
                    );
                  });
                  var pEmail = (storedP.userEmail || "").toLowerCase();
                  var pUsers = storedP.usersMap || {};
                  var pUser = pUsers[pEmail];
                  if (pUser && pUser.idUsuario) {
                    await saveTicketPendingClose(
                      info?.uniqueCode || "T" + ticketId,
                      ticketId,
                      String(pUser.idUsuario),
                      "",
                    );
                  }
                } catch (e) {}
                showSuccessToast(
                  "Ticket tomado. Cierre pendiente (fuera de horario).",
                );
                originalBtn.textContent = "✅ Tomado";
                originalBtn.disabled = false;
                return;
              }
              // Add close comment if provided
              if (closeComment) {
                await fetch(SP_API + "/comment/" + ticketId, {
                  method: "POST",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    content: "<p>" + closeComment + "</p>",
                    internal: false,
                  }),
                });
              }
              // Close ticket
              var closeRes = await fetch(
                SP_API +
                  "/update-ticket-status-with-optional-comment/" +
                  ticketId,
                {
                  method: "PATCH",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO,
                    ticketCommentRequest: null,
                  }),
                },
              );
              if (!closeRes.ok)
                throw new Error("Error al cerrar: HTTP " + closeRes.status);

              // Migrate if group selected and ticket matches board period
              var selectedGroup = takeGroupSelect.value;
              var canMigrateTake = selectedGroup
                ? await canMigrateTicket(info.createdAt)
                : false;
              if (selectedGroup && !canMigrateTake) {
                showErrorToast(
                  "Ticket tomado y cerrado, pero NO migrado: no corresponde al mes del board.",
                );
              }
              if (selectedGroup && canMigrateTake && mondayToken && boardId) {
                // Check if already exists in Monday before creating
                var existingItemId = await checkTicketExistsInMonday(
                  mondayToken,
                  ticket?.uniqueCode || "",
                );
                if (!existingItemId) {
                  var ticketRes = await fetch(SP_API + "/" + ticketId, {
                    headers: spGetHeaders(),
                  });
                  var ticketJson = await ticketRes.json();
                  var ticket = ticketJson.data || ticketJson;
                  var holderEmail =
                    ticket.ticketHolder?.ticketHolderLog?.email || "";
                  var users = await getMondayUsers(mondayToken);
                  var personValue = {};
                  if (holderEmail) {
                    var userId = users[holderEmail.toLowerCase()];
                    if (userId)
                      personValue = {
                        personsAndTeams: [
                          { id: parseInt(userId), kind: "person" },
                        ],
                      };
                  }
                  var url = BASE_URL + "/" + ticketId;
                  var desc = (ticket.description || "").replace(/<[^>]*>/g, "");
                  var itemName = ticket.subject || "Sin asunto";
                  var createdDate = new Date(ticket.createdAt)
                    .toISOString()
                    .slice(0, 10);
                  var spPriority = (
                    ticket.incidentPriorityName ||
                    ticket.incidentPriority?.name ||
                    ""
                  )
                    .toLowerCase()
                    .trim();
                  var priorityIndex =
                    PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];
                  var columnValues = JSON.stringify({
                    descripci_n_mkn9e5f4: { text: desc },
                    ...(personValue.personsAndTeams
                      ? { multiple_person_mm25nvfq: personValue }
                      : {}),
                    status: { index: 1 },
                    priority_mkn9kbe9: { index: priorityIndex },
                    cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
                    link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
                    text_mm2c9nhc: ticket.uniqueCode || ticketId,
                  });
                  var result = await mondayQuery(
                    mondayToken,
                    "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
                    {
                      boardId: boardId,
                      groupId: selectedGroup,
                      itemName: itemName,
                      columnValues: columnValues,
                    },
                  );
                  addToCache(
                    ticket.uniqueCode || ticketId,
                    result.create_item.id,
                  );
                } else {
                  addToCache(ticket?.uniqueCode || ticketId, existingItemId);
                }
              }

              // Update UI
              var row = originalBtn.closest(".MuiDataGrid-row");
              if (row) {
                var synced = getCache() || {};
                var uc = info?.uniqueCode || ticketId;
                if (selectedGroup && synced[uc]) {
                  originalBtn.replaceWith(createSyncedBadge(synced[uc]));
                } else {
                  originalBtn.replaceWith(createButton(ticketId));
                }
                var oldSteal = row.querySelector("." + STEAL_BTN_CLASS);
                if (oldSteal) oldSteal.remove();
                var oldTake = row.querySelector("." + TAKE_BTN_CLASS);
                if (oldTake) oldTake.remove();
                var oldClose = row.querySelector("." + CLOSE_BTN_CLASS);
                if (oldClose) oldClose.remove();
                var statusCell = row.querySelector(
                  '[data-field="ticketStatusName"]',
                );
                if (statusCell) statusCell.textContent = "Cerrado";
              }
              showSuccessToast(
                selectedGroup && canMigrateTake
                  ? "Ticket tomado, cerrado y migrado"
                  : "Ticket tomado y cerrado",
              );
            } else {
              // Just take
              var newCloseBtn = createCloseButton(ticketId);
              originalBtn.replaceWith(newCloseBtn);
              var row = newCloseBtn.closest(".MuiDataGrid-row");
              if (row) {
                var oldSteal = row.querySelector("." + STEAL_BTN_CLASS);
                if (oldSteal) oldSteal.remove();
                var oldTake = row.querySelector("." + TAKE_BTN_CLASS);
                if (oldTake) oldTake.remove();
                row.classList.add(HIGHLIGHT_CLASS);
                row.style.position = "relative";
                var indicator = document.createElement("span");
                indicator.textContent = "❗";
                indicator.style.cssText =
                  "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
                row.appendChild(indicator);
                var statusCell = row.querySelector(
                  '[data-field="ticketStatusName"]',
                );
                if (statusCell) statusCell.textContent = "Asignado";
              }
              showSuccessToast("Ticket tomado");
            }
            if (isDetailView()) {
              if (doneCheck.checked) {
                // Show close tab / stay modal
                SP_Modal.success({
                  id: "sp-take-success",
                  title: "✅ Ticket tomado, cerrado y migrado",
                  message: "El ticket fue procesado correctamente.",
                  buttons: [
                    {
                      text: "Cerrar pestaña",
                      color: "#D94040",
                      onClick: function () {
                        window.close();
                      },
                    },
                    {
                      text: "Quedarme",
                      color: null,
                      onClick: function (close) {
                        close();
                        window.location.reload();
                      },
                    },
                  ],
                });
              } else {
                setTimeout(function () {
                  window.location.reload();
                }, 1500);
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
      btn.title = responsibleName
        ? "Asignado a: " + responsibleName
        : "Robar ticket";
      btn.style.cssText =
        "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #E65100;border-radius:4px;background:#E65100;color:#fff;margin-left:6px;white-space:nowrap;";
      hoverText(btn, "🥷 Robar", "💀 Robar");
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        e.preventDefault();
        btn.disabled = true;
        var origText = btn.textContent;
        btn.innerHTML = spinnerHTML(12);
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
      hoverText(btn, "🔒 Cerrar", "🔐 Cerrar");
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        e.preventDefault();
        btn.disabled = true;
        var origText = btn.textContent;
        btn.innerHTML = spinnerHTML(12);
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
        mondayToken && boardId
          ? mondayQuery(
              mondayToken,
              "query ($boardId: [ID!]!) { boards(ids: $boardId) { name groups { id title } } }",
              { boardId },
            ).catch(function () {
              return null;
            })
          : Promise.resolve(null),
      ]);
      var summaryHTML = ticketSummaryHTML(info);
      var groups = groupsData?.boards?.[0]?.groups || [];
      var groupOpts =
        '<option value="">-- Selecciona destino --</option>' +
        groups
          .map(function (g) {
            return '<option value="' + g.id + '">' + g.title + "</option>";
          })
          .join("");

      var m = SP_Modal.info({
        id: "sp-close-modal-single",
        title: "🔒 Cerrar ticket #" + ticketId,
        content:
          summaryHTML +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario (opcional)</label>' +
          '<textarea id="sp-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe un comentario..."></textarea>' +
          '<div id="sp-close-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar ticket</button>' +
          '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          "</div>",
        maxWidth: "420px",
      });
      var overlay = m.overlay;
      injectSLCopyButtons(overlay);

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

      cancelBtn.addEventListener("click", function () {
        m.close();
      });

      confirmBtn.addEventListener("click", async function () {
        var selectedGroup = groupSelect.value;
        if (!selectedGroup) {
          msg.textContent = "Selecciona un destino en Monday para migrar.";
          return;
        }
        var commentText = document
          .getElementById("sp-close-comment")
          .value.trim();
        overlay.remove();
        originalBtn.disabled = true;
        originalBtn.innerHTML = spinnerHTML(12);
        showLoadingToast(
          selectedGroup ? "Cerrando y migrando..." : "Cerrando ticket...",
        );

        var spToken = getToken();
        try {
          // Step 1: Add comment if provided
          if (commentText) {
            var commentRes = await fetch(SP_API + "/comment/" + ticketId, {
              method: "POST",
              headers: spHeaders(),
              body: JSON.stringify({
                content: "<p>" + commentText + "</p>",
                internal: false,
              }),
            });
            if (!commentRes.ok)
              throw new Error(
                "Error al agregar comentario: HTTP " + commentRes.status,
              );
          }

          // Step 1.5: If no one is assigned, assign to logged user first
          if (!info.holder || info.holder === "Sin asignar") {
            var myProfId = await getMyProfileId();
            if (myProfId) {
              var assignRes = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: spHeaders(),
                body: JSON.stringify({
                  resolutionGroupId: getTeamConfig().resolutionGroupId,
                  serviceId: null,
                  responsibleProfileId: myProfId,
                  resolutionGroup: {
                    label: getTeamConfig().resolutionGroupLabel,
                    value: getTeamConfig().resolutionGroupId,
                  },
                }),
              });
              if (!assignRes.ok)
                throw new Error("Error al asignar: HTTP " + assignRes.status);
            }
          }

          // Step 2: Close ticket
          var res = await fetch(
            SP_API + "/update-ticket-status-with-optional-comment/" + ticketId,
            {
              method: "PATCH",
              headers: spHeaders(),
              body: JSON.stringify({
                nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO,
                ticketCommentRequest: null,
              }),
            },
          );
          if (!res.ok) throw new Error("HTTP " + res.status);

          // Check if ticket matches board period before migrating
          var canMigrate = selectedGroup
            ? await canMigrateTicket(info.createdAt)
            : false;
          if (selectedGroup && !canMigrate) {
            showErrorToast(
              "Ticket cerrado, pero NO migrado: no corresponde al mes del board configurado.",
            );
          }

          if (selectedGroup && canMigrate && mondayToken && boardId && info) {
            var ticketRes = await fetch(SP_API + "/" + ticketId, {
              headers: spGetHeaders(),
            });
            var ticketJson = await ticketRes.json();
            var ticket = ticketJson.data || ticketJson;

            // Check if already exists in Monday
            var existingItemId = await checkTicketExistsInMonday(
              mondayToken,
              ticket.uniqueCode || "",
            );
            if (!existingItemId) {
              var holderEmail =
                ticket.ticketHolder?.ticketHolderLog?.email || "";
              var users = await getMondayUsers(mondayToken);
              var personValue = {};
              if (holderEmail) {
                var userId = users[holderEmail.toLowerCase()];
                if (userId)
                  personValue = {
                    personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
                  };
              }

              var url = BASE_URL + "/" + ticketId;
              var desc = (ticket.description || "").replace(/<[^>]*>/g, "");
              var itemName = ticket.subject || "Sin asunto";
              var createdDate = new Date(ticket.createdAt)
                .toISOString()
                .slice(0, 10);
              var spPriority = (
                ticket.incidentPriorityName ||
                ticket.incidentPriority?.name ||
                ""
              )
                .toLowerCase()
                .trim();
              var priorityIndex =
                PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];

              var columnValues = JSON.stringify({
                descripci_n_mkn9e5f4: { text: desc },
                ...(personValue.personsAndTeams
                  ? { multiple_person_mm25nvfq: personValue }
                  : {}),
                status: { index: 1 },
                priority_mkn9kbe9: { index: priorityIndex },
                cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
                link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
                text_mm2c9nhc: ticket.uniqueCode || ticketId,
              });

              var result = await mondayQuery(
                mondayToken,
                "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
                {
                  boardId: boardId,
                  groupId: selectedGroup,
                  itemName: itemName,
                  columnValues: columnValues,
                },
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
            var statusCell = row.querySelector(
              '[data-field="ticketStatusName"]',
            );
            if (statusCell) statusCell.textContent = "Cerrado";
          }
          showSuccessToast(
            selectedGroup ? "Ticket cerrado y migrado" : "Ticket cerrado",
          );
          if (isDetailView()) {
            SP_Modal.success({
              id: "sp-close-success",
              title: "✅ Ticket cerrado",
              message: selectedGroup
                ? "El ticket fue cerrado y migrado a Monday."
                : "El ticket fue cerrado correctamente.",
              buttons: [
                {
                  text: "Cerrar pestaña",
                  color: "#D94040",
                  onClick: function () {
                    window.close();
                  },
                },
                {
                  text: "Quedarme",
                  color: null,
                  onClick: function (close) {
                    close();
                    window.location.reload();
                  },
                },
              ],
            });
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
          originalBtn.textContent = "🔒 Cerrar";
          originalBtn.disabled = false;
        }
      });
    }

    function showReopenModal(ticketId, currentHolder) {
      const existing = document.getElementById("sp-reopen-modal");
      if (existing) existing.remove();

      const profiles = getTeamConfig().profiles;
      const opts = profiles
        .map(function (p) {
          return (
            '<option value="' +
            p.profileId +
            '">' +
            esc(p.profileFullName) +
            "</option>"
          );
        })
        .join("");

      const holderInfo =
        currentHolder && currentHolder !== "Sin asignar"
          ? '<p style="font-size:12px;color:#888;margin:0 0 12px;">Asignado actualmente a: <b>' +
            esc(currentHolder) +
            "</b></p>"
          : "";

      SP_Modal.form({
        id: "sp-reopen-modal",
        title: "🔓 Reabrir ticket #" + ticketId,
        content:
          '<p style="font-size:13px;color:#555;margin:0 0 12px;">Al reasignar un ticket cerrado a otra persona, se reabrirá automáticamente.</p>' +
          holderInfo +
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Reasignar a:</label>' +
          '<select id="sp-reopen-person" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">' +
          '<option value="">-- Selecciona --</option>' +
          opts +
          "</select>",
        submitText: "🔄 Reabrir",
        submitColor: "#FF8F00",
        maxWidth: "400px",
        onSubmit: async function (api) {
          const personId = api.getElement("#sp-reopen-person").value;
          if (!personId) {
            window.showErrorToast("Selecciona a quién reasignar.");
            return;
          }

          api.close();
          showLoadingToast("Reabriendo ticket...");

          try {
            const res = await fetch(SP_API + "/reassign/" + ticketId, {
              method: "PUT",
              headers: spHeaders(),
              body: JSON.stringify({
                resolutionGroupId: getTeamConfig().resolutionGroupId,
                serviceId: null,
                responsibleProfileId: parseInt(personId),
                resolutionGroup: {
                  label: getTeamConfig().resolutionGroupLabel,
                  value: getTeamConfig().resolutionGroupId,
                },
              }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const json = await res.json();
            if (json.success) {
              showSuccessToast("Ticket reabierto y reasignado");
              setTimeout(function () {
                window.location.reload();
              }, 1500);
            } else {
              throw new Error("No se pudo reabrir");
            }
          } catch (err) {
            showErrorToast("Error: " + err.message);
          }
        },
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
        var responsibleCell = row.querySelector(
          '[data-field="responsibleName"]',
        );
        var responsible = responsibleCell
          ? responsibleCell.textContent.trim()
          : "";
        rows.push({
          ticketId: ticketId,
          code: code,
          subject: subject,
          responsible: responsible,
          row: row,
        });
      });
      return rows;
    }

    async function handleBulkClose() {
      var bulkCloseBtn = document.getElementById(BULK_CLOSE_BTN_ID);
      if (bulkCloseBtn) {
        bulkCloseBtn.disabled = true;
        bulkCloseBtn.innerHTML = spinnerHTML(14, "Cargando...");
      }
      function restoreCloseBtn() {
        if (bulkCloseBtn) {
          bulkCloseBtn.disabled = false;
          bulkCloseBtn.textContent = "🔒 Cerrar varios";
        }
      }

      var spToken = getToken();
      if (!spToken) {
        restoreCloseBtn();
        return alert("No se encontro token de SupportPlus.");
      }

      var assigned = getAssignedRows();
      if (!assigned.length) {
        restoreCloseBtn();
        return alert("No hay tickets asignados en esta pagina.");
      }

      // Build ticket rows with checkboxes
      var ticketRows = assigned
        .map(function (p, i) {
          var label =
            p.code +
            (p.subject
              ? " - " +
                p.subject.substring(0, 35) +
                (p.subject.length > 35 ? "..." : "")
              : "");
          var resp = p.responsible
            ? ' <span style="color:#888;font-size:10px;">(' +
              p.responsible +
              ")</span>"
            : "";
          return (
            '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
            '<input type="checkbox" data-idx="' +
            i +
            '" class="sp-close-check" style="cursor:pointer;">' +
            '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            label +
            resp +
            "</span>" +
            "</div>"
          );
        })
        .join("");

      restoreCloseBtn();

      var m = SP_Modal.info({
        id: "sp-close-modal",
        title: "🔒 Cerrar tickets (" + assigned.length + " asignados)",
        content:
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<label style="font-size:12px;color:#555;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="sp-close-all"> Seleccionar todos</label>' +
          "</div>" +
          '<div style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px;">' +
          ticketRows +
          "</div>" +
          '<div id="sp-close-msg" style="font-size:13px;margin-bottom:8px;min-height:20px;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-close-start" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar seleccionados</button>' +
          '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
          "</div>",
        maxWidth: "560px",
        modalOptions: { maxHeight: "85vh" },
      });
      var overlay = m.overlay;

      // Select all toggle
      document
        .getElementById("sp-close-all")
        .addEventListener("change", function () {
          var checked = this.checked;
          overlay.querySelectorAll(".sp-close-check").forEach(function (cb) {
            cb.checked = checked;
          });
        });

      var startBtn = document.getElementById("sp-close-start");
      var cancelBtn = document.getElementById("sp-close-cancel");
      var msg = document.getElementById("sp-close-msg");

      cancelBtn.addEventListener("click", function () {
        m.close();
      });

      startBtn.addEventListener("click", async function () {
        var selected = [];
        overlay.querySelectorAll(".sp-close-check").forEach(function (cb) {
          if (cb.checked) selected.push(parseInt(cb.dataset.idx));
        });
        if (!selected.length) {
          msg.textContent = "Selecciona al menos un ticket.";
          return;
        }

        startBtn.disabled = true;
        startBtn.style.background = "#999";
        startBtn.innerHTML = spinnerHTML(16, "Cerrando...");
        cancelBtn.style.display = "none";

        var ok = 0,
          fail = 0;
        for (var i = 0; i < selected.length; i++) {
          var idx = selected[i];
          var t = assigned[idx];
          msg.textContent =
            "Cerrando " + (i + 1) + " / " + selected.length + "...";
          try {
            var res = await fetch(
              SP_API +
                "/update-ticket-status-with-optional-comment/" +
                t.ticketId,
              {
                method: "PATCH",
                headers: spHeaders(),
                body: JSON.stringify({
                  nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO,
                  ticketCommentRequest: null,
                }),
              },
            );
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

        msg.textContent =
          "Completado: " + ok + " cerrados, " + fail + " errores";
        startBtn.innerHTML = "✅ Listo";
        startBtn.style.background = "#2E7D32";
        cancelBtn.style.display = "";
        cancelBtn.textContent = "Cerrar";
        cancelBtn.addEventListener("click", function () {
          overlay.remove();
        });
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
      hoverText(btn, "🔒 Cerrar varios", "🔐 Cerrar varios");
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
    const SP_SEARCH_API =
      "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
    var activeModalRefresh = null;

    // --- Config button (header-buttons.js handles initial injection, this handles the click action) ---
    const CONFIG_BTN_ID = "sp-config-btn";

    function injectConfigButton() {
      // No-op: already injected by features/header-buttons.js
      // Kept for backward compat with header observer calls
    }

    // Allow opening config from outside initExtension
    _showConfigModal = showConfigModal;

    function showConfigModal() {
      var existing = document.getElementById("sp-config-modal");
      if (existing) existing.remove();

      // Load current values
      chrome.storage.local.get(
        [
          "mondayToken",
          "mondayBoardId",
          "mondayBoardName",
          "teamArea",
          "ignoredEmails",
          "myProfileId",
        ],
        function (stored) {
          var currentToken = stored.mondayToken || "";
          var currentBoardId = stored.mondayBoardId || "";
          var currentBoardName = stored.mondayBoardName || "";
          var currentArea = stored.teamArea || "dba";

          var cfgM = SP_Modal.info({
            id: "sp-config-modal",
            title: "⚙️ Configuración",
            content:
              '<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #eee;">' +
              '<button id="sp-cfg-tab-area" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid #D94040;color:#D94040;">Área de trabajo</button>' +
              '<button id="sp-cfg-tab-monday" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;color:#888;">Monday.com</button>' +
              "</div>" +
              '<div id="sp-cfg-panel-area">' +
              '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Área de trabajo</label>' +
              '<select id="sp-cfg-area" style="width:100%;padding:8px;font-size:13px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">' +
              '<option value="">-- Selecciona tu grupo --</option>' +
              (currentUserGroups.length > 0
                ? currentUserGroups
                : GROUP_INFO.map(function (g) {
                    return g.id;
                  })
              )
                .map(function (gId) {
                  var g = GROUP_INFO.find(function (gi) {
                    return gi.id === gId;
                  }) || { id: gId, name: "Grupo " + gId };
                  return (
                    '<option value="' +
                    g.id +
                    '"' +
                    (String(currentArea) === String(g.id) ? " selected" : "") +
                    ">" +
                    g.name +
                    "</option>"
                  );
                })
                .join("") +
              "</select>" +
              '<div id="sp-cfg-members" style="margin-bottom:8px;max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:6px;display:' +
              (currentArea ? "block" : "none") +
              ';"><div style="color:#888;font-size:11px;">Cargando miembros...</div></div>' +
              '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:12px;cursor:pointer;"><input type="checkbox" id="sp-cfg-only-with-tickets"> Solo mostrar personas con tickets</label>' +
              "</div>" +
              '<div id="sp-cfg-panel-monday" style="display:none;">' +
              '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Token de Monday</label>' +
              '<input id="sp-cfg-monday-token" type="password" value="' +
              (currentToken ? "••••••••" : "") +
              '" placeholder="Pega tu token de Monday aquí..." style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:4px;">' +
              '<div style="font-size:10px;color:#999;margin-bottom:12px;">Tu token personal de Monday. Se guarda encriptado.</div>' +
              "</div>" +
              '<div style="display:flex;gap:8px;margin-top:12px;">' +
              '<button id="sp-cfg-save" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">💾 Guardar</button>' +
              '<button id="sp-cfg-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
              "</div>",
            maxWidth: "450px",
          });
          var overlay = cfgM.overlay;

          // Events
          document
            .getElementById("sp-cfg-cancel")
            .addEventListener("click", function () {
              cfgM.close();
            });

          // Tab switching
          var tabArea = document.getElementById("sp-cfg-tab-area");
          var tabMonday = document.getElementById("sp-cfg-tab-monday");
          var panelArea = document.getElementById("sp-cfg-panel-area");
          var panelMonday = document.getElementById("sp-cfg-panel-monday");
          tabArea.addEventListener("click", function () {
            panelArea.style.display = "block";
            panelMonday.style.display = "none";
            tabArea.style.borderBottom = "2px solid #D94040";
            tabArea.style.color = "#D94040";
            tabMonday.style.borderBottom = "none";
            tabMonday.style.color = "#888";
          });
          tabMonday.addEventListener("click", function () {
            panelArea.style.display = "none";
            panelMonday.style.display = "block";
            tabMonday.style.borderBottom = "2px solid #D94040";
            tabMonday.style.color = "#D94040";
            tabArea.style.borderBottom = "none";
            tabArea.style.color = "#888";
          });

          // Members checkboxes
          var membersDiv = document.getElementById("sp-cfg-members");
          var onlyWithTicketsEl = document.getElementById(
            "sp-cfg-only-with-tickets",
          );

          // Load user config
          // Load user config from memory
          if (_userConfig.onlyWithTickets) onlyWithTicketsEl.checked = true;

          function loadMembersForConfig(groupId) {
            if (!groupId) {
              membersDiv.style.display = "none";
              return;
            }
            membersDiv.style.display = "block";
            membersDiv.innerHTML =
              '<div style="color:#888;font-size:11px;">Cargando...</div>';
            var spToken = localStorage.getItem("token");
            fetch(
              "https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" +
                groupId,
              {
                headers: spGetHeaders(),
              },
            )
              .then(function (r) {
                return r.json();
              })
              .then(function (json) {
                var profiles = json.data || json;
                if (!Array.isArray(profiles) || !profiles.length) {
                  membersDiv.innerHTML =
                    '<div style="color:#888;font-size:11px;">Sin miembros</div>';
                  return;
                }
                // Read blacklist from _userConfig (memory) — already profileIds
                var blacklistProfileIds = _userConfig.blacklist || [];
                membersDiv.innerHTML =
                  '<div style="font-size:10px;color:#888;margin-bottom:4px;">Desmarca los que no quieras ver:</div>';
                profiles.forEach(function (p) {
                  var isVisible = !blacklistProfileIds.includes(p.profileId);
                  var label = document.createElement("label");
                  label.style.cssText =
                    "display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;cursor:pointer;";
                  label.innerHTML =
                    '<input type="checkbox" data-pid="' +
                    p.profileId +
                    '"' +
                    (isVisible ? " checked" : "") +
                    "> " +
                    esc(p.profileFullName);
                  membersDiv.appendChild(label);
                });
              })
              .catch(function () {
                membersDiv.innerHTML =
                  '<div style="color:#D94040;font-size:11px;">Error</div>';
              });
          }

          // Load on area change
          document
            .getElementById("sp-cfg-area")
            .addEventListener("change", function () {
              loadMembersForConfig(this.value);
            });
          // Load initially if area set
          if (currentArea) loadMembersForConfig(currentArea);

          // Save
          document
            .getElementById("sp-cfg-save")
            .addEventListener("click", async function () {
              var token = await getMondayToken();
              var mondayTokenInput = document
                .getElementById("sp-cfg-monday-token")
                .value.trim();
              var area = document.getElementById("sp-cfg-area").value;
              var onlyWithTickets = onlyWithTicketsEl.checked;

              // If user entered a new Monday token (not the placeholder), save to API
              if (mondayTokenInput && mondayTokenInput !== "••••••••") {
                token = mondayTokenInput;
                var encoded = btoa(mondayTokenInput);
                chrome.storage.local.get(
                  ["usersMap", "userEmail"],
                  function (nd) {
                    var email = (nd.userEmail || "").toLowerCase();
                    var users = nd.usersMap || {};
                    var user = users[email];
                    if (user && user.idUsuario) {
                      chrome.runtime.sendMessage({
                        type: "api-put",
                        endpoint: "/usuarios/" + user.idUsuario,
                        body: { tokenMonday: encoded },
                      });
                    }
                  },
                );
                _mondayTokenCache = mondayTokenInput;
              }

              var saveData = {
                mondayToken: token,
                teamArea: area,
              };
              // Collect blacklisted profileIds (unchecked = blacklisted)
              // ONLY update blacklist if members were actually loaded (prevent accidental wipe)
              var memberChecks = membersDiv.querySelectorAll("input[data-pid]");
              var blacklistProfileIds = null; // null = don't update
              if (memberChecks.length > 0 && area) {
                blacklistProfileIds = [];
                memberChecks.forEach(function (cb) {
                  if (!cb.checked)
                    blacklistProfileIds.push(parseInt(cb.dataset.pid));
                });
              }
              // Save user config to API
              chrome.storage.local.get(
                ["userConfig", "usersMap", "userEmail"],
                function (nd) {
                  var email = (nd.userEmail || "").toLowerCase();
                  var users = nd.usersMap || {};
                  var user = users[email];

                  // Save config to API — resolve user by email via background
                  chrome.runtime.sendMessage(
                    {
                      type: "api-get",
                      endpoint: "/usuarios/correo/" + encodeURIComponent(email),
                    },
                    function (userResp) {
                      var apiUserId = null;
                      if (
                        userResp &&
                        userResp.success &&
                        userResp.data &&
                        userResp.data.data
                      ) {
                        apiUserId = userResp.data.data.IdUsuario;
                      } else if (user && user.idUsuario) {
                        apiUserId = user.idUsuario;
                      }

                      if (apiUserId) {
                        chrome.runtime.sendMessage({
                          type: "api-post",
                          endpoint: "/configuracion/usuario",
                          body: {
                            fkIdUsuario: apiUserId,
                            mostrarSoloConTickets: onlyWithTickets,
                            blacklistByProfileId: blacklistProfileIds || [],
                            usuarioAlta: email,
                          },
                        });
                      }
                    },
                  );

                  // Save blacklist locally for immediate use (profileIds for filtering)
                  var blacklistLocalIds =
                    blacklistProfileIds || _userConfig.blacklist || [];
                  _userConfig = {
                    onlyWithTickets: onlyWithTickets,
                    blacklist: blacklistLocalIds,
                  };
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
                },
              );
            });
        },
      );
    }

    function injectSearchButton() {
      if (document.getElementById(SEARCH_BTN_ID)) return;
      var userWrapper = document.querySelector(
        '[class*="warapperNameUserAndLogout"]',
      );
      if (!userWrapper) return;

      var btn = createHeaderButton({
        id: SEARCH_BTN_ID,
        icon: "🔍",
        label: "Buscar",
        color: "#7B1FA2",
        onClick: showSearchModal,
      });
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
      } catch (e) {
        return null;
      }
    }

    function saveDashboardCache(data, from, to, groupId) {
      localStorage.setItem(
        DASHBOARD_CACHE_KEY,
        JSON.stringify({
          data: data,
          from: from,
          to: to,
          groupId: groupId || "",
          ts: Date.now(),
        }),
      );
    }

    function clearDashboardCache() {
      localStorage.removeItem(DASHBOARD_CACHE_KEY);
    }

    var cached = loadDashboardCache();
    // Invalidate cache if not from today
    if (cached) {
      var cacheDate = new Date(cached.ts).toDateString();
      var todayDate = new Date().toDateString();
      if (cacheDate !== todayDate) {
        clearDashboardCache();
        cached = null;
      }
    }
    var dashboardData =
      cached && cached.data && cached.data.length ? cached.data : null;
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
        var lastDayPrev = new Date(
          today.getFullYear(),
          today.getMonth(),
          0,
        ).getDate();
        fromDate =
          prevMonth.getFullYear() +
          "-" +
          String(prevMonth.getMonth() + 1).padStart(2, "0") +
          "-01";
        toDate =
          prevMonth.getFullYear() +
          "-" +
          String(prevMonth.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(lastDayPrev).padStart(2, "0");
      } else {
        // Yesterday
        var yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        fromDate =
          yesterday.getFullYear() +
          "-" +
          String(yesterday.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(yesterday.getDate()).padStart(2, "0");
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
            var url =
              "https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=" +
              page +
              "&size=100&resolutionGroupId=" +
              groupId;
            url += "&initDate=" + fromDate + "&endDate=" + toDate;
            var res = await fetch(url, { headers: spGetHeaders() });
            if (!res.ok) break;
            var json = await res.json();
            var data = json.data || json;
            var tickets = data.content || [];
            tickets.forEach(function (t) {
              if (t.ticketStatusName === "Cerrado") allTickets.push(t);
            });
            if (page >= (data.totalPages || 1) - 1) break;
            page++;
          }
          dashboardData = allTickets;
          saveDashboardCache(allTickets, fromDate, toDate);
          var btn = document.getElementById(DASHBOARD_BTN_ID);
          if (btn) btn.textContent = "📊 Ver dashboard";
          SP_Log.info(
            "Dashboard auto-generated:",
            allTickets.length,
            "tickets",
          );
        } catch (e) {
          SP_Log.warn("Dashboard auto-gen failed:", e.message);
        }
      })();
    }

    if (!dashboardData) {
      // Delay auto-generation to not block page load
      setTimeout(autoGenerateDashboard, 5000);
    }

    // --- Session Timer (countdown from JWT exp) ---
    function injectSessionTimer() {
      if (document.getElementById("sp-session-timer")) return;
      var userWrapper = document.querySelector(
        '[class*="warapperNameUserAndLogout"]',
      );
      if (!userWrapper) return;

      // Decode JWT to get exp
      var token = localStorage.getItem("token");
      if (!token) return;
      try {
        var payload = token.split(".")[1];
        var decoded = JSON.parse(
          atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
        );
        var expMs = decoded.exp * 1000;
        if (!expMs || expMs < Date.now()) return;

        var timerEl = document.createElement("span");
        timerEl.id = "sp-session-timer";
        timerEl.title = "Tiempo restante de sesión";
        timerEl.style.cssText =
          "font-size:11px;color:inherit;opacity:0.8;margin-right:10px;font-family:monospace;white-space:nowrap;";
        userWrapper.parentElement.insertBefore(timerEl, userWrapper);

        function updateTimer() {
          var diff = expMs - Date.now();
          if (diff <= 0) {
            timerEl.textContent = "⏱️ Sesión expirada";
            timerEl.style.color = "#FF5252";
            timerEl.style.opacity = "1";
            return;
          }
          var h = Math.floor(diff / 3600000);
          var m = Math.floor((diff % 3600000) / 60000);
          var s = Math.floor((diff % 60000) / 1000);
          var timeStr =
            (h > 0 ? h + "h " : "") +
            String(m).padStart(2, "0") +
            "m " +
            String(s).padStart(2, "0") +
            "s";
          timerEl.textContent = "⏱️ " + timeStr;
          if (diff < 300000) {
            timerEl.style.color = "#FF5252";
            timerEl.style.opacity = "1";
          } else if (diff < 900000) {
            timerEl.style.color = "#FFD740";
            timerEl.style.opacity = "1";
          }
        }
        updateTimer();
        setInterval(updateTimer, 1000);
      } catch (e) {}
    }

    function injectUpdateButton() {
      if (document.getElementById("sp-update-btn")) return;
      var refBtn =
        document.getElementById(DASHBOARD_BTN_ID) ||
        document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;
      // Read version info from storage
      chrome.storage.local.get(["latestVersion", "latestZipUrl"], function (r) {
        var latestVersion = r.latestVersion || "";
        var latestZipUrl = r.latestZipUrl || "";
        var currentVersion = chrome.runtime.getManifest().version;
        if (!latestVersion || latestVersion === currentVersion || !latestZipUrl)
          return;
        if (document.getElementById("sp-update-btn")) return;
        var btn = createHeaderButton({
          id: "sp-update-btn",
          icon: "📥",
          label: "Actualizar v" + latestVersion,
          color: "#5D4037",
          onClick: showUpdateModal,
        });
        refBtn.parentElement.insertBefore(btn, refBtn);
      });
    }

    function showUpdateModal() {
      chrome.storage.local.get(["allVersions", "latestVersion"], function (r) {
        var allVersions = r.allVersions || [];
        var _latestVersion = r.latestVersion || "";
        var _currentVersion = chrome.runtime.getManifest().version;
        if (!allVersions.length) {
          showErrorToast("No hay versiones disponibles");
          return;
        }

        // Filter versions newer than current
        var curParts = _currentVersion.split(".").map(Number);
        function isNewer(v) {
          var p = v.split(".").map(Number);
          return (
            p[0] > curParts[0] ||
            (p[0] === curParts[0] && p[1] > curParts[1]) ||
            (p[0] === curParts[0] && p[1] === curParts[1] && p[2] > curParts[2])
          );
        }
        var newerVersions = allVersions.filter(function (v) {
          return isNewer(v.version);
        });
        var changelogHTML = newerVersions.length
          ? newerVersions
              .map(function (v) {
                return (
                  '<div style="padding:6px 0;border-bottom:1px solid #eee;"><b style="color:#1976D2;">v' +
                  v.version +
                  '</b> <span style="font-size:0.85rem;color:#555;">— ' +
                  (v.changes || "Sin descripción") +
                  "</span></div>"
                );
              })
              .join("")
          : '<div style="color:#888;padding:8px;">Estás en la versión más reciente.</div>';

        // Version select options
        var selectOpts = allVersions
          .map(function (v) {
            return (
              '<option value="' +
              v.version +
              '"' +
              (v.version === _latestVersion ? " selected" : "") +
              ">" +
              v.version +
              (v.version === _latestVersion ? " (última)" : "") +
              "</option>"
            );
          })
          .join("");

        SP_Modal.info({
          id: "sp-update-modal",
          title: "📥 Actualización disponible",
          content:
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.85rem;color:#888;margin-bottom:8px;">Versión instalada: <b>' +
            _currentVersion +
            "</b> → Última: <b>" +
            _latestVersion +
            "</b></div>" +
            '<div style="font-size:0.9rem;font-weight:600;margin-bottom:6px;">📋 Cambios desde tu versión:</div>' +
            '<div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;">' +
            changelogHTML +
            "</div>" +
            "</div>" +
            '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
            '<label style="font-size:0.85rem;white-space:nowrap;">Descargar versión:</label>' +
            '<select id="sp-update-version-select" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;">' +
            selectOpts +
            "</select>" +
            "</div>" +
            '<div id="sp-update-selected-changes" style="margin-bottom:12px;font-size:0.85rem;color:#555;min-height:20px;"></div>' +
            '<button id="sp-update-download" style="width:100%;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">📥 Descargar</button>' +
            '<a id="sp-update-direct-link" href="#" target="_blank" style="display:block;text-align:center;margin-top:8px;font-size:0.8rem;color:#666;text-decoration:underline;">Si no descarga, clic aquí para abrir enlace directo</a>',
          maxWidth: "500px",
        });

        var vSelect = document.getElementById("sp-update-version-select");
        var changesDiv = document.getElementById("sp-update-selected-changes");
        var downloadBtn = document.getElementById("sp-update-download");
        var directLink = document.getElementById("sp-update-direct-link");

        function updateSelectedChanges() {
          var selected = allVersions.find(function (v) {
            return v.version === vSelect.value;
          });
          changesDiv.textContent = selected
            ? selected.changes || "Sin descripción"
            : "";
          if (directLink && selected && selected.zipUrl)
            directLink.href = selected.zipUrl;
        }
        vSelect.addEventListener("change", updateSelectedChanges);
        updateSelectedChanges();

        downloadBtn.addEventListener("click", function () {
          var selected = allVersions.find(function (v) {
            return v.version === vSelect.value;
          });
          if (!selected || !selected.zipUrl) {
            showErrorToast("No hay archivo para esta versión");
            return;
          }
          downloadBtn.textContent = "⏳ Descargando...";
          downloadBtn.disabled = true;
          downloadZip(selected.zipUrl, selected.version);
          setTimeout(function () {
            downloadBtn.textContent = "📥 Descargar";
            downloadBtn.disabled = false;
          }, 5000);
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
        dashboardFrom =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-01T00:00";
        dashboardTo =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(now.getDate()).padStart(2, "0") +
          "T23:59";
      }

      var btn = createHeaderButton({
        id: DASHBOARD_BTN_ID,
        icon: "📊",
        label: dashboardData ? "Ver dashboard" : "Dashboard",
        color: "#00796B",
        onClick: handleDashboardClick,
      });
      searchBtn.parentElement.insertBefore(btn, searchBtn);

      var sep = document.createElement("span");
      sep.style.cssText =
        "color:rgba(255,255,255,0.4);font-size:16px;margin-right:8px;";
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
        var groupOpts = currentUserGroups
          .map(function (gId) {
            var g = GROUP_INFO.find(function (gi) {
              return gi.id === gId;
            }) || { id: gId, name: "Grupo " + gId };
            return '<option value="' + g.id + '">' + g.name + "</option>";
          })
          .join("");
        var m = SP_Modal.info({
          id: "sp-dashboard-group-modal",
          title: "📊 Generar Dashboard",
          content:
            '<p style="margin:0 0 12px;font-size:0.85rem;color:#555;">Selecciona el grupo del cual quieres generar el dashboard:</p>' +
            '<select id="sp-dash-group-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:0.9rem;margin-bottom:12px;">' +
            groupOpts +
            "</select>" +
            '<div style="background:#FFF3E0;border:1px solid #FF8F00;border-radius:6px;padding:10px;margin-bottom:12px;font-size:0.8rem;color:#E65100;">⚠️ La generación del dashboard puede tardar varios minutos. Puedes seguir trabajando con normalidad, se te avisará cuando esté listo.</div>' +
            '<button id="sp-dash-group-confirm" style="width:100%;padding:10px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Generar</button>',
          maxWidth: "400px",
        });
        document
          .getElementById("sp-dash-group-confirm")
          .addEventListener("click", function () {
            var selectedGroup = document.getElementById(
              "sp-dash-group-select",
            ).value;
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
        dashboardFrom =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-01T00:00";
        dashboardTo =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(now.getDate()).padStart(2, "0") +
          "T23:59";
      }
      btn.disabled = true;
      btn.innerHTML =
        '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Creando dashboard...</span>';
      btn.style.background = "#999";

      var spToken = getToken();
      if (!spToken) {
        showErrorToast("No hay token");
        btn.innerHTML =
          '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>';
        btn.style.background = "#00796B";
        btn.disabled = false;
        return;
      }

      var allTickets = [];
      var page = 0;
      try {
        while (true) {
          var url =
            "https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=" +
            page +
            "&size=100&resolutionGroupId=" +
            groupId;
          if (dashboardFrom) url += "&initDate=" + dashboardFrom;
          if (dashboardTo) url += "&endDate=" + dashboardTo;
          var res = await fetch(url, { headers: spGetHeaders() });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var data = json.data || json;
          var tickets = data.content || [];
          tickets.forEach(function (t) {
            if (t.ticketStatusName === "Cerrado") allTickets.push(t);
          });
          btn.innerHTML =
            '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> ' +
            allTickets.length +
            " tickets...</span>";
          if (page >= (data.totalPages || 1) - 1) break;
          page++;
        }
      } catch (err) {
        showErrorToast("Error: " + err.message);
        btn.innerHTML =
          '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>';
        btn.style.background = "#00796B";
        btn.disabled = false;
        return;
      }

      dashboardData = allTickets;
      saveDashboardCache(allTickets, dashboardFrom, dashboardTo, groupId);
      btn.innerHTML =
        '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Ver dashboard</span>';
      btn.style.background = "#00796B";
      btn.disabled = false;
      showSuccessToast(
        "Dashboard listo: " + allTickets.length + " tickets cerrados",
      );
    }

    function buildDashboardChart(allTickets) {
      if (!allTickets.length)
        return '<div style="text-align:center;padding:40px;color:#888;">Sin tickets cerrados en este periodo</div>';

      var counts = {};
      allTickets.forEach(function (t) {
        var name = t.responsibleName || "Sin asignar";
        counts[name] = (counts[name] || 0) + 1;
      });
      var sorted = Object.entries(counts).sort(function (a, b) {
        return b[1] - a[1];
      });
      var maxCount = sorted[0][1];
      var colors = [
        "#1976D2",
        "#2E7D32",
        "#D94040",
        "#7B1FA2",
        "#E65100",
        "#00796B",
        "#C2185B",
        "#F57F17",
        "#283593",
        "#5D4037",
      ];

      var html =
        '<div style="margin-bottom:12px;font-size:13px;color:#888;">Total: <b>' +
        allTickets.length +
        "</b> tickets cerrados</div>";
      sorted.forEach(function (entry, i) {
        var name = entry[0];
        var count = entry[1];
        var pct = Math.round((count / maxCount) * 100);
        var color = colors[i % colors.length];
        html +=
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
          '<div style="width:180px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' +
          name +
          '">' +
          name +
          "</div>" +
          '<div style="flex:1;background:#eee;border-radius:4px;height:24px;overflow:hidden;">' +
          '<div style="width:' +
          pct +
          "%;background:" +
          color +
          ';height:100%;border-radius:4px;transition:width 0.5s;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">' +
          '<span style="color:#fff;font-size:11px;font-weight:700;">' +
          count +
          "</span>" +
          "</div>" +
          "</div>" +
          "</div>";
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
        var gOpts = currentUserGroups
          .map(function (gId) {
            var g = GROUP_INFO.find(function (gi) {
              return gi.id === gId;
            }) || { id: gId, name: "Grupo " + gId };
            return (
              '<option value="' +
              g.id +
              '"' +
              (String(g.id) === String(currentGroupId) ? " selected" : "") +
              ">" +
              g.name +
              "</option>"
            );
          })
          .join("");
        groupSelectorHTML =
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
          '<label style="font-size:12px;white-space:nowrap;">Grupo:</label>' +
          '<select id="sp-dash-group-change" style="flex:1;padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
          gOpts +
          "</select>" +
          "</div>";
      }

      var m = SP_Modal.info({
        id: "sp-dashboard-modal",
        title: "📊 Tickets cerrados por analista",
        content:
          groupSelectorHTML +
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">' +
          '<label style="font-size:12px;">Desde:</label>' +
          '<input id="sp-dash-from" type="datetime-local" value="' +
          dashboardFrom +
          '" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
          '<label style="font-size:12px;">Hasta:</label>' +
          '<input id="sp-dash-to" type="datetime-local" value="' +
          dashboardTo +
          '" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
          '<button id="sp-dash-refresh" style="padding:5px 14px;font-size:12px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-weight:600;">Regenerar</button>' +
          "</div>" +
          '<div id="sp-dash-results" style="flex:1;overflow:auto;min-height:200px;"></div>',
        maxWidth: "700px",
        modalOptions: { width: "95%", maxHeight: "90vh" },
      });

      document.getElementById("sp-dash-results").innerHTML =
        buildDashboardChart(dashboardData || []);

      // Group change handler
      var groupChangeEl = document.getElementById("sp-dash-group-change");
      if (groupChangeEl) {
        groupChangeEl.addEventListener("change", function () {
          var newGroupId = parseInt(groupChangeEl.value);
          // Check if there's cached data for this group
          var cached = loadDashboardCache();
          if (
            cached &&
            cached.data &&
            cached.data.length &&
            String(cached.groupId) === String(newGroupId)
          ) {
            // Load from cache
            dashboardData = cached.data;
            dashboardFrom = cached.from || dashboardFrom;
            dashboardTo = cached.to || dashboardTo;
            document.getElementById("sp-dash-from").value = dashboardFrom;
            document.getElementById("sp-dash-to").value = dashboardTo;
            document.getElementById("sp-dash-results").innerHTML =
              buildDashboardChart(dashboardData);
          } else {
            // No cache for this group - show empty with message
            dashboardData = null;
            document.getElementById("sp-dash-results").innerHTML =
              '<div style="text-align:center;padding:40px;color:#888;">No hay datos para este grupo. Presiona <b>Regenerar</b> para generar el dashboard.</div>';
          }
        });
      }

      document
        .getElementById("sp-dash-refresh")
        .addEventListener("click", function () {
          dashboardFrom = document.getElementById("sp-dash-from").value;
          dashboardTo = document.getElementById("sp-dash-to").value;
          dashboardData = null;
          clearDashboardCache();
          var selectedGroupId = groupChangeEl
            ? parseInt(groupChangeEl.value)
            : getTeamConfig().resolutionGroupId;
          m.close();
          var btn = document.getElementById(DASHBOARD_BTN_ID);
          generateDashboard(btn, selectedGroupId);
        });
    }

    // --- DBA Info Button ---
    const WATER_BTN_ID = "sp-water-btn";
    function injectWaterButton() {
      if (document.getElementById(WATER_BTN_ID)) return;
      // Only show if user has "DBA Info" subrol
      if (!window.SP_Session.state.canDBAInfo) return;
      var refBtn =
        document.getElementById(DASHBOARD_BTN_ID) ||
        document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;
      var btn = createHeaderButton({
        id: WATER_BTN_ID,
        icon: "🏠",
        label: "DBA Info",
        color: "#0288D1",
        onClick: showWaterModal,
      });
      refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
    }

    function showWaterModal() {
      var existing = document.getElementById("sp-water-modal");
      if (existing) {
        existing.remove();
        return;
      }
      showLoadingToast("Cargando DBA Info...");

      // Load products and active log from API
      Promise.all([
        new Promise(function (resolve) {
          chrome.runtime.sendMessage(
            { type: "api-get", endpoint: "/productos" },
            function (resp) {
              resolve(resp && resp.success && resp.data ? resp.data.data : []);
            },
          );
        }),
        new Promise(function (resolve) {
          chrome.runtime.sendMessage(
            { type: "api-get", endpoint: "/productos/log" },
            function (resp) {
              resolve(resp && resp.success && resp.data ? resp.data.data : []);
            },
          );
        }),
      ])
        .then(function (results) {
          var lt = document.getElementById("sp-loading-toast");
          if (lt) lt.remove();
          var products = (results[0] || []).map(function (p) {
            return {
              id: p.IdcatProducto,
              name: p.Nombre,
              producto: p.Descripcion || p.Nombre,
              cantidad: p.Cantidad || 1,
            };
          });
          var todayLog = (results[1] || []).map(function (l) {
            return {
              id: l.IdLogProducto,
              productId: l.FK_IdcatProducto,
              userId: l.FK_IdUsuario,
              name: l.ProductoNombre,
              userName: l.UsuarioNombre,
              date: l.FechaAlta,
            };
          });

          // Build user list from usersMap (stored as usersMap)
          chrome.storage.local.get(
            ["usersMap", "userEmail"],
            function (stored) {
              var currentEmail = (stored.userEmail || "").toLowerCase();
              var usersMap = stored.usersMap || {};
              var currentUser = usersMap[currentEmail];
              var currentUserId = currentUser ? currentUser.idUsuario : null;

              // Collect users that have DBA Info permission
              var users = [];
              Object.keys(usersMap).forEach(function (email) {
                var u = usersMap[email];
                if (!u || !u.canDBAInfo) return;
                var cumpleDisplay = "";
                var cumpleColor = "";
                if (u.cumpleanos) {
                  var parts = u.cumpleanos.split("-");
                  var day = parseInt(parts[2]);
                  var month = parseInt(parts[1]) - 1;
                  var meses = [
                    "enero",
                    "febrero",
                    "marzo",
                    "abril",
                    "mayo",
                    "junio",
                    "julio",
                    "agosto",
                    "septiembre",
                    "octubre",
                    "noviembre",
                    "diciembre",
                  ];
                  cumpleDisplay = day + " de " + meses[month];
                  var now = new Date();
                  var thisYearBday = new Date(now.getFullYear(), month, day);
                  var diffDays = Math.floor(
                    (thisYearBday - now) / (1000 * 60 * 60 * 24),
                  );
                  if (diffDays < 0) cumpleColor = "#D32F2F";
                  else if (diffDays <= 30) cumpleColor = "#F9A825";
                  else cumpleColor = "#2E7D32";
                }
                users.push({
                  id: u.idUsuario,
                  nombre: u.name,
                  correo: email,
                  cumple: cumpleDisplay,
                  cumpleColor: cumpleColor,
                });
              });

              if (!users.length) {
                showErrorToast("No hay usuarios con acceso a DBA Info");
                return;
              }

              // Build log count map: userId_productId -> count
              var logCountMap = {};
              todayLog.forEach(function (l) {
                var key = l.userId + "_" + l.productId;
                logCountMap[key] = (logCountMap[key] || 0) + 1;
              });

              // Sort products
              products.sort(function (a, b) {
                return a.name.localeCompare(b.name);
              });

              // Generate columns (each product has N columns based on cantidad)
              var columns = [];
              products.forEach(function (p) {
                for (var i = 0; i < p.cantidad; i++) {
                  columns.push({
                    productId: p.id,
                    productName: p.name,
                    colName:
                      p.cantidad > 1 ? p.name + " " + (i + 1) : p.producto,
                    colIndex: i,
                  });
                }
              });

              // Build product headers
              var productHeaders = columns
                .map(function (col) {
                  return (
                    '<th style="padding:6px 10px;text-align:center;">' +
                    col.colName +
                    "</th>"
                  );
                })
                .join("");

              // Check product completion
              var productCompletionMap = {};
              products.forEach(function (p) {
                productCompletionMap[p.id] = users.every(function (u) {
                  return (logCountMap[u.id + "_" + p.id] || 0) >= p.cantidad;
                });
              });

              // Build table rows
              var tableRows = users
                .map(function (u, idx) {
                  var cells = columns
                    .map(function (col) {
                      var userCount =
                        logCountMap[u.id + "_" + col.productId] || 0;
                      var producto = products.find(function (p) {
                        return p.id === col.productId;
                      });
                      var cantidad = producto ? producto.cantidad : 1;
                      var isMarked = userCount > col.colIndex;
                      var isMe = u.id === currentUserId;
                      var timesMarked = isMarked
                        ? Math.floor(
                            (userCount - col.colIndex - 1) / cantidad,
                          ) + 1
                        : 0;
                      if (isMe && !isMarked && col.colIndex === userCount) {
                        return (
                          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;"><input type="checkbox" class="sp-dba-check" data-product-id="' +
                          col.productId +
                          '" data-product-name="' +
                          col.colName +
                          '" data-user-id="' +
                          u.id +
                          '" style="cursor:pointer;width:16px;height:16px;"></td>'
                        );
                      }
                      var display = isMarked
                        ? "\u2705" +
                          (timesMarked > 1
                            ? ' <span style="font-size:9px;color:#888;">(x' +
                              timesMarked +
                              ")</span>"
                            : "")
                        : "\u2014";
                      return (
                        '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">' +
                        display +
                        "</td>"
                      );
                    })
                    .join("");
                  var cumpleCell =
                    '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:' +
                    (u.cumpleColor || "#333") +
                    ';font-weight:600;">' +
                    (u.cumple || "-") +
                    "</td>";
                  return (
                    '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">' +
                    (idx + 1) +
                    '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">' +
                    u.nombre +
                    "</td>" +
                    cells +
                    cumpleCell +
                    "</tr>"
                  );
                })
                .join("");

              // Reset buttons
              var resetBtnsHTML = "";
              products.forEach(function (p) {
                if (productCompletionMap[p.id]) {
                  resetBtnsHTML +=
                    '<button class="sp-dba-reset-btn" data-product-id="' +
                    p.id +
                    '" data-product-name="' +
                    p.name +
                    '" style="padding:6px 14px;border:none;border-radius:6px;background:#1565C0;color:#fff;cursor:pointer;font-size:12px;font-weight:600;margin-right:8px;margin-bottom:4px;">\uD83D\uDD04 Reiniciar ' +
                    p.name +
                    "</button>";
                }
              });

              // Build modal
              var overlay = document.createElement("div");
              overlay.id = "sp-water-modal";
              overlay.style.cssText =
                "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
              overlay.innerHTML =
                '<div style="background:#fff;padding:20px;border-radius:12px;max-width:900px;width:95%;max-height:90vh;overflow:auto;font-family:system-ui;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                '<h3 style="margin:0;font-size:16px;">🏠 DBA Info</h3>' +
                '<button id="sp-water-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">✕</button>' +
                "</div>" +
                '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
                '<thead><tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;">#</th><th style="padding:6px 10px;text-align:left;">Nombre</th>' +
                productHeaders +
                '<th style="padding:6px 10px;text-align:center;">🎂</th></tr></thead>' +
                "<tbody>" +
                tableRows +
                "</tbody></table>" +
                (resetBtnsHTML
                  ? '<div style="margin-top:12px;text-align:center;">' +
                    resetBtnsHTML +
                    "</div>"
                  : "") +
                "</div>";
              document.body.appendChild(overlay);

              document
                .getElementById("sp-water-close")
                .addEventListener("click", function () {
                  overlay.remove();
                });
              overlay.addEventListener("click", function (e) {
                if (e.target === overlay) overlay.remove();
              });

              // Handle checkbox clicks (register product consumption)
              overlay.querySelectorAll(".sp-dba-check").forEach(function (cb) {
                cb.addEventListener("change", function () {
                  if (!cb.checked) return;
                  cb.disabled = true;
                  var productId = parseInt(cb.dataset.productId);
                  var userId = parseInt(cb.dataset.userId);
                  chrome.runtime.sendMessage(
                    {
                      type: "api-post",
                      endpoint: "/productos/log",
                      body: {
                        fkIdProducto: productId,
                        fkIdUsuario: userId,
                        usuarioAlta: currentEmail,
                      },
                    },
                    function (resp) {
                      if (resp && resp.success) {
                        cb.parentElement.innerHTML = "\u2705";
                        showSuccessToast(
                          "\u2705 " + cb.dataset.productName + " registrado",
                        );
                      } else {
                        showErrorToast("Error al registrar");
                        cb.checked = false;
                        cb.disabled = false;
                      }
                    },
                  );
                });
              });

              // Reset buttons
              overlay
                .querySelectorAll(".sp-dba-reset-btn")
                .forEach(function (btn) {
                  btn.addEventListener("click", function () {
                    var productId = parseInt(btn.dataset.productId);
                    var productName = btn.dataset.productName;
                    if (
                      !confirm(
                        "\u00bfReiniciar el conteo de " + productName + "?",
                      )
                    )
                      return;
                    btn.disabled = true;
                    btn.textContent = "\u23f3 Reiniciando...";
                    chrome.runtime.sendMessage(
                      {
                        type: "api-put",
                        endpoint: "/productos/log/reiniciar",
                        body: {
                          fkIdProducto: productId,
                          usuarioModificacion: currentEmail,
                        },
                      },
                      function (resp) {
                        if (resp && resp.success) {
                          showSuccessToast(
                            "\u2705 Conteo de " + productName + " reiniciado",
                          );
                          overlay.remove();
                          showWaterModal();
                        } else {
                          showErrorToast("Error al reiniciar");
                          btn.disabled = false;
                          btn.textContent =
                            "\uD83D\uDD04 Reiniciar " + productName;
                        }
                      },
                    );
                  });
                });
            },
          );
        })
        .catch(function (err) {
          var lt = document.getElementById("sp-loading-toast");
          if (lt) lt.remove();
          showErrorToast("Error: " + (err.message || err));
        });
    }

    // --- Suggested Comments Button ---
    const SUGGESTED_BTN_ID = "sp-suggested-btn";
    function injectSuggestedCommentsButton() {
      if (!_btnComments) return;
      if (document.getElementById(SUGGESTED_BTN_ID)) return;
      var refBtn =
        document.getElementById(DASHBOARD_BTN_ID) ||
        document.getElementById(SEARCH_BTN_ID);
      if (!refBtn) return;
      var btn = createHeaderButton({
        id: SUGGESTED_BTN_ID,
        icon: "💬",
        label: "Comentarios",
        color: "#00897B",
        onClick: showSuggestedCommentsModal,
      });
      refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
    }

    function showSuggestedCommentsModal() {
      var existing = document.getElementById("sp-suggested-modal");
      if (existing) {
        existing.remove();
        return;
      }

      var m = SP_Modal.info({
        id: "sp-suggested-modal",
        title: "💬 Comentarios sugeridos",
        content:
          '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
          '<input id="sp-sug-new-input" type="text" placeholder="Nuevo comentario sugerido..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;">' +
          '<button id="sp-sug-add" style="padding:6px 12px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">+ Agregar</button>' +
          "</div>" +
          '<div id="sp-sug-list" style="flex:1;overflow:auto;"></div>',
        maxWidth: "600px",
        modalOptions: {
          width: "95%",
          maxHeight: "80vh",
          zIndex: 99998,
        },
      });
      var overlay = m.overlay;

      var groupId = getTeamConfig().resolutionGroupId;
      var groupPageId = null;
      var userPageId = null;
      var today = new Date().toISOString().slice(0, 10);

      // Variables for suggested comments
      var groupId = getTeamConfig().resolutionGroupId;

      function loadList() {
        var listDiv = document.getElementById("sp-sug-list");
        if (!listDiv) return;
        chrome.storage.local.get("suggestedComments", function (r) {
          var comments = r.suggestedComments || {};
          var items = comments[groupId] || [];
          if (!items.length) {
            listDiv.innerHTML =
              '<div style="text-align:center;color:#888;padding:20px;font-size:12px;">No hay comentarios sugeridos para este grupo</div>';
            return;
          }
          listDiv.innerHTML = items
            .map(function (c) {
              return (
                '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;" data-id="' +
                c.id +
                '">' +
                '<span style="flex:1;font-size:12px;">' +
                c.text +
                "</span>" +
                '<button class="sp-sug-edit" data-id="' +
                c.id +
                '" data-text="' +
                c.text.replace(/"/g, "&quot;") +
                '" style="padding:3px 8px;border:1px solid #1976D2;border-radius:4px;background:#fff;color:#1976D2;cursor:pointer;font-size:10px;">✏️</button>' +
                '<button class="sp-sug-del" data-id="' +
                c.id +
                '" style="padding:3px 8px;border:1px solid #D32F2F;border-radius:4px;background:#fff;color:#D32F2F;cursor:pointer;font-size:10px;">🗑️</button>' +
                "</div>"
              );
            })
            .join("");

          // Edit handlers
          listDiv.querySelectorAll(".sp-sug-edit").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var newText = prompt("Editar comentario:", btn.dataset.text);
              if (!newText || newText === btn.dataset.text) return;
              btn.textContent = "⏳";
              var updateProps = {
                Comentario: { rich_text: [{ text: { content: newText } }] },
              };
              chrome.runtime.sendMessage(
                {
                  type: "api-put",
                  pageId: btn.dataset.id,
                  body: { properties: updateProps },
                },
                function () {
                  btn.textContent = "✅";
                  chrome.runtime.sendMessage(
                    { type: "sync" },
                    function () {
                      loadList();
                    },
                  );
                },
              );
            });
          });

          // Delete handlers (logical delete)
          listDiv.querySelectorAll(".sp-sug-del").forEach(function (btn) {
            btn.addEventListener("click", function () {
              if (!confirm("¿Eliminar este comentario sugerido?")) return;
              btn.textContent = "⏳";
              var deleteProps = {
                Activo: { checkbox: false },
                FechaEliminacion: { date: { start: today } },
              };
              if (userPageId)
                deleteProps["UsuarioEliminacion"] = {
                  relation: [{ id: userPageId }],
                };
              chrome.runtime.sendMessage(
                {
                  type: "api-put",
                  pageId: btn.dataset.id,
                  body: { properties: deleteProps },
                },
                function () {
                  var row = btn.closest("[data-id]");
                  if (row) row.remove();
                  chrome.runtime.sendMessage(
                    { type: "sync" },
                    function () {
                      loadList();
                    },
                  );
                },
              );
            });
          });
        });
      }

      // Sync first, then load list
      chrome.runtime.sendMessage({ type: "sync" }, function () {
        loadList();
      });

      // Add new comment
      document
        .getElementById("sp-sug-add")
        .addEventListener("click", function () {
          var input = document.getElementById("sp-sug-new-input");
          var text = input.value.trim();
          if (!text) return;
          if (!groupPageId) {
            showErrorToast("No se pudo determinar el grupo");
            return;
          }
          var addBtn = document.getElementById("sp-sug-add");
          addBtn.disabled = true;
          addBtn.textContent = "⏳";
          var createProps = {
            Nombre: { title: [{ text: { content: "" } }] },
            Comentario: { rich_text: [{ text: { content: text } }] },
            MSP_cat_Grupos: { relation: [{ id: groupPageId }] },
            Activo: { checkbox: true },
          };
          chrome.runtime.sendMessage(
            {
              type: "api-post",
              body: {
                parent: { database_id: "36920e0684b980a19fdbd27302a65feb" },
                properties: createProps,
              },
            },
            function () {
              input.value = "";
              addBtn.disabled = false;
              addBtn.textContent = "+ Agregar";
              showSuccessToast("Comentario agregado");
              chrome.runtime.sendMessage({ type: "sync" }, function () {
                loadList();
              });
            },
          );
        });
    }

    // --- Report Excel: delegated to features/reports.js ---
    function injectReportButton() {
      if (window.SP_Reports) window.SP_Reports.injectReportButton();
    }
    function injectMondayStatsButton() {
      if (window.SP_Reports) window.SP_Reports.injectMondayStatsButton();
    }

    const QUICK_SEARCH_ID = "sp-quick-search";

    function injectQuickSearch() {
      if (document.getElementById(QUICK_SEARCH_ID)) return;
      var userWrapper = document.querySelector(
        '[class*="warapperNameUserAndLogout"]',
      );
      if (!userWrapper) return;
      var parent = userWrapper.parentElement;

      var wrapper = document.createElement("div");
      wrapper.id = QUICK_SEARCH_ID;
      wrapper.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;margin-right:12px;";

      var input = document.createElement("input");
      input.id = "sp-quick-search-input";
      input.type = "text";
      input.placeholder = "Folio o ID...";
      input.style.cssText =
        "padding:5px 10px;font-size:12px;border:1px solid #ccc;border-radius:6px;width:130px;outline:none;";
      var goBtn = document.createElement("button");
      goBtn.textContent = "→";
      goBtn.style.cssText =
        "padding:5px 10px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#4CAF50;color:#fff;font-weight:600;";

      async function doQuickSearch() {
        var val = input.value.trim();
        if (!val) return;
        goBtn.disabled = true;
        goBtn.textContent = "...";

        var spToken = getToken();
        if (!spToken) {
          showErrorToast("No hay token");
          goBtn.textContent = "→";
          goBtn.disabled = false;
          return;
        }

        try {
          var res = await fetch(
            SP_SEARCH_API +
              "?uniqueCode=" +
              encodeURIComponent(val) +
              "&page=0&size=1",
            {
              headers: spGetHeaders(),
            },
          );
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
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doQuickSearch();
      });

      wrapper.appendChild(input);
      wrapper.appendChild(goBtn);
      parent.insertBefore(wrapper, userWrapper);
    }

    const QUICK_FILTER_ID = "sp-quick-filter";

    function injectQuickFilterButton() {
      var userWrapper = document.querySelector(
        '[class*="warapperNameUserAndLogout"]',
      );
      if (!userWrapper) return;
      var parent = userWrapper.parentElement;

      if (!document.getElementById(QUICK_FILTER_ID)) {
        var btn = document.createElement("button");
        btn.id = QUICK_FILTER_ID;
        btn.textContent = "⏳ En espera";
        btn.style.cssText =
          "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#FF8F00;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
        btn.addEventListener("click", function () {
          showQuickFilterModal("En espera");
        });
        parent.insertBefore(btn, userWrapper);
      }
    }

    async function showQuickFilterModal(
      statusName,
      extraParams,
      title,
      customApiUrl,
    ) {
      var existing = document.getElementById("sp-search-modal");
      if (existing) existing.remove();

      var modalTitle = title || "Tickets: " + statusName;

      var m = SP_Modal.info({
        id: "sp-search-modal",
        title: modalTitle,
        content:
          '<div id="sp-qf-results" style="flex:1;overflow:auto;min-height:100px;"><div style="text-align:center;padding:20px;color:#888;">Buscando...</div></div>' +
          '<div id="sp-qf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
        maxWidth: "900px",
        modalOptions: {
          width: "95%",
          maxHeight: "90vh",
          headerActions:
            '<button id="sp-qf-refresh" style="padding:6px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:13px;">🔄 Actualizar</button>',
        },
        onClose: function () {
          activeModalRefresh = null;
        },
      });

      document
        .getElementById("sp-qf-refresh")
        .addEventListener("click", function () {
          if (activeModalRefresh) activeModalRefresh();
        });

      var currentPage = 1;
      activeModalRefresh = doQuickSearch;
      await doQuickSearch();

      async function doQuickSearch() {
        var results = document.getElementById("sp-qf-results");
        var paging = document.getElementById("sp-qf-paging");
        results.innerHTML =
          '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
        paging.innerHTML = "";

        var spToken = getToken();
        if (!spToken) {
          results.innerHTML =
            '<div style="color:#D94040;padding:12px;">No hay token</div>';
          return;
        }

        try {
          var baseUrl = customApiUrl || SP_SEARCH_API;
          var url = baseUrl + "?page=" + (currentPage - 1) + "&size=25";
          if (!customApiUrl)
            url += "&resolutionGroupId=" + getTeamConfig().resolutionGroupId;
          if (statusName)
            url += "&ticketStatusName=" + encodeURIComponent(statusName);
          if (extraParams) url += "&" + extraParams;
          var res = await fetch(url, {
            headers: spGetHeaders(),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var data = json.data || json;
          var tickets = data.content || [];
          var totalPages = data.totalPages || 1;
          var totalElements = data.totalElements || 0;

          if (!tickets.length) {
            var emptyMsg =
              customApiUrl && modalTitle.indexOf("pendientes") !== -1
                ? "Sin tickets pendientes por atender"
                : "Sin tickets con estado: " + (statusName || "todos");
            results.innerHTML =
              '<div style="text-align:center;padding:20px;color:#888;">' +
              emptyMsg +
              "</div>";
            return;
          }

          var myName = getLoggedUserName();
          var synced = getCache() || {};
          renderTicketCards(results, tickets, myName, synced, cachedBoardDate);

          paging.innerHTML =
            "<span>" +
            totalElements +
            " tickets | Pag " +
            currentPage +
            " de " +
            totalPages +
            "</span>" +
            '<div style="display:flex;gap:4px;">' +
            '<button id="sp-qf-prev" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' +
            (currentPage <= 1 ? " disabled" : "") +
            ">&lt;</button>" +
            '<button id="sp-qf-next" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' +
            (currentPage >= totalPages ? " disabled" : "") +
            ">&gt;</button>" +
            "</div>";

          var prev = document.getElementById("sp-qf-prev");
          var next = document.getElementById("sp-qf-next");
          if (prev)
            prev.addEventListener("click", function () {
              if (currentPage > 1) {
                currentPage--;
                doQuickSearch();
              }
            });
          if (next)
            next.addEventListener("click", function () {
              if (currentPage < totalPages) {
                currentPage++;
                doQuickSearch();
              }
            });
        } catch (err) {
          results.innerHTML =
            '<div style="color:#D94040;padding:12px;">Error: ' +
            err.message +
            "</div>";
        }
      }
    }

    function showSearchModal() {
      var existing = document.getElementById("sp-search-modal");
      if (existing) existing.remove();

      var statusOpts =
        '<option value="">Todos</option><option value="Asignado">Asignado</option><option value="En espera">En espera</option><option value="En atención">En atención</option><option value="En validación">En validación</option><option value="Por confirmar">Por confirmar</option><option value="Por ejecutar">Por ejecutar</option><option value="Por revisar">Por revisar</option><option value="En aplicaciones">En aplicaciones</option><option value="Cerrado">Cerrado</option><option value="Rechazado">Rechazado</option><option value="Cancelado">Cancelado</option><option value="Reabierto">Reabierto</option>';
      var typeOpts =
        '<option value="">Todos</option><option value="5">Solicitud</option><option value="6">Incidente</option>';
      var priorityOpts =
        '<option value="">Todas</option><option value="6">Critico</option><option value="7">Alto</option><option value="8">Medio</option><option value="9">Bajo</option>';

      var inputStyle =
        "width:100%;padding:6px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;";

      var m = SP_Modal.info({
        id: "sp-search-modal",
        title: "🔍 Buscar tickets",
        content:
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
          '<div><label style="font-size:11px;color:#888;">Folio</label><input id="sp-sf-code" style="' +
          inputStyle +
          '" placeholder="Ej: 123"></div>' +
          '<div><label style="font-size:11px;color:#888;">Solicitante</label><input id="sp-sf-requester" style="' +
          inputStyle +
          '" placeholder="Nombre"></div>' +
          '<div><label style="font-size:11px;color:#888;">Estado</label><select id="sp-sf-status" style="' +
          inputStyle +
          '">' +
          statusOpts +
          "</select></div>" +
          '<div><label style="font-size:11px;color:#888;">Tipo</label><select id="sp-sf-type" style="' +
          inputStyle +
          '">' +
          typeOpts +
          "</select></div>" +
          '<div><label style="font-size:11px;color:#888;">Prioridad</label><select id="sp-sf-priority" style="' +
          inputStyle +
          '">' +
          priorityOpts +
          "</select></div>" +
          '<div><label style="font-size:11px;color:#888;">Desde</label><input id="sp-sf-from" type="datetime-local" style="' +
          inputStyle +
          '"></div>' +
          '<div><label style="font-size:11px;color:#888;">Hasta</label><input id="sp-sf-to" type="datetime-local" style="' +
          inputStyle +
          '"></div>' +
          "</div>" +
          '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
          '<button id="sp-sf-search" style="flex:1;padding:10px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:14px;">🔍 Buscar</button>' +
          '<button id="sp-sf-refresh" style="padding:10px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:14px;">🔄</button>' +
          "</div>" +
          '<div id="sp-sf-results" style="flex:1;overflow:auto;min-height:100px;"></div>' +
          '<div id="sp-sf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
        maxWidth: "900px",
        modalOptions: { width: "95%", maxHeight: "90vh" },
        onClose: function () {
          activeModalRefresh = null;
        },
      });

      document
        .getElementById("sp-sf-refresh")
        .addEventListener("click", function () {
          if (activeModalRefresh) activeModalRefresh();
        });

      var currentPage = 1;
      document
        .getElementById("sp-sf-search")
        .addEventListener("click", function () {
          currentPage = 1;
          activeModalRefresh = doSearch;
          doSearch();
        });

      async function doSearch() {
        var results = document.getElementById("sp-sf-results");
        var paging = document.getElementById("sp-sf-paging");
        results.innerHTML =
          '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
        paging.innerHTML = "";

        var spToken = getToken();
        if (!spToken) {
          results.innerHTML =
            '<div style="color:#D94040;padding:12px;">No hay token de SupportPlus</div>';
          return;
        }

        var params =
          "page=" +
          (currentPage - 1) +
          "&size=25&resolutionGroupId=" +
          getTeamConfig().resolutionGroupId;
        var code = document.getElementById("sp-sf-code").value.trim();
        var requester = document.getElementById("sp-sf-requester").value.trim();
        var status = document.getElementById("sp-sf-status").value;
        var type = document.getElementById("sp-sf-type").value;
        var priority = document.getElementById("sp-sf-priority").value;
        var from = document.getElementById("sp-sf-from").value;
        var to = document.getElementById("sp-sf-to").value;

        if (code) params += "&uniqueCode=" + encodeURIComponent(code);
        if (requester)
          params += "&requesterName=" + encodeURIComponent(requester);
        if (status) params += "&ticketStatusName=" + encodeURIComponent(status);
        if (type) params += "&reportTypeId=" + type;
        if (priority) params += "&priorityId=" + priority;
        if (from) params += "&initDate=" + from;
        if (to) params += "&endDate=" + to;

        try {
          var res = await fetch(SP_SEARCH_API + "?" + params, {
            headers: spGetHeaders(),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          var data = json.data || json;
          var tickets = data.content || [];
          var totalPages = data.totalPages || 1;
          var totalElements = data.totalElements || 0;

          if (!tickets.length) {
            results.innerHTML =
              '<div style="text-align:center;padding:20px;color:#888;">Sin resultados</div>';
            return;
          }

          var myName2 = getLoggedUserName();
          var synced2 = getCache() || {};
          renderTicketCards(
            results,
            tickets,
            myName2,
            synced2,
            cachedBoardDate,
          );

          paging.innerHTML =
            "<span>" +
            totalElements +
            " resultados | Pag " +
            currentPage +
            " de " +
            totalPages +
            "</span>" +
            '<div style="display:flex;gap:4px;">' +
            '<button id="sp-sf-prev" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' +
            (currentPage <= 1 ? " disabled" : "") +
            ">&lt;</button>" +
            '<button id="sp-sf-next" style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;"' +
            (currentPage >= totalPages ? " disabled" : "") +
            ">&gt;</button>" +
            "</div>";

          var prev = document.getElementById("sp-sf-prev");
          var next = document.getElementById("sp-sf-next");
          if (prev)
            prev.addEventListener("click", function () {
              if (currentPage > 1) {
                currentPage--;
                doSearch();
              }
            });
          if (next)
            next.addEventListener("click", function () {
              if (currentPage < totalPages) {
                currentPage++;
                doSearch();
              }
            });
        } catch (err) {
          results.innerHTML =
            '<div style="color:#D94040;padding:12px;">Error: ' +
            err.message +
            "</div>";
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
          var bd = await mondayQuery(
            mondayToken,
            "query ($boardId: [ID!]!) { boards(ids: $boardId) { name } }",
            { boardId },
          );
          cachedBoardDate = parseBoardDate(bd.boards[0]?.name || "");
        }
      } catch (e) {}
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
      if (_qdCommentsInterval) {
        clearInterval(_qdCommentsInterval);
        _qdCommentsInterval = null;
      }
      var existing = document.getElementById("sp-quick-detail-modal");
      if (existing) existing.remove();
      // Refresh panel when modal reloads (after actions)
      document.dispatchEvent(new CustomEvent("sp-refresh-panel"));

      showLoadingToast("Cargando detalle...");

      var spToken = getToken();
      if (!spToken) {
        showErrorToast("No hay token");
        return;
      }

      try {
        var res = await fetch(SP_API + "/" + ticketId, {
          headers: spGetHeaders(),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        var t = json.data || json;

        // Check if ticket is pending close
        var isPendingClose = false;
        try {
          var pendingResp = await new Promise(function (resolve) {
            chrome.runtime.sendMessage(
              {
                type: "api-get",
                dbId: "38420e0684b980d682ccfac983fc1780",
                body: {
                  filter: {
                    and: [
                      {
                        property: "IdSupporPlus",
                        number: { equals: parseInt(ticketId) },
                      },
                      { property: "Cerrado", checkbox: { equals: false } },
                    ],
                  },
                  page_size: 1,
                },
              },
              function (r) {
                resolve(r);
              },
            );
          });
          if (
            pendingResp &&
            pendingResp.success &&
            pendingResp.data.results &&
            pendingResp.data.results.length > 0
          ) {
            isPendingClose = true;
          }
        } catch (e) {
          /* ignore */
        }

        // Sync status and person to Monday (non-blocking, reuses ticket data)
        (async function () {
          try {
            var mondayToken = await getMondayToken();
            if (!mondayToken) {
              // Force sync and retry once
              await new Promise(function (r) {
                chrome.runtime.sendMessage({ type: "sync" }, r);
              });
              await new Promise(function (r) {
                setTimeout(r, 2000);
              });
              mondayToken = await getMondayToken();
            }
            if (!mondayToken || !t.uniqueCode) return;
            var spStatus = (t.ticketStatus?.name || "").toLowerCase();
            var hEmail = t.ticketHolder?.ticketHolderLog?.email || "";
            var mondayStatusIndex = mapStatusToMonday(spStatus);

            // Direct fetch to Monday (no background proxy needed)
            async function mFetch(query, variables) {
              var r = await fetch("https://api.monday.com/v2", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: mondayToken,
                },
                body: JSON.stringify({ query: query, variables: variables }),
              });
              var d = await r.json();
              return d.data;
            }

            // Find ticket in Monday boards
            var wsId2 = await getMondayWorkspaceId();
            var boardsData = await mFetch(
              "{ boards(workspace_ids: [" +
                wsId2 +
                "], limit: 50) { id name } }",
              {},
            );
            var ticketBoards = (boardsData.boards || []).filter(function (b) {
              return (
                b.name.includes("Tickets DBA -") &&
                !b.name.includes("Subelementos")
              );
            });
            for (var b of ticketBoards) {
              var itemData = await mFetch(
                "query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }",
                {
                  boardId: b.id,
                  columnId: "text_mm2c9nhc",
                  value: t.uniqueCode,
                },
              );
              var items = itemData.items_page_by_column_values?.items || [];
              if (items.length) {
                var colValues = { status: { index: mondayStatusIndex } };
                if (hEmail) {
                  var usersData = await mFetch(
                    "{ users(limit:500) { id email } }",
                    {},
                  );
                  var uId = (usersData.users || []).find(function (u) {
                    return (
                      u.email && u.email.toLowerCase() === hEmail.toLowerCase()
                    );
                  });
                  if (uId)
                    colValues.multiple_person_mm25nvfq = {
                      personsAndTeams: [
                        { id: parseInt(uId.id), kind: "person" },
                      ],
                    };
                }
                await mFetch(
                  "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
                  {
                    boardId: b.id,
                    itemId: items[0].id,
                    columnValues: JSON.stringify(colValues),
                  },
                );
                SP_Log.debug(
                  "Monday synced from modal:",
                  t.uniqueCode,
                  spStatus,
                  hEmail,
                );
                break;
              }
            }
          } catch (e) {
            SP_Log.warn("Modal Monday sync error:", e.message);
          }
        })();
        var loadingToast = document.getElementById("sp-loading-toast");
        if (loadingToast) loadingToast.remove();

        // Build modal content
        var desc = (t.description || "").replace(
          /<script[^>]*>[\s\S]*?<\/script>/gi,
          "",
        );
        var holderName =
          t.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar";
        var holderEmail = t.ticketHolder?.ticketHolderLog?.email || "";
        var requesterName = t.ticketInfo?.fullName || "";
        var requesterEmail = t.ticketInfo?.email || "";
        var statusName = t.ticketStatus?.name || "";
        var priorityName = t.incidentPriority?.name || "";
        var serviceName = t.service?.name || "";
        var groupName = t.resolutionGroup?.name || "";

        // Subgroup permissions loaded from API sync
        var _canCommentClosedResolved = _canCommentClosed;
        var _canReopenTicketsResolved = _canReopenTickets;
        // Fallback: read from storage if not loaded yet
        if (!_canReopenTicketsResolved || !_canCommentClosedResolved) {
          try {
            var permsData = await new Promise(function (r) {
              chrome.storage.local.get("subgroupPerms", function (d) {
                r(d.subgroupPerms || {});
              });
            });
            if (!_canReopenTicketsResolved)
              _canReopenTicketsResolved = !!permsData.canReopenTickets;
            if (!_canCommentClosedResolved)
              _canCommentClosedResolved = !!permsData.canCommentClosed;
          } catch (e) {}
        }
        var reportType = t.reportType?.name || "";
        var createdAt = t.createdAt
          ? t.createdAt.replace("T", " ").substring(0, 16)
          : "";
        var updatedAt = t.updatedAt
          ? t.updatedAt.replace("T", " ").substring(0, 16)
          : "";
        var location = t.ticketInfo?.location || "";
        var department = t.ticketInfo?.departmentName || "";
        var channel = t.attentionChannel?.name || "";

        // Attachments
        var attachments = t.ticketAttachments?.attachments || [];
        var attachHTML = "";
        if (attachments.length) {
          attachHTML =
            '<div style="margin-top:12px;"><b style="font-size:12px;">📎 Adjuntos (' +
            attachments.length +
            '):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">';
          attachments.forEach(function (a) {
            var fileName = a.file?.name || "archivo";
            var fileId = a.file?.id || "";
            attachHTML +=
              '<button class="sp-qd-download" data-file-id="' +
              fileId +
              '" data-file-name="' +
              fileName.replace(/"/g, "&quot;") +
              '" style="padding:4px 8px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:11px;cursor:pointer;color:#1976D2;">📎 ' +
              esc(fileName) +
              "</button>";
          });
          attachHTML += "</div></div>";
        }

        // Comments
        var comments = t.ticketComments || [];
        var commentsHTML = "";
        if (comments.length) {
          commentsHTML =
            '<div style="margin-top:12px;"><b style="font-size:12px;">💬 Comentarios (' +
            comments.length +
            "):</b>";
          comments.forEach(function (c) {
            var cDate = c.createdAt
              ? c.createdAt.replace("T", " ").substring(0, 16)
              : "";
            var cContent = (c.content || "").replace(/<[^>]*>/g, "");
            commentsHTML +=
              '<div style="margin-top:6px;padding:6px 8px;background:#f9f9f9;border-left:3px solid #1976D2;border-radius:4px;font-size:11px;">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:2px;"><b>' +
              (c.fullName || "") +
              '</b><span style="color:#888;">' +
              cDate +
              "</span></div>" +
              '<div style="color:#555;">' +
              cContent +
              "</div></div>";
          });
          commentsHTML += "</div>";
        }

        // Participants
        var participants = t.participants || [];
        var participantsHTML = "";
        if (participants.length) {
          participantsHTML =
            '<div style="margin-top:12px;"><b style="font-size:12px;">👥 Participantes (' +
            participants.length +
            '):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">';
          participants.forEach(function (p) {
            participantsHTML +=
              '<span style="padding:2px 6px;background:#e8f5e9;border:1px solid #2E7D32;border-radius:4px;font-size:10px;">' +
              (p.profileFullName || p.email || "") +
              "</span>";
          });
          participantsHTML += "</div></div>";
        }

        var rowStyle =
          "padding:4px 10px;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;font-size:12px;";

        var overlay = document.createElement("div");
        overlay.id = "sp-quick-detail-modal";
        overlay.style.cssText =
          "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:99999;display:flex;align-items:center;justify-content:center;transition:background 0.3s ease,backdrop-filter 0.3s ease;backdrop-filter:blur(0px);";
        overlay.innerHTML =
          '<div style="background:#fff;padding:clamp(16px, 2vw, 28px);border-radius:12px;width:92vw;max-width:900px;max-height:85vh;display:flex;flex-direction:column;overflow-y:auto;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);transform:scale(0.95);opacity:0;transition:transform 0.2s ease,opacity 0.2s ease;box-shadow:0 8px 40px rgba(0,0,0,0.25);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<h3 style="margin:0;font-size:1.1rem;">📋 ' +
          (t.uniqueCode || ticketId) +
          ' <span class="sp-qd-copy-folio" data-copy="' +
          (t.uniqueCode || ticketId) +
          '" style="cursor:pointer;font-size:0.85rem;opacity:0.6;" title="Copiar folio">⧉</span> <span style="font-weight:400;color:' +
          (STATUS_TEXT_COLORS[statusName] || "#333") +
          ';font-size:0.85rem;">(' +
          statusName +
          ")</span>" +
          (isPendingClose
            ? ' <span style="padding:2px 8px;background:#FF8F00;color:#fff;border-radius:4px;font-size:0.7rem;font-weight:600;vertical-align:middle;">🕐 Pendiente por cerrar</span>'
            : "") +
          "</h3>" +
          '<div style="display:flex;gap:6px;align-items:center;">' +
          '<span id="sp-qd-actions" style="display:flex;gap:4px;"></span>' +
          '<a href="/es/dashboard/tickets/' +
          ticketId +
          '" target="_blank" style="padding:5px 10px;border:1px solid #1976D2;border-radius:6px;font-size:0.9rem;text-decoration:none;color:#1976D2;">Abrir ↗</a>' +
          '<button id="sp-qd-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.9rem;">✕</button>' +
          "</div>" +
          "</div>" +
          '<div style="flex:1;overflow:auto;">' +
          // Subject + info grid
          '<div style="background:#f5f5f5;padding:8px 10px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:8px;">' +
          (t.subject || "Sin asunto") +
          "</div>" +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px;font-size:0.9rem;">' +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;">' +
          (statusName === "Cerrado"
            ? '<span style="color:#2E7D32;font-weight:700;font-size:0.9rem;">Cerrado</span>'
            : '<span style="color:#888;">Estado:</span> <select id="sp-qd-status-select" style="font-size:0.9rem;border:none;background:transparent;color:' +
              (STATUS_TEXT_COLORS[statusName] || "#333") +
              ';font-weight:700;cursor:pointer;"><option value="" selected>' +
              statusName +
              '</option><option value="" disabled>Cargando...</option></select>') +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Prioridad:</span> ' +
          priorityName +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Tipo:</span> ' +
          reportType +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Canal:</span> ' +
          channel +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Grupo:</span> ' +
          groupName +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Servicio:</span> ' +
          serviceName +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Creado:</span> ' +
          createdAt +
          "</div>" +
          '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Actualizado:</span> ' +
          updatedAt +
          "</div>" +
          "</div>" +
          // Assign row (only if "En espera" / unassigned)
          (statusName === "En espera"
            ? '<div style="margin-bottom:8px;">' +
              '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
              '<button id="sp-qd-take-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🤚 Tomar</button>' +
              (_canRejectTickets
                ? '<button id="sp-qd-reject-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D32F2F;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">❌ Rechazar</button>'
                : "") +
              '<select id="sp-qd-assign-select" style="flex:1;padding:6px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:6px;"><option value="">-- Asignar a --</option></select>' +
              "</div>" +
              '<div id="sp-qd-take-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:0.9rem;">' +
              '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario al tomar</label>' +
              '<div style="display:flex;gap:4px;align-items:flex-start;"><textarea id="sp-qd-take-comment" style="flex:1;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;">se revisa</textarea><label style="padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-take-attach" type="file" multiple style="display:none;"></label></div>' +
              '<div id="sp-qd-take-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
              '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.9rem;"><input type="checkbox" id="sp-qd-take-done"> <b>Ticket realizado</b></label>' +
              '<div id="sp-qd-take-extra" style="display:none;margin-top:6px;">' +
              '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario antes de cerrar (opcional)</label>' +
              '<div style="display:flex;gap:4px;align-items:flex-start;"><textarea id="sp-qd-take-close-comment" placeholder="Comentario de cierre..." style="flex:1;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;"></textarea><label style="padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-take-close-attach" type="file" multiple style="display:none;"></label></div>' +
              '<div id="sp-qd-take-close-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
              "</div>" +
              '<div style="display:flex;gap:6px;margin-top:8px;"><button id="sp-qd-take-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Confirmar</button><button id="sp-qd-take-cancel" style="padding:6px 12px;border:1px solid #999;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:0.9rem;font-weight:600;">Cancelar</button></div>' +
              '<div id="sp-qd-take-suggested" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
              "</div>" +
              "</div>"
            : "") +
          // Action row - only if not closed and not waiting
          (function () {
            if (statusName === "En espera" || statusName === "Cerrado")
              return "";
            var isMigrated =
              t.uniqueCode && getCache() && getCache()[t.uniqueCode];
            var closeHTML =
              '<div style="margin-bottom:8px;">' +
              '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
              '<button id="sp-qd-close-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔒 Cerrar</button>' +
              (holderEmail &&
              holderEmail.toLowerCase() !== getLoggedUserEmail().toLowerCase()
                ? '<button id="sp-qd-steal-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🤚 Tomar</button>'
                : "") +
              "</div>" +
              '<div id="sp-qd-close-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:0.9rem;">' +
              '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario antes de cerrar (opcional)</label>' +
              '<div style="display:flex;gap:4px;align-items:flex-start;"><textarea id="sp-qd-close-comment" placeholder="Comentario de cierre..." style="flex:1;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;"></textarea><label style="padding:6px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-close-attach" type="file" multiple style="display:none;"></label></div>' +
              '<div id="sp-qd-close-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
              '<div style="display:flex;gap:6px;"><button id="sp-qd-close-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Confirmar</button><button id="sp-qd-close-cancel" style="padding:6px 12px;border:1px solid #999;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:0.9rem;font-weight:600;">Cancelar</button></div>' +
              '<div id="sp-qd-close-suggested" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
              "</div>" +
              "</div>";
            return closeHTML;
          })() +
          // Migrate only (if closed, not migrated, and Monday configured)
          (statusName === "Cerrado" &&
          !(t.uniqueCode && getCache() && getCache()[t.uniqueCode])
            ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
              '<button id="sp-qd-migrate-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🙂 Migrar a Monday</button>' +
              "</div>"
            : "") +
          // Reopen row (if closed) - no select, reopen assigns to current holder
          (statusName === "Cerrado" && _canReopenTicketsResolved
            ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
              '<button id="sp-qd-reopen-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔓 Reabrir</button>' +
              "</div>"
            : "") +
          // People row
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.9rem;">' +
          '<b style="color:#888;">👤 Solicitante:</b> ' +
          requesterName +
          ' <span class="sp-qd-copy-name" data-copy="' +
          requesterName +
          '" style="cursor:pointer;font-size:0.8rem;opacity:0.6;" title="Copiar nombre">📋</span>' +
          (requesterEmail
            ? '<br><span style="color:#888;">(' +
              requesterEmail +
              ') <span class="sp-qd-copy-email" data-copy="' +
              requesterEmail +
              '" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>'
            : "") +
          (department
            ? '<br><span style="color:#aaa;">' +
              department +
              " | " +
              location +
              "</span>"
            : "") +
          "</div>" +
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.9rem;">' +
          '<b style="color:#888;">🔍 Analista:</b> ' +
          holderName +
          (holderEmail
            ? '<br><span style="color:#888;">(' +
              holderEmail +
              ') <span class="sp-qd-copy-email" data-copy="' +
              holderEmail +
              '" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>'
            : "") +
          "</div>" +
          "</div>" +
          // Description (compact)
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;margin-bottom:8px;">' +
          '<b style="font-size:0.8rem;color:#888;">📝 Descripción</b>' +
          '<div style="margin:4px 0 0;font-size:0.9rem;line-height:1.5;color:#333;max-height:200px;overflow:auto;">' +
          desc +
          "</div>" +
          "</div>" +
          attachHTML +
          participantsHTML +
          // Comments section
          '<div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px;">' +
          '<b style="font-size:12px;">💬 Comentarios (' +
          comments.length +
          ")</b>" +
          '<div id="sp-qd-comments-list" style="max-height:250px;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column-reverse;">' +
          (comments.length
            ? comments
                .map(function (c) {
                  var cDate = utcToLocal(c.createdAt);
                  var cContent = (c.content || "").replace(
                    /<script[^>]*>[\s\S]*?<\/script>/gi,
                    "",
                  );
                  var cAttachments = c.attachments || [];
                  var cAttachHTML = "";
                  if (cAttachments.length) {
                    cAttachHTML =
                      '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">';
                    cAttachments.forEach(function (a) {
                      var cFileId = a.fileId || a.file?.id || a.id;
                      var cFileName = a.file?.name || a.name || "archivo";
                      cAttachHTML +=
                        '<button class="sp-qd-download" data-file-id="' +
                        cFileId +
                        '" data-file-name="' +
                        cFileName.replace(/"/g, "&quot;") +
                        '" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:0.8rem;cursor:pointer;color:#1976D2;">📎 ' +
                        esc(cFileName) +
                        "</button>";
                    });
                    cAttachHTML += "</div>";
                  }
                  var myName = getLoggedUserName();
                  var myEmail = getLoggedUserEmail();
                  var isMyComment =
                    (c.email &&
                      myEmail &&
                      c.email.toLowerCase() === myEmail.toLowerCase()) ||
                    c.fullName === myName;
                  var addAttachBtn = isMyComment
                    ? ' <label class="sp-qd-add-attach" data-comment-id="' +
                      c.id +
                      '" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar evidencia">📎<input type="file" multiple style="display:none;"></label>'
                    : "";
                  var align = isMyComment ? "flex-end" : "flex-start";
                  var userColor = isMyComment
                    ? null
                    : stringToColor(c.fullName || "user");
                  var bgColor = isMyComment ? "#e3f2fd" : userColor.bg;
                  var borderSide = isMyComment
                    ? "border-right:3px solid #1976D2;"
                    : "border-left:3px solid " + userColor.border + ";";
                  return (
                    '<div style="display:flex;justify-content:' +
                    align +
                    ';margin-bottom:6px;">' +
                    '<div class="sp-comment-bubble" style="max-width:85%;padding:6px 10px;background:' +
                    bgColor +
                    ";" +
                    borderSide +
                    'border-radius:6px;font-size:0.85rem;">' +
                    '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;' +
                    (isMyComment ? "justify-content:flex-end;" : "") +
                    '">' +
                    '<span style="font-weight:600;font-size:0.8rem;">' +
                    (c.fullName || "") +
                    "</span>" +
                    '<span style="color:#888;font-size:0.75rem;">' +
                    cDate +
                    "</span>" +
                    addAttachBtn +
                    "</div>" +
                    '<div style="color:#333;">' +
                    cContent +
                    "</div>" +
                    cAttachHTML +
                    "</div></div>"
                  );
                })
                .join("")
            : '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>') +
          "</div>" +
          // Add comment form (hide if closed, unless in "Comentar con ticket cerrado" sub-group)
          (statusName !== "Cerrado" || _canCommentClosedResolved
            ? '<div id="sp-qd-comment-section">' +
              '<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">' +
              '<textarea id="sp-qd-comment-input" placeholder="Escribe un comentario..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;outline:none;min-height:36px;resize:vertical;font-family:system-ui;"></textarea>' +
              '<label style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-attach-input" type="file" multiple style="display:none;"></label>' +
              '<button id="sp-qd-comment-send" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">Enviar</button>' +
              "</div>" +
              '<div id="sp-qd-attach-list" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
              '<div id="sp-qd-suggested" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;"></div>' +
              "</div>"
            : "") +
          "</div>" +
          "</div></div>";
        document.body.appendChild(overlay);

        // Trigger open animation
        requestAnimationFrame(function () {
          overlay.style.background = "rgba(0,0,0,0.5)";
          overlay.style.backdropFilter = "blur(6px)";
          var modalBox = overlay.querySelector("div");
          if (modalBox) {
            modalBox.style.transform = "scale(1)";
            modalBox.style.opacity = "1";
          }
        });

        function closeQdModal() {
          if (_qdCommentsInterval) {
            clearInterval(_qdCommentsInterval);
            _qdCommentsInterval = null;
          }
          var modalBox = overlay.querySelector("div");
          if (modalBox) {
            modalBox.style.transform = "scale(0.9) translateY(10px)";
            modalBox.style.opacity = "0";
          }
          overlay.style.background = "rgba(0,0,0,0)";
          overlay.style.backdropFilter = "blur(0px)";
          setTimeout(function () {
            overlay.remove();
          }, 250);
        }

        document
          .getElementById("sp-qd-close")
          .addEventListener("click", closeQdModal);
        document.addEventListener("keydown", function escHandler(e) {
          if (
            e.key === "Escape" &&
            document.getElementById("sp-quick-detail-modal") &&
            !document.getElementById("sp-carousel-modal")
          ) {
            closeQdModal();
            document.removeEventListener("keydown", escHandler);
          }
        });

        // Auto-refresh comments every 30s
        _qdCommentsInterval = setInterval(function () {
          if (!document.getElementById("sp-quick-detail-modal")) {
            clearInterval(_qdCommentsInterval);
            _qdCommentsInterval = null;
            return;
          }
          fetch(SP_API + "/" + ticketId, { headers: spGetHeaders() })
            .then(function (r) {
              return r.json();
            })
            .then(function (json) {
              var ticket = json.data || json;
              var newComments = ticket.ticketComments || [];
              var list = document.getElementById("sp-qd-comments-list");
              if (!list) return;
              var currentCount = list.querySelectorAll(
                "[style*='border-left']",
              ).length;
              if (newComments.length === currentCount) return; // No changes
              // Re-render comments
              var html = newComments
                .map(function (c) {
                  var cDate = utcToLocal(c.createdAt);
                  var cContent = (c.content || "").replace(
                    /<script[^>]*>.*?<\/script>/gi,
                    "",
                  );
                  var myName = getLoggedUserName();
                  var myEmail = getLoggedUserEmail();
                  var isMyComment =
                    (c.email &&
                      myEmail &&
                      c.email.toLowerCase() === myEmail.toLowerCase()) ||
                    c.fullName === myName;
                  var cAttachHTML = "";
                  if (c.attachments && c.attachments.length) {
                    cAttachHTML =
                      '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">';
                    c.attachments.forEach(function (a) {
                      var cFileId = a.fileId || a.file?.id || a.id;
                      var cFileName = a.file?.name || a.name || "archivo";
                      cAttachHTML +=
                        '<button class="sp-qd-download" data-file-id="' +
                        cFileId +
                        '" data-file-name="' +
                        cFileName.replace(/"/g, "&quot;") +
                        '" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:0.8rem;cursor:pointer;color:#1976D2;">📎 ' +
                        esc(cFileName) +
                        "</button>";
                    });
                    cAttachHTML += "</div>";
                  }
                  var addAttachBtn = isMyComment
                    ? ' <label class="sp-qd-add-attach" data-comment-id="' +
                      c.id +
                      '" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar evidencia">📎<input type="file" multiple style="display:none;"></label>'
                    : "";
                  var align = isMyComment ? "flex-end" : "flex-start";
                  var userColor = isMyComment
                    ? null
                    : stringToColor(c.fullName || "user");
                  var bgColor = isMyComment ? "#e3f2fd" : userColor.bg;
                  var borderSide = isMyComment
                    ? "border-right:3px solid #1976D2;"
                    : "border-left:3px solid " + userColor.border + ";";
                  return (
                    '<div style="display:flex;justify-content:' +
                    align +
                    ';margin-bottom:6px;">' +
                    '<div class="sp-comment-bubble" style="max-width:85%;padding:6px 10px;background:' +
                    bgColor +
                    ";" +
                    borderSide +
                    'border-radius:6px;font-size:0.85rem;">' +
                    '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;' +
                    (isMyComment ? "justify-content:flex-end;" : "") +
                    '">' +
                    '<span style="font-weight:600;font-size:0.8rem;">' +
                    (c.fullName || "") +
                    "</span>" +
                    '<span style="color:#888;font-size:0.75rem;">' +
                    cDate +
                    "</span>" +
                    addAttachBtn +
                    "</div>" +
                    '<div style="color:#333;">' +
                    cContent +
                    "</div>" +
                    cAttachHTML +
                    "</div></div>"
                  );
                })
                .join("");
              list.innerHTML =
                html ||
                '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>';
            })
            .catch(function () {});
        }, 30000);

        // Move action buttons to header
        var actionsContainer = document.getElementById("sp-qd-actions");
        if (actionsContainer) {
          var closeBtn = document.getElementById("sp-qd-close-btn");
          if (closeBtn) {
            closeBtn.style.padding = "5px 10px";
            closeBtn.style.fontSize = "11px";
            actionsContainer.appendChild(closeBtn);
          }
          var stealBtn = document.getElementById("sp-qd-steal-btn");
          if (stealBtn) {
            stealBtn.style.padding = "5px 10px";
            stealBtn.style.fontSize = "11px";
            actionsContainer.appendChild(stealBtn);
          }
          var takeBtn = document.getElementById("sp-qd-take-btn");
          if (takeBtn) {
            takeBtn.style.padding = "5px 10px";
            takeBtn.style.fontSize = "11px";
            actionsContainer.appendChild(takeBtn);
          }
          var rejectBtn = document.getElementById("sp-qd-reject-btn");
          if (rejectBtn) {
            rejectBtn.style.padding = "5px 10px";
            rejectBtn.style.fontSize = "11px";
            actionsContainer.appendChild(rejectBtn);
          }
          var migrateBtn = document.getElementById("sp-qd-migrate-btn");
          if (migrateBtn) {
            migrateBtn.style.padding = "5px 10px";
            migrateBtn.style.fontSize = "11px";
            actionsContainer.appendChild(migrateBtn);
          }
          var reopenBtn = document.getElementById("sp-qd-reopen-btn");
          if (reopenBtn) {
            reopenBtn.style.padding = "5px 10px";
            reopenBtn.style.fontSize = "11px";
            actionsContainer.appendChild(reopenBtn);
          }

          // Reassign to Aplicaciones button (conditions: department=Mesa de Ayuda, group=Infraestructura DBA, user in subgroup)
          if (
            _btnReassignApp &&
            department.toLowerCase().includes("mesa de ayuda") &&
            groupName.toLowerCase().includes("infraestructura dba") &&
            statusName !== "Cerrado"
          ) {
            var reassignAppBtn = document.createElement("button");
            reassignAppBtn.id = "sp-qd-reassign-app-btn";
            reassignAppBtn.textContent = "🔀 Aplicaciones";
            reassignAppBtn.style.cssText =
              "padding:5px 10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;";
            reassignAppBtn.addEventListener("click", function () {
              showReassignAppModal(ticketId);
            });
            actionsContainer.insertBefore(
              reassignAppBtn,
              actionsContainer.firstChild,
            );
          }
        }

        // Copy folio button
        var copyFolioBtn = overlay.querySelector(".sp-qd-copy-folio");
        if (copyFolioBtn) {
          copyFolioBtn.addEventListener("click", function () {
            navigator.clipboard
              .writeText(copyFolioBtn.dataset.copy)
              .then(function () {
                copyFolioBtn.textContent = "✅";
                setTimeout(function () {
                  copyFolioBtn.textContent = "⧉";
                }, 1500);
              });
          });
        }

        // Copy requester name button
        var copyNameBtn = overlay.querySelector(".sp-qd-copy-name");
        if (copyNameBtn) {
          copyNameBtn.addEventListener("click", function () {
            navigator.clipboard
              .writeText(copyNameBtn.dataset.copy)
              .then(function () {
                copyNameBtn.textContent = "✅";
                setTimeout(function () {
                  copyNameBtn.textContent = "📋";
                }, 1500);
              });
          });
        }

        // Copy email buttons
        overlay.querySelectorAll(".sp-qd-copy-email").forEach(function (btn) {
          btn.addEventListener("click", function () {
            navigator.clipboard.writeText(btn.dataset.copy).then(function () {
              btn.textContent = "✅";
              setTimeout(function () {
                btn.textContent = "📋";
              }, 1500);
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
            chip.style.cssText =
              "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
            chip.innerHTML =
              "📎 " +
              esc(f.name) +
              ' <span data-idx="' +
              idx +
              '" style="cursor:pointer;color:#D94040;font-weight:700;margin-left:2px;">✕</span>';
            chip
              .querySelector("[data-idx]")
              .addEventListener("click", function () {
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
            if (!text && !pendingFiles.length && !_pastedFile) return;
            var sendBtn = document.getElementById("sp-qd-comment-send");
            sendBtn.disabled = true;
            sendBtn.textContent = "...";
            try {
              // Step 1: Post comment
              var commentText = text || "(archivo adjunto)";
              var commentRes = await fetch(SP_API + "/comment/" + ticketId, {
                method: "POST",
                headers: spHeaders(),
                body: JSON.stringify({
                  content: "<p>" + commentText + "</p>",
                  internal: false,
                }),
              });
              if (!commentRes.ok) throw new Error("HTTP " + commentRes.status);
              var commentJson = await commentRes.json();
              var commentId = commentJson.data?.id || commentJson.id;

              // Step 2: Upload attached files if present
              var uploadedFileNames = [];
              if (pendingFiles.length && commentId) {
                var formData = new FormData();
                pendingFiles.forEach(function (f) {
                  formData.append("files", f);
                });
                var fileRes = await fetch(
                  "https://macropayapi.supportplus.mx/files",
                  {
                    method: "POST",
                    headers: { authorization: "Bearer " + spToken },
                    body: formData,
                  },
                );
                if (!fileRes.ok)
                  throw new Error(
                    "Error subiendo archivos: HTTP " + fileRes.status,
                  );
                var fileJson = await fileRes.json();
                var uploadedFiles = fileJson.data || fileJson;
                if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                  var attachPayload = uploadedFiles.map(function (f) {
                    uploadedFileNames.push(f.name);
                    return { fileId: f.id };
                  });
                  await fetch(
                    "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                    {
                      method: "POST",
                      headers: spHeaders(),
                      body: JSON.stringify({
                        attachments: attachPayload,
                        commentId: commentId,
                        isInternal: false,
                      }),
                    },
                  );
                }
              }

              // Step 2b: Upload pasted image if present
              if (_pastedFile && commentId) {
                var namedFile = new File(
                  [_pastedFile],
                  "clipboard_" + Date.now() + ".png",
                  { type: _pastedFile.type },
                );
                var imgFormData = new FormData();
                imgFormData.append("files", namedFile);
                var imgRes = await fetch(
                  "https://macropayapi.supportplus.mx/files",
                  {
                    method: "POST",
                    headers: { authorization: "Bearer " + spToken },
                    body: imgFormData,
                  },
                );
                if (imgRes.ok) {
                  var imgJson = await imgRes.json();
                  var imgFiles = imgJson.data || imgJson;
                  if (Array.isArray(imgFiles) && imgFiles.length) {
                    var imgAttach = imgFiles.map(function (f) {
                      uploadedFileNames.push(f.name || "imagen.png");
                      return { fileId: f.id };
                    });
                    await fetch(
                      "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                      {
                        method: "POST",
                        headers: spHeaders(),
                        body: JSON.stringify({
                          attachments: imgAttach,
                          commentId: commentId,
                          isInternal: false,
                        }),
                      },
                    );
                  }
                }
                // Clean up paste preview
                var pastePreview = document.getElementById(
                  "sp-qd-paste-preview",
                );
                if (pastePreview) pastePreview.remove();
                if (_pastedImgUrl) URL.revokeObjectURL(_pastedImgUrl);
                _pastedFile = null;
                _pastedImgUrl = null;
              }

              // Update UI
              var now = new Date();
              var nowStr =
                now.getFullYear() +
                "-" +
                String(now.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(now.getDate()).padStart(2, "0") +
                " " +
                String(now.getHours()).padStart(2, "0") +
                ":" +
                String(now.getMinutes()).padStart(2, "0");
              var myName = getLoggedUserName() || "Yo";
              var list = document.getElementById("sp-qd-comments-list");
              var noComments = list.querySelector('[style*="color:#aaa"]');
              if (noComments) noComments.remove();
              var attachLabel = uploadedFileNames.length
                ? ' <div style="margin-top:3px;">' +
                  uploadedFileNames
                    .map(function (n) {
                      return (
                        '<span style="color:#1976D2;font-size:10px;">📎 ' +
                        n +
                        "</span>"
                      );
                    })
                    .join(" ") +
                  "</div>"
                : "";
              list.innerHTML +=
                '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">' +
                '<div style="max-width:85%;padding:6px 10px;background:#e3f2fd;border-right:3px solid #1976D2;border-radius:6px;font-size:0.85rem;">' +
                '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;"><span style="font-weight:600;font-size:0.8rem;">' +
                myName.split(" ")[0] +
                '</span><span style="color:#888;font-size:0.75rem;">' +
                nowStr +
                "</span></div>" +
                '<div style="color:#333;">' +
                commentText +
                "</div>" +
                attachLabel +
                "</div></div>";
              list.scrollTop = list.scrollHeight;
              input.value = "";
              pendingFiles = [];
              renderPendingFiles();
              // Refetch comments to get proper attachment URLs
              await showQuickDetailModal(ticketId);
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
            if (e.key === "Enter")
              document.getElementById("sp-qd-comment-send").click();
          });
          // Paste image from clipboard - show preview (image will be sent with "Enviar" button)
          var _pastedFile = null;
          var _pastedImgUrl = null;
          commentInputEl.addEventListener("paste", function (e) {
            var items = (e.clipboardData || e.originalEvent.clipboardData)
              .items;
            for (var i = 0; i < items.length; i++) {
              if (items[i].type.indexOf("image") !== -1) {
                var file = items[i].getAsFile();
                if (file) {
                  e.preventDefault();
                  _pastedFile = file;
                  // Remove existing preview if any
                  var existingPreview = document.getElementById(
                    "sp-qd-paste-preview",
                  );
                  if (existingPreview) existingPreview.remove();
                  if (_pastedImgUrl) URL.revokeObjectURL(_pastedImgUrl);
                  _pastedImgUrl = URL.createObjectURL(file);
                  // Create preview (no "Enviar imagen" button — will send with regular "Enviar")
                  var previewDiv = document.createElement("div");
                  previewDiv.id = "sp-qd-paste-preview";
                  previewDiv.style.cssText =
                    "margin:8px 0;padding:8px;border:1px solid #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
                  previewDiv.innerHTML =
                    '<img src="' +
                    _pastedImgUrl +
                    '" style="max-width:80px;max-height:60px;border-radius:4px;border:1px solid #ddd;">' +
                    '<span style="flex:1;font-size:0.85rem;color:#333;">📋 Imagen del portapapeles</span>' +
                    '<button id="sp-qd-paste-cancel" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>';
                  commentInputEl.parentElement.insertAdjacentElement(
                    "afterend",
                    previewDiv,
                  );
                  // Cancel button
                  document
                    .getElementById("sp-qd-paste-cancel")
                    .addEventListener("click", function () {
                      previewDiv.remove();
                      URL.revokeObjectURL(_pastedImgUrl);
                      _pastedFile = null;
                      _pastedImgUrl = null;
                    });
                }
                break;
              }
            }
          });

          // Load suggested comments into all containers
          var suggestedContainers = [
            "sp-qd-suggested",
            "sp-qd-take-suggested",
            "sp-qd-close-suggested",
          ];
          chrome.storage.local.get("suggestedComments", function (r) {
            var comments = r.suggestedComments || {};
            var groupId = getTeamConfig().resolutionGroupId;
            var groupComments = comments[groupId] || [];
            suggestedContainers.forEach(function (containerId) {
              var container = document.getElementById(containerId);
              if (!container) return;
              groupComments.forEach(function (c) {
                var chip = document.createElement("button");
                chip.textContent =
                  c.text.substring(0, 40) + (c.text.length > 40 ? "..." : "");
                chip.title = c.text;
                var colors = stringToColor(c.text);
                chip.style.cssText =
                  "padding:3px 8px;font-size:0.8rem;border:1px solid " +
                  colors.border +
                  ";border-radius:12px;background:" +
                  colors.bg +
                  ";color:" +
                  colors.text +
                  ";cursor:pointer;white-space:nowrap;";
                chip.addEventListener("click", function () {
                  var takeComment =
                    document.getElementById("sp-qd-take-comment");
                  var takeCloseComment = document.getElementById(
                    "sp-qd-take-close-comment",
                  );
                  var closeComment = document.getElementById(
                    "sp-qd-close-comment",
                  );
                  if (
                    takeCloseComment &&
                    takeCloseComment.offsetParent !== null
                  ) {
                    takeCloseComment.value = c.text;
                    takeCloseComment.focus();
                  } else if (
                    closeComment &&
                    closeComment.offsetParent !== null
                  ) {
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
              if (
                e.target.tagName === "INPUT" ||
                e.target.tagName === "LABEL" ||
                e.target.tagName === "BUTTON"
              )
                return;
              // Deselect others
              overlay
                .querySelectorAll("[data-sp-selected-comment]")
                .forEach(function (el) {
                  el.style.outline = "";
                  el.removeAttribute("data-sp-selected-comment");
                });
              // Remove existing paste preview
              var existingPreview = document.getElementById(
                "sp-qd-comment-paste-preview",
              );
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
              var fileRes = await fetch(
                "https://macropayapi.supportplus.mx/files",
                {
                  method: "POST",
                  headers: { authorization: "Bearer " + spToken },
                  body: formData,
                },
              );
              if (!fileRes.ok) throw new Error("HTTP " + fileRes.status);
              var fileJson = await fileRes.json();
              var uploadedFiles = fileJson.data || fileJson;
              if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                var attachPayload = uploadedFiles.map(function (f) {
                  return { fileId: f.id };
                });
                await fetch(
                  "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                  {
                    method: "POST",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      attachments: attachPayload,
                      commentId: parseInt(commentId),
                      isInternal: false,
                    }),
                  },
                );
                showSuccessToast("Evidencia adjuntada");
                // Reload modal to show new attachments
                overlay.remove();
                showQuickDetailModal(ticketId);
              }
            } catch (err) {
              showErrorToast("Error: " + err.message);
              label.innerHTML =
                '📎<input type="file" multiple style="display:none;">';
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
                var selectedEl = overlay.querySelector(
                  "[data-sp-selected-comment]",
                );
                if (!selectedEl) return;
                var imgUrl = URL.createObjectURL(file);
                var previewDiv = document.createElement("div");
                previewDiv.id = "sp-qd-comment-paste-preview";
                previewDiv.style.cssText =
                  "margin:4px 0 8px;padding:8px;border:1px dashed #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
                previewDiv.innerHTML =
                  '<img src="' +
                  imgUrl +
                  '" style="max-width:60px;max-height:50px;border-radius:4px;">' +
                  '<span style="flex:1;font-size:0.85rem;">Adjuntar al comentario</span>' +
                  '<button id="sp-qd-cpaste-send" style="padding:5px 10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;">📎 Enviar</button>' +
                  '<button id="sp-qd-cpaste-cancel" style="padding:5px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>';
                selectedEl.insertAdjacentElement("afterend", previewDiv);
                document
                  .getElementById("sp-qd-cpaste-send")
                  .addEventListener("click", async function () {
                    var sendBtn = document.getElementById("sp-qd-cpaste-send");
                    sendBtn.textContent = "⏳";
                    sendBtn.disabled = true;
                    try {
                      var namedFile = new File(
                        [file],
                        "clipboard_" + Date.now() + ".png",
                        { type: file.type },
                      );
                      var formData = new FormData();
                      formData.append("files", namedFile);
                      var fileRes = await fetch(
                        "https://macropayapi.supportplus.mx/files",
                        {
                          method: "POST",
                          headers: { authorization: "Bearer " + spToken },
                          body: formData,
                        },
                      );
                      var fileJson = await fileRes.json();
                      var uploadedFiles = fileJson.data || fileJson;
                      if (
                        Array.isArray(uploadedFiles) &&
                        uploadedFiles.length
                      ) {
                        await fetch(
                          "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                          {
                            method: "POST",
                            headers: spHeaders(),
                            body: JSON.stringify({
                              attachments: [{ fileId: uploadedFiles[0].id }],
                              commentId: parseInt(_selectedCommentId),
                              isInternal: false,
                            }),
                          },
                        );
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
                document
                  .getElementById("sp-qd-cpaste-cancel")
                  .addEventListener("click", function () {
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
          statusSelect.innerHTML =
            '<option value="">' + statusName + "</option>";
        } else {
          fetch(
            "https://macropayapi.supportplus.mx/ticket-status/next-status-options/" +
              currentStatusId,
            {
              headers: spGetHeaders(),
            },
          )
            .then(function (r) {
              return r.json();
            })
            .then(function (statusJson) {
              var options = statusJson.data || [];
              statusSelect.innerHTML =
                '<option value="" data-id="">' +
                statusName +
                " (actual)</option>";
              options.forEach(function (opt) {
                var ns = opt.nextStatus || {};
                statusSelect.innerHTML +=
                  '<option value="' +
                  ns.id +
                  '" data-name="' +
                  (ns.name || opt.name) +
                  '">' +
                  (ns.name || opt.name) +
                  "</option>";
              });
            })
            .catch(function () {
              statusSelect.innerHTML =
                '<option value="">' + statusName + "</option>";
            });
        }

        if (statusSelect)
          statusSelect.addEventListener("change", async function () {
            var selectedOpt = statusSelect.options[statusSelect.selectedIndex];
            var newStatusId = statusSelect.value;
            var newStatusName =
              selectedOpt.dataset.name || selectedOpt.textContent;
            if (!newStatusId) return;
            statusSelect.disabled = true;
            showLoadingToast("Cambiando estatus...");
            try {
              var statusRes = await fetch(
                SP_API +
                  "/update-ticket-status-with-optional-comment/" +
                  ticketId,
                {
                  method: "PATCH",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    nextTicketStatusId: parseInt(newStatusId),
                    ticketCommentRequest: null,
                  }),
                },
              );
              if (!statusRes.ok) throw new Error("HTTP " + statusRes.status);
              showSuccessToast("Estatus cambiado a: " + newStatusName);
              updateMondayStatus(ticketId, t.uniqueCode, newStatusName);
              statusSelect.style.color =
                STATUS_TEXT_COLORS[newStatusName] || "#333";
              // Reload valid options for new status
              var newOptRes = await fetch(
                "https://macropayapi.supportplus.mx/ticket-status/next-status-options/" +
                  newStatusId,
                {
                  headers: spGetHeaders(),
                },
              );
              var newOptJson = await newOptRes.json();
              var newOptions = newOptJson.data || [];
              statusSelect.innerHTML =
                '<option value="" data-id="">' +
                newStatusName +
                " (actual)</option>";
              newOptions.forEach(function (opt) {
                var ns = opt.nextStatus || {};
                statusSelect.innerHTML +=
                  '<option value="' +
                  ns.id +
                  '" data-name="' +
                  (ns.name || opt.name) +
                  '">' +
                  (ns.name || opt.name) +
                  "</option>";
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
          var ticketGroupId =
            t.resolutionGroup?.id || getTeamConfig().resolutionGroupId;
          fetch(
            "https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" +
              ticketGroupId,
            {
              headers: spGetHeaders(),
            },
          )
            .then(function (r) {
              return r.json();
            })
            .then(function (json) {
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
            })
            .catch(function () {});

          // Toggle "Ticket realizado" extras
          takeDoneCheck.addEventListener("change", function () {
            if (takeDoneCheck.checked && !isWithinWorkHours()) {
              // Outside work hours - show warning instead of close form
              takeExtraDiv.style.display = "none";
              var existingWarning = document.getElementById(
                "sp-qd-take-hours-warning",
              );
              if (!existingWarning) {
                existingWarning = document.createElement("div");
                existingWarning.id = "sp-qd-take-hours-warning";
                existingWarning.style.cssText =
                  "margin-top:8px;padding:10px 14px;background:rgba(255,152,0,0.15);border:1px solid #FF8F00;border-radius:8px;font-size:12px;color:#E65100;";
                existingWarning.innerHTML =
                  "<b>⚠️ Fuera de horario laboral</b><br>El ticket se tomará pero el cierre quedará pendiente hasta que estés dentro del horario (" +
                  _workSchedule.horaEntrada +
                  ":00 - " +
                  _workSchedule.horaSalida +
                  ":00, " +
                  _workSchedule.diaInicio +
                  " a " +
                  _workSchedule.diaFinal +
                  ").";
                takeDoneCheck
                  .closest("label")
                  .parentElement.appendChild(existingWarning);
              }
            } else {
              // Within work hours or unchecked - normal behavior
              var warning = document.getElementById("sp-qd-take-hours-warning");
              if (warning) warning.remove();
              takeExtraDiv.style.display = takeDoneCheck.checked
                ? "block"
                : "none";
              if (takeDoneCheck.checked) {
                var takeCloseCommentEl = document.getElementById(
                  "sp-qd-take-close-comment",
                );
                if (takeCloseCommentEl)
                  setTimeout(function () {
                    takeCloseCommentEl.focus();
                  }, 50);
              }
            }
          });

          // Load Monday groups for the select
          getMondayToken().then(function (mondayToken) {
            if (!mondayToken) return;
            getMondayBoardId().then(function (boardId) {
              if (!boardId) return;
              mondayQuery(
                mondayToken,
                "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
                { boardId },
              )
                .then(function (gData) {
                  var groups = gData.boards[0]?.groups || [];
                  groups.forEach(function (g) {
                    var opt = document.createElement("option");
                    opt.value = g.id;
                    opt.textContent = g.title;
                    takeGroupSelect.appendChild(opt);
                  });
                })
                .catch(function () {});
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
            var bottomComment = document.getElementById(
              "sp-qd-comment-section",
            );
            if (bottomComment) bottomComment.style.display = "none";
            // Change button appearance
            takeBtn.textContent = "🤚 Tomar";
            takeBtn.style.background = "#0D47A1";
            takeBtn.disabled = true;
            // Focus comment textarea
            var takeCommentEl = document.getElementById("sp-qd-take-comment");
            if (takeCommentEl)
              setTimeout(function () {
                takeCommentEl.focus();
                takeCommentEl.select();
              }, 50);
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
                  headers: spHeaders(),
                  body: JSON.stringify({
                    nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.RECHAZADO,
                    ticketCommentRequest: null,
                  }),
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
              var bottomComment = document.getElementById(
                "sp-qd-comment-section",
              );
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
          var takeAttachList = document.getElementById(
            "sp-qd-take-attach-list",
          );
          var takeCloseAttachInput = document.getElementById(
            "sp-qd-take-close-attach",
          );
          var takeCloseAttachList = document.getElementById(
            "sp-qd-take-close-attach-list",
          );

          function renderTakeFiles() {
            if (takeAttachList) {
              takeAttachList.innerHTML = "";
              takePendingFiles.forEach(function (f, idx) {
                var chip = document.createElement("span");
                chip.style.cssText =
                  "padding:2px 6px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:3px;font-size:9px;color:#1565C0;display:flex;align-items:center;gap:3px;";
                chip.innerHTML =
                  "📎 " +
                  f.name +
                  ' <span style="cursor:pointer;color:#D32F2F;" data-idx="' +
                  idx +
                  '">✕</span>';
                chip
                  .querySelector("span")
                  .addEventListener("click", function () {
                    takePendingFiles.splice(idx, 1);
                    renderTakeFiles();
                  });
                takeAttachList.appendChild(chip);
              });
            }
          }
          function renderTakeCloseFiles() {
            if (takeCloseAttachList) {
              takeCloseAttachList.innerHTML = "";
              takeCloseFiles.forEach(function (f, idx) {
                var chip = document.createElement("span");
                chip.style.cssText =
                  "padding:2px 6px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:3px;font-size:9px;color:#1565C0;display:flex;align-items:center;gap:3px;";
                chip.innerHTML =
                  "📎 " +
                  f.name +
                  ' <span style="cursor:pointer;color:#D32F2F;" data-idx="' +
                  idx +
                  '">✕</span>';
                chip
                  .querySelector("span")
                  .addEventListener("click", function () {
                    takeCloseFiles.splice(idx, 1);
                    renderTakeCloseFiles();
                  });
                takeCloseAttachList.appendChild(chip);
              });
            }
          }
          if (takeAttachInput) {
            takeAttachInput.addEventListener("change", function () {
              for (var i = 0; i < takeAttachInput.files.length; i++)
                takePendingFiles.push(takeAttachInput.files[i]);
              takeAttachInput.value = "";
              renderTakeFiles();
            });
          }
          if (takeCloseAttachInput) {
            takeCloseAttachInput.addEventListener("change", function () {
              for (var i = 0; i < takeCloseAttachInput.files.length; i++)
                takeCloseFiles.push(takeCloseAttachInput.files[i]);
              takeCloseAttachInput.value = "";
              renderTakeCloseFiles();
            });
          }

          // Paste image from clipboard into take textareas
          var takeCommentEl = document.getElementById("sp-qd-take-comment");
          var takeCloseCommentEl = document.getElementById(
            "sp-qd-take-close-comment",
          );
          if (takeCommentEl) {
            takeCommentEl.addEventListener("paste", function (e) {
              var items = (e.clipboardData || e.originalEvent.clipboardData)
                .items;
              for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                  var f = items[i].getAsFile();
                  if (f) {
                    takePendingFiles.push(
                      new File([f], "clipboard_" + Date.now() + ".png", {
                        type: f.type,
                      }),
                    );
                    renderTakeFiles();
                  }
                  e.preventDefault();
                  break;
                }
              }
            });
          }
          if (takeCloseCommentEl) {
            takeCloseCommentEl.addEventListener("paste", function (e) {
              var items = (e.clipboardData || e.originalEvent.clipboardData)
                .items;
              for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                  var f = items[i].getAsFile();
                  if (f) {
                    takeCloseFiles.push(
                      new File([f], "clipboard_" + Date.now() + ".png", {
                        type: f.type,
                      }),
                    );
                    renderTakeCloseFiles();
                  }
                  e.preventDefault();
                  break;
                }
              }
            });
          }

          // Confirm button - executes the take action
          var takeConfirmBtn = document.getElementById("sp-qd-take-confirm");
          if (takeConfirmBtn) {
            takeConfirmBtn.addEventListener("click", async function () {
              var comment =
                document.getElementById("sp-qd-take-comment").value.trim() ||
                "se revisa";
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
                    headers: spHeaders(),
                    body: JSON.stringify({
                      resolutionGroupId: t.resolutionGroup?.id,
                      serviceId: null,
                      responsibleProfileId: myProfId,
                      resolutionGroup: {
                        label: t.resolutionGroup?.name || "",
                        value: t.resolutionGroup?.id,
                      },
                    }),
                  });
                  if (!res.ok) throw new Error("HTTP " + res.status);
                  // Post comment separately
                  var commentRes = await fetch(
                    SP_API + "/comment/" + ticketId,
                    {
                      method: "POST",
                      headers: spHeaders(),
                      body: JSON.stringify({
                        content: "<p>" + comment + "</p>",
                        internal: false,
                      }),
                    },
                  );
                  var commentJson = await commentRes.json();
                  var commentId = commentJson.data?.id || commentJson.id;
                  // Upload files
                  if (commentId) {
                    var formData = new FormData();
                    takePendingFiles.forEach(function (f) {
                      formData.append("files", f);
                    });
                    var fileRes = await fetch(
                      "https://macropayapi.supportplus.mx/files",
                      {
                        method: "POST",
                        headers: { authorization: "Bearer " + spToken },
                        body: formData,
                      },
                    );
                    if (fileRes.ok) {
                      var fileJson = await fileRes.json();
                      var uploadedFiles = fileJson.data || fileJson;
                      if (
                        Array.isArray(uploadedFiles) &&
                        uploadedFiles.length
                      ) {
                        var attachPayload = uploadedFiles.map(function (f) {
                          return { fileId: f.id };
                        });
                        await fetch(
                          "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                          {
                            method: "POST",
                            headers: spHeaders(),
                            body: JSON.stringify({
                              attachments: attachPayload,
                              commentId: commentId,
                              isInternal: false,
                            }),
                          },
                        );
                      }
                    }
                  }
                } else {
                  // No files - reassign with comment inline
                  var res = await fetch(SP_API + "/reassign/" + ticketId, {
                    method: "PUT",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      resolutionGroupId: t.resolutionGroup?.id,
                      serviceId: null,
                      responsibleProfileId: myProfId,
                      resolutionGroup: {
                        label: t.resolutionGroup?.name || "",
                        value: t.resolutionGroup?.id,
                      },
                      ticketCommentRequest: {
                        internal: false,
                        content: comment,
                      },
                    }),
                  });
                  if (!res.ok) throw new Error("HTTP " + res.status);
                  var json2 = await res.json();
                  if (!json2.success) throw new Error("No success");
                }

                if (takeDoneCheck.checked) {
                  // Check work hours before closing
                  if (!isWithinWorkHours()) {
                    // Save as pending close - ticket was taken but can't close now
                    try {
                      var storedPending = await new Promise(function (r) {
                        chrome.storage.local.get(
                          ["usersMap", "userEmail"],
                          function (d) {
                            r(d);
                          },
                        );
                      });
                      var pendingEmail = (
                        storedPending.userEmail || ""
                      ).toLowerCase();
                      var pendingUsers = storedPending.usersMap || {};
                      var pendingUser = pendingEmail ? pendingUsers[pendingEmail] : null;
                      if (pendingUser && pendingUser.idUsuario) {
                        await saveTicketPendingClose(
                          t.uniqueCode || "T" + ticketId,
                          ticketId,
                          String(pendingUser.idUsuario),
                          "",
                        );
                      }
                    } catch (e) {}
                    showSuccessToast(
                      "Ticket tomado. Cierre pendiente (fuera de horario).",
                    );
                    updateMondayStatus(ticketId, t.uniqueCode, "Asignado");
                    chrome.storage.local.get("userEmail", function (r) {
                      if (r.userEmail)
                        updateMondayPerson(ticketId, t.uniqueCode, r.userEmail);
                    });
                    overlay.remove();
                    showQuickDetailModal(ticketId);
                    return;
                  }
                  var closeComment = document
                    .getElementById("sp-qd-take-close-comment")
                    .value.trim();
                  if (closeComment || takeCloseFiles.length > 0) {
                    var closeCommentRes = await fetch(
                      SP_API + "/comment/" + ticketId,
                      {
                        method: "POST",
                        headers: spHeaders(),
                        body: JSON.stringify({
                          content:
                            "<p>" +
                            (closeComment || "(archivo adjunto)") +
                            "</p>",
                          internal: false,
                        }),
                      },
                    );
                    // Upload close files if any
                    if (takeCloseFiles.length > 0) {
                      var closeCommentJson = await closeCommentRes.json();
                      var closeCommentId =
                        closeCommentJson.data?.id || closeCommentJson.id;
                      if (closeCommentId) {
                        var formData2 = new FormData();
                        takeCloseFiles.forEach(function (f) {
                          formData2.append("files", f);
                        });
                        var fileRes2 = await fetch(
                          "https://macropayapi.supportplus.mx/files",
                          {
                            method: "POST",
                            headers: { authorization: "Bearer " + spToken },
                            body: formData2,
                          },
                        );
                        if (fileRes2.ok) {
                          var fileJson2 = await fileRes2.json();
                          var uploadedFiles2 = fileJson2.data || fileJson2;
                          if (
                            Array.isArray(uploadedFiles2) &&
                            uploadedFiles2.length
                          ) {
                            var attachPayload2 = uploadedFiles2.map(
                              function (f) {
                                return { fileId: f.id };
                              },
                            );
                            await fetch(
                              "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                              {
                                method: "POST",
                                headers: spHeaders(),
                                body: JSON.stringify({
                                  attachments: attachPayload2,
                                  commentId: closeCommentId,
                                  isInternal: false,
                                }),
                              },
                            );
                          }
                        }
                      }
                    }
                  }
                  await fetch(
                    SP_API +
                      "/update-ticket-status-with-optional-comment/" +
                      ticketId,
                    {
                      method: "PATCH",
                      headers: spHeaders(),
                      body: JSON.stringify({
                        nextTicketStatusId:
                          window.SP_CONFIG.SP_STATUSES.CERRADO,
                        ticketCommentRequest: null,
                      }),
                    },
                  );
                  var selectedGroup = takeGroupSelect
                    ? takeGroupSelect.value
                    : "";
                  showSuccessToast("Ticket tomado y cerrado");
                  removeTicketPendingClose(ticketId);
                  updateMondayStatus(ticketId, t.uniqueCode, "Cerrado");
                } else {
                  showSuccessToast("Ticket tomado");
                  updateMondayStatus(ticketId, t.uniqueCode, "Asignado");
                  chrome.storage.local.get("userEmail", function (r) {
                    if (r.userEmail)
                      updateMondayPerson(ticketId, t.uniqueCode, r.userEmail);
                  });
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
            assignSelect.disabled = true;
            showLoadingToast("Asignando ticket...");
            try {
              var res = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: spHeaders(),
                body: JSON.stringify({
                  resolutionGroupId: t.resolutionGroup?.id,
                  serviceId: null,
                  responsibleProfileId: parseInt(selectedId),
                  resolutionGroup: {
                    label: t.resolutionGroup?.name || "",
                    value: t.resolutionGroup?.id,
                  },
                }),
              });
              if (!res.ok) throw new Error("HTTP " + res.status);
              var json2 = await res.json();
              if (json2.success) {
                showSuccessToast("Ticket asignado");
                updateMondayStatus(ticketId, t.uniqueCode, "Asignado");
                var assignedOpt =
                  assignSelect.options[assignSelect.selectedIndex];
                if (assignedOpt && assignedOpt.dataset.email)
                  updateMondayPerson(
                    ticketId,
                    t.uniqueCode,
                    assignedOpt.dataset.email,
                  );
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
                mondayQuery(
                  mondayToken,
                  "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
                  { boardId },
                )
                  .then(function (gData) {
                    var groups = gData.boards[0]?.groups || [];
                    groups.forEach(function (g) {
                      var opt = document.createElement("option");
                      opt.value = g.id;
                      opt.textContent = g.title;
                      closeGroupSelect.appendChild(opt);
                    });
                  })
                  .catch(function () {});
              });
            });
          }

          closeActionBtn.addEventListener("click", async function () {
            // Check if within work hours
            if (!isWithinWorkHours()) {
              // Outside work hours - save to API and show warning
              closeForm.style.display = "none";
              var warningDiv = document.getElementById(
                "sp-qd-outside-hours-warning",
              );
              if (warningDiv) {
                warningDiv.remove();
              }
              warningDiv = document.createElement("div");
              warningDiv.id = "sp-qd-outside-hours-warning";
              warningDiv.style.cssText =
                "margin-top:8px;padding:10px 14px;background:rgba(255,152,0,0.15);border:1px solid #FF8F00;border-radius:8px;font-size:12px;color:#E65100;";
              warningDiv.innerHTML =
                "<b>⚠️ Fuera de horario laboral</b><br>El cierre se registrará como pendiente. Podrás cerrar este ticket cuando estés dentro del horario (" +
                _workSchedule.horaEntrada +
                ":00 - " +
                _workSchedule.horaSalida +
                ":00, " +
                _workSchedule.diaInicio +
                " a " +
                _workSchedule.diaFinal +
                ').<br><span id="sp-qd-saving-pending" style="color:#888;margin-top:4px;display:inline-block;">Guardando...</span>';
              closeActionBtn.parentElement.appendChild(warningDiv);
              // Save pending close
              try {
                var analystPageId = "";
                var storedData = await new Promise(function (r) {
                  chrome.storage.local.get(["usersMap"], function (d) {
                    r(d);
                  });
                });
                var users = storedData.usersMap || {};
                // Use the ticket holder email to find their user ID
                var analystEmail = (
                  t.ticketHolder?.ticketHolderLog?.email || ""
                ).toLowerCase();
                if (analystEmail && users[analystEmail]) {
                }
                if (!analystPageId)
                  throw new Error("No se encontró al analista");
                var closeGroupPageId = "";
                await saveTicketPendingClose(
                  t.uniqueCode || "T" + ticketId,
                  ticketId,
                  analystPageId,
                  closeGroupPageId,
                );
                document.getElementById("sp-qd-saving-pending").innerHTML =
                  "✅ Registrado como pendiente. Se cerrará en horario laboral.";
              } catch (err) {
                document.getElementById("sp-qd-saving-pending").innerHTML =
                  "❌ Error: " + err.message;
              }
              return;
            }
            // Within work hours - show close form normally
            closeForm.style.display =
              closeForm.style.display === "none" ? "block" : "none";
            // Hide bottom comment section when close form is shown
            var bottomComment = document.getElementById(
              "sp-qd-comment-section",
            );
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
              var bottomComment = document.getElementById(
                "sp-qd-comment-section",
              );
              if (bottomComment) bottomComment.style.display = "";
            });
          }

          // File attachments for close form
          var closePendingFiles = [];
          var closeAttachInput = document.getElementById("sp-qd-close-attach");
          var closeAttachList = document.getElementById(
            "sp-qd-close-attach-list",
          );
          function renderCloseFiles() {
            if (closeAttachList) {
              closeAttachList.innerHTML = "";
              closePendingFiles.forEach(function (f, idx) {
                var chip = document.createElement("span");
                chip.style.cssText =
                  "padding:2px 6px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:3px;font-size:9px;color:#1565C0;display:flex;align-items:center;gap:3px;";
                chip.innerHTML =
                  "📎 " +
                  f.name +
                  ' <span style="cursor:pointer;color:#D32F2F;" data-idx="' +
                  idx +
                  '">✕</span>';
                chip
                  .querySelector("span")
                  .addEventListener("click", function () {
                    closePendingFiles.splice(idx, 1);
                    renderCloseFiles();
                  });
                closeAttachList.appendChild(chip);
              });
            }
          }
          if (closeAttachInput) {
            closeAttachInput.addEventListener("change", function () {
              for (var i = 0; i < closeAttachInput.files.length; i++)
                closePendingFiles.push(closeAttachInput.files[i]);
              closeAttachInput.value = "";
              renderCloseFiles();
            });
          }

          // Paste image from clipboard into close textarea
          var closeCommentEl = document.getElementById("sp-qd-close-comment");
          if (closeCommentEl) {
            closeCommentEl.addEventListener("paste", function (e) {
              var items = (e.clipboardData || e.originalEvent.clipboardData)
                .items;
              for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                  var f = items[i].getAsFile();
                  if (f) {
                    closePendingFiles.push(
                      new File([f], "clipboard_" + Date.now() + ".png", {
                        type: f.type,
                      }),
                    );
                    renderCloseFiles();
                  }
                  e.preventDefault();
                  break;
                }
              }
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
                  headers: spHeaders(),
                  body: JSON.stringify({
                    resolutionGroupId: t.resolutionGroup?.id,
                    serviceId: null,
                    responsibleProfileId: myProfId,
                    resolutionGroup: {
                      label: t.resolutionGroup?.name || "",
                      value: t.resolutionGroup?.id,
                    },
                  }),
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
              var closeComment = document
                .getElementById("sp-qd-close-comment")
                .value.trim();
              var selectedGroup = closeGroupSelect
                ? closeGroupSelect.value
                : "";
              closeConfirmBtn.disabled = true;
              closeConfirmBtn.textContent = "⏳...";
              showLoadingToast("Cerrando ticket...");
              try {
                // Comment if provided (with file upload)
                if (closeComment || closePendingFiles.length > 0) {
                  var cRes = await fetch(SP_API + "/comment/" + ticketId, {
                    method: "POST",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      content:
                        "<p>" + (closeComment || "(archivo adjunto)") + "</p>",
                      internal: false,
                    }),
                  });
                  if (closePendingFiles.length > 0 && cRes.ok) {
                    var cJson = await cRes.json();
                    var cId = cJson.data?.id || cJson.id;
                    if (cId) {
                      var fd = new FormData();
                      closePendingFiles.forEach(function (f) {
                        fd.append("files", f);
                      });
                      var fRes = await fetch(
                        "https://macropayapi.supportplus.mx/files",
                        {
                          method: "POST",
                          headers: { authorization: "Bearer " + spToken },
                          body: fd,
                        },
                      );
                      if (fRes.ok) {
                        var fJson = await fRes.json();
                        var uFiles = fJson.data || fJson;
                        if (Array.isArray(uFiles) && uFiles.length) {
                          await fetch(
                            "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                            {
                              method: "POST",
                              headers: spHeaders(),
                              body: JSON.stringify({
                                attachments: uFiles.map(function (f) {
                                  return { fileId: f.id };
                                }),
                                commentId: cId,
                                isInternal: false,
                              }),
                            },
                          );
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
                      headers: spHeaders(),
                      body: JSON.stringify({
                        resolutionGroupId: t.resolutionGroup?.id,
                        serviceId: null,
                        responsibleProfileId: myProfId,
                        resolutionGroup: {
                          label: t.resolutionGroup?.name || "",
                          value: t.resolutionGroup?.id,
                        },
                      }),
                    });
                  }
                }
                // Close
                var closeRes = await fetch(
                  SP_API +
                    "/update-ticket-status-with-optional-comment/" +
                    ticketId,
                  {
                    method: "PATCH",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      nextTicketStatusId: window.SP_CONFIG.SP_STATUSES.CERRADO,
                      ticketCommentRequest: null,
                    }),
                  },
                );
                if (!closeRes.ok) throw new Error("HTTP " + closeRes.status);
                // Migrate if selected
                showSuccessToast("Ticket cerrado");
                removeTicketPendingClose(ticketId);
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

        // Auto-migrate to Monday when opening ticket (if not already there)
        var migrateOnlyBtn = document.getElementById("sp-qd-migrate-btn");
        if (migrateOnlyBtn) {
          migrateOnlyBtn.style.display = "none";
        }
        (async function () {
          try {
            // canMigrateMonday removed - only token check needed
            var mondayToken = await getMondayToken();
            if (!mondayToken) return;
            var code = t.uniqueCode || "";
            if (!code) return;

            // Check if exists in Monday
            var cached = getCache() || {};
            var existingItemId = cached[code] || await checkTicketExistsInMonday(mondayToken, code);

            if (existingItemId) {
              addToCache(code, existingItemId);
              // Update status and person if different
              var currentStatus = (t.ticketStatusName || "").toLowerCase();
              var holderEmail = t.ticketHolder && t.ticketHolder.ticketHolderLog ? t.ticketHolder.ticketHolderLog.email || "" : "";
              await window.SP_MondayUtils.updateMondayItem(mondayToken, code, { statusName: currentStatus, email: holderEmail });
            } else {
              // Create it
              await ensureTicketInMonday(ticketId, code);
            }
          } catch (e) { /* silent */ }
        })();

        // Reopen button - reassigns to current holder to reopen
        var reopenBtn = document.getElementById("sp-qd-reopen-btn");
        if (reopenBtn) {
          reopenBtn.addEventListener("click", async function () {
            // Get the holder's profileId from the ticket data
            var holderProfileId = t.ticketHolder?.ticketHolderLog ? null : null;
            // We need to find the profileId of the current holder
            var holderEmail = t.ticketHolder?.ticketHolderLog?.email || "";
            var teamConfigReopen = getTeamConfig();
            var holderProfile = teamConfigReopen.profiles
              ? teamConfigReopen.profiles.find(function (p) {
                  return p.email === holderEmail;
                })
              : null;
            var personId = holderProfile
              ? holderProfile.profileId
              : sessionProfileId;
            if (!personId) {
              showErrorToast("No se pudo determinar el analista");
              return;
            }
            reopenBtn.disabled = true;
            reopenBtn.textContent = "⏳...";
            try {
              var res = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: spHeaders(),
                body: JSON.stringify({
                  resolutionGroupId: teamConfigReopen.resolutionGroupId,
                  serviceId: null,
                  responsibleProfileId: parseInt(personId),
                  resolutionGroup: {
                    label: teamConfigReopen.resolutionGroupLabel,
                    value: teamConfigReopen.resolutionGroupId,
                  },
                }),
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
        var allAttachBtns = Array.from(
          overlay.querySelectorAll(".sp-qd-download"),
        );
        SP_Log.debug(
          "Registering download listeners (carousel), found:",
          allAttachBtns.length,
        );

        // Cache for loaded files: { fileId: { url, blob, byteArray, mimeType, fileName } }
        var attachCache = {};

        async function loadFileData(fileId, fileName) {
          if (attachCache[fileId]) return attachCache[fileId];
          var fileRes = await fetch(
            "https://macropayapi.supportplus.mx/files/" + fileId,
            {
              headers: spGetHeaders(),
            },
          );
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
          var mimeMap = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
            bmp: "image/bmp",
            pdf: "application/pdf",
            zip: "application/zip",
            txt: "text/plain",
          };
          if (mimeMap[ext]) mimeType = mimeMap[ext];

          var blob = new Blob([byteArray], { type: mimeType });
          var url = URL.createObjectURL(blob);
          attachCache[fileId] = {
            url: url,
            blob: blob,
            byteArray: byteArray,
            mimeType: mimeType,
            fileName: fileName,
          };
          return attachCache[fileId];
        }

        function buildFileContentHTML(fileName, url, byteArray) {
          var isImage = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(fileName);
          var isPdf = /\.pdf$/i.test(fileName);
          var isText =
            /\.(txt|sql|csv|json|xml|log|md|yml|yaml|ini|conf|sh|bat|ps1|py|js|ts|html|css|env)$/i.test(
              fileName,
            );
          var contentHTML = "";
          var textContent = null;
          if (isImage) {
            contentHTML =
              '<img src="' +
              url +
              '" style="max-width:90vw;max-height:70vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:block;margin:0 auto;">';
          } else if (isPdf) {
            contentHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;width:90vw;max-width:860px;"><div id="sp-pdf-viewer" style="width:100%;height:68vh;overflow:auto;background:#404040;border-radius:8px 8px 0 0;display:flex;flex-direction:column;align-items:center;padding:16px 0;gap:12px;"></div><div id="sp-pdf-controls" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 16px;background:rgba(30,30,30,0.9);border-radius:0 0 8px 8px;width:100%;box-sizing:border-box;"><button id="sp-pdf-prev-page" style="padding:5px 12px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;font-weight:500;transition:background 0.2s;">◀ Anterior</button><span id="sp-pdf-page-info" style="color:#ddd;font-size:12px;min-width:90px;text-align:center;">Cargando...</span><button id="sp-pdf-next-page" style="padding:5px 12px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;font-weight:500;transition:background 0.2s;">Siguiente ▶</button><span style="width:1px;height:18px;background:rgba(255,255,255,0.2);"></span><button id="sp-pdf-zoom-out" style="padding:5px 8px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;">−</button><span id="sp-pdf-zoom-info" style="color:#ddd;font-size:12px;min-width:40px;text-align:center;">130%</span><button id="sp-pdf-zoom-in" style="padding:5px 8px;border:none;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;">+</button></div></div>';
          } else if (isText) {
            textContent = new TextDecoder("utf-8").decode(byteArray);
            var escaped = textContent
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            var extMatch = fileName.match(/\.([^.]+)$/);
            var ext = extMatch ? extMatch[1].toLowerCase() : "";
            var needsHighlight =
              ext === "sql" ||
              ext === "js" ||
              ext === "ts" ||
              ext === "py" ||
              ext === "json" ||
              ext === "xml" ||
              ext === "html" ||
              ext === "css";

            if (needsHighlight) {
              var highlighted = escaped;
              if (ext === "sql") {
                // --- SQL Linter ---
                var sqlErrors = [];
                var rawLines = textContent.split("\n");
                // Strip comments for analysis
                var cleanedSQL = textContent
                  .replace(/--[^\n]*/g, "")
                  .replace(/\/\*[\s\S]*?\*\//g, "");

                // 1. Unbalanced parentheses
                var parenCount = 0;
                rawLines.forEach(function (line, idx) {
                  var lineClean = line
                    .replace(/--.*$/, "")
                    .replace(/'[^']*'/g, "");
                  for (var c = 0; c < lineClean.length; c++) {
                    if (lineClean[c] === "(") parenCount++;
                    if (lineClean[c] === ")") parenCount--;
                    if (parenCount < 0) {
                      sqlErrors.push({
                        line: idx + 1,
                        msg: "Paréntesis ')' sin abrir",
                      });
                      parenCount = 0;
                    }
                  }
                });
                if (parenCount > 0)
                  sqlErrors.push({
                    line: rawLines.length,
                    msg: "Faltan " + parenCount + " paréntesis de cierre ')'",
                  });

                // 2. Unclosed strings
                var inString = false;
                rawLines.forEach(function (line, idx) {
                  var lineNoComment = line.replace(/--.*$/, "");
                  for (var c = 0; c < lineNoComment.length; c++) {
                    if (lineNoComment[c] === "'") {
                      if (inString && lineNoComment[c + 1] === "'") {
                        c++;
                        continue;
                      }
                      inString = !inString;
                    }
                  }
                  if (inString) {
                    sqlErrors.push({
                      line: idx + 1,
                      msg: "String sin cerrar (comilla simple)",
                    });
                    inString = false;
                  }
                });

                // 3. SELECT without FROM (unless it's SELECT @var or SELECT value with no table)
                var selectMatches = cleanedSQL.match(
                  /\bSELECT\b(?![\s\S]*?\bFROM\b)(?![\s]*@)(?![\s]*\d)(?![\s]*')/gi,
                );
                // Simplified: check each SELECT...FROM pair
                var statements = cleanedSQL.split(/\bGO\b|\b;\s*\n/gi);
                statements.forEach(function (stmt) {
                  var trimmed = stmt.trim().toUpperCase();
                  if (
                    trimmed.match(/^\s*SELECT\b/) &&
                    !trimmed.match(/\bFROM\b/) &&
                    !trimmed.match(/SELECT\s+@/) &&
                    !trimmed.match(/SELECT\s+\d/) &&
                    trimmed.length > 20
                  ) {
                    var stmtStart = textContent.indexOf(
                      stmt.trim().substring(0, 30),
                    );
                    if (stmtStart >= 0) {
                      var lineNum = textContent
                        .substring(0, stmtStart)
                        .split("\n").length;
                      sqlErrors.push({ line: lineNum, msg: "SELECT sin FROM" });
                    }
                  }
                });

                // 4. BEGIN without END
                var beginCount = (cleanedSQL.match(/\bBEGIN\b/gi) || []).length;
                var endCount = (cleanedSQL.match(/\bEND\b/gi) || []).length;
                if (beginCount > endCount)
                  sqlErrors.push({
                    line: rawLines.length,
                    msg:
                      "Faltan " +
                      (beginCount - endCount) +
                      " END para cerrar BEGIN",
                  });
                if (endCount > beginCount)
                  sqlErrors.push({
                    line: rawLines.length,
                    msg:
                      endCount - beginCount + " END sin BEGIN correspondiente",
                  });

                // 5. Trailing comma before FROM or closing paren
                rawLines.forEach(function (line, idx) {
                  var lineClean = line.replace(/--.*$/, "").trim();
                  if (/,\s*$/.test(lineClean)) {
                    var nextLine = (rawLines[idx + 1] || "")
                      .replace(/--.*$/, "")
                      .trim()
                      .toUpperCase();
                    if (/^(FROM|WHERE|\))/.test(nextLine)) {
                      sqlErrors.push({
                        line: idx + 1,
                        msg:
                          "Coma al final antes de " + nextLine.split(/\s/)[0],
                      });
                    }
                  }
                });

                // 6. UPDATE without SET
                statements.forEach(function (stmt) {
                  var trimmed = stmt.trim().toUpperCase();
                  if (
                    trimmed.match(/^\s*UPDATE\b/) &&
                    !trimmed.match(/\bSET\b/)
                  ) {
                    var stmtStart = textContent.indexOf(
                      stmt.trim().substring(0, 20),
                    );
                    if (stmtStart >= 0) {
                      var lineNum = textContent
                        .substring(0, stmtStart)
                        .split("\n").length;
                      sqlErrors.push({ line: lineNum, msg: "UPDATE sin SET" });
                    }
                  }
                });

                // 7. INSERT INTO without VALUES/SELECT/EXEC
                statements.forEach(function (stmt) {
                  var trimmed = stmt.trim().toUpperCase();
                  if (
                    trimmed.match(/^\s*INSERT\s+INTO\b/) &&
                    !trimmed.match(/\bVALUES\b/) &&
                    !trimmed.match(/\bSELECT\b/) &&
                    !trimmed.match(/\bEXEC\b/)
                  ) {
                    var stmtStart = textContent.indexOf(
                      stmt.trim().substring(0, 20),
                    );
                    if (stmtStart >= 0) {
                      var lineNum = textContent
                        .substring(0, stmtStart)
                        .split("\n").length;
                      sqlErrors.push({
                        line: lineNum,
                        msg: "INSERT INTO sin VALUES/SELECT",
                      });
                    }
                  }
                });

                // Build error line set for highlighting
                var errorLines = {};
                sqlErrors.forEach(function (e) {
                  errorLines[e.line] = e.msg;
                });

                // Apply syntax highlighting with error lines marked
                var lines = escaped.split("\n");
                highlighted = lines
                  .map(function (line, idx) {
                    var lineNum = idx + 1;
                    var hl = line;
                    // Apply SQL syntax highlighting
                    hl = hl.replace(
                      /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|BEGIN|END|IF|ELSE|THEN|CASE|WHEN|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|UNION|ALL|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|TOP|VALUES|EXEC|EXECUTE|DECLARE|VARCHAR|INT|BIGINT|NVARCHAR|DATETIME|BIT|FLOAT|DECIMAL|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|IDENTITY|GO|USE|DATABASE|SCHEMA|GRANT|REVOKE|COMMIT|ROLLBACK|TRANSACTION|WITH|NOLOCK|COUNT|SUM|AVG|MAX|MIN|COALESCE|ISNULL|CAST|CONVERT|GETDATE|DATEADD|DATEDIFF|LEN|SUBSTRING|REPLACE|TRIM|UPPER|LOWER|ROW_NUMBER|OVER|PARTITION|RANK|DENSE_RANK|LAG|LEAD|MERGE|OUTPUT|INSERTED|DELETED|CURSOR|FETCH|NEXT|OPEN|CLOSE|DEALLOCATE|PRINT|RAISERROR|TRY|CATCH|THROW|RETURN|WHILE|BREAK|CONTINUE|TEMP|TEMPORARY|TRUNCATE|ASC|DESC|HAVING|EXCEPT|INTERSECT)\b/gi,
                      '<span style="color:#569CD6;">$1</span>',
                    );
                    hl = hl.replace(
                      /('(?:[^'\\]|\\.)*')/g,
                      '<span style="color:#CE9178;">$1</span>',
                    );
                    hl = hl.replace(
                      /(--[^\n]*)/g,
                      '<span style="color:#6A9955;">$1</span>',
                    );
                    hl = hl.replace(
                      /\b(\d+)\b/g,
                      '<span style="color:#B5CEA8;">$1</span>',
                    );

                    var lineNumStr =
                      '<span style="display:inline-block;min-width:' +
                      (String(lines.length).length * 8 + 8) +
                      'px;text-align:right;color:#858585;user-select:none;padding-right:12px;border-right:1px solid #404040;margin-right:12px;">' +
                      lineNum +
                      "</span>";

                    if (errorLines[lineNum]) {
                      return (
                        '<span style="background:rgba(255,0,0,0.15);display:inline-block;width:100%;">' +
                        lineNumStr +
                        hl +
                        "</span>"
                      );
                    }
                    return lineNumStr + hl;
                  })
                  .join("\n");

                // Build error panel if there are errors
                var errorPanelHTML = "";
                if (sqlErrors.length) {
                  errorPanelHTML =
                    '<div style="background:#2d1515;border:1px solid #F44336;border-radius:6px;padding:8px 12px;margin-bottom:8px;max-height:120px;overflow:auto;width:90vw;box-sizing:border-box;">' +
                    '<div style="color:#F44336;font-weight:600;font-size:11px;margin-bottom:4px;">⚠️ ' +
                    sqlErrors.length +
                    " posible" +
                    (sqlErrors.length > 1 ? "s" : "") +
                    " error" +
                    (sqlErrors.length > 1 ? "es" : "") +
                    " de sintaxis:</div>";
                  sqlErrors.forEach(function (e) {
                    errorPanelHTML +=
                      '<div style="color:#ef9a9a;font-size:11px;font-family:Consolas,monospace;padding:1px 0;">Línea ' +
                      e.line +
                      ": " +
                      e.msg +
                      "</div>";
                  });
                  errorPanelHTML += "</div>";
                }

                contentHTML =
                  '<div style="display:flex;flex-direction:column-reverse;align-items:center;gap:8px;">' +
                  '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:' +
                  (sqlErrors.length ? "65vh" : "75vh") +
                  ';overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' +
                  highlighted +
                  "</pre></div>" +
                  errorPanelHTML +
                  "</div>";
              } else if (ext === "json") {
                highlighted = highlighted.replace(
                  /(&quot;[^&]*?&quot;)\s*:/g,
                  '<span style="color:#9CDCFE;">$1</span>:',
                );
                highlighted = highlighted.replace(
                  /:\s*(&quot;[^&]*?&quot;)/g,
                  ': <span style="color:#CE9178;">$1</span>',
                );
                highlighted = highlighted.replace(
                  /:\s*(true|false|null|\d+\.?\d*)/g,
                  ': <span style="color:#B5CEA8;">$1</span>',
                );
              } else if (ext === "js" || ext === "ts") {
                highlighted = highlighted.replace(
                  /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|typeof|instanceof)\b/g,
                  '<span style="color:#569CD6;">$1</span>',
                );
                highlighted = highlighted.replace(
                  /(\/\/[^\n]*)/g,
                  '<span style="color:#6A9955;">$1</span>',
                );
                highlighted = highlighted.replace(
                  /(&quot;[^&]*?&quot;|&apos;[^&]*?&apos;)/g,
                  '<span style="color:#CE9178;">$1</span>',
                );
              } else if (ext === "py") {
                highlighted = highlighted.replace(
                  /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|True|False|None|self|print|lambda|yield|raise|pass|break|continue)\b/g,
                  '<span style="color:#569CD6;">$1</span>',
                );
                highlighted = highlighted.replace(
                  /(#[^\n]*)/g,
                  '<span style="color:#6A9955;">$1</span>',
                );
              } else if (ext === "xml" || ext === "html") {
                highlighted = highlighted.replace(
                  /(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g,
                  '<span style="color:#569CD6;">$1</span>',
                );
                highlighted = highlighted.replace(
                  /(\s[a-zA-Z-]+)=/g,
                  '<span style="color:#9CDCFE;">$1</span>=',
                );
                highlighted = highlighted.replace(
                  /(&lt;!--[\s\S]*?--&gt;)/g,
                  '<span style="color:#6A9955;">$1</span>',
                );
              } else if (ext === "css") {
                highlighted = highlighted.replace(
                  /([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/g,
                  '<span style="color:#D7BA7D;">$1</span> {',
                );
                highlighted = highlighted.replace(
                  /([a-z-]+)\s*:/g,
                  '<span style="color:#9CDCFE;">$1</span>:',
                );
              }
              if (ext !== "sql") {
                contentHTML =
                  '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:75vh;overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' +
                  highlighted +
                  "</pre></div>";
              }
            } else {
              contentHTML =
                '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:75vh;overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' +
                escaped +
                "</pre></div>";
            }
          } else if (/\.(xlsx|xls)$/i.test(fileName)) {
            // Excel preview using SheetJS (loaded as content script)
            try {
              var wb = XLSX.read(byteArray, { type: "array" });
              var ws = wb.Sheets[wb.SheetNames[0]];
              var htmlTable = XLSX.utils.sheet_to_html(ws, { editable: false });
              contentHTML =
                '<div style="max-height:75vh;max-width:90vw;overflow:auto;background:#fff;border-radius:8px;padding:8px;">' +
                '<div style="font-size:11px;color:#888;margin-bottom:8px;">Hoja: ' +
                esc(wb.SheetNames[0]) +
                (wb.SheetNames.length > 1
                  ? " (" + wb.SheetNames.length + " hojas)"
                  : "") +
                "</div>" +
                "<style>.sp-excel-table table{border-collapse:collapse;font-size:11px;font-family:Consolas,monospace;} .sp-excel-table td,.sp-excel-table th{border:1px solid #ddd;padding:3px 6px;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;}</style>" +
                '<div class="sp-excel-table">' +
                htmlTable +
                "</div></div>";
            } catch (e) {
              contentHTML =
                '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;color:#D94040;">Error al leer el archivo Excel</div>';
            }
          } else {
            contentHTML =
              '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 12px;font-size:14px;">No se puede previsualizar: <b>' +
              esc(fileName) +
              '</b></p><a href="' +
              url +
              '" download="' +
              fileName +
              '" style="padding:8px 16px;background:#1976D2;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">📥 Descargar</a></div>';
          }
          return {
            html: contentHTML,
            textContent: textContent,
            isText: isText,
            isPdf: isPdf,
            byteArray: byteArray,
          };
        }

        function openCarousel(startIndex) {
          var currentIndex = startIndex;
          var totalFiles = allAttachBtns.length;
          var currentUrl = null;
          var currentTextContent = null;

          var fileModal = document.createElement("div");
          fileModal.id = "sp-carousel-modal";
          fileModal.style.cssText =
            "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background 0.3s ease;";
          fileModal.innerHTML =
            '<div class="sp-file-content" style="transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;display:flex;flex-direction:column;align-items:center;width:100%;"><div id="sp-carousel-header" style="display:flex;justify-content:space-between;align-items:center;width:90vw;margin-bottom:8px;gap:8px;"></div><div id="sp-carousel-body" style="display:flex;align-items:center;justify-content:center;width:100%;position:relative;min-height:200px;"></div></div>';
          document.body.appendChild(fileModal);

          requestAnimationFrame(function () {
            fileModal.style.background = "rgba(0,0,0,.85)";
            var contentEl = fileModal.querySelector(".sp-file-content");
            if (contentEl) {
              contentEl.style.transform = "scale(1) translateY(0)";
              contentEl.style.opacity = "1";
            }
          });

          function closeCarousel() {
            var contentEl = fileModal.querySelector(".sp-file-content");
            if (contentEl) {
              contentEl.style.transform = "scale(0.9) translateY(10px)";
              contentEl.style.opacity = "0";
            }
            fileModal.style.background = "rgba(0,0,0,0)";
            document.removeEventListener("keydown", handleKeys);
            setTimeout(function () {
              fileModal.remove();
            }, 250);
          }

          function renderHeader(fileName, url, isText) {
            var header = fileModal.querySelector("#sp-carousel-header");
            var counterHTML =
              totalFiles > 1
                ? '<span style="color:#fff;font-size:13px;font-weight:600;">' +
                  (currentIndex + 1) +
                  " / " +
                  totalFiles +
                  "</span>"
                : "";
            var copyBtn = isText
              ? '<button id="sp-file-copy-text" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">📋 Copiar</button>'
              : "";
            header.innerHTML =
              '<div style="display:flex;align-items:center;gap:12px;">' +
              counterHTML +
              '<span style="color:#ccc;font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' +
              esc(fileName) +
              '">' +
              esc(fileName) +
              '</span></div><div style="display:flex;gap:8px;">' +
              copyBtn +
              '<a href="' +
              url +
              '" download="' +
              fileName +
              '" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;text-decoration:none;">📥 Descargar</a><button id="sp-file-close" style="padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;">✕ Cerrar</button></div>';
            fileModal
              .querySelector("#sp-file-close")
              .addEventListener("click", closeCarousel);
            var copyTextBtn = fileModal.querySelector("#sp-file-copy-text");
            if (copyTextBtn && currentTextContent) {
              copyTextBtn.addEventListener("click", function () {
                navigator.clipboard
                  .writeText(currentTextContent)
                  .then(function () {
                    copyTextBtn.textContent = "✅ Copiado";
                    setTimeout(function () {
                      copyTextBtn.textContent = "📋 Copiar";
                    }, 2000);
                  });
              });
            }
          }

          function renderBody(contentHTML) {
            var body = fileModal.querySelector("#sp-carousel-body");
            var navPrevHTML =
              totalFiles > 1
                ? '<button id="sp-carousel-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.15)\'">◀</button>'
                : "";
            var navNextHTML =
              totalFiles > 1
                ? '<button id="sp-carousel-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.3)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.15)\'">▶</button>'
                : "";
            body.innerHTML =
              navPrevHTML +
              '<div style="display:flex;align-items:center;justify-content:center;width:90vw;">' +
              contentHTML +
              "</div>" +
              navNextHTML;

            var prevBtn = fileModal.querySelector("#sp-carousel-prev");
            var nextBtn = fileModal.querySelector("#sp-carousel-next");
            if (prevBtn)
              prevBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                navigateTo(currentIndex - 1);
              });
            if (nextBtn)
              nextBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                navigateTo(currentIndex + 1);
              });
          }

          function showLoading() {
            var body = fileModal.querySelector("#sp-carousel-body");
            body.innerHTML =
              '<div style="color:#fff;font-size:16px;display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.8s linear infinite;"></div><span>Cargando archivo...</span></div>';
            if (!document.getElementById("sp-carousel-spin-style")) {
              var style = document.createElement("style");
              style.id = "sp-carousel-spin-style";
              style.textContent =
                "@keyframes sp-spin { to { transform: rotate(360deg); } } .sp-pdf-text-layer { user-select: text; cursor: text; } .sp-pdf-text-layer span { color: transparent; position: absolute; white-space: pre; } .sp-pdf-text-layer span::selection { background: rgba(0,100,200,0.3); color: transparent; }";
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
              if (pageInfoEl)
                pageInfoEl.textContent =
                  "Página " + currentPage + " / " + totalPages;
              if (zoomInfoEl)
                zoomInfoEl.textContent = Math.round(scale * 100) + "%";
            }

            function renderPage(num) {
              pdfDoc.getPage(num).then(function (page) {
                var viewport = page.getViewport({ scale: scale });

                // Container for canvas + text layer
                var pageDiv = document.createElement("div");
                pageDiv.style.cssText =
                  "position:relative;display:block;margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);width:" +
                  viewport.width +
                  "px;height:" +
                  viewport.height +
                  "px;";

                // Canvas
                var canvas = document.createElement("canvas");
                canvas.style.cssText = "display:block;";
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                var ctx = canvas.getContext("2d");
                page.render({ canvasContext: ctx, viewport: viewport });
                pageDiv.appendChild(canvas);

                // Text layer for selection
                var textLayerDiv = document.createElement("div");
                textLayerDiv.style.cssText =
                  "position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;opacity:0.25;line-height:1;";
                textLayerDiv.className = "sp-pdf-text-layer";
                pageDiv.appendChild(textLayerDiv);

                page.getTextContent().then(function (textContent) {
                  textContent.items.forEach(function (item) {
                    var tx = pdfjsLib.Util.transform(
                      viewport.transform,
                      item.transform,
                    );
                    var span = document.createElement("span");
                    span.textContent = item.str;
                    span.style.cssText =
                      "position:absolute;white-space:pre;transform-origin:0% 0%;font-family:sans-serif;" +
                      "left:" +
                      tx[4] +
                      "px;" +
                      "top:" +
                      (viewport.height - tx[5]) +
                      "px;" +
                      "font-size:" +
                      Math.abs(tx[0]) +
                      "px;" +
                      "color:transparent;";
                    textLayerDiv.appendChild(span);
                  });
                });

                pdfContainer.appendChild(pageDiv);
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
              var pages = pdfContainer.children;
              if (pages[num - 1]) {
                pages[num - 1].scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }
              updatePageInfo();
            }

            // Load PDF
            loadingTask.promise
              .then(function (pdf) {
                pdfDoc = pdf;
                totalPages = pdf.numPages;
                currentPage = 1;
                renderAllPages();
              })
              .catch(function (err) {
                pdfContainer.innerHTML =
                  '<p style="color:#fff;text-align:center;padding:20px;">Error al cargar PDF: ' +
                  (err.message || err) +
                  "</p>";
              });

            // Controls
            if (prevPageBtn)
              prevPageBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                goToPage(currentPage - 1);
              });
            if (nextPageBtn)
              nextPageBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                goToPage(currentPage + 1);
              });
            if (zoomInBtn)
              zoomInBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                scale = Math.min(scale + 0.25, 3);
                renderAllPages();
              });
            if (zoomOutBtn)
              zoomOutBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                scale = Math.max(scale - 0.25, 0.5);
                renderAllPages();
              });

            // Scroll tracking to update current page
            pdfContainer.addEventListener("scroll", function () {
              var pages = pdfContainer.children;
              var containerTop = pdfContainer.scrollTop;
              for (var i = 0; i < pages.length; i++) {
                if (
                  pages[i].offsetTop + pages[i].offsetHeight / 2 >
                  containerTop
                ) {
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
              var result = buildFileContentHTML(
                fileName,
                data.url,
                data.byteArray,
              );
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
              body.innerHTML =
                '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 8px;color:#c62828;font-size:14px;">❌ Error al cargar: ' +
                esc(fileName) +
                '</p><p style="margin:0;color:#666;font-size:12px;">' +
                esc(err.message) +
                "</p></div>";
            }
          }

          function handleKeys(e) {
            if (e.key === "Escape") {
              closeCarousel();
              e.preventDefault();
              e.stopImmediatePropagation();
            }
            if (e.key === "ArrowLeft" && totalFiles > 1) {
              navigateTo(currentIndex - 1);
              e.preventDefault();
            }
            if (e.key === "ArrowRight" && totalFiles > 1) {
              navigateTo(currentIndex + 1);
              e.preventDefault();
            }
          }
          document.addEventListener("keydown", handleKeys);

          fileModal.addEventListener("click", function (e) {
            if (e.target === fileModal) closeCarousel();
          });

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
        if (!statusCell || statusCell.textContent.trim() !== "En espera")
          return;
        var folioEl = row.querySelector(
          '[data-field="uniqueCode"] p.MuiTypography-body1',
        );
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
      document.querySelectorAll(".MuiDataGrid-row").forEach(function (row) {
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
            btn.className =
              DETAIL_QUICK_CLASS +
              " MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
            btn.textContent = folioText;
            btn.style.cssText =
              "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              e.preventDefault();
              showQuickDetailModal(ticketId);
            });
            folioEl.replaceWith(btn);
          }
        }
      });
    }
    // Also run on DOM changes for SPA navigation (independent of session)
    var _folioObserver = new MutationObserver(function () {
      injectFolioButtons();
    });
    _folioObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectFolioButtons, 500);

    // Inject row buttons and basic header
    function injectButtonsImmediate() {
      injectConfigButton();
      injectSearchButton();
      injectQuickSearch();
      injectUpdateButton();
      injectSessionTimer();

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
            btn.className =
              DETAIL_QUICK_CLASS +
              " MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
            btn.textContent = folioText;
            btn.style.cssText =
              "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
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
              var res = await fetch(SP_API + "/" + detailTicketId[1], {
                headers: spGetHeaders(),
              });
              if (!res.ok) return;
              var ticket = (await res.json()).data;
              if (!ticket || !ticket.uniqueCode) return;
              var spStatus = (ticket.ticketStatusName || "").toLowerCase();
              var holderEmail =
                ticket.ticketHolder?.ticketHolderLog?.email || "";
              // Find in Monday
              var ticketBoards = await getMondayTicketBoards(mondayToken);
              for (var b of ticketBoards) {
                var itemRes = await mondayQuery(
                  mondayToken,
                  "query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }",
                  {
                    boardId: b.id,
                    columnId: "text_mm2c9nhc",
                    value: ticket.uniqueCode,
                  },
                );
                var items = itemRes.items_page_by_column_values?.items || [];
                if (items.length) {
                  var colValues = {};
                  var mondayStatusIndex = mapStatusToMonday(spStatus);
                  colValues.status = { index: mondayStatusIndex };
                  if (holderEmail) {
                    var users = await getMondayUsers(mondayToken);
                    var userId = users[holderEmail.toLowerCase()];
                    if (userId)
                      colValues.multiple_person_mm25nvfq = {
                        personsAndTeams: [
                          { id: parseInt(userId), kind: "person" },
                        ],
                      };
                  }
                  await mondayQuery(
                    mondayToken,
                    "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
                    {
                      boardId: b.id,
                      itemId: items[0].id,
                      columnValues: JSON.stringify(colValues),
                    },
                  );
                  SP_Log.debug(
                    "Detail view synced to Monday:",
                    ticket.uniqueCode,
                  );
                  break;
                }
              }
            } catch (e) {}
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
        var oldTakeBtn = row.querySelector("." + TAKE_BTN_CLASS);
        if (oldTakeBtn) oldTakeBtn.remove();
        var oldStealBtn = row.querySelector("." + STEAL_BTN_CLASS);
        if (oldStealBtn) oldStealBtn.remove();
        var oldCloseBtn = row.querySelector("." + CLOSE_BTN_CLASS);
        if (oldCloseBtn) oldCloseBtn.remove();

        // Auto-migrate logic
        var rowGroupCell = row.querySelector(
          '[data-field="resolutionGroupName"]',
        );
        var rowGroupName = rowGroupCell ? rowGroupCell.textContent.trim() : "";
        var rowBelongsToMe =
          !rowGroupName ||
          rowGroupName === getTeamConfig().resolutionGroupLabel ||
          isMultiGroup();

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
      checkPendingCloseAlert();
      loadTeamPanel();
    }

    // --- Pending close alert (above grid) ---
    var _pendingAlertShown = false;
    async function checkPendingCloseAlert() {
      if (_pendingAlertShown) return;
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid) return;
      try {
        var groupPageId = "";
        var pendingResp = await new Promise(function (resolve) {
          chrome.runtime.sendMessage(
            {
              type: "api-get",
              dbId: "38420e0684b980d682ccfac983fc1780",
              body: groupPageId
                ? {
                    filter: {
                      and: [
                        {
                          property: "Grupo",
                          relation: { contains: groupPageId },
                        },
                        { property: "Cerrado", checkbox: { equals: false } },
                      ],
                    },
                  }
                : {
                    filter: {
                      property: "Cerrado",
                      checkbox: { equals: false },
                    },
                  },
            },
            function (r) {
              resolve(r);
            },
          );
        });
        var pendingTickets =
          pendingResp && pendingResp.success && pendingResp.data.results
            ? pendingResp.data.results
            : [];
        if (!pendingTickets.length) return;

        _pendingAlertShown = true;
        var existingAlert = document.getElementById("sp-pending-close-alert");
        if (existingAlert) existingAlert.remove();

        var alertDiv = document.createElement("div");
        alertDiv.id = "sp-pending-close-alert";
        alertDiv.style.cssText =
          "margin-bottom:8px;padding:10px 16px;background:#FFF3E0;border:1px solid #FF8F00;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;font-family:system-ui;";
        alertDiv.innerHTML =
          '<span style="font-size:20px;">🕐</span><span style="flex:1;font-size:13px;color:#E65100;font-weight:600;">Hay ' +
          pendingTickets.length +
          ' ticket(s) pendientes por cerrar</span><span style="padding:4px 12px;background:#FF8F00;color:#fff;border-radius:6px;font-size:12px;font-weight:600;">Cerrar ahora</span>';
        var panelEl =
          document.getElementById(TEAM_PANEL_ID) ||
          document.getElementById("sp-manager-panel");
        var insertRef = panelEl || grid;
        insertRef.parentElement.insertBefore(alertDiv, insertRef);

        alertDiv.addEventListener("click", function () {
          if (!isWithinWorkHours()) {
            SP_Modal.info({
              id: "sp-pending-close-modal",
              title: "⏰ Fuera de horario laboral",
              content:
                '<p style="font-size:14px;color:#555;margin:0 0 12px;">No se pueden cerrar tickets fuera del horario laboral.</p>' +
                '<p style="font-size:13px;color:#888;margin:0;">Horario: ' +
                _workSchedule.horaEntrada +
                ":00 - " +
                _workSchedule.horaSalida +
                ":00, " +
                _workSchedule.diaInicio +
                " a " +
                _workSchedule.diaFinal +
                "</p>",
              maxWidth: "380px",
              modalOptions: { textAlign: "center" },
            });
            return;
          }

          var ticketList = pendingTickets
            .map(function (p) {
              var ticket = p.properties.Ticket?.title?.[0]?.plain_text || "";
              var spId = p.properties.IdSupporPlus?.number || 0;
              return { ticket: ticket, ticketId: spId, pageId: p.id };
            })
            .filter(function (t) {
              return t.ticketId;
            });

          var listHTML = ticketList
            .map(function (t) {
              return (
                '<div style="padding:4px 8px;font-size:12px;border-bottom:1px solid #eee;">' +
                t.ticket +
                "</div>"
              );
            })
            .join("");

          var m = SP_Modal.info({
            id: "sp-pending-close-modal",
            title: "🔒 Cerrar " + ticketList.length + " tickets pendientes",
            content:
              '<p style="font-size:13px;color:#555;margin:0 0 12px;">Se cerrarán los siguientes tickets:</p>' +
              '<div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:16px;">' +
              listHTML +
              "</div>" +
              '<div id="sp-pending-close-progress" style="display:none;margin-bottom:12px;padding:8px;background:#f5f5f5;border-radius:6px;font-size:12px;text-align:center;"></div>' +
              '<div style="display:flex;gap:8px;">' +
              '<button id="sp-pending-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">✅ Cerrar todos</button>' +
              '<button id="sp-pending-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
              "</div>",
            maxWidth: "450px",
          });

          document
            .getElementById("sp-pending-close-cancel")
            .addEventListener("click", m.close);

          document
            .getElementById("sp-pending-close-confirm")
            .addEventListener("click", async function () {
              var confirmBtn = document.getElementById(
                "sp-pending-close-confirm",
              );
              var progress = document.getElementById(
                "sp-pending-close-progress",
              );
              confirmBtn.disabled = true;
              confirmBtn.textContent = "⏳ Cerrando...";
              progress.style.display = "block";

              var closed = 0;
              var errors = 0;
              var skipped = 0;
              for (var i = 0; i < ticketList.length; i++) {
                progress.textContent =
                  "Procesando " + (i + 1) + " de " + ticketList.length + "...";
                try {
                  // Check if ticket is already closed in the portal
                  var ticketRes = await fetch(
                    SP_API + "/" + ticketList[i].ticketId,
                    { headers: spGetHeaders() },
                  );
                  var ticketJson = await ticketRes.json();
                  var ticketData = ticketJson.data || ticketJson;
                  var alreadyClosed =
                    ticketData.ticketStatus?.name === "Cerrado" ||
                    ticketData.ticketStatus?.type?.name === "Cerrado";

                  if (alreadyClosed) {
                    // Already closed — mark as done
                    chrome.runtime.sendMessage({
                      type: "api-put",
                      pageId: ticketList[i].pageId,
                      body: { properties: { Cerrado: { checkbox: true } } },
                    });
                    skipped++;
                  } else {
                    // Close via API
                    var closeRes = await fetch(
                      SP_API +
                        "/update-ticket-status-with-optional-comment/" +
                        ticketList[i].ticketId,
                      {
                        method: "PATCH",
                        headers: spHeaders(),
                        body: JSON.stringify({
                          nextTicketStatusId:
                            window.SP_CONFIG.SP_STATUSES.CERRADO,
                          ticketCommentRequest: null,
                        }),
                      },
                    );
                    if (!closeRes.ok)
                      throw new Error("HTTP " + closeRes.status);
                    chrome.runtime.sendMessage({
                      type: "api-put",
                      pageId: ticketList[i].pageId,
                      body: { properties: { Cerrado: { checkbox: true } } },
                    });
                    closed++;
                  }
                  updateMondayStatus(
                    ticketList[i].ticketId,
                    ticketList[i].ticket,
                    "Cerrado",
                  );
                } catch (e) {
                  errors++;
                }
              }

              m.close();
              alertDiv.remove();
              _pendingAlertShown = false;
              if (errors === 0) {
                showSuccessToast(
                  "✅ " +
                    closed +
                    " cerrados" +
                    (skipped ? ", " + skipped + " ya estaban cerrados" : ""),
                );
              } else {
                showErrorToast(closed + " cerrados, " + errors + " errores");
              }
              refreshTeamPanel();
            });
        });
      } catch (e) {}
    }

    // --- Handle single click ---
    async function handleMondayClick(ticketId, autoGroupId) {
      const mondayToken = await getMondayToken();
      if (!mondayToken)
        return alert(
          "⚠️ Configura tu token de Monday en el popup de la extensión primero.",
        );
      const boardId = await getMondayBoardId();
      if (!boardId)
        return alert(
          "⚠️ Configura el Board ID en el popup de la extensión primero.",
        );
      const spToken = getToken();
      if (!spToken)
        return alert(
          "⚠️ No se encontró token de SupportPlus. ¿Estás logueado?",
        );

      let ticketData, boardData, meId;
      try {
        const [ticketRes, mondayData] = await Promise.all([
          fetch(`${SP_API}/${ticketId}`, {
            headers: {
              accept: "application/json",
              authorization: `Bearer ${spToken}`,
            },
          }).then((r) => {
            if (!r.ok) throw new Error(`SP HTTP ${r.status}`);
            return r.json();
          }),
          mondayQuery(
            mondayToken,
            `query ($boardId: [ID!]!) { me { id } boards(ids: $boardId) { id name groups { id title } } }`,
            { boardId },
          ),
        ]);
        ticketData = ticketRes.data || ticketRes;
        meId = mondayData.me.id;
        boardData = mondayData.boards;
      } catch (err) {
        return alert("Error: " + err.message);
      }
      if (!boardData.length)
        return alert(
          "No se encontró el board. Verifica el Board ID en el popup.",
        );
      if (autoGroupId) {
        await autoMigrateToMonday(
          ticketData,
          ticketId,
          boardData,
          mondayToken,
          meId,
          autoGroupId,
        );
      } else {
        showMondayModal(ticketData, ticketId, boardData, mondayToken, meId);
      }
    }

    // Auto migrate without modal
    async function autoMigrateToMonday(
      ticket,
      ticketId,
      boards,
      mondayToken,
      meId,
      groupId,
    ) {
      showLoadingToast("Migrando a Monday...");

      // Check if already exists
      var existingId = await checkTicketExistsInMonday(
        mondayToken,
        ticket.uniqueCode || "",
      );
      if (existingId) {
        addToCache(ticket.uniqueCode || ticketId, existingId);
        var lt = document.getElementById("sp-loading-toast");
        if (lt) lt.remove();
        showSuccessToast("✅ Ya existe en Monday");
        return;
      }

      const url = BASE_URL + "/" + ticketId;
      const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
      const itemName = ticket.subject || "Sin asunto";
      const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
      const spPriority = (
        ticket.incidentPriorityName ||
        ticket.incidentPriority?.name ||
        ""
      )
        .toLowerCase()
        .trim();
      const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];
      const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
      let personValue = {};
      if (holderEmail) {
        try {
          const users = await getMondayUsers(mondayToken);
          const userId = users[holderEmail.toLowerCase()];
          if (userId)
            personValue = {
              personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
            };
        } catch (e) {}
      }
      const columnValues = JSON.stringify({
        descripci_n_mkn9e5f4: { text: desc },
        ...(personValue.personsAndTeams
          ? { multiple_person_mm25nvfq: personValue }
          : {}),
        status: { index: 1 },
        priority_mkn9kbe9: { index: priorityIndex },
        cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
        link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
        text_mm2c9nhc: ticket.uniqueCode || ticketId,
      });
      try {
        const result = await mondayQuery(
          mondayToken,
          "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
          {
            boardId: boards[0].id,
            groupId: groupId,
            itemName: itemName,
            columnValues: columnValues,
          },
        );
        if (result.errors) throw new Error(result.errors[0].message);
        syncPromise = null;
        localStorage.removeItem(CACHE_KEY);
        var lt = document.getElementById("sp-loading-toast");
        if (lt) lt.remove();
        showSuccessToast("✅ Migrado a Monday");
        document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
        injectButtons();
      } catch (err) {
        var lt2 = document.getElementById("sp-loading-toast");
        if (lt2) lt2.remove();
        showErrorToast("Error Monday: " + err.message);
      }
    }

    // --- Single modal ---
    function showMondayModal(ticket, ticketId, boards, mondayToken, meId) {
      const existing = document.getElementById("sp-monday-modal");
      if (existing) existing.remove();

      const url = `${BASE_URL}/${ticketId}`;
      const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
      const creatorGroup =
        ticket.ticketInfo?.departmentName ||
        ticket.resolutionGroup?.name ||
        "Sin grupo";
      const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
      const holderName =
        ticket.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar";

      // Determine if ticket is from another area - show person selector
      const ticketGroupId = ticket.resolutionGroup?.id || null;
      const myAreaConfig = getTeamConfig();
      const isOtherArea =
        ticketGroupId && ticketGroupId !== myAreaConfig.resolutionGroupId;
      var personSelectHTML = "";
      if (isOtherArea) {
        var personOpts =
          '<option value="">-- Mantener: ' + holderName + " --</option>";
        myAreaConfig.profiles.forEach(function (p) {
          personOpts +=
            '<option value="' +
            p.profileId +
            '">' +
            p.profileFullName +
            "</option>";
        });
        personSelectHTML =
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Persona asignada en Monday</label>' +
          '<select id="sp-person-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">' +
          personOpts +
          "</select>";
      }

      // Resolve board by ticket createdAt
      const createdDate = new Date(ticket.createdAt);

      const mondayM = SP_Modal.info({
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
        maxWidth: "520px",
        modalOptions: { maxHeight: "85vh" },
      });
      const overlay = mondayM.overlay;
      injectSLCopyButtons(overlay);

      const groupSelect = document.getElementById("sp-group-select");
      const board = boards[0];
      if (board && board.groups) {
        board.groups.forEach((g) => {
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
        sendBtn.innerHTML = spinnerHTML(16, "Validando...");
        var closeBtnEl = document.getElementById("sp-monday-close");
        if (closeBtnEl) closeBtnEl.style.display = "none";
        msg.textContent = "";

        const boardId = boards[0].id;
        const boardName = boards[0].name;
        const boardDate = parseBoardDate(boardName);
        const ticketDate = new Date(ticket.createdAt);

        if (
          boardDate &&
          (ticketDate.getMonth() !== boardDate.month ||
            ticketDate.getFullYear() !== boardDate.year)
        ) {
          const ticketMonthName = MONTH_NAMES[ticketDate.getMonth()];
          msg.textContent =
            "Este ticket es de " +
            ticketMonthName +
            " " +
            ticketDate.getFullYear() +
            " y el board seleccionado es de " +
            MONTH_NAMES[boardDate.month] +
            " " +
            boardDate.year +
            ". Selecciona el board correcto.";
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
            badge.style.cssText =
              "padding:6px 14px;font-size:12px;border-radius:6px;background:#E8F5E9;color:#2E7D32;font-weight:600;white-space:nowrap;cursor:pointer;";
            detailBtn.replaceWith(badge);
          }
          return;
        }

        // Read values BEFORE closing modal
        const selectedGroupId =
          document.getElementById("sp-group-select")?.value || "";
        var selectedPersonId =
          document.getElementById("sp-person-select")?.value || "";

        // Validations passed - close modal and show loading toast
        const modal = document.getElementById("sp-monday-modal");
        if (modal) modal.remove();
        showLoadingToast("Migrando a Monday...");

        const groupId = selectedGroupId;
        const itemName = ticket.subject || "Sin asunto";
        const createdDate = new Date(ticket.createdAt)
          .toISOString()
          .slice(0, 10);
        const spPriority = (
          ticket.incidentPriorityName ||
          ticket.incidentPriority?.name ||
          ""
        )
          .toLowerCase()
          .trim();
        const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];

        let personValue = {};
        // If a person was selected from the dropdown (other area ticket), use their email
        if (selectedPersonId) {
          var selectedProfile = null;
          Object.values(TEAM_AREAS).forEach(function (area) {
            area.profiles.forEach(function (p) {
              if (String(p.profileId) === selectedPersonId) selectedProfile = p;
            });
          });
          if (selectedProfile && selectedProfile.email) {
            try {
              const users = await getMondayUsers(mondayToken);
              var foundUserId = users[selectedProfile.email.toLowerCase()];
              if (!foundUserId) {
                // Fallback: search by partial email match
                var emailPrefix = selectedProfile.email
                  .split("@")[0]
                  .toLowerCase();
                Object.entries(users).forEach(function (entry) {
                  if (
                    !foundUserId &&
                    entry[0].toLowerCase().includes(emailPrefix)
                  )
                    foundUserId = entry[1];
                });
              }
              if (foundUserId)
                personValue = {
                  personsAndTeams: [
                    { id: parseInt(foundUserId), kind: "person" },
                  ],
                };
              SP_Log.debug(
                "Monday person select:",
                selectedProfile.email,
                "-> userId:",
                foundUserId,
              );
            } catch (e) {
              SP_Log.warn("Error finding Monday user:", e);
            }
          }
        } else {
          const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
          if (holderEmail) {
            try {
              const users = await getMondayUsers(mondayToken);
              const userId = users[holderEmail.toLowerCase()];
              if (userId)
                personValue = {
                  personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
                };
            } catch (e) {}
          }
        }

        const columnValues = JSON.stringify({
          descripci_n_mkn9e5f4: { text: desc },
          ...(personValue.personsAndTeams
            ? { multiple_person_mm25nvfq: personValue }
            : {}),
          status: { index: 1 },
          priority_mkn9kbe9: { index: priorityIndex },
          cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
          link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
          text_mm2c9nhc: ticket.uniqueCode || ticketId,
        });

        try {
          // Check if already exists before creating
          const existingId = await checkTicketExistsInMonday(
            mondayToken,
            ticket.uniqueCode || "",
          );
          let newItemId;
          if (existingId) {
            newItemId = existingId;
          } else {
            const result = await mondayQuery(
              mondayToken,
              `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
            create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
          }`,
              { boardId, groupId, itemName, columnValues },
            );
            newItemId = result.create_item.id;
          }
          addToCache(ticket.uniqueCode || ticketId, newItemId);
          const row = document.querySelector(
            `.MuiDataGrid-row[data-id="${ticketId}"]`,
          );
          if (row) {
            const btn = row.querySelector(`.${BTN_CLASS}`);
            if (btn) btn.replaceWith(createSyncedBadge(newItemId));
          }
          const detailBtn = document.getElementById(DETAIL_BTN_ID);
          if (detailBtn) {
            const badge = createSyncedBadge(newItemId);
            badge.id = DETAIL_BTN_ID;
            badge.style.cssText =
              "padding:6px 14px;font-size:12px;border-radius:6px;background:#E8F5E9;color:#2E7D32;font-weight:600;white-space:nowrap;cursor:pointer;";
            detailBtn.replaceWith(badge);
          }
          showSuccessToast("Ticket migrado a Monday");
          document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
          injectButtons();
          if (isDetailView()) {
            SP_Modal.success({
              id: "sp-migrate-success",
              title: "✅ Ticket migrado a Monday",
              message: "El ticket fue migrado correctamente.",
              buttons: [
                {
                  text: "Cerrar pestaña",
                  color: "#D94040",
                  onClick: function () {
                    window.close();
                  },
                },
                {
                  text: "Quedarme",
                  color: null,
                  onClick: function (close) {
                    close();
                  },
                },
              ],
            });
          }
        } catch (err) {
          showErrorToast("Error: " + err.message);
        }
      });

      document
        .getElementById("sp-monday-close")
        .addEventListener("click", () => mondayM.close());
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
        loadProfilesForGroup(currentTeamArea)
          .then(function (profiles) {
            var me = profiles.find(function (p) {
              return p.profileFullName === myName;
            });
            if (me) {
              sessionProfileId = me.profileId;
              myProfileId = me.profileId;
            }
          })
          .catch(function () {});
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
      // Refresh work schedule from storage
      chrome.storage.local.get("workSchedule", function (r) {
        if (r.workSchedule) _workSchedule = r.workSchedule;
      });
    });

    // --- Auto-refresh team panel every 60 seconds ---
    var _teamPanelInterval = setInterval(function () {
      if (!document.getElementById("sp-team-panel")) {
        clearInterval(_teamPanelInterval);
        return;
      }
      if (!isDetailView()) refreshTeamPanel();
    }, 60000);

    // ─── Expose core functions for external modules ─────────
    window.SP_Core = {
      getTeamConfig: getTeamConfig,
      getActiveAreas: getActiveAreas,
      isMultiGroup: isMultiGroup,
      getLoggedUserName: getLoggedUserName,
      getMyProfileId: getMyProfileId,
      getToken: getToken,
      loadProfilesForGroup: loadProfilesForGroup,
      getMondayToken: getMondayToken,
      getMondayBoardId: getMondayBoardId,
      mondayQuery: mondayQuery,
      getMondayUsers: getMondayUsers,
      getMondayTicketBoards: getMondayTicketBoards,
      checkTicketExistsInMonday: checkTicketExistsInMonday,
      canMigrateTicket: canMigrateTicket,
      ensureSyncStarted: ensureSyncStarted,
      getCache: getCache,
      addToCache: addToCache,
      createSyncedBadge: createSyncedBadge,
      createButton: createButton,
      createCopyButton: createCopyButton,
      isDetailView: isDetailView,
      getDetailTicketId: getDetailTicketId,
    };
  } // end initExtension

  // Re-sync on page focus (detect changes without reload)
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      try {
        chrome.runtime.sendMessage({ type: "sync" }, function () {
          // Refresh work schedule
          chrome.storage.local.get("workSchedule", function (ws) {
            if (ws.workSchedule) _workSchedule = ws.workSchedule;
          });
          // Refresh suggested comments chips if modal is open
          var suggestedDiv = document.getElementById("sp-qd-suggested");
          if (suggestedDiv) {
            chrome.storage.local.get("suggestedComments", function (r) {
              try {
                var comments = r.suggestedComments || {};
                var groupId =
                  (typeof currentTeamArea !== "undefined"
                    ? currentTeamArea
                    : "") ||
                  (typeof currentUserGroups !== "undefined" &&
                  currentUserGroups.length
                    ? currentUserGroups[0]
                    : 0);
                var groupComments = comments[groupId] || [];
                suggestedDiv.innerHTML = "";
                var commentInputEl = document.getElementById(
                  "sp-qd-comment-input",
                );
                groupComments.forEach(function (c) {
                  var chip = document.createElement("button");
                  chip.textContent =
                    c.text.substring(0, 40) + (c.text.length > 40 ? "..." : "");
                  chip.title = c.text;
                  var colors = stringToColor(c.text);
                  chip.style.cssText =
                    "padding:3px 8px;font-size:0.8rem;border:1px solid " +
                    colors.border +
                    ";border-radius:12px;background:" +
                    colors.bg +
                    ";color:" +
                    colors.text +
                    ";cursor:pointer;white-space:nowrap;";
                  chip.addEventListener("click", function () {
                    if (commentInputEl) {
                      commentInputEl.value = c.text;
                      commentInputEl.focus();
                    }
                  });
                  suggestedDiv.appendChild(chip);
                });
              } catch (e) {}
            });
          }
        });
      } catch (e) {}
    }
  });
})();
