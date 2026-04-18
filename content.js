(function () {
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
        row.style.backgroundColor = "rgba(217, 64, 64, 0.08)";
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
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      e.preventDefault();
      showTakeModal(ticketId, btn);
    });
    return btn;
  }

  function showTakeModal(ticketId, originalBtn) {
    var existing = document.getElementById("sp-take-modal");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "sp-take-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:420px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;">🤚 Tomar ticket</h3>' +
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
      confirmBtn.disabled = true;
      confirmBtn.style.background = "#999";
      confirmBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Tomando...';
      cancelBtn.style.display = "none";

      var profileId = await getMyProfileId();
      if (!profileId) {
        msg.textContent = "No se pudo obtener tu perfil.";
        confirmBtn.innerHTML = "✊ Tomar ticket";
        confirmBtn.style.background = "#1976D2";
        confirmBtn.disabled = false;
        cancelBtn.style.display = "";
        return;
      }

      var comment = document.getElementById("sp-take-comment").value.trim();
      var spToken = getToken();

      try {
        var res = await fetch(SP_API + "/reassign/" + ticketId, {
          method: "PUT",
          headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
          body: JSON.stringify({
            ticketCommentRequest: { internal: false, content: comment },
            resolutionGroupId: 19,
            serviceId: null,
            responsibleProfileId: profileId,
            resolutionGroup: { label: "Infraestructura DBA", value: 19 }
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var json = await res.json();
        if (json.success) {
          overlay.remove();
          // Update button
          originalBtn.textContent = "✅ Tomado";
          originalBtn.style.background = "#2E7D32";
          originalBtn.style.borderColor = "#2E7D32";
          originalBtn.disabled = true;
          // Highlight row
          var row = originalBtn.closest(".MuiDataGrid-row");
          if (row) {
            row.classList.add(HIGHLIGHT_CLASS);
            row.style.backgroundColor = "rgba(217, 64, 64, 0.08)";
          }
          // Toast
          var toast = document.createElement("div");
          toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#2E7D32;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:sp-toast-in 0.3s ease;";
          toast.textContent = "✅ Ticket tomado";
          if (!document.getElementById("sp-toast-style")) {
            var s = document.createElement("style");
            s.id = "sp-toast-style";
            s.textContent = "@keyframes sp-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes sp-toast-out{from{opacity:1}to{opacity:0;transform:translateX(-50%) translateY(-10px)}}";
            document.head.appendChild(s);
          }
          document.body.appendChild(toast);
          setTimeout(function() { toast.style.animation = "sp-toast-out 0.3s ease forwards"; setTimeout(function() { toast.remove(); }, 300); }, 3000);
        } else {
          throw new Error("No success");
        }
      } catch (err) {
        msg.textContent = "Error: " + err.message;
        confirmBtn.innerHTML = "✊ Tomar ticket";
        confirmBtn.style.background = "#1976D2";
        confirmBtn.disabled = false;
        cancelBtn.style.display = "";
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
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      e.preventDefault();
      showTakeModal(ticketId, btn);
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
      btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span>';
      var spToken = getToken();
      try {
        var res = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
          body: JSON.stringify({
            nextTicketStatusId: 9,
            ticketCommentRequest: null
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        // Replace close button with migrate button
        var row = btn.closest(".MuiDataGrid-row");
        btn.replaceWith(createButton(ticketId));
        // Remove steal button if present
        if (row) {
          var oldSteal = row.querySelector("." + STEAL_BTN_CLASS);
          if (oldSteal) oldSteal.remove();
        }
      } catch (err) {
        btn.textContent = "❌";
        btn.title = err.message;
        setTimeout(function() { btn.textContent = "🔒 Cerrar"; btn.disabled = false; }, 2000);
      }
    });
    return btn;
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
    injectBulkButton();
    injectBulkCloseButton();
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
      sendBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> Creando...';
      var closeBtn = document.getElementById("sp-monday-close");
      if (closeBtn) closeBtn.style.display = "none";
      // Inject spinner keyframes if not present
      if (!document.getElementById("sp-spinner-style")) {
        const style = document.createElement("style");
        style.id = "sp-spinner-style";
        style.textContent = "@keyframes sp-spin { to { transform: rotate(360deg); } }";
        document.head.appendChild(style);
      }
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
        var closeBtnA = document.getElementById("sp-monday-close");
        if (closeBtnA) closeBtnA.style.display = "";
        return;
      }

      const groupId = document.getElementById("sp-group-select").value;
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
          console.log("[SP Monday] Buscando email:", holderEmail, "→ userId:", userId);
          if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
        } catch (e) { console.warn("[SP Monday] Error buscando usuario:", e); }
      }

      // Check if already migrated before creating
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
        // Update detail view button if present
        const detailBtn = document.getElementById(DETAIL_BTN_ID);
        if (detailBtn) {
          const badge = createSyncedBadge(newItemId);
          badge.id = DETAIL_BTN_ID;
          badge.style.cssText = "padding:6px 14px;font-size:12px;border-radius:6px;background:#E8F5E9;color:#2E7D32;font-weight:600;white-space:nowrap;cursor:pointer;";
          detailBtn.replaceWith(badge);
        }
        msg.innerHTML = '✅ Item creado!';
        sendBtn.innerHTML = "✅ Creado";
        sendBtn.disabled = true;
        const modal = document.getElementById("sp-monday-modal"); if (modal) modal.remove();
        // Show success toast
        const toast = document.createElement("div");
        toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#2E7D32;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
        toast.innerHTML = "✅ Ticket migrado a Monday";
        if (!document.getElementById("sp-toast-style")) {
          const s = document.createElement("style");
          s.id = "sp-toast-style";
          s.textContent = "@keyframes sp-toast-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes sp-toast-out{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}";
          document.head.appendChild(s);
        }
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.animation = "sp-toast-out 0.3s ease forwards"; setTimeout(() => toast.remove(), 300); }, 3000);
      } catch (err) {
        msg.textContent = "❌ Error: " + err.message;
        sendBtn.innerHTML = "💾 Crear en Monday";
        sendBtn.style.background = "#D94040";
        sendBtn.disabled = false;
        var closeBtnB = document.getElementById("sp-monday-close");
        if (closeBtnB) closeBtnB.style.display = "";
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
