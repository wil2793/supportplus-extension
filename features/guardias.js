// ============================================================
// FEATURES/GUARDIAS.JS - Control de Guardias (calendario + cambios)
// ============================================================

(function () {
  "use strict";

  const MESES = window.SP_CONFIG.MONTH_NAMES;
  const _state = { monthOffset: 0, entries: {}, rawEntries: [], myDays: [], currentUserName: "", currentUserId: "" };

  // ─── API Helper ───────────────────────────────────────────

  function apiMessage(type, endpoint, body) {
    return new Promise(function (resolve) {
      const msg = { type: type, endpoint: endpoint };
      if (body) msg.body = body;
      chrome.runtime.sendMessage(msg, function (resp) {
        resolve(resp && resp.success ? (resp.data || resp) : null);
      });
    });
  }

  // ─── Load Guardias Calendar ───────────────────────────────

  function loadGuardias(offset, options) {
    _state.monthOffset = offset;
    const opts = options || {};
    _state.currentUserName = opts.currentUserName || "";
    _state.currentUserId = opts.currentUserId || "";
    const gContent = document.getElementById("sp-dba-guardias-content");
    if (!gContent) return;
    _loadGuardiasInto(gContent, offset);
  }

  function loadGuardiasInto(contentEl, prevBtn, nextBtn, titleEl, offset, options) {
    const opts = options || {};
    _state.currentUserName = opts.currentUserName || _state.currentUserName || "";
    _state.currentUserId   = opts.currentUserId   || _state.currentUserId   || "";
    _state.monthOffset = offset || 0;

    if (prevBtn) prevBtn.addEventListener("click", function () {
      _state.monthOffset--;
      loadGuardiasInto(contentEl, prevBtn, nextBtn, titleEl, _state.monthOffset, opts);
    });
    if (nextBtn) nextBtn.addEventListener("click", function () {
      _state.monthOffset++;
      loadGuardiasInto(contentEl, prevBtn, nextBtn, titleEl, _state.monthOffset, opts);
    });

    _loadGuardiasInto(contentEl, _state.monthOffset, titleEl);
  }

  function _loadGuardiasInto(gContent, offset, titleEl) {
    gContent.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Cargando...</div>';

    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Fetch guardias from API
    apiMessage("api-get", "/guardias?mes=" + (month + 1) + "&anio=" + year).then(function (resp) {
      const guardias = (resp && resp.data) ? (Array.isArray(resp.data) ? resp.data : resp.data.data || []) : [];

      const entries = {};
      const rawEntries = [];

      guardias.forEach(function (g) {
        const date = g.Fecha ? g.Fecha.split("T")[0] : "";
        const name = g.UsuarioNombre || "";
        const userId = String(g.FK_IdUsuario);
        if (date) {
          entries[date] = name;
          rawEntries.push({ id: g.IdControlGuardia, date: date, name: name, userId: userId });
        }
      });

      _state.entries = entries;
      _state.rawEntries = rawEntries;
      _state.myDays = rawEntries.filter(function (e) {
        return e.userId === _state.currentUserId;
      });

      // Fetch pending solicitudes
      apiMessage("api-get", "/guardias/solicitudes?pendientes=true").then(function (solResp) {
        const pending = (solResp && solResp.data) ? (Array.isArray(solResp.data) ? solResp.data : solResp.data.data || []) : [];
        renderCalendar(gContent, entries, rawEntries, year, month, lastDay, todayStr, pending);
      });
    });
  }

  // ─── Render Calendar ──────────────────────────────────────

  function renderCalendar(gContent, entries, rawEntries, year, month, lastDay, todayStr, pending) {
    const pendingList = pending || [];
    const currentUserName = _state.currentUserName;
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const headerParts = ['<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:2px;">'];
    dias.forEach(function (d, i) {
      headerParts.push('<div style="text-align:center;font-size:10px;font-weight:600;color:' + (i >= 5 ? '#E65100' : '#888') + ';padding:4px;">' + d + '</div>');
    });
    headerParts.push('</div>');

    const calParts = ['<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">'];
    Array.from({ length: startOffset }).forEach(function () {
      calParts.push('<div style="padding:6px;min-height:50px;"></div>');
    });

    Array.from({ length: lastDay }, function (_, i) { return i + 1; }).forEach(function (day) {
      const d = new Date(year, month, day);
      const dow = d.getDay();
      const dStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const entry = entries[dStr] || "";
      const rawEntry = rawEntries.find(function (e) { return e.date === dStr; });
      const isToday = dStr === todayStr;
      const isWeekend = dow === 0 || dow === 6;
      const isMyDay = entry && currentUserName && entry.toLowerCase().includes(currentUserName.split(" ")[0].toLowerCase());
      const isOtherDay = entry && !isMyDay;

      const pendingForDay = rawEntry ? pendingList.find(function (p) { return p.FK_IdControlGuardiaSolicitado === rawEntry.id; }) : null;
      const hasPendingIndicator = pendingForDay && rawEntry && rawEntry.userId === _state.currentUserId;

      const bgColor = isToday ? "#E3F2FD" : isMyDay ? "#E8F5E9" : isWeekend ? "#FFF3E0" : "#f9f9f9";
      const borderColor = isToday ? "#1976D2" : isMyDay ? "#4CAF50" : hasPendingIndicator ? "#FF8F00" : "#e0e0e0";
      const firstName = entry ? entry.split(" ")[0] : "";
      const clickable = isOtherDay ? 'cursor:pointer;' : '';
      const dataAttrs = rawEntry ? 'data-guardia-id="' + rawEntry.id + '" data-guardia-date="' + dStr + '" data-guardia-name="' + entry + '"' : '';
      const pendingDot = hasPendingIndicator ? '<div style="width:8px;height:8px;border-radius:50%;background:#FF8F00;margin-top:2px;" title="Solicitud pendiente"></div>' : '';

      calParts.push(
        '<div class="sp-guardia-day" ' + dataAttrs + ' style="padding:4px 6px;min-height:50px;background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;' + clickable + '">' +
        '<div style="font-size:13px;font-weight:' + (isToday ? '700' : '600') + ';color:' + (isToday ? '#1976D2' : isWeekend ? '#E65100' : '#333') + ';">' + day + '</div>' +
        '<div style="font-size:9px;color:#555;text-align:center;margin-top:2px;' + (isMyDay ? 'font-weight:700;color:#2E7D32;' : '') + '">' + firstName + '</div>' +
        pendingDot +
        '</div>'
      );
    });
    calParts.push('</div>');

    gContent.innerHTML = '<div style="text-align:center;font-weight:600;margin-bottom:10px;font-size:14px;">' + MESES[month] + ' ' + year + '</div>' + headerParts.join("") + calParts.join("");

    // Nav buttons — update title if provided
    const prevBtn = document.getElementById("sp-dba-guardias-prev");
    const nextBtn = document.getElementById("sp-dba-guardias-next");
    if (prevBtn) { prevBtn.onclick = function () { loadGuardias(_state.monthOffset - 1, { currentUserName: _state.currentUserName, currentUserId: _state.currentUserId }); }; }
    if (nextBtn) { nextBtn.onclick = function () { loadGuardias(_state.monthOffset + 1, { currentUserName: _state.currentUserName, currentUserId: _state.currentUserId }); }; }

    // Click handlers
    gContent.querySelectorAll(".sp-guardia-day[data-guardia-id]").forEach(function (cell) {
      cell.addEventListener("click", function () {
        const guardiaId = parseInt(cell.dataset.guardiaId);
        const guardiaDate = cell.dataset.guardiaDate;
        const guardiaName = cell.dataset.guardiaName;
        const rawEntry = _state.rawEntries.find(function (e) { return e.id === guardiaId; });
        if (!rawEntry) return;

        const pendingForMe = pendingList.find(function (p) { return p.FK_IdControlGuardiaSolicitado === guardiaId; });
        if (rawEntry.userId === _state.currentUserId && pendingForMe) {
          showAcceptModal(pendingForMe, guardiaDate, guardiaName);
          return;
        }

        if (rawEntry.userId !== _state.currentUserId) {
          const alreadyRequested = pendingList.find(function (p) { return p.FK_IdControlGuardiaSolicitado === guardiaId; });
          if (alreadyRequested) {
            window.showErrorToast("Ya existe una solicitud pendiente para ese día.");
            return;
          }
          showRequestModal(guardiaId, guardiaDate, guardiaName);
        }
      });
    });
  }

  // ─── Request Swap Modal ───────────────────────────────────

  function showRequestModal(targetGuardiaId, targetDate, targetName) {
    const myDayOpts = _state.myDays.map(function (d) {
      return '<option value="' + d.id + '">' + d.date + '</option>';
    }).join("");

    if (!myDayOpts) {
      window.showErrorToast("No tienes días asignados este mes para ofrecer intercambio.");
      return;
    }

    const m = window.SP_Modal.info({
      id: "sp-guardia-request-modal",
      title: "🔄 Solicitar cambio de guardia",
      content:
        '<p style="font-size:13px;color:#555;margin:0 0 12px;">Quieres el día <b>' + targetDate + '</b> de <b>' + targetName + '</b></p>' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">¿Por cuál de tus días lo cambias?</label>' +
        '<select id="sp-guardia-my-day" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:12px;">' +
        '<option value="">-- Selecciona tu día --</option>' + myDayOpts + '</select>' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Motivo del cambio</label>' +
        '<textarea id="sp-guardia-motivo" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe el motivo..."></textarea>' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="sp-guardia-send" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Enviar solicitud</button>' +
        '<button id="sp-guardia-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>' +
        '</div>',
      maxWidth: "420px"
    });

    document.getElementById("sp-guardia-cancel").addEventListener("click", m.close);

    document.getElementById("sp-guardia-send").addEventListener("click", function () {
      const myDayId = document.getElementById("sp-guardia-my-day").value;
      const motivo = document.getElementById("sp-guardia-motivo").value.trim();
      if (!myDayId) { window.showErrorToast("Selecciona uno de tus días"); return; }
      if (!motivo) { window.showErrorToast("Escribe un motivo"); return; }

      const sendBtn = document.getElementById("sp-guardia-send");
      sendBtn.disabled = true;
      sendBtn.textContent = "⏳ Enviando...";

      chrome.runtime.sendMessage({
        type: "api-post",
        endpoint: "/guardias/solicitud",
        body: {
          motivoCambio: motivo,
          fkIdControlGuardiaSolicitado: targetGuardiaId,
          fkIdControlGuardiaOfrecido: parseInt(myDayId),
          fkIdUsuarioSolicitante: parseInt(_state.currentUserId),
          usuarioAlta: "EXTENSION"
        }
      }, function (resp) {
        m.close();
        if (resp && resp.success) {
          window.showSuccessToast("Solicitud de cambio enviada");
          loadGuardias(_state.monthOffset, { currentUserName: _state.currentUserName, currentUserId: _state.currentUserId });
        } else {
          window.showErrorToast("Error al enviar: " + (resp && resp.error ? resp.error : "revisa consola"));
        }
      });
    });
  }

  // ─── Accept Swap Modal ────────────────────────────────────

  function showAcceptModal(solicitud, targetDate, targetName) {
    const solicitanteName = solicitud.SolicitanteNombre || "Alguien";
    const ofrecidoEntry = _state.rawEntries.find(function (e) { return e.id === solicitud.FK_IdControlGuardiaOfrecido; });
    const ofrecidoDate = ofrecidoEntry ? ofrecidoEntry.date : (solicitud.FechaOfrecida ? solicitud.FechaOfrecida.split("T")[0] : "?");

    const m = window.SP_Modal.info({
      id: "sp-guardia-accept-modal",
      title: "📬 Solicitud de cambio",
      content:
        '<p style="font-size:13px;color:#555;margin:0 0 8px;"><b>' + solicitanteName + '</b> quiere cambiarte tu día <b>' + targetDate + '</b></p>' +
        '<p style="font-size:13px;color:#555;margin:0 0 12px;">Te ofrece su día: <b>' + ofrecidoDate + '</b></p>' +
        '<div style="padding:10px;background:#f5f5f5;border-radius:6px;margin-bottom:16px;">' +
        '<label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Motivo:</label>' +
        '<p style="margin:0;font-size:13px;color:#333;">' + (solicitud.MotivoCambio || "Sin motivo") + '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="sp-guardia-accept" style="flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">✅ Aceptar cambio</button>' +
        '<button id="sp-guardia-reject" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Rechazar</button>' +
        '</div>',
      maxWidth: "420px"
    });

    document.getElementById("sp-guardia-reject").addEventListener("click", m.close);

    document.getElementById("sp-guardia-accept").addEventListener("click", function () {
      const acceptBtn = document.getElementById("sp-guardia-accept");
      acceptBtn.disabled = true;
      acceptBtn.textContent = "⏳ Procesando...";

      chrome.runtime.sendMessage({
        type: "api-put",
        endpoint: "/guardias/solicitud/" + solicitud.IdSolicitudCambio + "/aceptar",
        body: { usuarioModificacion: "EXTENSION" }
      }, function (resp) {
        m.close();
        if (resp && resp.success) {
          window.showSuccessToast("Cambio de guardia aceptado");
          loadGuardias(_state.monthOffset, { currentUserName: _state.currentUserName, currentUserId: _state.currentUserId });
        } else {
          window.showErrorToast("Error al aceptar: " + (resp && resp.error ? resp.error : "unknown"));
        }
      });
    });
  }

  // Expose
  window.SP_Guardias = {
    load: loadGuardias,
    loadInto: loadGuardiasInto
  };

})();
