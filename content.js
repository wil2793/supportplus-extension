(function () {
  // Make loading backdrop less invasive - thin top bar instead of fullscreen
  const hideBackdrop = document.createElement("style");
  hideBackdrop.textContent = ".MuiBackdrop-root { background: transparent !important; top: 0 !important; bottom: auto !important; height: 3px !important; opacity: 1 !important; } .MuiBackdrop-root .MuiCircularProgress-root { display: none !important; } .MuiBackdrop-root::after { content: ''; position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: #D94040; animation: sp-loading-bar 1.2s ease-in-out infinite; } @keyframes sp-loading-bar { 0% { left: -30%; } 100% { left: 100%; } }";
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
    if (document.getElementById(DETAIL_BTN_ID)) return;
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
      isAssigned = ticket.ticketStatus?.name === "Asignado";
      holderName = ticket.ticketHolder?.ticketHolderLog?.fullName || "";
      console.log("[SP Monday] Detail ticket status:", ticket.ticketStatus?.name, "| type:", ticket.ticketStatus?.type?.name, "| closed:", isClosed, "| waiting:", isWaiting, "| assigned:", isAssigned, "| holder:", holderName);
    } catch (e) { return; }

    const synced = await ensureSyncStarted();
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
    } else if (isWaiting) {
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
    } else if (isAssigned) {
      const myName = getLoggedUserName();
      if (holderName && myName && holderName !== myName) {
        const stealBtn = document.createElement("button");
        stealBtn.id = DETAIL_BTN_ID;
        stealBtn.textContent = "🥷 Robar ticket";
        stealBtn.style.cssText =
          "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#E65100;color:#fff;font-weight:600;white-space:nowrap;";
        stealBtn.addEventListener("mouseenter", () => { if (!stealBtn.disabled) stealBtn.textContent = "💀 Robar ticket"; });
        stealBtn.addEventListener("mouseleave", () => { if (!stealBtn.disabled) stealBtn.textContent = "🥷 Robar ticket"; });
        stealBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          showTakeModal(ticketId, stealBtn);
        });
        const chip4 = container.querySelector(".MuiChip-root");
        container.insertBefore(stealBtn, chip4);
      }
    }
    } finally { detailLoading = false; }
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

  function colorRowsByStatus() {
    document.querySelectorAll(".MuiDataGrid-row").forEach(function(row) {
      if (row.dataset.spColored) return;
      var statusCell = row.querySelector('[data-field="ticketStatusName"]');
      if (!statusCell) return;
      var status = statusCell.textContent.trim();
      var color = STATUS_COLORS[status];
      if (color) {
        row.style.backgroundColor = color;
        row.dataset.spColored = "1";
      }
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
      const res = await fetch(SP_API.replace("/tickets/web", "") + "/tickets/web/active-profiles-by-resolution-group/19", {
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
        priority: t.incidentPriority?.name || ""
      };
    } catch (e) { return null; }
  }

  function ticketSummaryHTML(info) {
    if (!info) return "";
    return '<div style="background:#f5f5f5;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px;">' +
      '<div><b>Folio:</b> ' + info.uniqueCode + '</div>' +
      '<div><b>Asunto:</b> ' + info.subject + '</div>' +
      '<div><b>Persona:</b> ' + info.holder + (info.holderEmail ? ' (' + info.holderEmail + ')' : '') + '</div>' +
      '<div><b>Prioridad:</b> ' + info.priority + '</div>' +
      (info.desc ? '<div style="margin-top:4px;max-height:60px;overflow:auto;"><b>Desc:</b> ' + info.desc + '</div>' : '') +
      '</div>';
  }

  async function showTakeModal(ticketId, originalBtn) {
    var existing = document.getElementById("sp-take-modal");
    if (existing) existing.remove();

    // Fetch info first
    var info = await fetchTicketInfo(ticketId);
    var summaryHTML = ticketSummaryHTML(info);

    var overlay = document.createElement("div");
    overlay.id = "sp-take-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">🤚 Tomar ticket #' + ticketId + '</h3>' +
      summaryHTML +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario (opcional)</label>' +
      '<textarea id="sp-take-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:80px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe un comentario..."></textarea>' +
      '<div id="sp-take-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-take-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">✊ Tomar ticket</button>' +
        '<button id="sp-take-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

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

    cancelBtn.addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    confirmBtn.addEventListener("click", async function() {
      var comment = document.getElementById("sp-take-comment").value.trim();
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
          resolutionGroupId: 19,
          serviceId: null,
          responsibleProfileId: profileId,
          resolutionGroup: { label: "Infraestructura DBA", value: 19 }
        };
        if (comment) body.ticketCommentRequest = { internal: false, content: comment };
        var res = await fetch(SP_API + "/reassign/" + ticketId, {
          method: "PUT",
          headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        if (json.success) {
          var newCloseBtn = createCloseButton(ticketId);
          originalBtn.replaceWith(newCloseBtn);
          var row = newCloseBtn.closest(".MuiDataGrid-row");
          if (row) {
            row.classList.add(HIGHLIGHT_CLASS);
            row.style.position = "relative";
            var indicator = document.createElement("span");
            indicator.textContent = "❗";
            indicator.style.cssText = "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
            row.appendChild(indicator);
            var statusCell = row.querySelector('[data-field="ticketStatusName"]');
            if (statusCell) statusCell.textContent = "Asignado";
          }
          showSuccessToast("Ticket tomado");
          if (isDetailView()) {
            setTimeout(function() { window.location.reload(); }, 1500);
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

  function createStealButton(ticketId) {
    const btn = document.createElement("button");
    btn.className = STEAL_BTN_CLASS;
    btn.textContent = "🥷 Robar";
    btn.title = "Robar ticket";
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
    var groupOpts = '<option value="">-- No migrar --</option>' + groups.map(function(g) { return '<option value="' + g.id + '">' + g.title + '</option>'; }).join("");

    var overlay = document.createElement("div");
    overlay.id = "sp-close-modal-single";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">🔒 Cerrar ticket #' + ticketId + '</h3>' +
      summaryHTML +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Migrar a Monday (opcional)</label>' +
      '<select id="sp-close-group" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;font-size:13px;">' + groupOpts + '</select>' +
      '<div id="sp-close-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar ticket</button>' +
        '<button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

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
      overlay.remove();
      originalBtn.disabled = true;
      originalBtn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
      showLoadingToast(selectedGroup ? "Cerrando y migrando..." : "Cerrando ticket...");

      var spToken = getToken();
      try {
        var res = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
          body: JSON.stringify({ nextTicketStatusId: 9, ticketCommentRequest: null }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);

        if (selectedGroup && mondayToken && boardId && info) {
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
        '<button id="sp-sf-close" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cerrar</button>' +
      '</div>' +
      '<div id="sp-sf-results" style="flex:1;overflow:auto;min-height:100px;"></div>' +
      '<div id="sp-sf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-sf-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    var currentPage = 1;
    document.getElementById("sp-sf-search").addEventListener("click", function() { currentPage = 1; doSearch(); });

    async function doSearch() {
      var results = document.getElementById("sp-sf-results");
      var paging = document.getElementById("sp-sf-paging");
      results.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
      paging.innerHTML = "";

      var spToken = getToken();
      if (!spToken) { results.innerHTML = '<div style="color:#D94040;padding:12px;">No hay token de SupportPlus</div>'; return; }

      var params = "page=" + (currentPage - 1) + "&size=25&resolutionGroupId=19";
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

        var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<thead><tr style="background:rgba(0,0,0,0.05);text-align:left;">' +
          '<th style="padding:6px;">Folio</th>' +
          '<th style="padding:6px;">Fecha</th>' +
          '<th style="padding:6px;">Solicitante</th>' +
          '<th style="padding:6px;">Asunto</th>' +
          '<th style="padding:6px;">Estado</th>' +
          '<th style="padding:6px;">Analista</th>' +
          '<th style="padding:6px;"></th>' +
          '</tr></thead><tbody>';

        tickets.forEach(function(t) {
          var statusColor = STATUS_COLORS[t.ticketStatusName] || "transparent";
          var date = (t.createdAt || "").replace("T", " ").substring(0, 16);
          var subject = (t.subject || "").substring(0, 35) + ((t.subject || "").length > 35 ? "..." : "");
          var requesterName = (t.requesterName || "").substring(0, 20) + ((t.requesterName || "").length > 20 ? "..." : "");

          html += '<tr style="background:' + statusColor + ';border-bottom:1px solid #eee;">';
          html += '<td style="padding:6px;font-weight:600;">' + (t.uniqueCode || t.id) + '</td>';
          html += '<td style="padding:6px;font-size:11px;">' + date + '</td>';
          html += '<td style="padding:6px;" title="' + (t.requesterName || "") + '">' + requesterName + '</td>';
          html += '<td style="padding:6px;" title="' + (t.subject || "") + '">' + subject + '</td>';
          html += '<td style="padding:6px;font-size:11px;">' + (t.ticketStatusName || "") + '</td>';
          html += '<td style="padding:6px;">' + (t.responsibleName || "Sin asignar") + '</td>';
          html += '<td style="padding:6px;"><a href="/es/dashboard/tickets/' + t.id + '" style="color:#7B1FA2;font-size:11px;font-weight:600;text-decoration:none;">Ir al ticket →</a></td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        results.innerHTML = html;

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

  async function injectButtons() {
    const synced = await ensureSyncStarted();

    if (isDetailView()) {
      injectDetailButton();
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

      // Inject take button for "En espera" tickets
      if (statusText === "En espera" && !row.querySelector("." + TAKE_BTN_CLASS)) {
        container.appendChild(createTakeButton(ticketId));
      }

      // Inject steal button for "Asignado" tickets not assigned to me
      if (statusText === "Asignado" && !row.querySelector("." + STEAL_BTN_CLASS)) {
        const responsibleCell = row.querySelector('[data-field="responsibleName"]');
        const responsibleName = responsibleCell ? responsibleCell.textContent.trim() : "";
        const myName = getLoggedUserName();
        if (responsibleName && myName && responsibleName !== myName) {
          container.appendChild(createStealButton(ticketId));
        }
      }

      // Inject close button for "Asignado" tickets assigned to me
      if (statusText === "Asignado" && !row.querySelector("." + CLOSE_BTN_CLASS)) {
        const responsibleCell2 = row.querySelector('[data-field="responsibleName"]');
        const responsibleName2 = responsibleCell2 ? responsibleCell2.textContent.trim() : "";
        const myName2 = getLoggedUserName();
        if (responsibleName2 && myName2 && responsibleName2 === myName2) {
          container.appendChild(createCloseButton(ticketId));
        }
      }

      // Clean up close button if status changed
      if (statusText !== "Asignado") {
        const oldClose = row.querySelector("." + CLOSE_BTN_CLASS);
        if (oldClose) oldClose.remove();
      }

      // Inject migrate buttons for "Cerrado" tickets
      if (statusText === "Cerrado") {
        if (row.querySelector("." + BTN_CLASS) || row.querySelector("." + SYNCED_CLASS)) return;
        const uniqueCode = firstCell.textContent.trim();
        if (uniqueCode && synced[uniqueCode]) {
          container.appendChild(createSyncedBadge(synced[uniqueCode]));
        } else {
          container.appendChild(createButton(ticketId));
        }
      }
    });
    highlightMyRows();
    colorRowsByStatus();
    injectBulkButton();
    injectBulkCloseButton();
    injectNewTicketButton();
    injectSearchButton();
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
      const holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";
      if (holderEmail) {
        try {
          const users = await getMondayUsers(mondayToken);
          const userId = users[holderEmail.toLowerCase()];
          if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
        } catch (e) {}
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
  ensureSyncStarted().then(() => injectButtons());

  // --- Re-sync on page focus ---
  window.addEventListener("focus", () => {
    syncPromise = null;
    localStorage.removeItem(CACHE_KEY);
    ensureSyncStarted().then(() => injectButtons());
  });
})();
