// ============================================================
// FEATURES/GUARDIAS.JS - Control de Guardias (calendario + cambios)
// ============================================================

(function () {
  "use strict";

  const GUARDIAS_DB = "36d20e0684b98004b687c452ab2367a2";
  const SOLICITUD_DB = "39020e0684b9802db4b3ec41257e7c1f";
  const MESES = window.SP_CONFIG.MONTH_NAMES;
  const _state = { monthOffset: 0, entries: {}, rawEntries: [], myDays: [], currentUserName: "", currentUserPageId: "" };

  // ─── Load Guardias Calendar ───────────────────────────────

  function loadGuardias(offset, options) {
    _state.monthOffset = offset;
    const opts = options || {};
    _state.currentUserName = opts.currentUserName || "";
    _state.currentUserPageId = opts.currentUserPageId || "";
    const gContent = document.getElementById("sp-dba-guardias-content");
    if (!gContent) return;
    gContent.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Cargando...</div>';

    const today = new Date();
    const targetMonth = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const startStr = year + "-" + String(month + 1).padStart(2, "0") + "-01";
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

    // Fetch guardias entries
    chrome.runtime.sendMessage({
      type: "notion-query", dbId: GUARDIAS_DB, body: {
        filter: { and: [
          { property: "Fecha", date: { on_or_after: startStr } },
          { property: "Fecha", date: { on_or_before: endStr } }
        ]},
        sorts: [{ property: "Fecha", direction: "ascending" }]
      }
    }, function (resp) {
      if (!resp || !resp.success) {
        renderCalendar(gContent, {}, [], year, month, lastDay, todayStr);
        return;
      }

      // Resolve users from storage
      chrome.storage.local.get("notionUsers", function (stored) {
        const notionUsers = stored.notionUsers || {};
        const pageIdToName = {};
        Object.keys(notionUsers).forEach(function (email) {
          const u = notionUsers[email];
          if (u.notionPageId && u.name) pageIdToName[u.notionPageId] = u.name;
        });

        const entries = {};
        const rawEntries = [];

        (resp.data.results || []).forEach(function (p) {
          const date = (p.properties.Fecha && p.properties.Fecha.date) ? p.properties.Fecha.date.start : "";
          const userRelation = (p.properties.Usuario && p.properties.Usuario.relation) || [];
          const fallbackName = (p.properties.Nombre && p.properties.Nombre.title && p.properties.Nombre.title[0]) ? p.properties.Nombre.title[0].plain_text : "";
          const userPageId = userRelation.length > 0 ? userRelation[0].id : "";
          const name = (userPageId ? (pageIdToName[userPageId] || "") : "") || fallbackName;
          if (date) {
            entries[date] = name;
            rawEntries.push({ pageId: p.id, date: date, name: name, userPageId: userPageId });
          }
        });

        _state.entries = entries;
        _state.rawEntries = rawEntries;
        _state.myDays = rawEntries.filter(function (e) {
          return e.userPageId === _state.currentUserPageId;
        });

        // Fetch pending solicitudes to show indicators
        fetchPendingSolicitudes(function (pending) {
          renderCalendar(gContent, entries, rawEntries, year, month, lastDay, todayStr, pending);
        });
      });
    });
  }

  // ─── Fetch Pending Solicitudes ────────────────────────────

  function fetchPendingSolicitudes(callback) {
    chrome.runtime.sendMessage({
      type: "notion-query", dbId: SOLICITUD_DB, body: {
        filter: { property: "Aceptado", checkbox: { equals: false } }
      }
    }, function (resp) {
      const pending = [];
      if (resp && resp.success && resp.data.results) {
        resp.data.results.forEach(function (p) {
          const guardiaRel = (p.properties.DBA_ControlDeGuardias && p.properties.DBA_ControlDeGuardias.relation) || [];
          const ofrecidoRel = (p.properties.DBA_ControlDeGuardias_Ofrecido && p.properties.DBA_ControlDeGuardias_Ofrecido.relation) || [];
          const solicitanteRel = (p.properties["\ud83c\udfdb\ufe0f UsuarioSolicitante"] && p.properties["\ud83c\udfdb\ufe0f UsuarioSolicitante"].relation) || [];
          const motivo = (p.properties.MotivoCambio && p.properties.MotivoCambio.title && p.properties.MotivoCambio.title[0]) ? p.properties.MotivoCambio.title[0].plain_text : "";
          pending.push({
            id: p.id,
            guardiaPageId: guardiaRel.length > 0 ? guardiaRel[0].id : "",
            ofrecidoPageId: ofrecidoRel.length > 0 ? ofrecidoRel[0].id : "",
            solicitantePageId: solicitanteRel.length > 0 ? solicitanteRel[0].id : "",
            motivo: motivo
          });
        });
      }
      callback(pending);
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
    for (var s = 0; s < startOffset; s++) {
      calParts.push('<div style="padding:6px;min-height:50px;"></div>');
    }

    for (var day = 1; day <= lastDay; day++) {
      const d = new Date(year, month, day);
      const dow = d.getDay();
      const dStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const entry = entries[dStr] || "";
      const rawEntry = rawEntries.find(function (e) { return e.date === dStr; });
      const isToday = dStr === todayStr;
      const isWeekend = dow === 0 || dow === 6;
      const isMyDay = entry && currentUserName && entry.toLowerCase().includes(currentUserName.split(" ")[0].toLowerCase());
      const isOtherDay = entry && !isMyDay;

      // Check if this day has a pending solicitud targeting it
      const pendingForDay = rawEntry ? pendingList.find(function (p) { return p.guardiaPageId === rawEntry.pageId; }) : null;
      // Check if this day is offered in a pending solicitud for me
      const pendingForMe = rawEntry ? pendingList.find(function (p) { return p.ofrecidoPageId === rawEntry.pageId; }) : null;
      const hasPendingIndicator = pendingForDay && rawEntry && rawEntry.userPageId === _state.currentUserPageId;

      const bgColor = isToday ? "#E3F2FD" : isMyDay ? "#E8F5E9" : isWeekend ? "#FFF3E0" : "#f9f9f9";
      const borderColor = isToday ? "#1976D2" : isMyDay ? "#4CAF50" : hasPendingIndicator ? "#FF8F00" : "#e0e0e0";
      const firstName = entry ? entry.split(" ")[0] : "";
      const clickable = isOtherDay ? 'cursor:pointer;' : '';
      const dataAttrs = rawEntry ? 'data-guardia-page="' + rawEntry.pageId + '" data-guardia-date="' + dStr + '" data-guardia-name="' + entry + '"' : '';
      const pendingDot = hasPendingIndicator ? '<div style="width:8px;height:8px;border-radius:50%;background:#FF8F00;margin-top:2px;" title="Solicitud pendiente"></div>' : '';

      calParts.push(
        '<div class="sp-guardia-day" ' + dataAttrs + ' style="padding:4px 6px;min-height:50px;background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;' + clickable + '">' +
        '<div style="font-size:13px;font-weight:' + (isToday ? '700' : '600') + ';color:' + (isToday ? '#1976D2' : isWeekend ? '#E65100' : '#333') + ';">' + day + '</div>' +
        '<div style="font-size:9px;color:#555;text-align:center;margin-top:2px;' + (isMyDay ? 'font-weight:700;color:#2E7D32;' : '') + '">' + firstName + '</div>' +
        pendingDot +
        '</div>'
      );
    }
    calParts.push('</div>');

    gContent.innerHTML = '<div style="text-align:center;font-weight:600;margin-bottom:10px;font-size:14px;">' + MESES[month] + ' ' + year + '</div>' + headerParts.join("") + calParts.join("");

    // Nav buttons
    const prevBtn = document.getElementById("sp-dba-guardias-prev");
    const nextBtn = document.getElementById("sp-dba-guardias-next");
    if (prevBtn) { prevBtn.onclick = function () { loadGuardias(_state.monthOffset - 1, { currentUserName: _state.currentUserName, currentUserPageId: _state.currentUserPageId }); }; }
    if (nextBtn) { nextBtn.onclick = function () { loadGuardias(_state.monthOffset + 1, { currentUserName: _state.currentUserName, currentUserPageId: _state.currentUserPageId }); }; }

    // Click handlers for days
    gContent.querySelectorAll(".sp-guardia-day[data-guardia-page]").forEach(function (cell) {
      cell.addEventListener("click", function () {
        const guardiaPageId = cell.dataset.guardiaPage;
        const guardiaDate = cell.dataset.guardiaDate;
        const guardiaName = cell.dataset.guardiaName;
        const rawEntry = _state.rawEntries.find(function (e) { return e.pageId === guardiaPageId; });
        if (!rawEntry) return;

        // Check if this is MY day with a pending solicitud → show accept modal
        const pendingForMe = pendingList.find(function (p) { return p.guardiaPageId === guardiaPageId; });
        if (rawEntry.userPageId === _state.currentUserPageId && pendingForMe) {
          showAcceptModal(pendingForMe, guardiaDate, guardiaName);
          return;
        }

        // If it's someone else's day → check if already has a pending request
        if (rawEntry.userPageId !== _state.currentUserPageId) {
          const alreadyRequested = pendingList.find(function (p) { return p.guardiaPageId === guardiaPageId; });
          if (alreadyRequested) {
            window.showErrorToast("Ya existe una solicitud pendiente para ese día.");
            return;
          }
          showRequestModal(guardiaPageId, guardiaDate, guardiaName);
        }
      });
    });
  }

  // ─── Request Swap Modal ───────────────────────────────────

  function showRequestModal(targetGuardiaPageId, targetDate, targetName) {
    // Build options from my days
    const myDayOpts = _state.myDays.map(function (d) {
      return '<option value="' + d.pageId + '">' + d.date + '</option>';
    }).join("");

    if (!myDayOpts) {
      window.showErrorToast("No tienes días asignados este mes para ofrecer intercambio.");
      return;
    }

    const m = window.createModal({
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
      options: { maxWidth: "420px" }
    });

    document.getElementById("sp-guardia-cancel").addEventListener("click", m.close);

    document.getElementById("sp-guardia-send").addEventListener("click", function () {
      const myDayPageId = document.getElementById("sp-guardia-my-day").value;
      const motivo = document.getElementById("sp-guardia-motivo").value.trim();
      if (!myDayPageId) { window.showErrorToast("Selecciona uno de tus días"); return; }
      if (!motivo) { window.showErrorToast("Escribe un motivo"); return; }

      const sendBtn = document.getElementById("sp-guardia-send");
      sendBtn.disabled = true;
      sendBtn.textContent = "⏳ Enviando...";

      // Create solicitud in Notion
      chrome.runtime.sendMessage({
        type: "notion-create",
        body: {
          parent: { database_id: SOLICITUD_DB },
          properties: {
            "MotivoCambio": { title: [{ text: { content: motivo } }] },
            "DBA_ControlDeGuardias": { relation: [{ id: targetGuardiaPageId }] },
            "DBA_ControlDeGuardias_Ofrecido": { relation: [{ id: myDayPageId }] },
            "\ud83c\udfdb\ufe0f UsuarioSolicitante": { relation: _state.currentUserPageId ? [{ id: _state.currentUserPageId }] : [] },
            "Aceptado": { checkbox: false }
          }
        }
      }, function (resp) {
        m.close();
        if (resp && resp.success) {
          window.showSuccessToast("Solicitud de cambio enviada");
          loadGuardias(_state.monthOffset, { currentUserName: _state.currentUserName, currentUserPageId: _state.currentUserPageId });
        } else {
          window.showErrorToast("Error al enviar: " + (resp && resp.error ? resp.error : "revisa consola"));
          if (window.SP_Log) window.SP_Log.error("Guardia solicitud error:", resp);
        }
      });
    });
  }

  // ─── Accept Swap Modal ────────────────────────────────────

  function showAcceptModal(solicitud, targetDate, targetName) {
    // Resolve solicitante name
    chrome.storage.local.get("notionUsers", function (stored) {
      const notionUsers = stored.notionUsers || {};
      const pageIdToName = {};
      Object.keys(notionUsers).forEach(function (email) {
        const u = notionUsers[email];
        if (u.notionPageId && u.name) pageIdToName[u.notionPageId] = u.name;
      });

      const solicitanteName = pageIdToName[solicitud.solicitantePageId] || "Alguien";
      const ofrecidoEntry = _state.rawEntries.find(function (e) { return e.pageId === solicitud.ofrecidoPageId; });
      const ofrecidoDate = ofrecidoEntry ? ofrecidoEntry.date : "?";

      const m = window.createModal({
        id: "sp-guardia-accept-modal",
        title: "📬 Solicitud de cambio",
        content:
          '<p style="font-size:13px;color:#555;margin:0 0 8px;"><b>' + solicitanteName + '</b> quiere cambiarte tu día <b>' + targetDate + '</b></p>' +
          '<p style="font-size:13px;color:#555;margin:0 0 12px;">Te ofrece su día: <b>' + ofrecidoDate + '</b></p>' +
          '<div style="padding:10px;background:#f5f5f5;border-radius:6px;margin-bottom:16px;">' +
          '<label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Motivo:</label>' +
          '<p style="margin:0;font-size:13px;color:#333;">' + (solicitud.motivo || "Sin motivo") + '</p>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button id="sp-guardia-accept" style="flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">✅ Aceptar cambio</button>' +
          '<button id="sp-guardia-reject" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Rechazar</button>' +
          '</div>',
        options: { maxWidth: "420px" }
      });

      document.getElementById("sp-guardia-reject").addEventListener("click", m.close);

      document.getElementById("sp-guardia-accept").addEventListener("click", function () {
        const acceptBtn = document.getElementById("sp-guardia-accept");
        acceptBtn.disabled = true;
        acceptBtn.textContent = "⏳ Procesando...";

        // 1. Mark solicitud as accepted
        chrome.runtime.sendMessage({
          type: "notion-update", pageId: solicitud.id,
          body: { properties: { "Aceptado": { checkbox: true } } }
        }, function (acceptResp) {
          if (!acceptResp || !acceptResp.success) {
            m.close();
            window.showErrorToast("Error al aceptar: " + (acceptResp && acceptResp.error ? acceptResp.error : "unknown"));
            return;
          }

          // 2. Swap users in DBA_ControlDeGuardias
          const targetEntry = _state.rawEntries.find(function (e) { return e.pageId === solicitud.guardiaPageId; });
          const offeredEntry = _state.rawEntries.find(function (e) { return e.pageId === solicitud.ofrecidoPageId; });

          // Target day: put solicitante, save current as anterior
          const targetUserBefore = (targetEntry && targetEntry.userPageId) ? targetEntry.userPageId : _state.currentUserPageId;
          // Offered day: put accepter (me), save solicitante as anterior
          const offeredUserBefore = (offeredEntry && offeredEntry.userPageId) ? offeredEntry.userPageId : solicitud.solicitantePageId;

          const updateTarget = new Promise(function (resolve) {
            chrome.runtime.sendMessage({
              type: "notion-update", pageId: solicitud.guardiaPageId,
              body: { properties: {
                "Usuario": { relation: [{ id: solicitud.solicitantePageId }] },
                "Usuario_Anterior": { relation: targetUserBefore ? [{ id: targetUserBefore }] : [] }
              }}
            }, function (resp) {
              if (!resp || !resp.success) { if (window.SP_Log) window.SP_Log.error("Swap target failed:", resp); }
              resolve();
            });
          });

          const updateOffered = new Promise(function (resolve) {
            chrome.runtime.sendMessage({
              type: "notion-update", pageId: solicitud.ofrecidoPageId,
              body: { properties: {
                "Usuario": { relation: [{ id: _state.currentUserPageId }] },
                "Usuario_Anterior": { relation: offeredUserBefore ? [{ id: offeredUserBefore }] : [] }
              }}
            }, function (resp) {
              if (!resp || !resp.success) { if (window.SP_Log) window.SP_Log.error("Swap offered failed:", resp); }
              resolve();
            });
          });

          Promise.all([updateTarget, updateOffered]).then(function () {
            m.close();
            window.showSuccessToast("Cambio de guardia aceptado");
            loadGuardias(_state.monthOffset, { currentUserName: _state.currentUserName, currentUserPageId: _state.currentUserPageId });
          });
        });
      });
    });
  }

  // Expose
  window.SP_Guardias = {
    load: loadGuardias,
    DB_ID: GUARDIAS_DB,
    SOLICITUD_DB: SOLICITUD_DB
  };

})();
