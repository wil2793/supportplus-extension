// ============================================================
// FEATURES/MANAGER-VIEW.JS - Kanban panel (groups, tickets, drag & drop)
// ============================================================

(function () {
  "use strict";

  var esc = window.esc;
  var SP_Session = window.SP_Session;
  var SP_Templates = window.SP_Templates;
  var SP_API_Lib = window.SP_API_Lib;
  var SP_SEARCH_API = window.SP_CONFIG.SP_SEARCH_API;
  var SP_API_BASE = window.SP_CONFIG.SP_API;

  // ─── Helper: fetch active tickets count for a group ───────
  function fetchGroupTicketCount(groupId, spToken) {
    return fetch(SP_SEARCH_API + "?resolutionGroupId=" + groupId + "&ticketStatusName=Asignado", {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      return ((json.data || json).content || []).length;
    }).catch(function () { return 0; });
  }

  // ─── Helper: fetch tickets for a profile ──────────────────
  function fetchProfileTickets(profileId, spToken) {
    return fetch(SP_SEARCH_API + "?responsibleProfileId=" + profileId + "&ticketStatusName=Asignado", {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      return (json.data || json).content || [];
    }).catch(function () { return []; });
  }

  // ─── Tag Filter Component ─────────────────────────────────
  function createTagFilter(id, items, onChangeCallback) {
    var container = document.createElement("div");
    container.id = id;
    container.className = "sp-tag-filter";
    var selectedIds = [];

    function render() {
      container.innerHTML = "";
      selectedIds.forEach(function (sid) {
        var item = items.find(function (i) { return String(i.id) === sid; });
        if (!item) return;
        var tag = document.createElement("span");
        tag.className = "sp-tag-filter-tag";
        tag.innerHTML = esc(item.name) + ' <span class="sp-tag-remove" data-remove="' + sid + '">✕</span>';
        tag.querySelector("[data-remove]").addEventListener("click", function () {
          selectedIds = selectedIds.filter(function (s) { return s !== sid; });
          render();
          onChangeCallback(selectedIds);
        });
        container.appendChild(tag);
      });

      var input = document.createElement("input");
      input.type = "text";
      input.placeholder = selectedIds.length ? "+ Agregar..." : "🔍 Filtrar grupos...";
      input.className = "sp-tag-filter-input";

      var dropdown = document.createElement("div");
      dropdown.className = "sp-tag-filter-dropdown";

      function showDropdown() {
        var query = input.value.toLowerCase();
        var available = items.filter(function (i) {
          return !selectedIds.includes(String(i.id)) && i.name.toLowerCase().includes(query);
        });
        if (!available.length || !query) { dropdown.style.display = "none"; return; }
        dropdown.innerHTML = "";
        available.slice(0, 10).forEach(function (item) {
          var opt = document.createElement("div");
          opt.className = "sp-tag-filter-option";
          opt.textContent = item.name;
          opt.addEventListener("mousedown", function (e) {
            e.preventDefault();
            selectedIds.push(String(item.id));
            input.value = "";
            render();
            onChangeCallback(selectedIds);
          });
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

  // ─── Update Ticket List (smooth diff) ─────────────────────
  function updateTicketList(listEl, tickets, canDrag) {
    var countEl = listEl.previousElementSibling ? listEl.previousElementSibling.querySelector(".sp-mgr-pcount") : null;
    if (countEl) countEl.textContent = "(" + tickets.length + ")";
    if (!tickets.length) {
      listEl.innerHTML = SP_Templates.emptyState("Sin tickets");
      return;
    }
    var html = tickets.map(function (t) {
      return SP_Templates.ticketCard(t, { draggable: canDrag, showStatus: true });
    }).join("");
    if (listEl.innerHTML !== html) listEl.innerHTML = html;
  }

  // ─── Render Group Detail (columns per analyst) ────────────
  function renderGroupDetail(groupId, container, profiles, spToken, canDrag) {
    var _lastDropTime = 0;

    // "Sin asignar" column
    var unassignedCol = document.createElement("div");
    unassignedCol.className = "sp-mgr-column";
    unassignedCol.style.borderColor = "#FF8F00";
    unassignedCol.innerHTML = '<div class="sp-col-header sp-col-header-unassigned">⏳ Sin asignar <span class="sp-mgr-pcount">(...)</span></div>' +
      '<div class="sp-mgr-ptickets" data-profile-id="unassigned" data-group-id="' + groupId + '"></div>';
    container.appendChild(unassignedCol);

    // Member columns
    profiles.forEach(function (p) {
      var col = document.createElement("div");
      col.className = "sp-mgr-column";
      col.innerHTML = '<div class="sp-col-header sp-col-header-member">' + esc(p.profileFullName.split(" ")[0]) + ' <span class="sp-mgr-pcount">(...)</span></div>' +
        '<div class="sp-mgr-ptickets" data-profile-id="' + p.profileId + '" data-group-id="' + groupId + '"></div>';
      container.appendChild(col);
    });

    // Click on ticket opens modal (not while dragging)
    var isDragging = false;
    container.addEventListener("mousedown", function () { isDragging = false; });
    container.addEventListener("mousemove", function (e) { if (e.buttons) isDragging = true; });
    container.addEventListener("click", function (e) {
      if (isDragging) return;
      if (Date.now() - _lastDropTime < 1500) return;
      var ticket = e.target.closest(".sp-mgr-ticket");
      if (!ticket) return;
      var ticketId = ticket.dataset.ticketId;
      if (ticketId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(ticketId) } }));
    });

    // Drag and drop
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
        var zone = e.target.closest(".sp-mgr-ptickets");
        if (!zone) {
          var col = e.target.closest(".sp-mgr-column");
          zone = col ? col.querySelector(".sp-mgr-ptickets") : null;
        }
        if (zone) zone.classList.add("sp-drag-over");
      });
      container.addEventListener("dragleave", function (e) {
        var zone = e.target.closest(".sp-mgr-ptickets");
        if (!zone) {
          var col = e.target.closest(".sp-mgr-column");
          zone = col ? col.querySelector(".sp-mgr-ptickets") : null;
        }
        if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("sp-drag-over");
      });
      container.addEventListener("drop", async function (e) {
        e.preventDefault();
        var zone = e.target.closest(".sp-mgr-ptickets");
        if (!zone) {
          var col = e.target.closest(".sp-mgr-column");
          zone = col ? col.querySelector(".sp-mgr-ptickets") : null;
        }
        if (!zone) return;
        zone.classList.remove("sp-drag-over");

        var ticketId = e.dataTransfer.getData("text/plain");
        var targetProfileId = zone.dataset.profileId;
        var targetGroupId = zone.dataset.groupId;
        if (!ticketId || !targetProfileId) return;

        // Same column check
        var src = container.querySelector('.sp-mgr-ticket[data-ticket-id="' + ticketId + '"]');
        if (src) {
          var srcZone = src.closest(".sp-mgr-ptickets");
          if (srcZone && srcZone.dataset.profileId === targetProfileId) return;
        }

        // Optimistic UI: move immediately
        var srcZoneRef = src ? src.closest(".sp-mgr-ptickets") : null;
        var targetZone = container.querySelector('.sp-mgr-ptickets[data-profile-id="' + targetProfileId + '"]');
        _lastDropTime = Date.now();

        if (src && targetZone) {
          // Remove "Sin tickets" placeholder from target
          var placeholder = targetZone.querySelector('div[style*="color:#aaa"]');
          if (placeholder) placeholder.remove();
          // Move ticket to target
          targetZone.appendChild(src);
          src.style.opacity = "1";
          src.style.border = "1px solid #eee";
          // Update source count
          if (srcZoneRef) {
            var srcCount = srcZoneRef.querySelectorAll(".sp-mgr-ticket").length;
            var srcCountEl = srcZoneRef.previousElementSibling ? srcZoneRef.previousElementSibling.querySelector(".sp-mgr-pcount") : null;
            if (srcCountEl) srcCountEl.textContent = "(" + srcCount + ")";
            if (!srcCount) srcZoneRef.innerHTML = SP_Templates.emptyState("Sin tickets");
          }
          // Update target count
          var tgtCount = targetZone.querySelectorAll(".sp-mgr-ticket").length;
          var tgtCountEl = targetZone.previousElementSibling ? targetZone.previousElementSibling.querySelector(".sp-mgr-pcount") : null;
          if (tgtCountEl) tgtCountEl.textContent = "(" + tgtCount + ")";
        }

        // API call (revert on error)
        try {
          var res = await fetch(SP_API_BASE + "/reassign/" + ticketId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
            body: JSON.stringify({
              resolutionGroupId: parseInt(targetGroupId),
              serviceId: null,
              responsibleProfileId: parseInt(targetProfileId),
              resolutionGroup: { label: "", value: parseInt(targetGroupId) }
            })
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var json = await res.json();
          if (!json.success) throw new Error("API returned no success");
        } catch (err) {
          // Revert: move ticket back to source
          window.showErrorToast("Error al reasignar: " + (err.message || "intenta de nuevo"));
          if (src && srcZoneRef) {
            var tgtPlaceholder = targetZone ? targetZone.querySelector('div[style*="color:#aaa"]') : null;
            if (tgtPlaceholder) tgtPlaceholder.remove();
            srcZoneRef.appendChild(src);
            // Re-update counts
            if (targetZone) {
              var revertTgtCount = targetZone.querySelectorAll(".sp-mgr-ticket").length;
              var revertTgtCountEl = targetZone.previousElementSibling ? targetZone.previousElementSibling.querySelector(".sp-mgr-pcount") : null;
              if (revertTgtCountEl) revertTgtCountEl.textContent = "(" + revertTgtCount + ")";
              if (!revertTgtCount) targetZone.innerHTML = SP_Templates.emptyState("Sin tickets");
            }
            var revertSrcCount = srcZoneRef.querySelectorAll(".sp-mgr-ticket").length;
            var revertSrcCountEl = srcZoneRef.previousElementSibling ? srcZoneRef.previousElementSibling.querySelector(".sp-mgr-pcount") : null;
            if (revertSrcCountEl) revertSrcCountEl.textContent = "(" + revertSrcCount + ")";
          }
        }
      });
    }

    // Fetch tickets per member
    profiles.forEach(function (p) {
      fetchProfileTickets(p.profileId, spToken).then(function (tickets) {
        var listEl = container.querySelector('.sp-mgr-ptickets[data-profile-id="' + p.profileId + '"]');
        if (!listEl) return;
        var countEl = listEl.previousElementSibling.querySelector(".sp-mgr-pcount");
        if (countEl) countEl.textContent = "(" + tickets.length + ")";

        var userConfig = SP_Session.state.userConfig || {};
        if (!tickets.length && userConfig.onlyWithTickets) {
          var col = listEl.parentElement;
          if (col) col.style.display = "none";
        }

        listEl.innerHTML = tickets.length
          ? SP_Templates.ticketList(tickets, { draggable: canDrag })
          : SP_Templates.emptyState("Sin tickets");
      });
    });

    // Fetch unassigned (En espera)
    fetch("https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups?page=0&size=50&resolutionGroupId=" + groupId + "&ticketStatusName=En%20espera", {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      var tickets = (json.data || json).content || [];
      var listEl = container.querySelector('.sp-mgr-ptickets[data-profile-id="unassigned"]');
      if (!listEl) return;
      var countEl = listEl.previousElementSibling.querySelector(".sp-mgr-pcount");
      if (countEl) countEl.textContent = "(" + tickets.length + ")";
      listEl.innerHTML = tickets.length
        ? SP_Templates.ticketList(tickets, { draggable: canDrag, borderColor: "#FF8F00", codeColor: "#E65100" })
        : SP_Templates.emptyState("Sin tickets");
    }).catch(function () { });

    // "Cerrados hoy" column
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

    var closedCol = document.createElement("div");
    closedCol.className = "sp-mgr-column";
    closedCol.style.borderColor = "#2E7D32";
    closedCol.innerHTML = '<div class="sp-col-header sp-col-header-closed">✅ Cerrados hoy <span class="sp-mgr-closed-count">(...)</span></div>' +
      '<div class="sp-mgr-closed-list sp-mgr-ptickets"></div>';
    closedCol.addEventListener("click", function (e) {
      var ticket = e.target.closest(".sp-mgr-ticket");
      if (!ticket) return;
      var ticketId = ticket.dataset.ticketId;
      if (ticketId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(ticketId) } }));
    });
    container.appendChild(closedCol);

    // "Pendientes por cerrar" column
    var pendingCol = document.createElement("div");
    pendingCol.className = "sp-mgr-column sp-mgr-pending-close-col";
    pendingCol.style.borderColor = "#FF8F00";
    pendingCol.style.display = "none";
    pendingCol.innerHTML = '<div class="sp-col-header sp-col-header-pending">🕐 Pendientes <span class="sp-mgr-pending-count">(...)</span></div>' +
      '<div class="sp-mgr-pending-list sp-mgr-ptickets"></div>';
    container.insertBefore(pendingCol, closedCol);

    // Load pending close tickets
    if (window.SP_ManagerView && window.SP_ManagerView._fetchPendingClose) {
      window.SP_ManagerView._fetchPendingClose(SP_Session.state.groups).then(function (pendingTickets) {
        if (!pendingTickets.length) return;
        pendingCol.style.display = "";
        var countEl = pendingCol.querySelector(".sp-mgr-pending-count");
        if (countEl) countEl.textContent = "(" + pendingTickets.length + ")";
        var listEl = pendingCol.querySelector(".sp-mgr-pending-list");
        if (!listEl) return;
        var withinHours = SP_Session.isWithinWorkHours();
        listEl.innerHTML = pendingTickets.map(function (pt) {
          return SP_Templates.pendingTicketCard(pt, withinHours);
        }).join("");
        listEl.addEventListener("click", function (e) {
          if (!SP_Session.isWithinWorkHours()) { window.showErrorToast("⏰ Fuera de horario laboral. No puedes cerrar tickets ahora."); return; }
          var ticket = e.target.closest(".sp-pending-ticket");
          if (!ticket) return;
          var tId = ticket.dataset.ticketId;
          if (tId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(tId) } }));
        });
      });
    }

    // Fetch closed today
    fetch(SP_SEARCH_API + "?resolutionGroupId=" + groupId + "&ticketStatusName=Cerrado&initDate=" + todayStr + "T00:00&endDate=" + todayStr + "T23:59&page=0&size=100", {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      var tickets = (json.data || json).content || [];
      var countEl = closedCol.querySelector(".sp-mgr-closed-count");
      if (countEl) countEl.textContent = "(" + tickets.length + ")";
      var listEl = closedCol.querySelector(".sp-mgr-closed-list");
      if (!listEl) return;
      listEl.innerHTML = tickets.length
        ? tickets.map(function (t) { return SP_Templates.ticketCard(t, { borderColor: "#2E7D32", codeColor: "#2E7D32", showResponsible: true }); }).join("")
        : SP_Templates.emptyState("Sin tickets");
    }).catch(function () { });
  }

  // ─── Load Group Detail (with blacklist) ───────────────────
  function loadManagerGroupDetail(groupId, container, spToken, canDrag) {
    fetch(SP_API_BASE + "/active-profiles-by-resolution-group/" + groupId, {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function (r) { return r.json(); }).then(function (json) {
      var profiles = json.data || json;
      if (!Array.isArray(profiles)) {
        container.innerHTML = '<div style="color:#888;font-size:11px;">Sin miembros</div>';
        return;
      }

      // Apply blacklist
      var userConfig = SP_Session.state.userConfig || {};
      var blacklist = userConfig.blacklist || [];

      if (blacklist.length > 0) {
        // Resolve blacklisted profile IDs from Notion pages
        Promise.all(blacklist.map(function (pageId) {
          return SP_API_Lib.notionGetPage(pageId).then(function (data) {
            return (data.properties && data.properties["Id Support Plus"] && data.properties["Id Support Plus"].number) || null;
          }).catch(function () { return null; });
        })).then(function (blacklistedIds) {
          blacklistedIds = blacklistedIds.filter(Boolean);
          if (blacklistedIds.length > 0) {
            profiles = profiles.filter(function (p) { return !blacklistedIds.includes(p.profileId); });
          }
          renderGroupDetail(groupId, container, profiles, spToken, canDrag);
        });
      } else {
        renderGroupDetail(groupId, container, profiles, spToken, canDrag);
      }
    }).catch(function () {
      container.innerHTML = '<div style="color:#888;font-size:11px;">Error al cargar</div>';
    });
  }

  // ─── Load Manager Panel ───────────────────────────────────
  function loadManagerPanel(grid, groups, canDrag) {
    var spToken = SP_API_Lib.getSpToken();
    if (!spToken) return;

    var panel = document.createElement("div");
    panel.id = "sp-manager-panel";
    panel.className = "sp-mgr-panel";
    grid.parentElement.insertBefore(panel, grid);

    var singleGroup = (groups.length === 1);
    var GROUP_INFO = window.SP_Header ? window.SP_Header.getGroupInfo() : window.SP_CONFIG.GROUP_INFO;

    var groupsInfo = groups.map(function (gId) {
      return GROUP_INFO.find(function (g) { return g.id === gId; }) || { id: gId, name: "Grupo " + gId };
    });

    // Summary row (only multiple groups)
    var summaryDiv = document.createElement("div");
    summaryDiv.className = "sp-mgr-summary-row";
    if (!singleGroup) panel.appendChild(summaryDiv);

    // Summary filter
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
        col.className = "sp-summary-card";
        col.style.borderColor = "#1976D2";
        col.innerHTML = '<div class="sp-summary-card-header" style="background:#1976D2;">' + esc(dept.name) + '</div>' +
          '<div class="sp-mgr-count sp-summary-card-count" style="color:#1976D2;">...</div>';
        summaryDiv.appendChild(col);
      });
    }

    // Collapse filter
    if (!singleGroup) {
      var collapseTagFilter = createTagFilter("sp-mgr-collapse-filter", groupsInfo, function (selected) {
        panel.querySelectorAll("[id^='sp-mgr-section-']").forEach(function (el) {
          var gId = el.id.replace("sp-mgr-section-", "");
          el.style.display = (!selected.length || selected.includes(gId)) ? "" : "none";
        });
      });
      panel.appendChild(collapseTagFilter.element);
    }

    // Collapsible sections per group
    groupsInfo.forEach(function (dept) {
      var section = document.createElement("div");
      section.id = "sp-mgr-section-" + dept.id;
      section.className = "sp-section";

      var header = document.createElement("div");
      header.className = "sp-section-header";
      header.innerHTML = '<span>📂 ' + esc(dept.name) + '</span><span class="sp-mgr-toggle" style="font-size:14px;">' + (singleGroup ? '▼' : '▶') + '</span>';

      var body = document.createElement("div");
      body.className = "sp-mgr-body sp-section-body";
      body.style.display = singleGroup ? "block" : "none";
      body.innerHTML = '<div class="sp-mgr-columns sp-mgr-columns-wrap"></div>';

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
      fetchGroupTicketCount(dept.id, spToken).then(function (count) {
        var col = document.getElementById("sp-mgr-summary-" + dept.id);
        if (col) col.querySelector(".sp-mgr-count").textContent = count;
      });
    });

    // Auto-refresh summary every 60s (uses requestIdleCallback for better perf)
    var _summaryInterval = setInterval(function () {
      if (!document.getElementById("sp-manager-panel")) { clearInterval(_summaryInterval); return; }
      var doRefresh = function () {
        groupsInfo.forEach(function (dept) {
          fetchGroupTicketCount(dept.id, spToken).then(function (count) {
            var col = document.getElementById("sp-mgr-summary-" + dept.id);
            if (col) col.querySelector(".sp-mgr-count").textContent = count;
          });
        });
      };
      if (window.requestIdleCallback) {
        window.requestIdleCallback(doRefresh, { timeout: 5000 });
      } else {
        doRefresh();
      }
    }, 60000);

    // Refresh open collapsibles on tab focus
    function refreshOpenCollapsibles() {
      panel.querySelectorAll(".sp-mgr-body").forEach(function (body) {
        if (body.style.display !== "none" && body.dataset.loaded) {
          body.querySelectorAll(".sp-mgr-ptickets").forEach(function (listEl) {
            var profileId = listEl.dataset.profileId;
            var gId = listEl.dataset.groupId || "";
            if (profileId === "unassigned") {
              fetch(SP_SEARCH_API + "?resolutionGroupId=" + gId + "&ticketStatusName=En%20espera&page=0&size=100", {
                headers: { accept: "application/json", authorization: "Bearer " + spToken }
              }).then(function (r) { return r.json(); }).then(function (json) {
                updateTicketList(listEl, (json.data || json).content || [], canDrag);
              }).catch(function () { });
            } else {
              fetchProfileTickets(profileId, spToken).then(function (tickets) {
                updateTicketList(listEl, tickets, canDrag);
              });
            }
          });
        }
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refreshOpenCollapsibles();
    });
    document.addEventListener("sp-refresh-panel", refreshOpenCollapsibles);
  }

  // ─── Init Manager View ────────────────────────────────────
  function initManagerView() {
    var groups = SP_Session.state.groups;
    if (!groups || !groups.length) return;
    var canDrag = SP_Session.state.canDragDrop;
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
      if (!window.location.pathname.includes("/dashboard/tickets-mesa")) {
        attempts++;
        if (attempts > 40) clearInterval(interval);
        return;
      }
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid && attempts < 40) { attempts++; return; }
      clearInterval(interval);
      if (!grid) return;
      if (document.getElementById("sp-manager-panel")) return;
      mgrLoading = true;
      loadManagerPanel(grid, groups, canDrag);
    }, 500);

    // Observer for SPA re-navigation
    var mgrDebounceTimer = null;
    var mgrObserver = new MutationObserver(function () {
      if (mgrDebounceTimer) clearTimeout(mgrDebounceTimer);
      mgrDebounceTimer = setTimeout(function () {
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

  // Expose
  window.SP_ManagerView = {
    init: initManagerView,
    _fetchPendingClose: null // Set by content.js (fetchPendingCloseTickets)
  };

})();
