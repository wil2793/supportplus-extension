// ============================================================
// FEATURES/REPORTS.JS - CSV export & Monday stats
// ============================================================

(function () {
  "use strict";

  var esc = window.esc;
  var SP_CONFIG = window.SP_CONFIG;

  var REPORT_BTN_ID = "sp-report-btn";
  var MONDAY_STATS_BTN_ID = "sp-monday-stats-btn";
  var reportGenerating = false;

  // ─── Inject Report Button ─────────────────────────────────

  function injectReportButton() {
    if (!window.SP_Session.state.btnReports) return;
    if (document.getElementById(REPORT_BTN_ID)) return;
    var refBtn = document.getElementById("sp-dashboard-btn") || document.getElementById("sp-search-btn");
    if (!refBtn) return;

    var btn = window.createHeaderButton({ id: REPORT_BTN_ID, icon: "📥", label: "Reporte Excel", color: "#1565C0", onClick: handleReportClick });
    refBtn.parentElement.insertBefore(btn, refBtn.nextSibling);
  }

  // ─── Report Modal ─────────────────────────────────────────

  async function handleReportClick() {
    if (reportGenerating) return;

    var stored = await SP_Storage.getMultiple(["notionUsers", "userEmail", "groupNames"]);
    var email = (stored.userEmail || "").toLowerCase();
    var users = stored.notionUsers || {};
    var userData = users[email];
    var userGroups = userData ? (userData.groups || []) : [];
    var groupNamesMap = stored.groupNames || {};

    if (!userGroups.length) { window.showErrorToast("No tienes grupos asignados"); return; }

    var groupOptions = userGroups.map(function (gId) {
      var name = groupNamesMap[gId] || (SP_CONFIG.GROUP_INFO.find(function (g) { return g.id === gId; }) || {}).name || ("Grupo " + gId);
      return { id: gId, name: name };
    });

    var now = new Date();
    var currentMonth = now.getMonth();
    var currentYear = now.getFullYear();

    var monthOpts = SP_CONFIG.MONTH_NAMES.map(function (m, i) {
      return '<option value="' + i + '"' + (i === currentMonth ? ' selected' : '') + '>' + m + '</option>';
    }).join("");
    var yearOpts = '';
    for (var y = currentYear; y >= currentYear - 3; y--) {
      yearOpts += '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>';
    }

    var groupCheckboxes = groupOptions.map(function (g) {
      return '<label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:12px;">' +
        '<input type="checkbox" value="' + g.id + '" checked> ' + esc(g.name) + '</label>';
    }).join("");

    var m = window.createModal({
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
      options: { maxWidth: "480px" }
    });
    var overlay = m.overlay;

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
      var selectedGroups = [];
      overlay.querySelectorAll('#sp-rpt-groups input[type="checkbox"]:checked').forEach(function (cb) {
        var gId = parseInt(cb.value);
        var gName = groupOptions.find(function (g) { return g.id === gId; });
        selectedGroups.push({ id: gId, name: gName ? gName.name : ("Grupo " + gId) });
      });
      if (!selectedGroups.length) { window.showErrorToast("Selecciona al menos un grupo"); return; }

      var fromDate, toDate;
      var mode = overlay.querySelector('[name="sp-rpt-mode"]:checked').value;
      if (mode === "month") {
        var month = parseInt(document.getElementById("sp-rpt-month").value);
        var year = parseInt(document.getElementById("sp-rpt-year").value);
        var lastDay = new Date(year, month + 1, 0).getDate();
        fromDate = year + "-" + String(month + 1).padStart(2, "0") + "-01T00:00";
        toDate = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0") + "T23:59";
      } else {
        var fromVal = document.getElementById("sp-rpt-from").value;
        var toVal = document.getElementById("sp-rpt-to").value;
        var rangeError = document.getElementById("sp-rpt-range-error");
        if (!fromVal || !toVal) { rangeError.textContent = "Selecciona ambas fechas"; rangeError.style.display = "block"; return; }
        if (fromVal > toVal) { rangeError.textContent = "La fecha inicio no puede ser mayor a la fecha fin"; rangeError.style.display = "block"; return; }
        rangeError.style.display = "none";
        fromDate = fromVal + "T00:00";
        toDate = toVal + "T23:59";
      }

      m.close();
      reportGenerating = true;
      var reportBtn = document.getElementById(REPORT_BTN_ID);
      if (reportBtn) { reportBtn.disabled = true; reportBtn.style.opacity = "0.5"; }

      window.showLoadingToast("Generando reporte...");
      var spToken = window.SP_API_Lib.getSpToken();

      try {
        var allTickets = [];
        for (var i = 0; i < selectedGroups.length; i++) {
          var group = selectedGroups[i];
          var page = 0;
          var hasMore = true;
          while (hasMore) {
            var url = SP_CONFIG.SP_SEARCH_API + "?resolutionGroupId=" + group.id + "&page=" + page + "&size=100&initDate=" + encodeURIComponent(fromDate) + "&endDate=" + encodeURIComponent(toDate);
            var res = await fetch(url, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
            if (!res.ok) throw new Error("HTTP " + res.status + " en grupo " + group.name);
            var json = await res.json();
            var data = json.data || json;
            var tickets = data.content || [];
            tickets.forEach(function (t) { t._groupName = group.name; });
            allTickets = allTickets.concat(tickets);
            hasMore = tickets.length === 100;
            page++;
          }
        }

        if (!allTickets.length) {
          window.showErrorToast("No se encontraron tickets en el rango seleccionado.");
          reportGenerating = false;
          if (reportBtn) { reportBtn.disabled = false; reportBtn.style.opacity = "1"; }
          return;
        }

        // Build CSV
        var headers = ["Folio", "Asunto", "Grupo", "Solicitante", "Responsable", "Estado", "Prioridad", "Tipo", "Canal", "Fecha Creacion", "Fecha Actualizacion"];
        var csvRows = [headers.join(",")];
        allTickets.forEach(function (t) {
          var row = [
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

        var csvContent = "\uFEFF" + csvRows.join("\n");
        var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        var downloadUrl = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "Reporte_SP_" + fromDate.substring(0, 10) + "_a_" + toDate.substring(0, 10) + ".csv";
        a.click();
        URL.revokeObjectURL(downloadUrl);

        window.showSuccessToast("📥 CSV listo: " + allTickets.length + " tickets de " + selectedGroups.length + " grupo(s)");
      } catch (err) {
        window.showErrorToast("Error: " + err.message);
      }

      reportGenerating = false;
      if (reportBtn) { reportBtn.disabled = false; reportBtn.style.opacity = "1"; }
    });
  }

  // ─── Monday Stats ─────────────────────────────────────────

  function injectMondayStatsButton() {
    if (!window.SP_Session.state.canMigrateMonday) return;
    if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
    var refBtn = document.getElementById(REPORT_BTN_ID) || document.getElementById("sp-dashboard-btn") || document.getElementById("sp-search-btn");
    if (!refBtn) return;

    window.SP_API_Lib.getMondayToken().then(function (token) {
      if (!token) return;
      window.SP_API_Lib.getMondayBoardId().then(function (boardId) {
        if (!boardId) return;
        if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
        var btn = window.createHeaderButton({ id: MONDAY_STATS_BTN_ID, icon: "📈", label: "Monday Stats", color: "#1565C0", onClick: handleMondayStats });
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
      var mondayToken = await window.SP_API_Lib.getMondayToken();
      var boardId = await window.SP_API_Lib.getMondayBoardId();
      if (!mondayToken || !boardId) throw new Error("Configura Monday");

      var allItems = [];
      var firstPage = await window.SP_API_Lib.mondayQuery(mondayToken,
        'query ($boardId: [ID!]!) { boards(ids: $boardId) { name items_page(limit: 500) { cursor items { id name column_values { id text value } } } } }',
        { boardId: boardId });
      var board = firstPage.boards[0];
      var boardName = board.name;
      var page = board.items_page;
      allItems = allItems.concat(page.items);

      var cursor = page.cursor;
      while (cursor) {
        btn.textContent = "⏳ " + allItems.length + " items...";
        var next = await window.SP_API_Lib.mondayQuery(mondayToken,
          'query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values { id text value } } } }',
          { cursor: cursor });
        allItems = allItems.concat(next.next_items_page.items);
        cursor = next.next_items_page.cursor;
      }

      // Parse stats
      var statsByPerson = {};
      allItems.forEach(function (item) {
        var person = "Sin asignar";
        item.column_values.forEach(function (col) {
          if (col.id === "multiple_person_mm25nvfq" && col.text) person = col.text;
        });
        if (!statsByPerson[person]) statsByPerson[person] = 0;
        statsByPerson[person]++;
      });

      // Show modal
      var personSorted = Object.entries(statsByPerson).sort(function (a, b) { return b[1] - a[1]; });
      var maxTotal = personSorted[0] ? personSorted[0][1] : 1;
      var colors = ["#1976D2", "#2E7D32", "#D94040", "#7B1FA2", "#E65100", "#00796B"];

      var barsHTML = personSorted.map(function (entry, idx) {
        var name = entry[0];
        var total = entry[1];
        var barWidth = Math.round((total / maxTotal) * 100);
        var color = colors[idx % colors.length];
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<div style="width:140px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(name) + '">' + esc(name) + '</div>' +
          '<div style="flex:1;background:#f0f0f0;border-radius:4px;height:30px;overflow:hidden;"><div style="width:' + barWidth + '%;background:' + color + ';height:100%;border-radius:4px;"></div></div>' +
          '<div style="width:35px;font-size:13px;font-weight:700;text-align:center;">' + total + '</div></div>';
      }).join("");

      window.createModal({
        id: "sp-monday-stats-modal",
        title: '📈 ' + esc(boardName) + ' (' + allItems.length + ' tickets)',
        content: '<h4 style="margin:0 0 12px;font-size:14px;color:#555;">Tickets por persona</h4><div style="flex:1;overflow:auto;">' + barsHTML + '</div>',
        options: { maxWidth: "700px", width: "95%", maxHeight: "90vh" }
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
