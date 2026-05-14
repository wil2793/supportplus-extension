(function () {
  // Make loading backdrop less invasive - thin top bar instead of fullscreen
  const hideBackdrop = document.createElement("style");
  hideBackdrop.textContent = ".MuiBackdrop-root { background: transparent !important; top: 0 !important; bottom: auto !important; height: 3px !important; opacity: 1 !important; } .MuiBackdrop-root .MuiCircularProgress-root { display: none !important; } .MuiBackdrop-root::after { content: ''; position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: #D94040; animation: sp-loading-bar 1.2s ease-in-out infinite; } @keyframes sp-loading-bar { 0% { left: -30%; } 100% { left: 100%; } } .MuiDataGrid-cell[data-field='uniqueCode'] { min-width: 320px !important; max-width: 320px !important; } .MuiDataGrid-columnHeader[data-field='uniqueCode'] { min-width: 320px !important; max-width: 320px !important; }";
  document.head.appendChild(hideBackdrop);

  // --- Toast helpers ---
  function ensureToastStyles() {
    if (!document.getElementById("sp-toast-style")) {
      var s = document.createElement("style");
      s.id = "sp-toast-style";
      s.textContent = "@keyframes sp-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes sp-toast-out{from{opacity:1}to{opacity:0;transform:translateX(-50%) translateY(-10px)}}@keyframes sp-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }
  }
  function showLoadingToast(text) {
    ensureToastStyles();
    var existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.id = "sp-loading-toast";
    toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#333;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
    toast.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> ' + text;
    document.body.appendChild(toast);
    return toast;
  }
  function showSuccessToast(text) {
    ensureToastStyles();
    var existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#2E7D32;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.animation = "sp-toast-out 0.3s ease forwards"; setTimeout(function() { toast.remove(); }, 300); }, 3000);
  }
  function showErrorToast(text) {
    ensureToastStyles();
    var existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#D94040;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.animation = "sp-toast-out 0.3s ease forwards"; setTimeout(function() { toast.remove(); }, 4000); }, 4000);
  }

  const SP_API = "https://macropayapi.supportplus.mx/tickets/web";
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

  const PRIORITY_MAP = { critico: 10, alto: 110, medio: 109, bajo: 7 };
  const DEV_IDS = new Set([965, 2877]);
  const QA_IDS = new Set([2787, 2878, 396]);
  const PROD_IDS = new Set([2786, 2879, 395]);
  const GROUP_MAP = { DEV: "topics", QA: "group_title", PROD: "grupo_nuevo__1", SS: "grupo_nuevo895__1" };
  const GROUP_LABELS = { [GROUP_MAP.DEV]: "DEV", [GROUP_MAP.QA]: "QA", [GROUP_MAP.PROD]: "PROD", [GROUP_MAP.SS]: "Shared Services" };

  const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

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
    } catch(e) { return true; } // On error, allow
  }

  function getToken() { return localStorage.getItem("token"); }
  function getMondayToken() {
    return new Promise((r, reject) => {
      try {
        chrome.storage.local.get("mondayToken", ({ mondayToken }) => r(mondayToken));
      } catch (e) {
        if (e.message?.includes("Extension context invalidated")) {
          alert("⚠️ La extensión se actualizó. Recarga la página (F5) para continuar.");
        }
        reject(e);
      }
    });
  }

  function getMondayBoardId() {
    return new Promise((r) => {
      chrome.storage.local.get("mondayBoardId", ({ mondayBoardId }) => r(mondayBoardId));
    });
  }

  function collectServiceIds(node) {
    const ids = [node.id];
    for (const c of node.children || []) ids.push(...collectServiceIds(c));
    return ids;
  }

  function resolveGroup(serviceNode) {
    const ids = collectServiceIds(serviceNode);
    console.log("[SP Monday] Service IDs:", ids, "| Service name:", serviceNode.name);
    for (const id of ids) {
      if (DEV_IDS.has(id)) return GROUP_MAP.DEV;
      if (QA_IDS.has(id)) return GROUP_MAP.QA;
      if (PROD_IDS.has(id)) return GROUP_MAP.PROD;
    }
    return GROUP_MAP.SS;
  }

  // Parse "19/03/2026 - 17:51" → board name "Tickets DBA - Marzo - 2026"
  function dateToBoardName(dateStr) {
    const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    const monthIdx = parseInt(m[2]) - 1;
    return `Tickets DBA - ${MONTH_NAMES[monthIdx]} - ${m[3]}`;
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
    const r = await fetch(MONDAY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ query, variables }),
    });
    if (!r.ok) throw new Error(`Monday HTTP ${r.status}`);
    const json = await r.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  }

  // --- Sync ---
  let syncPromise = null;
  async function fetchSyncedTickets() {
    const cached = getCache();
    if (cached) return cached;
    const mondayToken = await getMondayToken();
    if (!mondayToken) return {};
    const configuredBoardId = await getMondayBoardId();
    try {
      let boardIds = [];
      if (configuredBoardId) {
        boardIds = [configuredBoardId];
      } else {
        const boardsData = await mondayQuery(mondayToken, `{ boards(limit:500) { id name } }`);
        boardIds = boardsData.boards
          .filter((b) => b.name.startsWith("Tickets DBA") && !b.name.includes("Subelementos"))
          .map((b) => b.id);
      }
      if (!boardIds.length) return {};
      const synced = {};
      for (const boardId of boardIds) {
        const firstPage = await mondayQuery(mondayToken,
          `query ($boardId: [ID!]!) { boards(ids: $boardId) { items_page(limit: 500) { cursor items { id column_values(ids: ["text_mm2c9nhc"]) { text } } } } }`,
          { boardId });
        let page = firstPage.boards[0].items_page;
        for (const item of page.items) {
          const code = (item.column_values[0]?.text || "").trim();
          if (code) synced[code] = item.id;
        }
        let cursor = page.cursor;
        while (cursor) {
          const next = await mondayQuery(mondayToken,
            `query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id column_values(ids: ["text_mm2c9nhc"]) { text } } } }`,
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
        .then((d) => d.users.reduce((m, u) => { m[u.email.toLowerCase()] = u.id; return m; }, {}));
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
    const badge = document.createElement("span");
    badge.className = SYNCED_CLASS;
    badge.textContent = "✅ Migrado";
    badge.title = "Ya migrado a Monday";
    badge.style.cssText = "display:inline-block;padding:2px 8px;font-size:11px;border:1px solid #2E7D32;border-radius:4px;background:#E8F5E9;color:#2E7D32;font-weight:600;margin-left:6px;white-space:nowrap;cursor:pointer;line-height:normal;box-sizing:border-box;";
    badge.addEventListener("mouseenter", () => { badge.textContent = "🔗 Monday"; });
    badge.addEventListener("mouseleave", () => { badge.textContent = "✅ Migrado"; });
    badge.addEventListener("click", (e) => {
      e.stopPropagation(); e.preventDefault();
      window.open(`https://macropay7.monday.com/boards/18402162782/pulses/${mondayItemId}`, "_blank");
    });
    return badge;
  }

  function createCopyButton(text) {
    const btn = document.createElement("button");
    btn.className = "sp-copy-btn";
    btn.innerHTML = "📋";
    btn.title = "Copiar folio";
    btn.style.cssText = "padding:1px 4px;font-size:12px;cursor:pointer;border:none;background:transparent;margin-left:4px;opacity:0.6;";
    btn.addEventListener("mouseenter", function() { btn.style.opacity = "1"; });
    btn.addEventListener("mouseleave", function() { btn.style.opacity = "0.6"; });
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      e.preventDefault();
      navigator.clipboard.writeText(text).then(function() {
        btn.innerHTML = "✅";
        setTimeout(function() { btn.innerHTML = "📋"; }, 1500);
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
    } else if (isClosed) {
      // Show migrate button only if ticket belongs to my area (or gerente)
      var myArea = getTeamConfig();
      var ticketBelongsToMe = !ticketGroupId || ticketGroupId === myArea.resolutionGroupId || isGerente();
      if (ticketBelongsToMe) {
      const btn = document.createElement("button");
      btn.id = DETAIL_BTN_ID;
      btn.textContent = "🙂 Migrar a Monday";
      btn.style.cssText =
        "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#D94040;color:#fff;font-weight:600;white-space:nowrap;";
      btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.textContent = "🫡 Migrar a Monday"; });
      btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.textContent = "🙂 Migrar a Monday"; });
      btn.addEventListener("click", () => {
        btn.textContent = "⏳ Migrando...";
        btn.disabled = true;
        handleMondayClick(ticketId).finally(() => { btn.textContent = "🙂 Migrar a Monday"; btn.disabled = false; });
      });
      const chip2 = container.querySelector(".MuiChip-root");
      container.insertBefore(btn, chip2);
      }
    } else if (isWaiting) {
      // Show take button only if ticket belongs to my area (or gerente)
      var myArea2 = getTeamConfig();
      var ticketBelongsToMe2 = !ticketGroupId || ticketGroupId === myArea2.resolutionGroupId || isGerente();
      if (ticketBelongsToMe2) {
      const takeBtn = document.createElement("button");
      takeBtn.id = DETAIL_BTN_ID;
      takeBtn.textContent = "🤚 Tomar ticket";
      takeBtn.style.cssText =
        "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;white-space:nowrap;";
      takeBtn.addEventListener("mouseenter", () => { if (!takeBtn.disabled) takeBtn.textContent = "✊ Tomar ticket"; });
      takeBtn.addEventListener("mouseleave", () => { if (!takeBtn.disabled) takeBtn.textContent = "🤚 Tomar ticket"; });
      takeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        showTakeModal(ticketId, takeBtn);
      });
      const chip3 = container.querySelector(".MuiChip-root");
      container.insertBefore(takeBtn, chip3);
      }
    } else if (isAssigned) {
      // Show steal/close buttons only if ticket belongs to my area (or gerente)
      var myArea3 = getTeamConfig();
      var ticketBelongsToMe3 = !ticketGroupId || ticketGroupId === myArea3.resolutionGroupId || isGerente();
      if (ticketBelongsToMe3) {
      const myName = getLoggedUserName();
      const chip4 = container.querySelector(".MuiChip-root");
      if (holderName && myName && holderName !== myName) {
        const stealBtn = document.createElement("button");
        stealBtn.id = DETAIL_BTN_ID;
        stealBtn.textContent = "🥷 Robar ticket";
        stealBtn.title = "Asignado a: " + holderName;
        stealBtn.style.cssText =
          "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#E65100;color:#fff;font-weight:600;white-space:nowrap;";
        stealBtn.addEventListener("mouseenter", () => { if (!stealBtn.disabled) stealBtn.textContent = "💀 Robar ticket"; });
        stealBtn.addEventListener("mouseleave", () => { if (!stealBtn.disabled) stealBtn.textContent = "🥷 Robar ticket"; });
        stealBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          showTakeModal(ticketId, stealBtn);
        });
        container.insertBefore(stealBtn, chip4);
      } else if (holderName && myName && holderName === myName) {
        const closeBtn = document.createElement("button");
        closeBtn.id = DETAIL_BTN_ID;
        closeBtn.textContent = "🔒 Cerrar ticket";
        closeBtn.style.cssText =
          "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#616161;color:#fff;font-weight:600;white-space:nowrap;";
        closeBtn.addEventListener("mouseenter", () => { if (!closeBtn.disabled) closeBtn.textContent = "🔐 Cerrar ticket"; });
        closeBtn.addEventListener("mouseleave", () => { if (!closeBtn.disabled) closeBtn.textContent = "🔒 Cerrar ticket"; });
        closeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          e.preventDefault();
          closeBtn.disabled = true;
          closeBtn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
          await showCloseModal(ticketId, closeBtn);
          closeBtn.textContent = "🔒 Cerrar ticket";
          closeBtn.disabled = false;
        });
        container.insertBefore(closeBtn, chip4);
      }
      }
    }
    } finally { detailLoading = false; }
  }

  const IAM_BTN_ID = "sp-iam-btn";
  const IAM_PROFILES = [296, 126, 128];
  const IAM_API = "https://macropayapi.supportplus.mx/ticket-participants/assign-visitor-participant";

  const IAM_NAMES = ["Carlos Alberto Lopez Mata", "Crhistian Uziel Sanchez Alvarez", "Leyver Adair Vasquez Velasco"];

  function injectIamButton() {
    if (document.getElementById(IAM_BTN_ID)) return;
    if (!isDetailView()) return;
    var ticketId = getDetailTicketId();
    if (!ticketId) return;

    // Find the "Agregar usuarios" card
    var cards = document.querySelectorAll(".MuiCardHeader-content .MuiTypography-body1");
    var targetCard = null;
    cards.forEach(function(el) {
      if (el.textContent.trim() === "Agregar usuarios") targetCard = el.closest(".MuiCard-root");
    });
    if (!targetCard) return;

    // Check if all IAMcitos already exist in the list
    var existingNames = [];
    targetCard.querySelectorAll("p[aria-label]").forEach(function(p) {
      existingNames.push(p.getAttribute("aria-label"));
    });
    var allExist = IAM_NAMES.every(function(name) {
      return existingNames.indexOf(name) !== -1;
    });
    if (allExist) return;

    var btn = document.createElement("button");
    btn.id = IAM_BTN_ID;
    btn.textContent = "👥 Agregar IAMcitos";
    btn.style.cssText = "width:100%;padding:10px;font-size:13px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;margin-top:8px;";
    btn.addEventListener("click", async function() {
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Agregando...';
      ensureToastStyles();

      // Re-check existing names at click time
      var currentNames = [];
      targetCard.querySelectorAll("p[aria-label]").forEach(function(p) {
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
        setTimeout(function() { window.location.reload(); }, 1500);
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
    document.querySelectorAll("h2.MuiTypography-h2").forEach(function(h2) {
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
    if (slRaw) slMatches = slRaw.filter(function(v, i, a) { return a.indexOf(v) === i; });

    // Detect users
    var userMatches = [];
    var userRaw = fullText.match(/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g);
    if (userRaw) {
      var seen = {};
      userMatches = userRaw.map(function(v) {
        var m = v.match(/(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i);
        return m ? m[1] : v;
      }).filter(function(v) { var low = v.toLowerCase(); if (seen[low]) return false; seen[low] = true; return true; });
    }

    // Detect DB objects (tables, views, stored procedures, functions)
    var dbMatches = [];
    // Pattern 1: schema.object (e.g. HANA_Plata.HN_ZVW_PEDIDOS_CENT)
    var dbSchemaRaw = fullText.match(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]{3,}/g);
    if (dbSchemaRaw) dbSchemaRaw.forEach(function(v) {
      // Exclude common false positives (emails, urls, file extensions)
      if (v.match(/\.(com|mx|net|org|jpg|png|pdf|xlsx|csv|txt|html|js|css)$/i)) return;
      dbMatches.push(v);
    });
    // Pattern 2: SP/USP prefixed (stored procedures)
    var dbSpRaw = fullText.match(/\b(?:sp_|usp_|SP_|USP_)[A-Za-z0-9_]{3,}/g);
    if (dbSpRaw) dbSpRaw.forEach(function(v) { dbMatches.push(v); });
    // Pattern 3: Common DB prefixes (HN_, VW_, ZVW_, FN_, TBL_, V_, T_)
    var dbPrefixRaw = fullText.match(/\b(?:HN_|VW_|ZVW_|FN_|TBL_|V_|T_)[A-Za-z0-9_]{3,}/g);
    if (dbPrefixRaw) dbPrefixRaw.forEach(function(v) { dbMatches.push(v); });
    // Pattern 4: Contextual - word after "tabla", "vista", "procedimiento", "store procedure", "view", "trigger", "function"
    var dbContextRaw = fullText.match(/(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*([A-Za-z_][A-Za-z0-9_.]{3,})/gi);
    if (dbContextRaw) {
      dbContextRaw.forEach(function(match) {
        var obj = match.replace(/^(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*/i, "").trim();
        if (obj && obj.length > 3) dbMatches.push(obj);
      });
    }
    // Pattern 5: UPPER_CASE words with underscores (3+ segments, likely DB objects)
    var dbUpperRaw = fullText.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g);
    if (dbUpperRaw) dbUpperRaw.forEach(function(v) {
      // Exclude things that are clearly not DB objects
      if (v.length < 8) return;
      dbMatches.push(v);
    });
    // Deduplicate
    var dbSeen = {};
    dbMatches = dbMatches.filter(function(v) { var low = v.toLowerCase(); if (dbSeen[low]) return false; dbSeen[low] = true; return true; });

    if (!slMatches.length && !userMatches.length && !dbMatches.length) return;

    var container = document.createElement("div");
    container.id = DETAIL_DETECTIONS_ID;
    container.style.cssText = "margin-bottom:12px;";

    if (slMatches.length) {
      var slDiv = document.createElement("div");
      slDiv.style.cssText = "padding:8px 10px;background:#E3F2FD;border-radius:6px;margin-bottom:8px;";
      slDiv.innerHTML = '<b style="font-size:12px;color:#1976D2;">SL/PR detectadas:</b> ';
      slMatches.forEach(function(sl) {
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
      userMatches.forEach(function(u) {
        var span = document.createElement("span");
        span.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #E65100;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;";
        span.textContent = u;
        span.appendChild(createCopyButton(u));
        userDiv.appendChild(span);
      });
      container.appendChild(userDiv);
    }

    if (dbMatches.length) {
      var dbDiv = document.createElement("div");
      dbDiv.style.cssText = "padding:8px 10px;background:#E8F5E9;border-radius:6px;margin-bottom:8px;";
      dbDiv.innerHTML = '<b style="font-size:12px;color:#2E7D32;">🗄️ Objetos de BD detectados:</b> ';
      dbMatches.forEach(function(obj) {
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
    if (document.getElementById(REASSIGN_APP_BTN_ID)) return;
    if (!isDetailView()) return;
    var ticketId = getDetailTicketId();
    if (!ticketId) return;

    // Don't show if ticket is closed
    var chipLabels = document.querySelectorAll(".MuiChip-label");
    var isClosed = false;
    chipLabels.forEach(function(el) { if (el.textContent.trim() === "Cerrado") isClosed = true; });
    if (isClosed) return;

    // Find "Información del ticket" h1
    var h1 = null;
    document.querySelectorAll("h1.MuiTypography-h1").forEach(function(el) {
      if (el.textContent.trim() === "Información del ticket") h1 = el;
    });
    if (!h1) return;

    var btn = document.createElement("button");
    btn.id = REASSIGN_APP_BTN_ID;
    btn.textContent = "🔀 Reasignar a Aplicaciones";
    btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#C62828;color:#fff;font-weight:600;white-space:nowrap;margin-left:12px;vertical-align:middle;";
    btn.addEventListener("click", function() { showReassignAppModal(ticketId); });
    h1.parentElement.appendChild(btn);
  }

  function showReassignAppModal(ticketId) {
    var existing = document.getElementById("sp-reassign-app-modal");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "sp-reassign-app-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;text-align:center;">' +
      '<h3 style="margin:0 0 16px;color:#C62828;">⚠️ Reasignar a Aplicaciones</h3>' +
      '<p style="font-size:14px;color:#555;margin:0 0 8px;">Este ticket dejará de ser nuestro y pasará a mejor vida con el equipo de Aplicaciones.</p>' +
      '<p style="font-size:13px;color:#888;margin:0 0 20px;">🪦 Descanse en paz... o no, depende de Aplicaciones.</p>' +
      '<div id="sp-reassign-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-reassign-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:14px;">Sí, reasignar</button>' +
        '<button id="sp-reassign-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-reassign-cancel").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    document.getElementById("sp-reassign-confirm").addEventListener("click", async function() {
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
          var successOverlay = document.createElement("div");
          successOverlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
          successOverlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:360px;width:90%;font-family:system-ui;text-align:center;">' +
            '<h3 style="margin:0 0 12px;color:#2E7D32;">✅ Ticket reasignado</h3>' +
            '<p style="font-size:14px;color:#555;margin:0 0 16px;">El ticket fue reasignado a Aplicaciones exitosamente. 🪦 Descanse en paz.</p>' +
            '<button id="sp-reassign-ok" style="width:100%;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">Aceptar</button>' +
          '</div>';
          document.body.appendChild(successOverlay);
          document.getElementById("sp-reassign-ok").addEventListener("click", function() {
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

    const btn = document.createElement("button");
    btn.id = BULK_BTN_ID;
    btn.textContent = "😨 Migrar varios";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#D94040;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.textContent = "😱 Migrar varios"; });
    btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.textContent = "😨 Migrar varios"; });
    btn.addEventListener("click", handleBulkMigrate);

    if (insertMethod === "beforeSearch") {
      const searchBtn = container.querySelector('button[aria-label="Buscar"]');
      container.insertBefore(btn, searchBtn);
    } else {
      container.prepend(btn);
    }
  }

  async function handleBulkMigrate() {
    // Prevent double click
    const bulkBtn = document.getElementById(BULK_BTN_ID);
    if (bulkBtn) {
      bulkBtn.disabled = true;
      bulkBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Cargando...';
      if (!document.getElementById("sp-spinner-style")) {
        var style = document.createElement("style");
        style.id = "sp-spinner-style";
        style.textContent = "@keyframes sp-spin { to { transform: rotate(360deg); } }";
        document.head.appendChild(style);
      }
    }

    function restoreBulkBtn() {
      if (bulkBtn) {
        bulkBtn.disabled = false;
        bulkBtn.textContent = "😨 Migrar varios";
      }
    }

    const mondayToken = await getMondayToken();
    if (!mondayToken) { restoreBulkBtn(); return alert("Configura tu token de Monday en el popup de la extension primero."); }
    const boardId = await getMondayBoardId();
    if (!boardId) { restoreBulkBtn(); return alert("Configura el Board ID en el popup de la extension primero."); }
    const spToken = getToken();
    if (!spToken) { restoreBulkBtn(); return alert("No se encontro token de SupportPlus."); }

    // Ensure sync is fresh before checking pending
    syncPromise = null;
    localStorage.removeItem(CACHE_KEY);
    await ensureSyncStarted();

    const pending = getPendingRows();
    if (!pending.length) { restoreBulkBtn(); return alert("No hay tickets pendientes de migrar en esta pagina."); }

    // Fetch groups from configured board
    const boardData = await mondayQuery(mondayToken, `query ($boardId: [ID!]!) { boards(ids: $boardId) { name groups { id title } } }`, { boardId });
    const boardName = boardData.boards[0]?.name || "";
    const boardDate = parseBoardDate(boardName);
    const groups = boardData.boards[0]?.groups || [];
    const allGroups = {};
    for (const g of groups) allGroups[g.id] = g.title;
    const groupOpts = '<option value="">-- Selecciona --</option>' + groups.map(g => `<option value="${g.id}">${g.title}</option>`).join("");

    // Build ticket rows with individual group selectors
    const ticketRows = pending.map((p, i) => {
      const codeCell = p.row.querySelector('[data-field="uniqueCode"]');
      const subjectCell = p.row.querySelector('[data-field="subject"]');
      const code = codeCell ? codeCell.textContent.trim() : p.ticketId;
      const subject = subjectCell ? subjectCell.textContent.trim() : "";
      const label = subject ? code + " - " + subject.substring(0, 40) + (subject.length > 40 ? "..." : "") : code;
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
        '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + label + '</span>' +
        '<select data-idx="' + i + '" class="sp-bulk-group-select" style="padding:4px;font-size:11px;border:1px solid #ddd;border-radius:4px;min-width:120px;">' + groupOpts + '</select>' +
        '</div>';
    }).join("");

    // Show assignment modal
    restoreBulkBtn();
    const selOverlay = document.createElement("div");
    selOverlay.id = "sp-monday-modal";
    selOverlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    selOverlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:560px;width:90%;max-height:85vh;display:flex;flex-direction:column;font-family:system-ui;">' +
      '<h3 style="margin:0 0 8px;">Migracion masiva (' + pending.length + ' tickets)</h3>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
        '<label style="font-size:12px;color:#555;white-space:nowrap;">Asignar todos a:</label>' +
        '<select id="sp-bulk-all-group" style="flex:1;padding:4px;font-size:11px;border:1px solid #ddd;border-radius:4px;">' + groupOpts + '</select>' +
        '<button id="sp-bulk-apply-all" style="padding:4px 10px;font-size:11px;border:1px solid #D94040;border-radius:4px;background:#fff;color:#D94040;cursor:pointer;white-space:nowrap;">Aplicar a todos</button>' +
      '</div>' +
      '<div style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px;">' + ticketRows + '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-bulk-start" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Iniciar migracion</button>' +
        '<button id="sp-bulk-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(selOverlay);

    // Apply all button
    document.getElementById("sp-bulk-apply-all").addEventListener("click", function() {
      var val = document.getElementById("sp-bulk-all-group").value;
      selOverlay.querySelectorAll(".sp-bulk-group-select").forEach(function(s) { s.value = val; });
    });

    // Wait for user action
    const groupAssignments = await new Promise(function(resolve) {
      document.getElementById("sp-bulk-start").addEventListener("click", function() {
        var assignments = [];
        selOverlay.querySelectorAll(".sp-bulk-group-select").forEach(function(s) {
          assignments[parseInt(s.dataset.idx)] = s.value;
        });
        resolve(assignments);
      });
      document.getElementById("sp-bulk-cancel").addEventListener("click", function() {
        selOverlay.remove();
        resolve(null);
      });
    });
    selOverlay.remove();
    if (!groupAssignments) return;

    // Show progress overlay
    const overlay = document.createElement("div");
    overlay.id = "sp-monday-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">Migracion masiva</h3>' +
      '<div id="sp-bulk-status" style="font-size:13px;margin-bottom:12px;">Iniciando...</div>' +
      '<div style="height:8px;background:#eee;border-radius:4px;"><div id="sp-bulk-bar" style="height:100%;background:#D94040;border-radius:4px;width:0%;transition:width .3s"></div></div>' +
      '<div id="sp-bulk-log" style="margin-top:12px;max-height:200px;overflow:auto;font-size:12px;color:#666;"></div>' +
      '<button id="sp-bulk-close" style="margin-top:12px;width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;display:none;">Cerrar</button>' +
      '</div>';
    document.body.appendChild(overlay);

    const status = document.getElementById("sp-bulk-status");
    const bar = document.getElementById("sp-bulk-bar");
    const log = document.getElementById("sp-bulk-log");
    const closeBtn = document.getElementById("sp-bulk-close");

    const users = await getMondayUsers(mondayToken);

    let ok = 0, fail = 0;

    for (let i = 0; i < pending.length; i++) {
      const { ticketId, dateText, row } = pending[i];
      const groupId = groupAssignments[i];
      if (!groupId) continue;
      status.textContent = "Procesando " + (i + 1) + " / " + pending.length + "...";
      bar.style.width = Math.round(((i + 1) / pending.length) * 100) + "%";

      try {
        const ticketRes = await fetch(SP_API + "/" + ticketId, {
          headers: { accept: "application/json", authorization: "Bearer " + spToken },
        });
        if (!ticketRes.ok) throw new Error("HTTP " + ticketRes.status);
        const ticketJson = await ticketRes.json();
        const ticket = ticketJson.data || ticketJson;

        // Validate ticket date matches board period
        if (boardDate) {
          const ticketCreated = new Date(ticket.createdAt);
          if (ticketCreated.getMonth() !== boardDate.month || ticketCreated.getFullYear() !== boardDate.year) {
            var ticketPeriod = MONTH_NAMES[ticketCreated.getMonth()] + " " + ticketCreated.getFullYear();
            log.innerHTML += '<div style="color:#e67e22;">⚠ ' + (ticket.uniqueCode || ticketId) + ': Ticket de ' + ticketPeriod + ', no corresponde al board (' + MONTH_NAMES[boardDate.month] + ' ' + boardDate.year + ')</div>';
            log.scrollTop = log.scrollHeight;
            fail++;
            continue;
          }
        }

        // Check if already migrated
        const currentCache = getCache() || {};
        if (ticket.uniqueCode && currentCache[ticket.uniqueCode]) {
          log.innerHTML += '<div style="color:#e67e22;">' + (ticket.uniqueCode || ticketId) + ': Ya migrado, se omite</div>';
          log.scrollTop = log.scrollHeight;
          continue;
        }

        const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
        let personValue = {};
        if (holderEmail) {
          const userId = users[holderEmail.toLowerCase()];
          if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
        }

        const url = BASE_URL + "/" + ticketId;
        const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
        const itemName = ticket.subject || "Sin asunto";
        const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
        const spPriority = (ticket.incidentPriorityName || ticket.incidentPriority?.name || "").toLowerCase().trim();
        const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];

        const columnValues = JSON.stringify({
          descripci_n_mkn9e5f4: { text: desc },
          ...(personValue.personsAndTeams ? { multiple_person_mm25nvfq: personValue } : {}),
          status: { index: 1 },
          priority_mkn9kbe9: { index: priorityIndex },
          cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
          link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
          text_mm2c9nhc: ticket.uniqueCode || ticketId,
        });

        const result = await mondayQuery(mondayToken,
          `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
            create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
          }`,
          { boardId, groupId, itemName, columnValues }
        );

        const newItemId = result.create_item.id;
        addToCache(ticket.uniqueCode || ticketId, newItemId);

        // Update row UI
        const btn = row.querySelector("." + BTN_CLASS);
        if (btn) btn.replaceWith(createSyncedBadge(newItemId));

        ok++;
        log.innerHTML += '<div style="color:#00c875;">' + ticket.uniqueCode + ' -> ' + (allGroups[groupId] || groupId) + '</div>';
      } catch (err) {
        fail++;
        log.innerHTML += '<div style="color:#df2f4a;">' + ticketId + ': ' + err.message + '</div>';
      }

      log.scrollTop = log.scrollHeight;
    }

    status.textContent = "Completado: " + ok + " migrados, " + fail + " errores";
    closeBtn.style.display = "block";
    closeBtn.addEventListener("click", function() { overlay.remove(); });
  }

  // --- Inject buttons ---
  const HIGHLIGHT_CLASS = "sp-my-row";

  function getLoggedUserName() {
    const el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
    return el ? el.textContent.trim() : "";
  }

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
    document.querySelectorAll(".MuiDataGrid-row").forEach(function(row) {
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

  const TEAM_AREAS = {
    dba: {
      resolutionGroupId: 19,
      resolutionGroupLabel: "Infraestructura DBA",
      profiles: [
        { profileId: 138, profileFullName: "Rickey Oswaldo Ehuan Vargas" },
        { profileId: 141, profileFullName: "Wille Hans Ditte Morales Sanchez" },
        { profileId: 144, profileFullName: "Jorge Luis Balam Vargas" },
        { profileId: 146, profileFullName: "Eduardo Emmanuel Ravell May" },
        { profileId: 148, profileFullName: "Gamaliel Uriel Tzab Novelo" },
        { profileId: 190, profileFullName: "Ariel Jesus Fernandez Mena" },
        { profileId: 294, profileFullName: "William Israel Alpuche Jimenez" }
      ]
    },
    aplicaciones: {
      resolutionGroupId: 22,
      resolutionGroupLabel: "Aplicaciones - Liberación e Implementación",
      profiles: [
        { profileId: 135, profileFullName: "Omar Francisco Canul Mutul" },
        { profileId: 187, profileFullName: "Eduardo Emanuel Herrera Pech" },
        { profileId: 303, profileFullName: "Aaron Isaac Dorantes Ku" }
      ]
    }
  };

  var currentTeamArea = "dba"; // default
  const GERENTE_NAME = "Rickey Oswaldo Ehuan Vargas";

  function isGerente() {
    return getLoggedUserName() === GERENTE_NAME;
  }

  function getTeamConfig() {
    return TEAM_AREAS[currentTeamArea] || TEAM_AREAS.dba;
  }

  // Returns all areas if gerente, otherwise just the configured one
  function getActiveAreas() {
    if (isGerente()) return Object.values(TEAM_AREAS);
    return [getTeamConfig()];
  }

  function loadTeamArea() {
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get("teamArea", function(result) {
          currentTeamArea = result.teamArea || "dba";
          resolve();
        });
      } catch(e) { resolve(); }
    });
  }

  const DBA_PROFILES = TEAM_AREAS.dba.profiles;
  const DBA_PROFILE_NAMES = {};
  DBA_PROFILES.forEach(function(p) { DBA_PROFILE_NAMES[p.profileId] = p.profileFullName; });

  // Build a global profile name map for all areas
  const ALL_PROFILE_NAMES = {};
  Object.values(TEAM_AREAS).forEach(function(area) {
    area.profiles.forEach(function(p) { ALL_PROFILE_NAMES[p.profileId] = p.profileFullName; });
  });

  async function loadTeamPanel() {
    if (isDetailView()) return;
    if (teamPanelLoading) return;
    if (document.getElementById(TEAM_PANEL_ID)) return;
    teamPanelLoading = true;
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

      // Render empty columns immediately
      var containerDiv = document.createElement("div");
      containerDiv.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
      panel.innerHTML = "";
      panel.appendChild(containerDiv);

      // "Sin asignar" column at the left (for each area)
      areas.forEach(function(area, areaIdx) {
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

        area.profiles.forEach(function(p) {
          var isMe = myName && p.profileFullName === myName;
          var borderColor = isMe ? "#D94040" : "#ddd";
          var headerBg = isMe ? "#D94040" : (areaIdx === 0 ? "#2196F3" : "#7B1FA2");
          var firstName = p.profileFullName.split(" ")[0];

          var col = document.createElement("div");
          col.id = "sp-team-col-" + p.profileId;
          col.style.cssText = "min-width:180px;max-width:220px;border:2px solid " + borderColor + ";border-radius:8px;overflow:hidden;flex-shrink:0;";
          col.innerHTML = '<div class="sp-team-header" data-profile-id="' + p.profileId + '" style="background:' + headerBg + ';color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">' + firstName + ' <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
            '<div class="sp-team-tickets" data-profile-id="' + p.profileId + '" data-area-group="' + area.resolutionGroupId + '" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
          containerDiv.appendChild(col);
        });
      });

      // Setup drag and drop + click to open
      var dragStartPos = null;
      panel.addEventListener("click", function(e) {
        var ticket = e.target.closest(".sp-team-ticket");
        if (!ticket) return;
        // Only open if it wasn't a drag (mouse didn't move much)
        if (dragStartPos && (Math.abs(e.clientX - dragStartPos.x) > 5 || Math.abs(e.clientY - dragStartPos.y) > 5)) return;
        var ticketId = ticket.dataset.ticketId;
        if (ticketId) window.open("/es/dashboard/tickets/" + ticketId, "_blank");
      });
      panel.addEventListener("mousedown", function(e) {
        dragStartPos = { x: e.clientX, y: e.clientY };
      });
      panel.addEventListener("dragstart", function(e) {
        var ticket = e.target.closest(".sp-team-ticket");
        if (!ticket) return;
        e.dataTransfer.setData("text/plain", ticket.dataset.ticketId);
        ticket.style.opacity = "0.4";
        dragStartPos = null; // Nullify so click doesn't fire after drag
      });
      panel.addEventListener("dragend", function(e) {
        var ticket = e.target.closest(".sp-team-ticket");
        if (ticket) ticket.style.opacity = "1";
      });
      panel.addEventListener("dragover", function(e) {
        e.preventDefault();
        var col = e.target.closest("[id^='sp-team-col-']");
        if (!col) return;
        var dropZone = col.querySelector(".sp-team-tickets");
        if (dropZone) dropZone.style.background = "#e3f2fd";
      });
      panel.addEventListener("dragleave", function(e) {
        var col = e.target.closest("[id^='sp-team-col-']");
        if (!col) return;
        // Only reset if actually leaving the column
        if (col.contains(e.relatedTarget)) return;
        var dropZone = col.querySelector(".sp-team-tickets");
        if (dropZone) dropZone.style.background = "#fafafa";
      });
      panel.addEventListener("drop", async function(e) {
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
        var dropAreaConfig = Object.values(TEAM_AREAS).find(function(a) { return a.resolutionGroupId === dropAreaGroupId; }) || getTeamConfig();

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
      areas.forEach(function(area) {
        area.profiles.forEach(function(p) {
          var TEAM_API = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId;
          Promise.all([
            fetch(TEAM_API + "&ticketStatusName=Asignado", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function(r) { return r.json(); }),
            fetch(TEAM_API + "&ticketStatusName=En%20atenci%C3%B3n", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function(r) { return r.json(); })
          ]).then(function(results) {
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
              tickets.forEach(function(t) {
                var statusColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
                html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:10px;line-height:1.3;cursor:grab;">';
                html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
                html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:' + statusColor + ';font-weight:600;font-size:9px;">' + t.ticketStatusName + '</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</span></div>';
                html += '</div>';
              });
              listEl.innerHTML = html;
            }
          }).catch(function() {
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
        }).then(function(r) { return r.json(); }).then(function(json) {
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
            tickets.forEach(function(t) {
              html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:10px;line-height:1.3;cursor:grab;">';
              html += '<div style="font-weight:600;color:#E65100;">' + (t.uniqueCode || "") + '</div>';
              html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
              html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#FF8F00;font-weight:600;font-size:9px;">En espera</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</span></div>';
              html += '</div>';
            });
            listEl.innerHTML = html;
          }
        }).catch(function() {});
      });

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
    areas.forEach(function(a) { allProfiles = allProfiles.concat(a.profiles); });

    var pending = allProfiles.length;
    allProfiles.forEach(function(p) {
      var TEAM_API = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId;
      Promise.all([
        fetch(TEAM_API + "&ticketStatusName=Asignado", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function(r) { return r.json(); }),
        fetch(TEAM_API + "&ticketStatusName=En%20atenci%C3%B3n", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function(r) { return r.json(); })
      ]).then(function(results) {
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
          tickets.forEach(function(t) {
            var statusColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
            html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:10px;line-height:1.3;cursor:grab;">';
            html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
            html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:' + statusColor + ';font-weight:600;font-size:9px;">' + t.ticketStatusName + '</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</span></div>';
            html += '</div>';
          });
          listEl.innerHTML = html;
        }
      }).catch(function() {}).finally(function() { pending--; if (pending <= 0) teamRefreshing = false; });
    });

    // Also refresh unassigned column
    refreshUnassignedColumn();
  }

  function refreshTeamColumn(profileId) {
    var spToken = getToken();
    if (!spToken) return;
    var name = ALL_PROFILE_NAMES[profileId];
    if (!name) return;
    var TEAM_API = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + profileId;
    Promise.all([
      fetch(TEAM_API + "&ticketStatusName=Asignado", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function(r) { return r.json(); }),
      fetch(TEAM_API + "&ticketStatusName=En%20atenci%C3%B3n", { headers: { accept: "application/json", authorization: "Bearer " + spToken } }).then(function(r) { return r.json(); })
    ]).then(function(results) {
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
        tickets.forEach(function(t) {
          var statusColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
          html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:10px;line-height:1.3;cursor:grab;">';
          html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
          html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:' + statusColor + ';font-weight:600;font-size:9px;">' + t.ticketStatusName + '</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</span></div>';
          html += '</div>';
        });
        listEl.innerHTML = html;
      }
    }).catch(function() {});
  }

  function refreshUnassignedColumn() {
    var spToken = getToken();
    if (!spToken) return;
    var areas = getActiveAreas();
    areas.forEach(function(area) {
      fetch(SP_SEARCH_API + "?page=0&size=50&resolutionGroupId=" + area.resolutionGroupId + "&ticketStatusName=En%20espera", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken },
      }).then(function(r) { return r.json(); }).then(function(json) {
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
          tickets.forEach(function(t) {
            html += '<div draggable="true" data-ticket-id="' + t.id + '" class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:10px;line-height:1.3;cursor:grab;">';
            html += '<div style="font-weight:600;color:#E65100;">' + (t.uniqueCode || "") + '</div>';
            html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 30) + '</div>';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#FF8F00;font-weight:600;font-size:9px;">En espera</span><span style="color:#888;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</span></div>';
            html += '</div>';
          });
          listEl.innerHTML = html;
        }
      }).catch(function() {});
    });
  }

  // --- Take ticket (reassign) ---
  let myProfileId = null;
  async function getMyProfileId() {
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
      const me = profiles.find(function(p) { return p.profileFullName === myName; });
      if (me) myProfileId = me.profileId;
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
    btn.addEventListener("mouseenter", function() { if (!btn.disabled) btn.textContent = "✊ Tomar"; });
    btn.addEventListener("mouseleave", function() { if (!btn.disabled) btn.textContent = "🤚 Tomar"; });
    btn.addEventListener("click", async function(e) {
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
    if (slRaw) slMatches = slRaw.filter(function(v, i, a) { return a.indexOf(v) === i; });

    // Detect DB users
    var userMatches = [];
    var userRaw = fullText.match(/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g);
    if (userRaw) {
      var seen = {};
      userMatches = userRaw.map(function(v) {
        var m = v.match(/(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i);
        return m ? m[1] : v;
      }).filter(function(v) { var low = v.toLowerCase(); if (seen[low]) return false; seen[low] = true; return true; });
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
    if (slMatches.length) {
      slHTML = '<div style="margin-bottom:8px;padding:8px 10px;background:#E3F2FD;border-radius:6px;border-left:4px solid #1976D2;">' +
        '<b style="font-size:11px;color:#1976D2;">📋 SL/PR detectadas:</b> ';
      slMatches.forEach(function(sl) {
        slHTML += '<span class="sp-sl-copy" data-sl="' + sl + '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #1976D2;border-radius:4px;font-weight:600;font-size:12px;">' + sl + '</span>';
      });
      slHTML += '</div>';
    }

    var userHTML = "";
    if (userMatches.length) {
      userHTML = '<div style="margin-bottom:8px;padding:8px 10px;background:#FFF3E0;border-radius:6px;border-left:4px solid #E65100;">' +
        '<b style="font-size:11px;color:#E65100;">🖥️ Usuarios detectados:</b> ';
      userMatches.forEach(function(u) {
        userHTML += '<span class="sp-user-copy" data-user="' + u + '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #E65100;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">' + u + '</span>';
      });
      userHTML += '</div>';
    }

    // Detect DB objects
    var dbMatches = [];
    var dbSchemaRaw = fullText.match(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]{3,}/g);
    if (dbSchemaRaw) dbSchemaRaw.forEach(function(v) { if (!v.match(/\.(com|mx|net|org|jpg|png|pdf|xlsx|csv|txt|html|js|css)$/i)) dbMatches.push(v); });
    var dbSpRaw = fullText.match(/\b(?:sp_|usp_|SP_|USP_)[A-Za-z0-9_]{3,}/g);
    if (dbSpRaw) dbSpRaw.forEach(function(v) { dbMatches.push(v); });
    var dbPrefixRaw = fullText.match(/\b(?:HN_|VW_|ZVW_|FN_|TBL_|V_|T_)[A-Za-z0-9_]{3,}/g);
    if (dbPrefixRaw) dbPrefixRaw.forEach(function(v) { dbMatches.push(v); });
    var dbContextRaw = fullText.match(/(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*([A-Za-z_][A-Za-z0-9_.]{3,})/gi);
    if (dbContextRaw) { dbContextRaw.forEach(function(match) { var obj = match.replace(/^(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*/i, "").trim(); if (obj && obj.length > 3) dbMatches.push(obj); }); }
    var dbUpperRaw = fullText.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g);
    if (dbUpperRaw) dbUpperRaw.forEach(function(v) { if (v.length >= 8) dbMatches.push(v); });
    var dbSeen = {};
    dbMatches = dbMatches.filter(function(v) { var low = v.toLowerCase(); if (dbSeen[low]) return false; dbSeen[low] = true; return true; });

    var dbHTML = "";
    if (dbMatches.length) {
      dbHTML = '<div style="margin-bottom:8px;padding:8px 10px;background:#E8F5E9;border-radius:6px;border-left:4px solid #2E7D32;">' +
        '<b style="font-size:11px;color:#2E7D32;">🗄️ Objetos de BD:</b> ';
      dbMatches.forEach(function(obj) {
        dbHTML += '<span class="sp-db-copy" data-db="' + obj + '" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #2E7D32;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">' + obj + '</span>';
      });
      dbHTML += '</div>';
    }

    return card + slHTML + userHTML + dbHTML;
  }

  function injectSLCopyButtons(container) {
    container.querySelectorAll(".sp-sl-copy").forEach(function(span) {
      if (span.querySelector(".sp-copy-btn")) return;
      var sl = span.dataset.sl;
      if (sl) span.appendChild(createCopyButton(sl));
    });
    container.querySelectorAll(".sp-user-copy").forEach(function(span) {
      if (span.querySelector(".sp-copy-btn")) return;
      var user = span.dataset.user;
      if (user) span.appendChild(createCopyButton(user));
    });
    container.querySelectorAll(".sp-db-copy").forEach(function(span) {
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

    tickets.forEach(function(t) {
      var statusColor = STATUS_COLORS[t.ticketStatusName] || "transparent";
      var textColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
      var date = (t.createdAt || "").replace("T", " ").substring(0, 16);
      var subject = (t.subject || "").substring(0, 40) + ((t.subject || "").length > 40 ? "..." : "");
      html += '<tr style="background:' + statusColor + ';border-bottom:1px solid #eee;">';
      html += '<td style="padding:6px;font-weight:600;white-space:nowrap;"><a href="/es/dashboard/tickets/' + t.id + '" target="_blank" style="color:inherit;text-decoration:none;">' + (t.uniqueCode || t.id) + '</a><span class="sp-card-copy" data-code="' + (t.uniqueCode || "") + '"></span></td>';
      html += '<td style="padding:6px;font-size:11px;">' + date + '</td>';
      html += '<td style="padding:6px;" title="' + (t.subject || "") + '">' + subject + '</td>';
      html += '<td style="padding:6px;">' + (t.requesterName || "") + '</td>';
      html += '<td style="padding:6px;font-size:11px;font-weight:700;color:' + textColor + ';">' + (t.ticketStatusName || "") + '</td>';
      html += '<td style="padding:6px;">' + (t.responsibleName || "Sin asignar") + '</td>';
      html += '<td style="padding:8px;white-space:nowrap;display:flex;align-items:center;gap:6px;flex-wrap:wrap;" class="sp-card-actions" data-id="' + t.id + '" data-status="' + (t.ticketStatusName || "") + '" data-responsible="' + (t.responsibleName || "") + '" data-code="' + (t.uniqueCode || "") + '"></td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Inject copy buttons
    container.querySelectorAll(".sp-card-copy").forEach(function(span) {
      var code = span.dataset.code;
      if (code) span.appendChild(createCopyButton(code));
    });

    // Inject action buttons
    container.querySelectorAll(".sp-card-actions").forEach(function(cell) {
      var id = cell.dataset.id;
      var status = cell.dataset.status;
      var responsible = cell.dataset.responsible;
      var code = cell.dataset.code;

      if (status === "En espera") cell.appendChild(createTakeButton(id));
      if ((status === "Asignado" || status === "En atención") && responsible && myName && responsible === myName) cell.appendChild(createCloseButton(id));
      if ((status === "Asignado" || status === "En atención") && responsible && myName && responsible !== myName) cell.appendChild(createStealButton(id, responsible));
      if (status === "Cerrado") {
        if (code && synced[code]) cell.appendChild(createSyncedBadge(synced[code]));
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
      } catch(e) {}
    }
    var groupOpts = '<option value="">-- No migrar --</option>' + groups.map(function(g) { return '<option value="' + g.id + '">' + g.title + '</option>'; }).join("");

    var overlay = document.createElement("div");
    overlay.id = "sp-take-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">🤚 Tomar ticket #' + ticketId + '</h3>' +
      summaryHTML +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario al tomar</label>' +
      '<textarea id="sp-take-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="se revisa"></textarea>' +
      '<div style="margin-bottom:12px;"><label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="sp-take-done"> <b>Ticket realizado</b></label></div>' +
      '<div id="sp-take-close-comment-section" style="display:none;margin-bottom:12px;">' +
        '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario antes de cerrar (opcional)</label>' +
        '<textarea id="sp-take-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;" placeholder="Comentario de cierre..."></textarea>' +
      '</div>' +
      '<div id="sp-take-migrate-section" style="display:none;margin-bottom:12px;">' +
        '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Migrar a Monday</label>' +
        '<select id="sp-take-group" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' + groupOpts + '</select>' +
      '</div>' +
      '<div id="sp-take-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-take-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">✊ Tomar ticket</button>' +
        '<button id="sp-take-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
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

    doneCheck.addEventListener("change", function() {
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
    takeGroupSelect.addEventListener("change", function() {
      if (doneCheck.checked && takeGroupSelect.value) {
        confirmBtn.textContent = "Tomar, cerrar y migrar";
      } else if (doneCheck.checked) {
        confirmBtn.textContent = "Tomar y cerrar";
      }
    });

    cancelBtn.addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    confirmBtn.addEventListener("click", async function() {
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
              body: JSON.stringify({ nextTicketStatusId: 9, ticketCommentRequest: null }),
            });
            if (!closeRes.ok) throw new Error("Error al cerrar: HTTP " + closeRes.status);

            // Migrate if group selected and ticket matches board period
            var selectedGroup = takeGroupSelect.value;
            var canMigrateTake = selectedGroup ? await canMigrateTicket(info.createdAt) : false;
            if (selectedGroup && !canMigrateTake) {
              showErrorToast("Ticket tomado y cerrado, pero NO migrado: no corresponde al mes del board.");
            }
            if (selectedGroup && canMigrateTake && mondayToken && boardId) {
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
            setTimeout(function() { window.location.reload(); }, 1500);
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
    btn.addEventListener("mouseenter", function() { if (!btn.disabled) btn.textContent = "💀 Robar"; });
    btn.addEventListener("mouseleave", function() { if (!btn.disabled) btn.textContent = "🥷 Robar"; });
    btn.addEventListener("click", async function(e) {
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
    btn.addEventListener("mouseenter", function() { if (!btn.disabled) btn.textContent = "🔐 Cerrar"; });
    btn.addEventListener("mouseleave", function() { if (!btn.disabled) btn.textContent = "🔒 Cerrar"; });
    btn.addEventListener("click", async function(e) {
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
      (mondayToken && boardId) ? mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { name groups { id title } } }', { boardId }).catch(function() { return null; }) : Promise.resolve(null)
    ]);
    var summaryHTML = ticketSummaryHTML(info);
    var groups = groupsData?.boards?.[0]?.groups || [];
    var groupOpts = '<option value="">-- Selecciona destino --</option>' + groups.map(function(g) { return '<option value="' + g.id + '">' + g.title + '</option>'; }).join("");

    var overlay = document.createElement("div");
    overlay.id = "sp-close-modal-single";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">🔒 Cerrar ticket #' + ticketId + '</h3>' +
      summaryHTML +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario (opcional)</label>' +
      '<textarea id="sp-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe un comentario..."></textarea>' +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Migrar a Monday <span style="color:#D94040;">*</span></label>' +
      '<select id="sp-close-group" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;font-size:13px;">' + groupOpts + '</select>' +
      '<div id="sp-close-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar ticket</button>' +
        '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
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
    groupSelect.addEventListener("change", function() {
      if (groupSelect.value) {
        confirmBtn.innerHTML = "🔐 Cerrar y migrar";
      } else {
        confirmBtn.innerHTML = "🔐 Cerrar ticket";
      }
    });

    cancelBtn.addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    confirmBtn.addEventListener("click", async function() {
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

        // Step 2: Close ticket
        var res = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
          body: JSON.stringify({ nextTicketStatusId: 9, ticketCommentRequest: null }),
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
          var closeOverlay = document.createElement("div");
          closeOverlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
          closeOverlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:360px;width:90%;font-family:system-ui;text-align:center;">' +
            '<h3 style="margin:0 0 12px;">✅ Ticket cerrado</h3>' +
            '<p style="font-size:13px;color:#555;margin:0 0 16px;">' + (selectedGroup ? 'El ticket fue cerrado y migrado a Monday.' : 'El ticket fue cerrado correctamente.') + '</p>' +
            '<div style="display:flex;gap:8px;">' +
              '<button id="sp-close-tab" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Cerrar pestaña</button>' +
              '<button id="sp-stay-tab" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Quedarme</button>' +
            '</div></div>';
          document.body.appendChild(closeOverlay);
          document.getElementById("sp-close-tab").addEventListener("click", function() { window.close(); });
          document.getElementById("sp-stay-tab").addEventListener("click", function() { closeOverlay.remove(); window.location.reload(); });
        }
      } catch (err) {
        showErrorToast("Error: " + err.message);
        originalBtn.textContent = "🔒 Cerrar";
        originalBtn.disabled = false;
      }
    });
  }

  function getAssignedRows() {
    const rows = [];
    document.querySelectorAll(".MuiDataGrid-row").forEach(function(row) {
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
    var ticketRows = assigned.map(function(p, i) {
      var label = p.code + (p.subject ? " - " + p.subject.substring(0, 35) + (p.subject.length > 35 ? "..." : "") : "");
      var resp = p.responsible ? ' <span style="color:#888;font-size:10px;">(' + p.responsible + ')</span>' : "";
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;">' +
        '<input type="checkbox" data-idx="' + i + '" class="sp-close-check" style="cursor:pointer;">' +
        '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + label + resp + '</span>' +
        '</div>';
    }).join("");

    restoreCloseBtn();

    var overlay = document.createElement("div");
    overlay.id = "sp-close-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:560px;width:90%;max-height:85vh;display:flex;flex-direction:column;font-family:system-ui;">' +
      '<h3 style="margin:0 0 8px;">🔒 Cerrar tickets (' + assigned.length + ' asignados)</h3>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
        '<label style="font-size:12px;color:#555;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="sp-close-all"> Seleccionar todos</label>' +
      '</div>' +
      '<div style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px;">' + ticketRows + '</div>' +
      '<div id="sp-close-msg" style="font-size:13px;margin-bottom:8px;min-height:20px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-close-start" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar seleccionados</button>' +
        '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    // Select all toggle
    document.getElementById("sp-close-all").addEventListener("change", function() {
      var checked = this.checked;
      overlay.querySelectorAll(".sp-close-check").forEach(function(cb) { cb.checked = checked; });
    });

    var startBtn = document.getElementById("sp-close-start");
    var cancelBtn = document.getElementById("sp-close-cancel");
    var msg = document.getElementById("sp-close-msg");

    cancelBtn.addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    startBtn.addEventListener("click", async function() {
      var selected = [];
      overlay.querySelectorAll(".sp-close-check").forEach(function(cb) {
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
              nextTicketStatusId: 9,
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
      cancelBtn.addEventListener("click", function() { overlay.remove(); });
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
    btn.addEventListener("mouseenter", function() { if (!btn.disabled) btn.textContent = "🔐 Cerrar varios"; });
    btn.addEventListener("mouseleave", function() { if (!btn.disabled) btn.textContent = "🔒 Cerrar varios"; });
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
    btn.addEventListener("click", function() {
      window.location.href = "/es/dashboard/tickets/nuevo";
    });
    parent.insertBefore(btn, bulkMigrateBtn);
  }

  // --- Custom search ---
  const SEARCH_BTN_ID = "sp-search-btn";
  const SP_SEARCH_API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
  var activeModalRefresh = null;

  function injectSearchButton() {
    if (document.getElementById(SEARCH_BTN_ID)) return;
    var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
    if (!userWrapper) return;

    var btn = document.createElement("button");
    btn.id = SEARCH_BTN_ID;
    btn.textContent = "🔍 Buscar";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#7B1FA2;color:#fff;font-weight:600;white-space:nowrap;margin-right:12px;";
    btn.addEventListener("click", showSearchModal);
    userWrapper.parentElement.insertBefore(btn, userWrapper);
  }

  const DASHBOARD_BTN_ID = "sp-dashboard-btn";

  const DASHBOARD_CACHE_KEY = "sp_dashboard_cache";

  function loadDashboardCache() {
    try {
      var raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function saveDashboardCache(data, from, to) {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ data: data, from: from, to: to, ts: Date.now() }));
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
  var dashboardData = cached ? cached.data : null;
  var dashboardFrom = cached ? cached.from : "";
  var dashboardTo = cached ? cached.to : "";

  function injectDashboardButton() {
    if (document.getElementById(DASHBOARD_BTN_ID)) return;
    var searchBtn = document.getElementById(SEARCH_BTN_ID);
    if (!searchBtn) return;

    if (!dashboardFrom || !dashboardTo) {
      var now = new Date();
      dashboardFrom = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01T00:00";
      dashboardTo = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + "T23:59";
    }

    var btn = document.createElement("button");
    btn.id = DASHBOARD_BTN_ID;
    btn.textContent = dashboardData ? "📊 Ver dashboard" : "📊 Dashboard";
    btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#00796B;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("click", handleDashboardClick);
    searchBtn.parentElement.insertBefore(btn, searchBtn);

    var sep = document.createElement("span");
    sep.style.cssText = "color:rgba(255,255,255,0.4);font-size:16px;margin-right:8px;";
    sep.textContent = "|";
    searchBtn.parentElement.insertBefore(sep, searchBtn);
  }

  async function handleDashboardClick() {
    var btn = document.getElementById(DASHBOARD_BTN_ID);
    if (!btn) return;

    // If data already loaded, show modal directly
    if (dashboardData) {
      showDashboardModal();
      return;
    }

    // Load data in background
    btn.disabled = true;
    btn.textContent = "⏳ Creando dashboard...";
    btn.style.background = "#999";
    showSuccessToast("📊 Generando dashboard, esto puede tardar un momento. Puedes seguir trabajando mientras tanto.");

    var spToken = getToken();
    if (!spToken) { showErrorToast("No hay token"); btn.textContent = "📊 Dashboard"; btn.style.background = "#00796B"; btn.disabled = false; return; }

    var allTickets = [];
    var page = 0;
    try {
      while (true) {
        var url = "https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=" + page + "&size=100&resolutionGroupId=" + getTeamConfig().resolutionGroupId;
        if (dashboardFrom) url += "&initDate=" + dashboardFrom;
        if (dashboardTo) url += "&endDate=" + dashboardTo;
        var res = await fetch(url, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        var data = json.data || json;
        var tickets = data.content || [];
        tickets.forEach(function(t) { if (t.ticketStatusName === "Cerrado") allTickets.push(t); });
        btn.textContent = "⏳ Cargando... " + allTickets.length + " tickets";
        if (page >= (data.totalPages || 1) - 1) break;
        page++;
      }
    } catch (err) {
      showErrorToast("Error: " + err.message);
      btn.textContent = "📊 Dashboard";
      btn.style.background = "#00796B";
      btn.disabled = false;
      return;
    }

    dashboardData = allTickets;
    saveDashboardCache(allTickets, dashboardFrom, dashboardTo);
    btn.textContent = "📊 Ver dashboard";
    btn.style.background = "#00796B";
    btn.disabled = false;
    showSuccessToast("Dashboard listo: " + allTickets.length + " tickets cerrados");
  }

  function buildDashboardChart(allTickets) {
    if (!allTickets.length) return '<div style="text-align:center;padding:40px;color:#888;">Sin tickets cerrados en este periodo</div>';

    var counts = {};
    allTickets.forEach(function(t) {
      var name = t.responsibleName || "Sin asignar";
      counts[name] = (counts[name] || 0) + 1;
    });
    var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
    var maxCount = sorted[0][1];
    var colors = ["#1976D2", "#2E7D32", "#D94040", "#7B1FA2", "#E65100", "#00796B", "#C2185B", "#F57F17", "#283593", "#5D4037"];

    var html = '<div style="margin-bottom:12px;font-size:13px;color:#888;">Total: <b>' + allTickets.length + '</b> tickets cerrados</div>';
    sorted.forEach(function(entry, i) {
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

    var overlay = document.createElement("div");
    overlay.id = "sp-dashboard-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:700px;width:95%;max-height:90vh;display:flex;flex-direction:column;font-family:system-ui;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;">📊 Tickets cerrados por analista</h3>' +
        '<button id="sp-dash-close" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cerrar</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">' +
        '<label style="font-size:12px;">Desde:</label>' +
        '<input id="sp-dash-from" type="datetime-local" value="' + dashboardFrom + '" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
        '<label style="font-size:12px;">Hasta:</label>' +
        '<input id="sp-dash-to" type="datetime-local" value="' + dashboardTo + '" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">' +
        '<button id="sp-dash-refresh" style="padding:5px 14px;font-size:12px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-weight:600;">Regenerar</button>' +
      '</div>' +
      '<div id="sp-dash-results" style="flex:1;overflow:auto;min-height:200px;"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-dash-results").innerHTML = buildDashboardChart(dashboardData || []);

    document.getElementById("sp-dash-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    document.getElementById("sp-dash-refresh").addEventListener("click", function() {
      dashboardFrom = document.getElementById("sp-dash-from").value;
      dashboardTo = document.getElementById("sp-dash-to").value;
      dashboardData = null;
      clearDashboardCache();
      overlay.remove();
      var btn = document.getElementById(DASHBOARD_BTN_ID);
      if (btn) btn.textContent = "📊 Dashboard";
      handleDashboardClick();
    });
  }

  // --- Report Excel ---
  const REPORT_BTN_ID = "sp-report-btn";
  var reportGenerating = false;

  function injectReportButton() {
    if (document.getElementById(REPORT_BTN_ID)) return;
    var dashBtn = document.getElementById(DASHBOARD_BTN_ID);
    if (!dashBtn) return;

    var btn = document.createElement("button");
    btn.id = REPORT_BTN_ID;
    btn.textContent = "📥 Reporte Excel";
    btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1565C0;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("click", handleReportClick);
    dashBtn.parentElement.insertBefore(btn, dashBtn.nextSibling);
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

      sheetNames.forEach(function(name) {
        var tickets = workbookData[name];
        var rows = tickets.map(function(t) {
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

      var totalTickets = Object.values(workbookData).reduce(function(sum, arr) { return sum + arr.length; }, 0);
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
    return new Promise(function(resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js";
      script.onload = function() { sheetJSLoaded = true; resolve(); };
      script.onerror = function() { reject(new Error("No se pudo cargar SheetJS")); };
      document.head.appendChild(script);
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
        var res = await fetch(SP_SEARCH_API + "?uniqueCode=" + encodeURIComponent(val) + "&resolutionGroupId=" + getTeamConfig().resolutionGroupId + "&page=0&size=1", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        var tickets = (json.data || json).content || [];
        if (tickets.length > 0) {
          window.open("/es/dashboard/tickets/" + tickets[0].id, "_blank");
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
    input.addEventListener("keydown", function(e) { if (e.key === "Enter") doQuickSearch(); });

    wrapper.appendChild(input);
    wrapper.appendChild(goBtn);
    parent.insertBefore(wrapper, userWrapper);
  }

  const QUICK_FILTER_ID = "sp-quick-filter";
  const QUICK_FILTER_ASSIGNED_ID = "sp-quick-filter-assigned";
  const QUICK_FILTER_ATTENTION_ID = "sp-quick-filter-attention";
  const QUICK_FILTER_MYCREATED_ID = "sp-quick-filter-mycreated";
  const QUICK_FILTER_MYASSIGNED_ID = "sp-quick-filter-myassigned";
  const QUICK_FILTER_MYPENDING_ID = "sp-quick-filter-mypending";

  async function showMyAssignedModal() {
    showQuickFilterModal("", "", "👤 Mis tickets asignados", "https://macropayapi.supportplus.mx/tickets/search-by-user-current-responsible");
  }

  function injectQuickFilterButton() {
    var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
    if (!userWrapper) return;
    var parent = userWrapper.parentElement;

    if (!document.getElementById(QUICK_FILTER_ID)) {
      var btn = document.createElement("button");
      btn.id = QUICK_FILTER_ID;
      btn.textContent = "⏳ En espera";
      btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#FF8F00;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
      btn.addEventListener("click", function() { showQuickFilterModal("En espera"); });
      parent.insertBefore(btn, userWrapper);
    }

    if (!document.getElementById(QUICK_FILTER_ASSIGNED_ID)) {
      var btn2 = document.createElement("button");
      btn2.id = QUICK_FILTER_ASSIGNED_ID;
      btn2.textContent = "📌 Asignados";
      btn2.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
      btn2.addEventListener("click", function() { showQuickFilterModal("Asignado"); });
      parent.insertBefore(btn2, userWrapper);
    }

    if (!document.getElementById(QUICK_FILTER_ATTENTION_ID)) {
      var btn3 = document.createElement("button");
      btn3.id = QUICK_FILTER_ATTENTION_ID;
      btn3.textContent = "🔔 En atención";
      btn3.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#E65100;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
      btn3.addEventListener("click", function() { showQuickFilterModal("En atención"); });
      parent.insertBefore(btn3, userWrapper);
    }

    if (!document.getElementById("sp-filter-separator") && !document.getElementById(QUICK_FILTER_MYASSIGNED_ID)) {
      var sep = document.createElement("span");
      sep.id = "sp-filter-separator";
      sep.textContent = "|";
      sep.style.cssText = "color:rgba(255,255,255,0.4);font-size:16px;margin-right:8px;";
      parent.insertBefore(sep, userWrapper);
    }

    if (!document.getElementById(QUICK_FILTER_MYASSIGNED_ID)) {
      var myName = getLoggedUserName();
      if (myName) {
        var btn4 = document.createElement("button");
        btn4.id = QUICK_FILTER_MYASSIGNED_ID;
        btn4.textContent = "👤 Mis asignados";
        btn4.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#2E7D32;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
        btn4.addEventListener("click", function() { showMyAssignedModal(); });
        parent.insertBefore(btn4, userWrapper);
      }
    }

    if (!document.getElementById(QUICK_FILTER_MYCREATED_ID)) {
      var myName2 = getLoggedUserName();
      if (myName2) {
        var btn5 = document.createElement("button");
        btn5.id = QUICK_FILTER_MYCREATED_ID;
        btn5.textContent = "📝 Mis creados";
        btn5.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#7B1FA2;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
        btn5.addEventListener("click", function() { showQuickFilterModal("", "", "📝 Tickets que yo creé", "https://macropayapi.supportplus.mx/tickets/search-by-user-requester"); });
        parent.insertBefore(btn5, userWrapper);
      }
    }

    if (!document.getElementById(QUICK_FILTER_MYPENDING_ID)) {
      var btn6 = document.createElement("button");
      btn6.id = QUICK_FILTER_MYPENDING_ID;
      btn6.textContent = "📋 Mis pendientes";
      btn6.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#D94040;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
      btn6.addEventListener("click", function() { showQuickFilterModal("Asignado", "", "📋 Mis pendientes", "https://macropayapi.supportplus.mx/tickets/search-by-user-current-responsible"); });
      parent.insertBefore(btn6, userWrapper);
    }
  }

  async function showQuickFilterModal(statusName, extraParams, title, customApiUrl) {
    var existing = document.getElementById("sp-search-modal");
    if (existing) existing.remove();

    var modalTitle = title || ("Tickets: " + statusName);

    var overlay = document.createElement("div");
    overlay.id = "sp-search-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:900px;width:95%;max-height:90vh;display:flex;flex-direction:column;font-family:system-ui;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="margin:0;">' + modalTitle + '</h3>' +
        '<div style="display:flex;gap:8px;"><button id="sp-qf-refresh" style="padding:6px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:13px;">🔄 Actualizar</button><button id="sp-qf-close" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cerrar</button></div>' +
      '</div>' +
      '<div id="sp-qf-results" style="flex:1;overflow:auto;min-height:100px;"><div style="text-align:center;padding:20px;color:#888;">Buscando...</div></div>' +
      '<div id="sp-qf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-qf-refresh").addEventListener("click", function() { if (activeModalRefresh) activeModalRefresh(); });
    document.getElementById("sp-qf-close").addEventListener("click", function() { activeModalRefresh = null; overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) { activeModalRefresh = null; overlay.remove(); } });

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
            ? '🎉 ¡Sin tickets pendientes! Ponte a jalar que no te pagan por estar de florero 🌵'
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
        if (prev) prev.addEventListener("click", function() { if (currentPage > 1) { currentPage--; doQuickSearch(); } });
        if (next) next.addEventListener("click", function() { if (currentPage < totalPages) { currentPage++; doQuickSearch(); } });
      } catch (err) {
        results.innerHTML = '<div style="color:#D94040;padding:12px;">Error: ' + err.message + '</div>';
      }
    }
  }

  function showSearchModal() {
    var existing = document.getElementById("sp-search-modal");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "sp-search-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";

    var statusOpts = '<option value="">Todos</option><option value="Asignado">Asignado</option><option value="En espera">En espera</option><option value="En atención">En atención</option><option value="En validación">En validación</option><option value="Por confirmar">Por confirmar</option><option value="Por ejecutar">Por ejecutar</option><option value="Por revisar">Por revisar</option><option value="En aplicaciones">En aplicaciones</option><option value="Cerrado">Cerrado</option><option value="Rechazado">Rechazado</option><option value="Cancelado">Cancelado</option><option value="Reabierto">Reabierto</option>';
    var typeOpts = '<option value="">Todos</option><option value="5">Solicitud</option><option value="6">Incidente</option>';
    var priorityOpts = '<option value="">Todas</option><option value="6">Critico</option><option value="7">Alto</option><option value="8">Medio</option><option value="9">Bajo</option>';

    var inputStyle = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;';

    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:900px;width:95%;max-height:90vh;display:flex;flex-direction:column;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">🔍 Buscar tickets</h3>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
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
        '<button id="sp-sf-close" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cerrar</button>' +
      '</div>' +
      '<div id="sp-sf-results" style="flex:1;overflow:auto;min-height:100px;"></div>' +
      '<div id="sp-sf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-sf-refresh").addEventListener("click", function() { if (activeModalRefresh) activeModalRefresh(); });
    document.getElementById("sp-sf-close").addEventListener("click", function() { activeModalRefresh = null; overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) { activeModalRefresh = null; overlay.remove(); } });

    var currentPage = 1;
    document.getElementById("sp-sf-search").addEventListener("click", function() { currentPage = 1; activeModalRefresh = doSearch; doSearch(); });

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
        if (prev) prev.addEventListener("click", function() { if (currentPage > 1) { currentPage--; doSearch(); } });
        if (next) next.addEventListener("click", function() { if (currentPage < totalPages) { currentPage++; doSearch(); } });

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
    } catch(e) {}
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

  function makeWaitingRowsDraggable() {
    document.querySelectorAll(".MuiDataGrid-row").forEach(function(row) {
      var ticketId = row.getAttribute("data-id");
      if (!ticketId) return;
      var statusCell = row.querySelector('[data-field="ticketStatusName"]');
      if (!statusCell || statusCell.textContent.trim() !== "En espera") return;
      var folioEl = row.querySelector('[data-field="uniqueCode"] p.MuiTypography-body1');
      if (!folioEl || folioEl.getAttribute("draggable") === "true") return;

      folioEl.setAttribute("draggable", "true");
      folioEl.style.cursor = "grab";
      folioEl.addEventListener("dragstart", function(e) {
        e.dataTransfer.setData("text/plain", ticketId);
        e.dataTransfer.effectAllowed = "move";
        row.style.opacity = "0.4";
      });
      folioEl.addEventListener("dragend", function() {
        row.style.opacity = "1";
      });
    });
  }

  async function injectButtons() {
    const synced = await ensureSyncStarted();
    var boardDate = await getBoardDate();

    // Header buttons - always inject regardless of view
    injectSearchButton();
    injectDashboardButton();
    injectReportButton();
    injectQuickSearch();
    injectQuickFilterButton();

    if (isDetailView()) {
      injectDetailButton();
      injectIamButton();
      injectDetailDetections();
      injectReassignAppButton();
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

      // Inject copy button if not present
      if (!row.querySelector(".sp-copy-btn")) {
        const codeEl = firstCell.querySelector("p.MuiTypography-body1");
        const codeText = codeEl ? codeEl.textContent.trim() : "";
        if (codeText) container.appendChild(createCopyButton(codeText));
      }

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

      // Inject take button for "En espera" tickets
      var rowGroupCell = row.querySelector('[data-field="resolutionGroupName"]');
      var rowGroupName = rowGroupCell ? rowGroupCell.textContent.trim() : "";
      var rowBelongsToMe = !rowGroupName || rowGroupName === getTeamConfig().resolutionGroupLabel || isGerente();

      if (statusText === "En espera" && !row.querySelector("." + TAKE_BTN_CLASS) && rowBelongsToMe) {
        container.appendChild(createTakeButton(ticketId));
      }

      // Inject steal button for "Asignado"/"En atención" tickets not assigned to me
      if ((statusText === "Asignado" || statusText === "En atención") && !row.querySelector("." + STEAL_BTN_CLASS) && rowBelongsToMe) {
        const responsibleCell = row.querySelector('[data-field="responsibleName"]');
        const responsibleName = responsibleCell ? responsibleCell.textContent.trim() : "";
        const myName = getLoggedUserName();
        if (responsibleName && myName && responsibleName !== myName) {
          container.appendChild(createStealButton(ticketId, responsibleName));
        }
      }

      // Inject close button for "Asignado"/"En atención" tickets assigned to me
      if ((statusText === "Asignado" || statusText === "En atención") && !row.querySelector("." + CLOSE_BTN_CLASS) && rowBelongsToMe) {
        const responsibleCell2 = row.querySelector('[data-field="responsibleName"]');
        const responsibleName2 = responsibleCell2 ? responsibleCell2.textContent.trim() : "";
        const myName2 = getLoggedUserName();
        if (responsibleName2 && myName2 && responsibleName2 === myName2) {
          container.appendChild(createCloseButton(ticketId));
        }
      }

      // Clean up close button if status changed
      if (statusText !== "Asignado" && statusText !== "En atención") {
        const oldClose = row.querySelector("." + CLOSE_BTN_CLASS);
        if (oldClose) oldClose.remove();
      }

      // Inject migrate buttons for "Cerrado" tickets
      if (statusText === "Cerrado" && rowBelongsToMe) {
        if (row.querySelector("." + BTN_CLASS) || row.querySelector("." + SYNCED_CLASS)) return;
        const codeEl = firstCell.querySelector("p.MuiTypography-body1");
        const uniqueCode = codeEl ? codeEl.textContent.trim() : "";
        if (uniqueCode && synced[uniqueCode]) {
          container.appendChild(createSyncedBadge(synced[uniqueCode]));
        } else {
          // Only show migrate button if ticket matches board period
          var dateCell = row.querySelector('[data-field="createdAt"]');
          var dateText = dateCell ? dateCell.textContent.trim() : "";
          if (ticketMatchesBoard(dateText, boardDate)) {
            container.appendChild(createButton(ticketId));
          }
        }
      }
    });
    highlightMyRows();
    colorRowsByStatus();
    makeWaitingRowsDraggable();
    injectBulkButton();
    injectBulkCloseButton();
    injectNewTicketButton();
    loadTeamPanel();
  }

  // --- Handle single click ---
  async function handleMondayClick(ticketId) {
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
    showMondayModal(ticketData, ticketId, boardData, mondayToken, meId);
  }

  // --- Single modal ---
  function showMondayModal(ticket, ticketId, boards, mondayToken, meId) {
    const existing = document.getElementById("sp-monday-modal");
    if (existing) existing.remove();

    const url = `${BASE_URL}/${ticketId}`;
    const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
    const groupId = ticket.service ? resolveGroup(ticket.service) : GROUP_MAP.SS;
    const groupLabel = GROUP_LABELS[groupId] || groupId;
    const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
    const holderName = ticket.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar";

    // Determine if ticket is from another area - show person selector
    const ticketGroupId = ticket.resolutionGroup?.id || null;
    const myAreaConfig = getTeamConfig();
    const isOtherArea = ticketGroupId && ticketGroupId !== myAreaConfig.resolutionGroupId;
    var personSelectHTML = "";
    if (isOtherArea) {
      var personOpts = '<option value="">-- Mantener: ' + holderName + ' --</option>';
      myAreaConfig.profiles.forEach(function(p) {
        personOpts += '<option value="' + p.profileId + '">' + p.profileFullName + '</option>';
      });
      personSelectHTML = '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Persona asignada en Monday</label>' +
        '<select id="sp-person-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">' + personOpts + '</select>';
    }

    // Resolve board by ticket createdAt
    const createdDate = new Date(ticket.createdAt);

    const overlay = document.createElement("div");
    overlay.id = "sp-monday-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";

    overlay.innerHTML = `
      <div style="background:#fff;padding:24px;border-radius:12px;max-width:520px;width:90%;max-height:85vh;overflow:auto;font-family:system-ui;">
        <h3 style="margin:0 0 16px;">📤 Migrar Ticket a Monday</h3>
        <div style="background:#f5f5f5;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">
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
        </div>
      </div>`;

    document.body.appendChild(overlay);
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

      // Validations passed - close modal and show loading toast
      const modal = document.getElementById("sp-monday-modal"); if (modal) modal.remove();
      showLoadingToast("Migrando a Monday...");

      const groupId = document.getElementById("sp-group-select")?.value || "";
      const itemName = ticket.subject || "Sin asunto";
      const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
      const spPriority = (ticket.incidentPriorityName || ticket.incidentPriority?.name || "").toLowerCase().trim();
      const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];

      let personValue = {};
      // If a person was selected from the dropdown (other area ticket), use their email
      var selectedPersonId = document.getElementById("sp-person-select")?.value || "";
      if (selectedPersonId) {
        // Find the profile name and try to match email in Monday
        var selectedProfile = null;
        Object.values(TEAM_AREAS).forEach(function(area) {
          area.profiles.forEach(function(p) { if (String(p.profileId) === selectedPersonId) selectedProfile = p; });
        });
        if (selectedProfile) {
          try {
            const users = await getMondayUsers(mondayToken);
            // Try to find by partial name match in Monday users
            var foundUserId = null;
            var nameParts = selectedProfile.profileFullName.toLowerCase().split(" ");
            Object.entries(users).forEach(function(entry) {
              if (foundUserId) return;
              var email = entry[0];
              if (nameParts.some(function(part) { return part.length > 3 && email.includes(part); })) {
                foundUserId = entry[1];
              }
            });
            if (foundUserId) personValue = { personsAndTeams: [{ id: parseInt(foundUserId), kind: "person" }] };
          } catch (e) {}
        }
      } else {
        const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
        if (holderEmail) {
          try {
            const users = await getMondayUsers(mondayToken);
            const userId = users[holderEmail.toLowerCase()];
            if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
          } catch (e) {}
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
        const result = await mondayQuery(mondayToken,
          `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
            create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
          }`,
          { boardId, groupId, itemName, columnValues }
        );
        const newItemId = result.create_item.id;
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
        if (isDetailView()) {
          var migrateOverlay = document.createElement("div");
          migrateOverlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
          migrateOverlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:360px;width:90%;font-family:system-ui;text-align:center;">' +
            '<h3 style="margin:0 0 12px;">✅ Ticket migrado a Monday</h3>' +
            '<p style="font-size:13px;color:#555;margin:0 0 16px;">El ticket fue migrado correctamente.</p>' +
            '<div style="display:flex;gap:8px;">' +
              '<button id="sp-migrate-close-tab" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Cerrar pestaña</button>' +
              '<button id="sp-migrate-stay-tab" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Quedarme</button>' +
            '</div></div>';
          document.body.appendChild(migrateOverlay);
          document.getElementById("sp-migrate-close-tab").addEventListener("click", function() { window.close(); });
          document.getElementById("sp-migrate-stay-tab").addEventListener("click", function() { migrateOverlay.remove(); });
        }
      } catch (err) {
        showErrorToast("Error: " + err.message);
      }
    });

    document.getElementById("sp-monday-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // --- Observer ---
  let injectTimeout;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(injectButtons, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  loadTeamArea().then(function() {
    ensureSyncStarted().then(() => injectButtons());
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
  setInterval(function() {
    if (!isDetailView()) refreshTeamPanel();
  }, 60000);
})();
