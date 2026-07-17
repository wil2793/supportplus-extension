// ============================================================
// FEATURES/REPORTS.JS - CSV export & Monday stats
// ============================================================

(function () {
  "use strict";

  const esc = window.esc;
  const SP_CONFIG = window.SP_CONFIG;

  const REPORT_BTN_ID = "sp-report-btn";
  const MONDAY_STATS_BTN_ID = "sp-monday-stats-btn";
  const _reportState = { generating: false };

  // ─── Inject Report Button ─────────────────────────────────

  function injectReportButton() {
    if (!window.SP_Session.state.btnReports) return;
    if (document.getElementById(REPORT_BTN_ID)) return;
    const refBtn = document.getElementById("sp-dashboard-btn") || document.getElementById("sp-search-btn");
    if (!refBtn) return;

    const btn = window.createHeaderButton({ id: REPORT_BTN_ID, icon: "📥", label: "Reporte Excel", color: "#1565C0", onClick: handleReportClick });
    refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
  }

  // ─── Report Modal ─────────────────────────────────────────

  async function handleReportClick() {
    if (_reportState.generating) return;

    const stored = await SP_Storage.getMultiple(["usersMap", "userEmail", "groupNames"]);
    const email = (stored.userEmail || "").toLowerCase();
    const users = stored.usersMap || {};
    const userData = users[email];
    const userGroups = userData ? (userData.groups || []) : [];
    const groupNamesMap = stored.groupNames || {};

    if (!userGroups.length) { window.showErrorToast("No tienes grupos asignados"); return; }

    const groupOptions = userGroups.map(function (gId) {
      const name = groupNamesMap[gId] || (SP_CONFIG.GROUP_INFO.find(function (g) { return g.id === gId; }) || {}).name || ("Grupo " + gId);
      return { id: gId, name: name };
    });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthOpts = SP_CONFIG.MONTH_NAMES.map(function (m, i) {
      return '<option value="' + i + '"' + (i === currentMonth ? ' selected' : '') + '>' + m + '</option>';
    }).join("");
    const yearOpts = Array.from({ length: 4 }, function (_, i) {
      const y = currentYear - i;
      return '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>';
    }).join("");

    const groupCheckboxes = groupOptions.map(function (g) {
      return '<label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:12px;">' +
        '<input type="checkbox" value="' + g.id + '" checked> ' + esc(g.name) + '</label>';
    }).join("");

    const m = window.SP_Modal.info({
      id: "sp-report-modal",
      title: "📥 Exportar Reporte CSV",
      content:
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Grupos:</label>' +
        '<div id="sp-rpt-groups" style="max-height:150px;overflow-y:auto;border:1px solid #ddd;border-radius:6px;padding:8px;">' + groupCheckboxes + '</div>' +
        '<div style="margin-top:4px;display:flex;gap:8px;"><button id="sp-rpt-select-all" style="font-size:10px;border:none;background:none;color:#1976D2;cursor:pointer;text-decoration:underline;">Seleccionar todos</button><button id="sp-rpt-select-none" style="font-size:10px;border:none;background:none;color:#1976D2;cursor:pointer;text-decoration:underline;">Deseleccionar todos</button></div>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Periodo:</label>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
        '<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="sp-rpt-mode" value="month" checked> Por mes</label>' +
        '<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="sp-rpt-mode" value="range"> Por rango</label>' +
        '</div>' +
        '<div id="sp-rpt-month-section" style="display:flex;gap:8px;">' +
        '<select id="sp-rpt-month" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;">' + monthOpts + '</select>' +
        '<select id="sp-rpt-year" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;">' + yearOpts + '</select>' +
        '</div>' +
        '<div id="sp-rpt-range-section" style="display:none;">' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
        '<input id="sp-rpt-from" type="date" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;">' +
        '<span style="font-size:12px;color:#888;">a</span>' +
        '<input id="sp-rpt-to" type="date" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;">' +
        '</div>' +
        '<div id="sp-rpt-range-error" style="color:#D94040;font-size:11px;margin-top:4px;display:none;"></div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="sp-rpt-generate" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1565C0;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">📥 Generar CSV</button>' +
        '<button id="sp-rpt-cancel" style="padding:10px 16px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>' +
        '</div>',
      maxWidth: "480px"
    });
    const overlay = m.overlay;

    // Toggle month/range
    overlay.querySelectorAll('[name="sp-rpt-mode"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        document.getElementById("sp-rpt-month-section").style.display = radio.value === "month" ? "flex" : "none";
        document.getElementById("sp-rpt-range-section").style.display = radio.value === "range" ? "block" : "none";
      });
    });

    document.getElementById("sp-rpt-select-all").addEventListener("click", function () {
      overlay.querySelectorAll('#sp-rpt-groups input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
    });
    document.getElementById("sp-rpt-select-none").addEventListener("click", function () {
      overlay.querySelectorAll('#sp-rpt-groups input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    });
    document.getElementById("sp-rpt-cancel").addEventListener("click", function () { m.close(); });

    document.getElementById("sp-rpt-generate").addEventListener("click", async function () {
      const selectedGroups = [];
      overlay.querySelectorAll('#sp-rpt-groups input[type="checkbox"]:checked').forEach(function (cb) {
        const gId = parseInt(cb.value);
        const gName = groupOptions.find(function (g) { return g.id === gId; });
        selectedGroups.push({ id: gId, name: gName ? gName.name : ("Grupo " + gId) });
      });
      if (!selectedGroups.length) { window.showErrorToast("Selecciona al menos un grupo"); return; }

      const range = { from: "", to: "" };
      const mode = overlay.querySelector('[name="sp-rpt-mode"]:checked').value;
      if (mode === "month") {
        const month = parseInt(document.getElementById("sp-rpt-month").value);
        const year = parseInt(document.getElementById("sp-rpt-year").value);
        const lastDay = new Date(year, month + 1, 0).getDate();
        range.from = year + "-" + String(month + 1).padStart(2, "0") + "-01T00:00";
        range.to = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0") + "T23:59";
      } else {
        const fromVal = document.getElementById("sp-rpt-from").value;
        const toVal = document.getElementById("sp-rpt-to").value;
        const rangeError = document.getElementById("sp-rpt-range-error");
        if (!fromVal || !toVal) { rangeError.textContent = "Selecciona ambas fechas"; rangeError.style.display = "block"; return; }
        if (fromVal > toVal) { rangeError.textContent = "La fecha inicio no puede ser mayor a la fecha fin"; rangeError.style.display = "block"; return; }
        rangeError.style.display = "none";
        range.from = fromVal + "T00:00";
        range.to = toVal + "T23:59";
      }

      m.close();
      _reportState.generating = true;
      const reportBtn = document.getElementById(REPORT_BTN_ID);
      if (reportBtn) { reportBtn.disabled = true; reportBtn.style.opacity = "0.5"; }

      window.showLoadingToast("Generando reporte...");
      const spToken = window.SP_API_Lib.getSpToken();

      try {
        const allTickets = [];
        for (const group of selectedGroups) {
          const loop = { page: 0, hasMore: true };
          while (loop.hasMore) {
            const url = SP_CONFIG.SP_SEARCH_API + "?resolutionGroupId=" + group.id + "&page=" + loop.page + "&size=100&initDate=" + encodeURIComponent(range.from) + "&endDate=" + encodeURIComponent(range.to);
            const res = await fetch(url, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
            if (!res.ok) throw new Error("HTTP " + res.status + " en grupo " + group.name);
            const json = await res.json();
            const data = json.data || json;
            const tickets = data.content || [];
            tickets.forEach(function (t) { t._groupName = group.name; });
            allTickets.push.apply(allTickets, tickets);
            loop.hasMore = tickets.length === 100;
            loop.page++;
          }
        }

        if (!allTickets.length) {
          window.showErrorToast("No se encontraron tickets en el rango seleccionado.");
          _reportState.generating = false;
          if (reportBtn) { reportBtn.disabled = false; reportBtn.style.opacity = "1"; }
          return;
        }

        // Build CSV
        const headers = ["Folio", "Asunto", "Grupo", "Solicitante", "Responsable", "Estado", "Prioridad", "Tipo", "Canal", "Fecha Creacion", "Fecha Actualizacion"];
        const csvRows = [headers.join(",")];
        allTickets.forEach(function (t) {
          const row = [
            '"' + (t.uniqueCode || "").replace(/"/g, '""') + '"',
            '"' + (t.subject || "").replace(/"/g, '""') + '"',
            '"' + (t._groupName || "").replace(/"/g, '""') + '"',
            '"' + (t.requesterName || "").replace(/"/g, '""') + '"',
            '"' + (t.responsibleName || "").replace(/"/g, '""') + '"',
            '"' + (t.ticketStatusName || "").replace(/"/g, '""') + '"',
            '"' + (t.incidentPriorityName || "").replace(/"/g, '""') + '"',
            '"' + (t.reportTypeName || "").replace(/"/g, '""') + '"',
            '"' + (t.attentionChannelName || "").replace(/"/g, '""') + '"',
            '"' + (t.createdAt ? t.createdAt.replace("T", " ").substring(0, 16) : "") + '"',
            '"' + (t.updatedAt ? t.updatedAt.replace("T", " ").substring(0, 16) : "") + '"'
          ];
          csvRows.push(row.join(","));
        });

        const csvContent = "\uFEFF" + csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "Reporte_SP_" + range.from.substring(0, 10) + "_a_" + range.to.substring(0, 10) + ".csv";
        a.click();
        URL.revokeObjectURL(downloadUrl);

        window.showSuccessToast("📥 CSV listo: " + allTickets.length + " tickets de " + selectedGroups.length + " grupo(s)");
      } catch (err) {
        window.showErrorToast("Error: " + err.message);
      }

      _reportState.generating = false;
      if (reportBtn) { reportBtn.disabled = false; reportBtn.style.opacity = "1"; }
    });
  }

  // ─── Monday Stats ─────────────────────────────────────────

  function injectMondayStatsButton() {
    if (!window.SP_Session.state.canMigrateMonday) return;
    if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
    const refBtn = document.getElementById(REPORT_BTN_ID) || document.getElementById("sp-dashboard-btn") || document.getElementById("sp-search-btn");
    if (!refBtn) return;

    window.SP_API_Lib.getMondayToken().then(function (token) {
      if (!token) return;
      window.SP_API_Lib.getMondayBoardId().then(function (boardId) {
        if (!boardId) return;
        if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
        const btn = window.createHeaderButton({ id: MONDAY_STATS_BTN_ID, icon: "📈", label: "Monday Stats", color: "#1565C0", onClick: handleMondayStats });
        refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
      });
    });
  }

  async function handleMondayStats() {
    const btn = document.getElementById(MONDAY_STATS_BTN_ID);
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "⏳ Cargando...";
    btn.style.background = "#999";

    try {
      const mondayToken = await window.SP_API_Lib.getMondayToken();
      const boardId = await window.SP_API_Lib.getMondayBoardId();
      if (!mondayToken || !boardId) throw new Error("Configura Monday");

      const allItems = [];
      const firstPage = await window.SP_API_Lib.mondayQuery(mondayToken,
        'query ($boardId: [ID!]!) { boards(ids: $boardId) { name items_page(limit: 500) { cursor items { id name column_values { id text value } } } } }',
        { boardId: boardId });
      const board = firstPage.boards[0];
      const boardName = board.name;
      const pageData = { current: board.items_page, cursor: board.items_page.cursor };
      allItems.push.apply(allItems, pageData.current.items);

      while (pageData.cursor) {
        btn.textContent = "⏳ " + allItems.length + " items...";
        const next = await window.SP_API_Lib.mondayQuery(mondayToken,
          'query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values { id text value } } } }',
          { cursor: pageData.cursor });
        allItems.push.apply(allItems, next.next_items_page.items);
        pageData.cursor = next.next_items_page.cursor;
      }

      // Parse stats
      const statsByPerson = {};
      allItems.forEach(function (item) {
        const personCol = item.column_values.find(function (col) {
          return col.id === "multiple_person_mm25nvfq" && col.text;
        });
        const person = personCol ? personCol.text : "Sin asignar";
        if (!statsByPerson[person]) statsByPerson[person] = 0;
        statsByPerson[person]++;
      });

      // Show modal
      const personSorted = Object.entries(statsByPerson).sort(function (a, b) { return b[1] - a[1]; });
      const maxTotal = personSorted[0] ? personSorted[0][1] : 1;
      const colors = ["#1976D2", "#2E7D32", "#D94040", "#7B1FA2", "#E65100", "#00796B"];

      const barsHTML = personSorted.map(function (entry, idx) {
        const name = entry[0];
        const total = entry[1];
        const barWidth = Math.round((total / maxTotal) * 100);
        const color = colors[idx % colors.length];
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<div style="width:140px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(name) + '">' + esc(name) + '</div>' +
          '<div style="flex:1;background:#f0f0f0;border-radius:4px;height:30px;overflow:hidden;"><div style="width:' + barWidth + '%;background:' + color + ';height:100%;border-radius:4px;"></div></div>' +
          '<div style="width:35px;font-size:13px;font-weight:700;text-align:center;">' + total + '</div></div>';
      }).join("");

      window.SP_Modal.info({
        id: "sp-monday-stats-modal",
        title: '📈 ' + esc(boardName) + ' (' + allItems.length + ' tickets)',
        content: '<h4 style="margin:0 0 12px;font-size:14px;color:#555;">Tickets por persona</h4><div style="flex:1;overflow:auto;">' + barsHTML + '</div>',
        maxWidth: "700px",
        modalOptions: { width: "95%", maxHeight: "90vh" }
      });
    } catch (err) {
      window.showErrorToast("Error: " + err.message);
    }

    btn.textContent = "📈 Monday Stats";
    btn.style.background = "#1565C0";
    btn.disabled = false;
  }

  // Expose
  window.SP_Reports = {
    injectReportButton: injectReportButton,
    injectMondayStatsButton: injectMondayStatsButton
  };

})();
