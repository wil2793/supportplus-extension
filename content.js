(function () {
  console.log("[SP] Extension loading...");
  // Make loading backdrop less invasive - thin top bar instead of fullscreen (all users)
  const hideBackdrop = document.createElement("style");
  hideBackdrop.textContent = ".MuiBackdrop-root { background: transparent !important; top: 0 !important; bottom: auto !important; height: 3px !important; opacity: 1 !important; } .MuiBackdrop-root .MuiCircularProgress-root { display: none !important; } .MuiBackdrop-root::after { content: ''; position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: #D94040; animation: sp-loading-bar 1.2s ease-in-out infinite; } @keyframes sp-loading-bar { 0% { left: -30%; } 100% { left: 100%; } } .MuiDataGrid-cell[data-field='uniqueCode'] { min-width: 320px !important; max-width: 320px !important; } .MuiDataGrid-columnHeader[data-field='uniqueCode'] { min-width: 320px !important; max-width: 320px !important; }";
  document.head.appendChild(hideBackdrop);

  const GROUP_INFO = [
    { id: 9, name: "Mesa de Ayuda" },
    { id: 10, name: "Soporte a Tiendas" },
    { id: 11, name: "Soporte Tecnico" },
    { id: 12, name: "Infraestructura IAM" },
    { id: 14, name: "SAP ABAP" },
    { id: 15, name: "SAP BASIS" },
    { id: 16, name: "SAP Funcional (Datos maestros)" },
    { id: 18, name: "Infraestructura (Cloud/ Servidores)" },
    { id: 19, name: "Infraestructura DBA" },
    { id: 20, name: "Infraestructura DevOps" },
    { id: 21, name: "Central de Monitoreo" },
    { id: 22, name: "Aplicaciones- Liberacion e Implementacion" },
    { id: 23, name: "Problemas" },
    { id: 24, name: "Ciberseguridad" },
    { id: 25, name: "Herramienta de Gestion" },
    { id: 26, name: "SAP Funcional (Modulo Banking - CML)" },
    { id: 27, name: "SAP Funcional (Modulo Compras)" },
    { id: 28, name: "SAP Funcional (Modulo Finanzas)" },
    { id: 29, name: "SAP Funcional (Modulo Garantias)" },
    { id: 30, name: "SAP Funcional (Modulo Logistico y Distribucion)" },
    { id: 31, name: "SAP Funcional (Modulo Presupuestos)" },
    { id: 32, name: "SAP Funcional (Modulo Comercial)" },
    { id: 33, name: "Salesforce Comunicaciones" },
    { id: 34, name: "Salesforce Funcional" },
    { id: 51, name: "Soporte Redes y Telecomunicaciones" },
    { id: 52, name: "Telefonia movil" },
    { id: 53, name: "Soporte Aplicativos y Sistemas (general)" },
    { id: 55, name: "Control Auditoria" },
    { id: 56, name: "Control Cadena Suministro" },
    { id: 57, name: "Control Cambaceo" },
    { id: 58, name: "Control Capital Humano" },
    { id: 59, name: "Centro de Servicios" },
    { id: 60, name: "Control CIAB" },
    { id: 61, name: "Control Cobranza" },
    { id: 62, name: "Control Comercial" },
    { id: 64, name: "Control Compras Internas" },
    { id: 65, name: "Control Cons/Mntto" },
    { id: 66, name: "Control Control Interno" },
    { id: 67, name: "Control Experiencia Cliente" },
    { id: 68, name: "Control Finanzas" },
    { id: 69, name: "Control Innovacion Crediticia" },
    { id: 70, name: "Control Juridico" },
    { id: 71, name: "Control Mercadotecnia" },
    { id: 72, name: "Control MNVO" },
    { id: 73, name: "Control Tiendas" },
    { id: 74, name: "control Transformacion Digital" },
    { id: 76, name: "Presupuestos TD" },
    { id: 77, name: "Activo Fijo" },
    { id: 78, name: "Mobile" },
    { id: 79, name: "Control Productos Prendarios" },
    { id: 80, name: "Categoría de inicio" },
    { id: 83, name: "Soporte office 365" },
    { id: 84, name: "Desarrollo" },
    { id: 85, name: "PMO" },
    { id: 86, name: "Desarrollo Organizacional" },
    { id: 87, name: "CANCELAR PR" },
    { id: 88, name: "Soporte a Tiendas - Interno" },
    { id: 89, name: "Viaticos" },
    { id: 90, name: "Compras Tecnologia" },
    { id: 91, name: "Compras Internas" }
  ];

  var currentUserRole = "usuario";
  var currentViewMode = null; // null = use own role's view
  var currentUserGroups = []; // Groups from Notion

  function getActiveViewMode() {
    return currentViewMode || currentUserRole;
  }

  // --- Session check ---
  var sessionUserName = ""; // Full name from session API, cached globally
  var sessionProfileId = null; // profileId resolved at startup

  // Load saved profileId
  try {
    chrome.storage.local.get("myProfileId", function(r) {
      if (r.myProfileId) { sessionProfileId = r.myProfileId; myProfileId = r.myProfileId; }
    });
  } catch(e) {}

  async function checkSession() {
    try {
      var res = await fetch("https://macropay.supportplus.mx/api/auth/session", {
        headers: { accept: "application/json", authorization: "Bearer " + (localStorage.getItem("token") || "") }
      });
      if (!res.ok) return "usuario";
      var data = await res.json();
      var email = data?.user?.email?.toLowerCase() || "";
      sessionUserName = data?.user?.name || "";
      try { chrome.storage.local.set({ userEmail: email }); } catch(e) {}

      // Read Notion data from storage (synced by background)
      var notionData = await new Promise(function(resolve) {
        chrome.storage.local.get("notionUsers", function(r) { resolve(r.notionUsers || null); });
      });

      // Always trigger a background re-sync (non-blocking)
      try { chrome.runtime.sendMessage({ type: "sync-notion" }); } catch(e) {}

      // If no Notion data yet, wait for sync
      if (!notionData) {
        await new Promise(function(r) { setTimeout(r, 3000); });
        notionData = await new Promise(function(resolve) {
          chrome.storage.local.get("notionUsers", function(r) { resolve(r.notionUsers || null); });
        });
      }

      // If still no Notion data, wait and don't load (no fallback to hardcoded)
      if (!notionData) return null;

      // Find user in Notion data
      var userData = notionData[email];
      if (!userData) return null; // Not in Notion = no access
      if (!userData.active) return "inactive";

      // Set profileId
      if (userData.profileId) {
        sessionProfileId = userData.profileId;
        try { chrome.storage.local.set({ myProfileId: userData.profileId }); } catch(e) {}
      }

      // Set groups
      if (userData.groups && userData.groups.length > 0) {
        currentUserGroups = userData.groups;
      }

      return userData.role;
    } catch(e) { return "usuario"; }
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
      var me = profiles.find(function(p) { return p.profileFullName === name; });
      if (me) {
        sessionProfileId = me.profileId;
        try { chrome.storage.local.set({ sessionProfileId: me.profileId }); } catch(e) {}
      }
      return sessionProfileId;
    } catch(e) { return null; }
  }

  // Helper to get name from DOM (fallback if session name not available yet)
  function getLoggedUserNameFromDOM() {
    var el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
    return el ? el.textContent.trim() : "";
  }

  checkSession().then(function(role) {
    if (role === null) { showAccessMessage("⚠️ Usuario no registrado en SupportPlus Tools. Solicite su alta con el administrador."); return; }
    if (role === "inactive") { showAccessMessage("⚠️ Usuario inactivo en SupportPlus Tools. Solicite su reactivación con el administrador."); return; }
    currentUserRole = role;
    // Admin: restore saved view mode
    if (role === "admin") {
      currentViewMode = localStorage.getItem("sp_view_mode") || null;
    }
    initByRole();
  });

  function showAccessMessage(text) {
    var attempts = 0;
    var interval = setInterval(function() {
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
    var viewMode = getActiveViewMode();
    // If admin is simulating another view, load that role's groups
    if (currentUserRole === "admin" && currentViewMode && currentViewMode !== "admin") {
      chrome.storage.local.get("notionRolesGroups", function(r) {
        var rolesGroups = r.notionRolesGroups || {};
        // Find groups for the simulated role (match by key)
        var roleGroups = rolesGroups[currentViewMode] || [];
        // Try partial match if exact not found (e.g. "gerente" matches "gerente dba")
        if (!roleGroups.length) {
          Object.keys(rolesGroups).forEach(function(key) {
            if (key.includes(currentViewMode) && rolesGroups[key].length > 0) {
              roleGroups = rolesGroups[key];
            }
          });
        }
        if (roleGroups.length > 0) currentUserGroups = roleGroups;
        initExtension();
        if (currentUserGroups.length > 1) {
          initManagerView(viewMode);
        }
        injectViewSwitcher();
      });
      return;
    }
    // Always init extension (for config, buttons, etc.)
    initExtension();
    // Always show manager view (unified) - groups determine if filter/counter shows
    if (currentUserGroups.length > 0) {
      initManagerView(getActiveViewMode());
    }
    // Admin gets the view switcher
    if (currentUserRole === "admin") injectViewSwitcher();
  }

  // --- View switcher (admin only) ---
  function injectViewSwitcher() {
    var attempts = 0;
    var interval = setInterval(function() {
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper && attempts < 30) { attempts++; return; }
      clearInterval(interval);
      if (!userWrapper) return;
      if (document.getElementById("sp-view-switcher")) return;

      var select = document.createElement("select");
      select.id = "sp-view-switcher";
      select.style.cssText = "padding:4px 8px;font-size:11px;border:1px solid rgba(255,255,255,0.3);border-radius:4px;background:rgba(30,30,30,0.9);color:#fff;margin-right:8px;cursor:pointer;";
      // Default option
      select.innerHTML = '<option value="" style="background:#222;color:#fff;"' + (!currentViewMode ? " selected" : "") + '>👤 Mi vista (Admin)</option>';
      // Load roles from Notion storage
      chrome.storage.local.get("notionRoles", function(r) {
        var rolesList = r.notionRoles || [];
        var roleIcons = { "ceo": "🏛️", "director": "👔", "gerente dba": "🏢", "gerente": "🏢", "usuario dba": "🧑‍💻", "usuario": "🧑‍💻" };
        rolesList.forEach(function(roleName) {
          var roleKey = roleName.toLowerCase();
          var icon = roleIcons[roleKey] || "👁️";
          var opt = document.createElement("option");
          opt.value = roleKey;
          opt.textContent = icon + " " + roleName;
          opt.style.cssText = "background:#222;color:#fff;";
          if (currentViewMode === roleKey) opt.selected = true;
          select.appendChild(opt);
        });
      });
      select.addEventListener("change", function() {
        var val = select.value;
        if (val) {
          localStorage.setItem("sp_view_mode", val);
        } else {
          localStorage.removeItem("sp_view_mode");
        }
        window.location.reload();
      });
      userWrapper.parentElement.insertBefore(select, userWrapper);
    }, 500);
  }

  // --- Global config modal reference ---
  var _showConfigModal = null;
  var _showQuickDetailModal = null;
  document.addEventListener("sp-open-config", function() { if (_showConfigModal) _showConfigModal(); });
  document.addEventListener("sp-open-ticket", function(e) { if (e.detail && e.detail.ticketId && _showQuickDetailModal) _showQuickDetailModal(e.detail.ticketId); });

  // --- Manager view (director / gerente) ---
  function initManagerView(viewMode) {
    // Groups come from Notion (currentUserGroups)
    var groups;
    if (currentUserGroups.length > 0) {
      groups = currentUserGroups;
    } else if (viewMode === "ceo") {
      groups = GROUP_INFO.map(function(g) { return g.id; });
    } else {
      groups = [19]; // fallback
    }
    var canDrag = (viewMode === "gerente" || viewMode === "admin" || viewMode === "director");
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
    var interval = setInterval(function() {
      if (!window.location.pathname.includes("/dashboard/tickets-mesa")) { attempts++; if (attempts > 40) clearInterval(interval); return; }
      var grid = document.querySelector(".MuiDataGrid-root");
      if (!grid && attempts < 40) { attempts++; return; }
      clearInterval(interval);
      if (!grid) return;
      if (document.getElementById("sp-manager-panel")) return;
      mgrLoading = true;
      loadManagerPanel(grid, groups, canDrag);
    }, 500);

    // Observer to re-inject when navigating back
    var mgrObserver = new MutationObserver(function() {
      // Remove panel if not on the right page
      if (!window.location.pathname.includes("/dashboard/tickets-mesa")) {
        var existing = document.getElementById("sp-manager-panel");
        if (existing) { existing.remove(); mgrLoading = false; }
        return;
      }
      tryInject();
    });
    mgrObserver.observe(document.body, { childList: true, subtree: true });
  }

  function loadManagerPanel(grid, groups, canDrag) {
    var spToken = localStorage.getItem("token");
    if (!spToken) return;

    // Inject config button for manager views
    var cfgAttempts = 0;
    var cfgInterval = setInterval(function() {
      if (document.getElementById("sp-config-btn") || cfgAttempts > 20) { clearInterval(cfgInterval); return; }
      var userWrapper = document.querySelector('[class*="warapperNameUserAndLogout"]');
      if (!userWrapper) { cfgAttempts++; return; }
      clearInterval(cfgInterval);
      var btn = document.createElement("button");
      btn.id = "sp-config-btn";
      btn.textContent = "⚙️";
      btn.title = "Configuración SupportPlus Tools";
      btn.style.cssText = "padding:4px 10px;font-size:14px;cursor:pointer;border:none;border-radius:6px;background:rgba(255,255,255,0.15);color:#fff;margin-right:8px;";
      btn.addEventListener("click", function() {
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

    var groupsInfo = groups.map(function(gId) {
      return GROUP_INFO.find(function(g) { return g.id === gId; }) || { id: gId, name: "Grupo " + gId };
    });

    // --- Tag filter component ---
    function createTagFilter(id, items, onChangeCallback) {
      var container = document.createElement("div");
      container.id = id;
      container.style.cssText = "margin-bottom:8px;padding:6px 8px;border:1px solid #ddd;border-radius:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;position:relative;";

      var selectedIds = []; // Empty = show all

      function render() {
        container.innerHTML = "";
        selectedIds.forEach(function(sid) {
          var item = items.find(function(i) { return String(i.id) === sid; });
          if (!item) return;
          var tag = document.createElement("span");
          tag.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
          tag.innerHTML = item.name + ' <span data-remove="' + sid + '" style="cursor:pointer;color:#D94040;font-weight:700;">✕</span>';
          tag.querySelector("[data-remove]").addEventListener("click", function() {
            selectedIds = selectedIds.filter(function(s) { return s !== sid; });
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
          var available = items.filter(function(i) { return !selectedIds.includes(String(i.id)) && i.name.toLowerCase().includes(query); });
          if (!available.length || !query) { dropdown.style.display = "none"; return; }
          dropdown.innerHTML = "";
          available.slice(0, 10).forEach(function(item) {
            var opt = document.createElement("div");
            opt.style.cssText = "padding:6px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid #f0f0f0;";
            opt.textContent = item.name;
            opt.addEventListener("mousedown", function(e) {
              e.preventDefault();
              selectedIds.push(String(item.id));
              input.value = "";
              render();
              onChangeCallback(selectedIds);
            });
            opt.addEventListener("mouseenter", function() { opt.style.background = "#e3f2fd"; });
            opt.addEventListener("mouseleave", function() { opt.style.background = ""; });
            dropdown.appendChild(opt);
          });
          dropdown.style.display = "block";
        }

        input.addEventListener("input", showDropdown);
        input.addEventListener("focus", function() { if (input.value) showDropdown(); });
        input.addEventListener("blur", function() { setTimeout(function() { dropdown.style.display = "none"; }, 150); });

        container.appendChild(input);
        container.appendChild(dropdown);
      }

      render();
      return { element: container, getSelected: function() { return selectedIds; } };
    }

    // Summary filter - only if multiple groups
    if (!singleGroup) {
      var summaryTagFilter = createTagFilter("sp-mgr-summary-filter", groupsInfo, function(selected) {
        summaryDiv.querySelectorAll("[id^='sp-mgr-summary-']").forEach(function(el) {
          var gId = el.id.replace("sp-mgr-summary-", "");
          el.style.display = (!selected.length || selected.includes(gId)) ? "" : "none";
        });
      });
      panel.insertBefore(summaryTagFilter.element, summaryDiv);

      groupsInfo.forEach(function(dept) {
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
      var collapseTagFilter = createTagFilter("sp-mgr-collapse-filter", groupsInfo, function(selected) {
        panel.querySelectorAll("[id^='sp-mgr-section-']").forEach(function(el) {
          var gId = el.id.replace("sp-mgr-section-", "");
          el.style.display = (!selected.length || selected.includes(gId)) ? "" : "none";
        });
      });
      panel.appendChild(collapseTagFilter.element);
    }

    // Collapsible detail per group
    groupsInfo.forEach(function(dept) {
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

      header.addEventListener("click", function() {
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
    groupsInfo.forEach(function(dept) {
      Promise.all([
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=Asignado", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function(r) { return r.json(); }),
        fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=En%20atenci%C3%B3n", {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function(r) { return r.json(); })
      ]).then(function(results) {
        var count = ((results[0].data || results[0]).content || []).length + ((results[1].data || results[1]).content || []).length;
        var col = document.getElementById("sp-mgr-summary-" + dept.id);
        if (col) col.querySelector(".sp-mgr-count").textContent = count;
      }).catch(function() {});
    });

    // Auto-refresh summary every 60s
    setInterval(function() {
      groupsInfo.forEach(function(dept) {
        Promise.all([
          fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=Asignado", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function(r) { return r.json(); }),
          fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + dept.id + "&ticketStatusName=En%20atenci%C3%B3n", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function(r) { return r.json(); })
        ]).then(function(results) {
          var count = ((results[0].data || results[0]).content || []).length + ((results[1].data || results[1]).content || []).length;
          var col = document.getElementById("sp-mgr-summary-" + dept.id);
          if (col) col.querySelector(".sp-mgr-count").textContent = count;
        }).catch(function() {});
      });
    }, 60000);

    // Refresh open collapsibles on focus or after actions (smooth, no flash)
    function refreshOpenCollapsibles() {
      panel.querySelectorAll(".sp-mgr-body").forEach(function(body) {
        if (body.style.display !== "none" && body.dataset.loaded) {
          var section = body.parentElement;
          var groupId = section.id.replace("sp-mgr-section-", "");
          // Re-fetch tickets for each profile column without clearing
          body.querySelectorAll(".sp-mgr-ptickets").forEach(function(listEl) {
            var profileId = listEl.dataset.profileId;
            var gId = listEl.dataset.groupId || groupId;
            if (profileId === "unassigned") {
              // Refresh unassigned
              fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + gId + "&ticketStatusName=En%20espera&page=0&size=100", {
                headers: { accept: "application/json", authorization: "Bearer " + spToken }
              }).then(function(r) { return r.json(); }).then(function(json) {
                var tickets = (json.data || json).content || [];
                updateTicketList(listEl, tickets, true);
              }).catch(function() {});
            } else {
              // Refresh assigned per profile
              Promise.all([
                fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + profileId + "&ticketStatusName=Asignado", {
                  headers: { accept: "application/json", authorization: "Bearer " + spToken }
                }).then(function(r) { return r.json(); }),
                fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + profileId + "&ticketStatusName=En%20atenci%C3%B3n", {
                  headers: { accept: "application/json", authorization: "Bearer " + spToken }
                }).then(function(r) { return r.json(); })
              ]).then(function(results) {
                var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);
                updateTicketList(listEl, tickets, false);
              }).catch(function() {});
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
      tickets.forEach(function(t) {
        var statusColor = t.ticketStatusName === "En espera" ? "#FF8F00" : t.ticketStatusName === "Asignado" ? "#1976D2" : "#4CAF50";
        html += '<div ' + (canDrag ? 'draggable="true" ' : '') + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:9px;line-height:1.3;' + (canDrag ? 'cursor:grab;' : '') + '">';
        html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
        html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 25) + '</div>';
        html += '<div style="display:flex;justify-content:space-between;"><span style="color:' + statusColor + ';font-weight:600;font-size:8px;">' + (t.ticketStatusName || "") + '</span><span style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;" title="' + (isUnassigned ? (t.requesterName || "") : (t.requesterName || "")) + '">' + (t.requesterName || "").split(" ")[0] + '</span></div>';
        html += '</div>';
      });
      if (listEl.innerHTML !== html) listEl.innerHTML = html;
    }

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") refreshOpenCollapsibles();
    });
    document.addEventListener("sp-refresh-panel", refreshOpenCollapsibles);
  }

  function loadManagerGroupDetail(groupId, container, spToken, canDrag) {
    // Fetch members of this group
    fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function(r) { return r.json(); }).then(function(json) {
      var profiles = json.data || json;
      if (!Array.isArray(profiles)) { container.innerHTML = '<div style="color:#888;font-size:11px;">Sin miembros</div>'; return; }

      // Filter out users that are inactive in Notion
      chrome.storage.local.get(["notionUsers", "visibleByGroup"], function(stored) {
        var notionUsers = stored.notionUsers || {};
        profiles = profiles.filter(function(p) {
          var found = Object.values(notionUsers).find(function(u) { return u.profileId === p.profileId; });
          if (found && !found.active) return false;
          return true;
        });

        // Filter by visible members (from config checkboxes)
        var visibleByGroup = stored.visibleByGroup || {};
        var visibleIds = visibleByGroup[String(groupId)];
        if (visibleIds && visibleIds.length > 0) {
          profiles = profiles.filter(function(p) {
            return visibleIds.includes(p.profileId);
          });
        }

        renderGroupDetail(groupId, container, profiles, spToken, canDrag);
      });
    }).catch(function() { container.innerHTML = '<div style="color:#888;font-size:11px;">Error al cargar</div>'; });
  }

  function renderGroupDetail(groupId, container, profiles, spToken, canDrag) {

      // Create "Sin asignar" column at the left
      var unassignedCol = document.createElement("div");
      unassignedCol.style.cssText = "min-width:160px;max-width:200px;border:1px solid #FF8F00;border-radius:6px;overflow:hidden;flex-shrink:0;";
      unassignedCol.innerHTML = '<div style="background:#FF8F00;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">⏳ Sin asignar <span class="sp-mgr-pcount">(...)</span></div>' +
        '<div class="sp-mgr-ptickets" data-profile-id="unassigned" data-group-id="' + groupId + '" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
      container.appendChild(unassignedCol);

      // Create columns per member
      profiles.forEach(function(p) {
        var col = document.createElement("div");
        col.style.cssText = "min-width:160px;max-width:200px;border:1px solid #ddd;border-radius:6px;overflow:hidden;flex-shrink:0;";
        col.innerHTML = '<div style="background:#2196F3;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">' + p.profileFullName.split(" ")[0] + ' <span class="sp-mgr-pcount">(...)</span></div>' +
          '<div class="sp-mgr-ptickets" data-profile-id="' + p.profileId + '" data-group-id="' + groupId + '" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
        container.appendChild(col);
      });

      // Click on ticket opens modal (only if not dragging)
      var isDragging = false;
      container.addEventListener("mousedown", function(e) { isDragging = false; });
      container.addEventListener("mousemove", function(e) { if (e.buttons) isDragging = true; });
      container.addEventListener("click", function(e) {
        if (isDragging) return;
        var ticket = e.target.closest(".sp-mgr-ticket");
        if (!ticket) return;
        var ticketId = ticket.dataset.ticketId;
        if (ticketId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(ticketId) } }));
      });

      // Setup drag and drop if allowed
      if (canDrag) {
        container.addEventListener("dragstart", function(e) {
          var ticket = e.target.closest(".sp-mgr-ticket");
          if (!ticket) return;
          e.dataTransfer.setData("text/plain", ticket.dataset.ticketId);
          ticket.style.opacity = "0.4";
        });
        container.addEventListener("dragend", function(e) {
          var ticket = e.target.closest(".sp-mgr-ticket");
          if (ticket) ticket.style.opacity = "1";
        });
        container.addEventListener("dragover", function(e) {
          e.preventDefault();
          var zone = e.target.closest(".sp-mgr-ptickets");
          if (zone) zone.style.background = "#e3f2fd";
        });
        container.addEventListener("dragleave", function(e) {
          var zone = e.target.closest(".sp-mgr-ptickets");
          if (zone && !zone.contains(e.relatedTarget)) zone.style.background = "#fafafa";
        });
        container.addEventListener("drop", async function(e) {
          e.preventDefault();
          var zone = e.target.closest(".sp-mgr-ptickets");
          if (!zone) return;
          zone.style.background = "#fafafa";
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

          try {
            var res = await fetch("https://macropayapi.supportplus.mx/tickets/web/reassign/" + ticketId, {
              method: "PUT",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({ resolutionGroupId: parseInt(targetGroupId), serviceId: null, responsibleProfileId: parseInt(targetProfileId), resolutionGroup: { label: "", value: parseInt(targetGroupId) } }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            var json2 = await res.json();
            if (json2.success) {
              // Refresh this group detail
              container.innerHTML = "";
              loadManagerGroupDetail(parseInt(targetGroupId), container, spToken, canDrag);
            }
          } catch(err) {}
        });
      }

      // Fetch tickets per member
      profiles.forEach(function(p) {
        Promise.all([
          fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId + "&ticketStatusName=Asignado", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function(r) { return r.json(); }),
          fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?responsibleProfileId=" + p.profileId + "&ticketStatusName=En%20atenci%C3%B3n", {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          }).then(function(r) { return r.json(); })
        ]).then(function(results) {
          var tickets = ((results[0].data || results[0]).content || []).concat((results[1].data || results[1]).content || []);
          var listEl = container.querySelector('.sp-mgr-ptickets[data-profile-id="' + p.profileId + '"]');
          if (!listEl) return;
          var countEl = listEl.previousElementSibling.querySelector(".sp-mgr-pcount");
          if (countEl) countEl.textContent = "(" + tickets.length + ")";

          if (!tickets.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
          } else {
            var html = "";
            tickets.forEach(function(t) {
              html += '<div ' + (canDrag ? 'draggable="true" ' : '') + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #eee;font-size:9px;line-height:1.3;' + (canDrag ? 'cursor:grab;' : '') + '">';
              html += '<div style="font-weight:600;color:#1976D2;">' + (t.uniqueCode || "") + '</div>';
              html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 25) + '</div>';
              html += '<div style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</div>';
              html += '</div>';
            });
            listEl.innerHTML = html;
          }
        }).catch(function() {});
      });

      // Fetch "Sin asignar" (En espera)
      fetch("https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups?page=0&size=50&resolutionGroupId=" + groupId + "&ticketStatusName=En%20espera", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      }).then(function(r) { return r.json(); }).then(function(json) {
        var tickets = (json.data || json).content || [];
        var listEl = container.querySelector('.sp-mgr-ptickets[data-profile-id="unassigned"]');
        if (!listEl) return;
        var countEl = listEl.previousElementSibling.querySelector(".sp-mgr-pcount");
        if (countEl) countEl.textContent = "(" + tickets.length + ")";
        if (!tickets.length) {
          listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
        } else {
          var html = "";
          tickets.forEach(function(t) {
            html += '<div ' + (canDrag ? 'draggable="true" ' : '') + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;' + (canDrag ? 'cursor:grab;' : '') + '">';
            html += '<div style="font-weight:600;color:#E65100;">' + (t.uniqueCode || "") + '</div>';
            html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 25) + '</div>';
            html += '<div style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (t.requesterName || "") + '">' + (t.requesterName || "").split(" ")[0] + '</div>';
            html += '</div>';
          });
          listEl.innerHTML = html;
        }
      }).catch(function() {});

      // Create "Cerrados hoy" column at the right
      var today = new Date();
      var todayStart = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T00:00";
      var todayEnd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T23:59";

      var closedCol = document.createElement("div");
      closedCol.style.cssText = "min-width:160px;max-width:200px;border:1px solid #2E7D32;border-radius:6px;overflow:hidden;flex-shrink:0;";
      closedCol.innerHTML = '<div style="background:#2E7D32;color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-mgr-closed-count">(...)</span></div>' +
        '<div class="sp-mgr-closed-list" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
      closedCol.addEventListener("click", function(e) {
        var ticket = e.target.closest(".sp-mgr-ticket");
        if (!ticket) return;
        var ticketId = ticket.dataset.ticketId;
        if (ticketId) document.dispatchEvent(new CustomEvent("sp-open-ticket", { detail: { ticketId: parseInt(ticketId) } }));
      });
      container.appendChild(closedCol);

      // Fetch closed today
      fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + groupId + "&ticketStatusName=Cerrado&initDate=" + todayStart + "&endDate=" + todayEnd + "&page=0&size=100", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      }).then(function(r) { return r.json(); }).then(function(json) {
        var tickets = (json.data || json).content || [];
        var countEl = closedCol.querySelector(".sp-mgr-closed-count");
        if (countEl) countEl.textContent = "(" + tickets.length + ")";
        var listEl = closedCol.querySelector(".sp-mgr-closed-list");
        if (!listEl) return;
        if (!tickets.length) {
          listEl.innerHTML = '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">Sin tickets</div>';
        } else {
          var html = "";
          tickets.forEach(function(t) {
            html += '<div style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #2E7D32;font-size:9px;line-height:1.3;">';
            html += '<div style="font-weight:600;color:#2E7D32;">' + (t.uniqueCode || "") + '</div>';
            html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + (t.subject || "").substring(0, 25) + '</div>';
            html += '<div style="color:#888;font-size:8px;">' + (t.responsibleName || "").split(" ")[0] + '</div>';
            html += '</div>';
          });
          listEl.innerHTML = html;
        }
      }).catch(function() {});
  }

  function initExtension() {
  _showQuickDetailModal = showQuickDetailModal;
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
    } else if (ticketGroupId && ticketGroupId !== getTeamConfig().resolutionGroupId && Object.values(TEAM_AREAS).some(function(a) { return a.resolutionGroupId === ticketGroupId; })) {
      // Ticket is from another known area - always show migrate button regardless of status
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
    } else if (isClosed) {
      // Show migrate button if ticket belongs to my area, the other area, or gerente
      var myArea = getTeamConfig();
      var isOtherKnownArea = Object.values(TEAM_AREAS).some(function(a) { return a.resolutionGroupId === ticketGroupId; });
      var canShowMigrate = !ticketGroupId || ticketGroupId === myArea.resolutionGroupId || isOtherKnownArea || isGerente();
      if (canShowMigrate) {
      const btn = document.createElement("button");
      btn.id = DETAIL_BTN_ID;
      btn.textContent = "🙂 Migrar a Monday";
      btn.style.cssText =
        "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#D94040;color:#fff;font-weight:600;white-space:nowrap;margin-right:6px;";
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
    } else if (isAssigned || isWaiting) {
      // Show buttons only if ticket belongs to my area (or gerente)
      var myArea3 = getTeamConfig();
      var ticketBelongsToMe3 = !ticketGroupId || ticketGroupId === myArea3.resolutionGroupId || isGerente();
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
      var canClose = !ticketGroupId || ticketGroupId === myAreaClose.resolutionGroupId || isGerente();
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
      var canReopen = !ticketGroupId || ticketGroupId === myAreaReopen.resolutionGroupId || isGerente();
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
  var hasMondayConfig = false;

  // Check if Monday is configured
  try {
    chrome.storage.local.get(["mondayToken", "mondayBoardId"], function(r) {
      hasMondayConfig = !!(r.mondayToken && r.mondayBoardId);
    });
  } catch(e) {}

  const TEAM_AREAS = {};
  // Build TEAM_AREAS dynamically from GROUP_INFO
  GROUP_INFO.forEach(function(g) {
    TEAM_AREAS[g.id] = {
      resolutionGroupId: g.id,
      resolutionGroupLabel: g.name,
      profiles: [] // loaded dynamically
    };
  });

  var currentTeamArea = "19"; // default (DBA)
  const GERENTE_NAME = "Rickey Oswaldo Ehuan Vargas";

  function isGerente() {
    return getLoggedUserName() === GERENTE_NAME;
  }

  function getTeamConfig() {
    return TEAM_AREAS[currentTeamArea] || TEAM_AREAS["19"];
  }

  // Returns all areas if gerente, otherwise just the configured one
  function getActiveAreas() {
    if (isGerente()) return [TEAM_AREAS["19"], TEAM_AREAS["22"]].filter(Boolean);
    return [getTeamConfig()];
  }

  function loadTeamArea() {
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get("teamArea", function(result) {
          var val = result.teamArea || "";
          // Migrate legacy values
          if (val === "dba") val = "19";
          if (val === "aplicaciones") val = "22";
          currentTeamArea = val;
          // Resolve profileId in background (non-blocking)
          resolveSessionProfileId();
          resolve();
        });
      } catch(e) { resolve(); }
    });
  }

  // Load profiles dynamically for a group
  var profilesCache = {};
  var visibleByGroup = {}; // { groupId: [profileId1, profileId2, ...] } — only visible members

  // Load visible members from storage
  try {
    chrome.storage.local.get("visibleByGroup", function(result) {
      visibleByGroup = result.visibleByGroup || {};
    });
  } catch(e) {}

  function loadProfilesForGroup(groupId) {
    if (profilesCache[groupId]) return Promise.resolve(profilesCache[groupId]);
    var spToken = localStorage.getItem("token");
    if (!spToken) return Promise.resolve([]);
    return fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    }).then(function(r) { return r.json(); }).then(function(json) {
      var profiles = json.data || json;
      if (!Array.isArray(profiles)) profiles = [];
      // Filter by visible members (if configured for this group)
      var visibleForGroup = visibleByGroup[String(groupId)];
      if (visibleForGroup && Array.isArray(visibleForGroup) && visibleForGroup.length > 0) {
        profiles = profiles.filter(function(p) {
          var id = p.profileId || p.id;
          return visibleForGroup.includes(id);
        });
      }
      profilesCache[groupId] = profiles;
      if (TEAM_AREAS[groupId]) TEAM_AREAS[groupId].profiles = profiles;
      return profiles;
    }).catch(function() { return []; });
  }

  // Build a global profile name map (populated as profiles load)
  var ALL_PROFILE_NAMES = {};

  async function loadTeamPanel() {
    if (isDetailView()) return;
    if (teamPanelLoading) return;
    if (!currentTeamArea) return; // No group configured
    if (document.getElementById("sp-manager-panel")) return; // Manager view active
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

      // Load profiles dynamically for each area
      await Promise.all(areas.map(function(area) {
        return loadProfilesForGroup(area.resolutionGroupId).then(function(profiles) {
          area.profiles = profiles;
          profiles.forEach(function(p) { ALL_PROFILE_NAMES[p.profileId] = p.profileFullName; });
        });
      }));

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

      // "Cerrados hoy" column at the right
      var closedCol = document.createElement("div");
      closedCol.id = "sp-team-col-closed";
      closedCol.style.cssText = "min-width:180px;max-width:220px;border:2px solid #2E7D32;border-radius:8px;overflow:hidden;flex-shrink:0;";
      closedCol.innerHTML = '<div class="sp-team-header" data-profile-id="closed" style="background:#2E7D32;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>' +
        '<div class="sp-team-tickets" data-profile-id="closed" data-area-group="closed" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
      containerDiv.appendChild(closedCol);

      // Setup drag and drop + click to open
      var dragStartPos = null;
      panel.addEventListener("click", function(e) {
        var ticket = e.target.closest(".sp-team-ticket");
        if (!ticket) return;
        // Only open if it wasn't a drag (mouse didn't move much)
        if (dragStartPos && (Math.abs(e.clientX - dragStartPos.x) > 5 || Math.abs(e.clientY - dragStartPos.y) > 5)) return;
        var ticketId = ticket.dataset.ticketId;
        if (ticketId) showQuickDetailModal(ticketId);
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
              body: JSON.stringify({ nextTicketStatusId: 9, ticketCommentRequest: null }),
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

            // Insert comment if the reassignment is not self-assign from unassigned
            var loggedName = getLoggedUserName();
            var newAnalystName = ALL_PROFILE_NAMES[parseInt(targetProfileId)] || "";
            var prevAnalystName = (sourceProfileId && sourceProfileId !== "unassigned") ? (ALL_PROFILE_NAMES[parseInt(sourceProfileId)] || "") : "";
            var isSelfAssignFromEmpty = !prevAnalystName && loggedName === newAnalystName;

            if (!isSelfAssignFromEmpty) {
              var commentLines = "Ticket reasignado por: " + loggedName + "\n";
              if (prevAnalystName) commentLines += "Analista anterior: " + prevAnalystName + "\n";
              commentLines += "Persona asignada: " + newAnalystName;
              fetch(SP_API + "/comment/" + ticketId, {
                method: "POST",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ content: "<p>" + commentLines.replace(/\n/g, "<br>") + "</p>", internal: false }),
              }).catch(function() {});
            }

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

  function refreshClosedColumn() {
    var spToken = getToken();
    if (!spToken) return;
    var today = new Date();
    var todayStart = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T00:00";
    var todayEnd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0") + "T23:59";
    var areas = getActiveAreas();
    var allClosed = [];
    var pending = areas.length;

    areas.forEach(function(area) {
      fetch("https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=" + area.resolutionGroupId + "&ticketStatusName=Cerrado&initDate=" + todayStart + "&endDate=" + todayEnd + "&page=0&size=100", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken },
      }).then(function(r) { return r.json(); }).then(function(json) {
        var tickets = (json.data || json).content || [];
        allClosed = allClosed.concat(tickets);
      }).catch(function() {}).finally(function() {
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
      tickets.forEach(function(t) {
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
      const me = profiles.find(function(p) { return p.profileFullName === myName; });
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
            if (doneCheck.checked) {
              // Show close tab / stay modal
              var closeOverlay = document.createElement("div");
              closeOverlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
              closeOverlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:360px;width:90%;font-family:system-ui;text-align:center;">' +
                '<h3 style="margin:0 0 12px;">✅ Ticket tomado, cerrado y migrado</h3>' +
                '<p style="font-size:13px;color:#555;margin:0 0 16px;">El ticket fue procesado correctamente.</p>' +
                '<div style="display:flex;gap:8px;">' +
                  '<button id="sp-take-close-tab" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;">Cerrar pestaña</button>' +
                  '<button id="sp-take-stay-tab" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Quedarme</button>' +
                '</div></div>';
              document.body.appendChild(closeOverlay);
              document.getElementById("sp-take-close-tab").addEventListener("click", function() { window.close(); });
              document.getElementById("sp-take-stay-tab").addEventListener("click", function() { closeOverlay.remove(); window.location.reload(); });
            } else {
              setTimeout(function() { window.location.reload(); }, 1500);
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

  function showReopenModal(ticketId, currentHolder) {
    var existing = document.getElementById("sp-reopen-modal");
    if (existing) existing.remove();

    var profiles = getTeamConfig().profiles;
    var opts = profiles.map(function(p) {
      return '<option value="' + p.profileId + '">' + p.profileFullName + '</option>';
    }).join("");

    var overlay = document.createElement("div");
    overlay.id = "sp-reopen-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:400px;width:90%;font-family:system-ui;">' +
      '<h3 style="margin:0 0 16px;color:#FF8F00;">🔓 Reabrir ticket #' + ticketId + '</h3>' +
      '<p style="font-size:13px;color:#555;margin:0 0 12px;">Al reasignar un ticket cerrado a otra persona, se reabrirá automáticamente.</p>' +
      (currentHolder && currentHolder !== "Sin asignar" ? '<p style="font-size:12px;color:#888;margin:0 0 12px;">Asignado actualmente a: <b>' + currentHolder + '</b></p>' : '') +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Reasignar a:</label>' +
      '<select id="sp-reopen-person" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;">' +
        '<option value="">-- Selecciona --</option>' + opts +
      '</select>' +
      '<div id="sp-reopen-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;color:#D94040;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="sp-reopen-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:14px;">🔄 Reabrir</button>' +
        '<button id="sp-reopen-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-reopen-cancel").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

    document.getElementById("sp-reopen-confirm").addEventListener("click", async function() {
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
          setTimeout(function() { window.location.reload(); }, 1500);
        } else { throw new Error("No se pudo reabrir"); }
      } catch (err) {
        showErrorToast("Error: " + err.message);
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
    chrome.storage.local.get(["mondayToken", "mondayBoardId", "mondayBoardName", "teamArea", "ignoredEmails", "visibleByGroup", "myProfileId"], function(stored) {
      var currentToken = stored.mondayToken || "";
      var currentBoardId = stored.mondayBoardId || "";
      var currentBoardName = stored.mondayBoardName || "";
      var currentArea = stored.teamArea || "dba";

      var overlay = document.createElement("div");
      overlay.id = "sp-config-modal";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
      overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:450px;width:90%;font-family:system-ui;">' +
        '<h3 style="margin:0 0 12px;">⚙️ Configuración</h3>' +
        '<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #eee;">' +
          '<button id="sp-cfg-tab-area" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid #D94040;color:#D94040;">Área de trabajo</button>' +
          (currentUserRole === "usuario" || currentUserRole === "admin" ? '<button id="sp-cfg-tab-monday" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;color:#888;">Monday.com</button>' : '') +
        '</div>' +
        '<div id="sp-cfg-panel-area">' +
          '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Área de trabajo</label>' +
          '<select id="sp-cfg-area" style="width:100%;padding:8px;font-size:13px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">' +
            '<option value="">-- Selecciona tu grupo --</option>' +
            (currentUserGroups.length > 0 ? currentUserGroups : GROUP_INFO.map(function(g){return g.id;})).map(function(gId) { var g = GROUP_INFO.find(function(gi){return gi.id === gId;}) || {id:gId,name:"Grupo "+gId}; return '<option value="' + g.id + '"' + (String(currentArea) === String(g.id) ? ' selected' : '') + '>' + g.name + '</option>'; }).join("") +
          '</select>' +
          '<div id="sp-cfg-members" style="margin-bottom:8px;max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:6px;display:' + (currentArea ? 'block' : 'none') + ';"><div style="color:#888;font-size:11px;">Cargando miembros...</div></div>' +
          '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Mi perfil</label>' +
          '<select id="sp-cfg-myprofile" style="width:100%;padding:8px;font-size:13px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;"><option value="">-- Selecciona tu perfil --</option></select>' +
        '</div>' +
        '<div id="sp-cfg-panel-monday" style="display:none;">' +
          '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">API Token</label>' +
          '<input id="sp-cfg-token" type="password" value="' + currentToken + '" placeholder="Pega tu token de Monday" style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:8px;">' +
          '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Board</label>' +
          '<div style="position:relative;margin-bottom:4px;">' +
            '<input id="sp-cfg-board-search" type="text" value="' + currentBoardName.replace(/"/g, '&quot;') + '" placeholder="Buscar board..." style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;">' +
            '<div id="sp-cfg-board-results" style="position:absolute;top:100%;left:0;right:0;max-height:180px;overflow-y:auto;background:#fff;border:1px solid #ddd;border-radius:4px;display:none;z-index:10;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>' +
          '</div>' +
          '<div id="sp-cfg-board-status" style="font-size:11px;color:#888;margin-bottom:12px;min-height:16px;">' + (currentBoardName ? "✅ " + currentBoardName : "Carga los boards primero") + '</div>' +
          '<button id="sp-cfg-load-boards" style="width:100%;padding:8px;font-size:12px;cursor:pointer;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;margin-bottom:12px;">🔄 Cargar boards</button>' +
          '<input type="hidden" id="sp-cfg-board-id" value="' + currentBoardId + '">' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="sp-cfg-save" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">💾 Guardar</button>' +
          '<button id="sp-cfg-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>' +
        '</div></div>';
      document.body.appendChild(overlay);

      // Events
      document.getElementById("sp-cfg-cancel").addEventListener("click", function() { overlay.remove(); });
      overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

      // Tab switching
      var tabArea = document.getElementById("sp-cfg-tab-area");
      var tabMonday = document.getElementById("sp-cfg-tab-monday");
      var panelArea = document.getElementById("sp-cfg-panel-area");
      var panelMonday = document.getElementById("sp-cfg-panel-monday");
      tabArea.addEventListener("click", function() {
        panelArea.style.display = "block"; panelMonday.style.display = "none";
        tabArea.style.borderBottom = "2px solid #D94040"; tabArea.style.color = "#D94040";
        if (tabMonday) { tabMonday.style.borderBottom = "none"; tabMonday.style.color = "#888"; }
      });
      if (tabMonday) tabMonday.addEventListener("click", function() {
        panelArea.style.display = "none"; panelMonday.style.display = "block";
        tabMonday.style.borderBottom = "2px solid #D94040"; tabMonday.style.color = "#D94040";
        tabArea.style.borderBottom = "none"; tabArea.style.color = "#888";
      });

      // Members checkboxes
      var membersDiv = document.getElementById("sp-cfg-members");
      var excludedMembers = stored.visibleByGroup || {};

      var myProfileSelect = document.getElementById("sp-cfg-myprofile");
      var savedProfileId = stored.myProfileId || "";

      function loadMembersForConfig(groupId) {
        if (!groupId) { membersDiv.style.display = "none"; return; }
        membersDiv.style.display = "block";
        membersDiv.innerHTML = '<div style="color:#888;font-size:11px;">Cargando...</div>';
        var spToken = localStorage.getItem("token");
        fetch("https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/" + groupId, {
          headers: { accept: "application/json", authorization: "Bearer " + spToken }
        }).then(function(r) { return r.json(); }).then(function(json) {
          var profiles = json.data || json;
          if (!Array.isArray(profiles) || !profiles.length) { membersDiv.innerHTML = '<div style="color:#888;font-size:11px;">Sin miembros</div>'; return; }
          var visibleList = excludedMembers[String(groupId)];
          var hasConfig = visibleList && Array.isArray(visibleList) && visibleList.length > 0;
          membersDiv.innerHTML = '<div style="font-size:10px;color:#888;margin-bottom:4px;">Desmarca los que no quieras ver:</div>';
          myProfileSelect.innerHTML = '<option value="">-- Selecciona tu perfil --</option>';
          profiles.forEach(function(p) {
            var isVisible = !hasConfig || visibleList.includes(p.profileId);
            var label = document.createElement("label");
            label.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;cursor:pointer;";
            label.innerHTML = '<input type="checkbox" data-pid="' + p.profileId + '"' + (isVisible ? ' checked' : '') + '> ' + p.profileFullName;
            membersDiv.appendChild(label);
            // Add to profile select (only visible ones)
            if (isVisible) {
              var opt = document.createElement("option");
              opt.value = p.profileId;
              opt.textContent = p.profileFullName;
              if (String(p.profileId) === String(savedProfileId)) opt.selected = true;
              myProfileSelect.appendChild(opt);
            }
          });
        }).catch(function() { membersDiv.innerHTML = '<div style="color:#D94040;font-size:11px;">Error</div>'; });
      }

      // Load on area change
      document.getElementById("sp-cfg-area").addEventListener("change", function() {
        loadMembersForConfig(this.value);
      });
      // Load initially if area set
      if (currentArea) loadMembersForConfig(currentArea);

      // Load boards
      var allBoards = [];
      document.getElementById("sp-cfg-load-boards").addEventListener("click", async function() {
        var token = document.getElementById("sp-cfg-token").value.trim();
        if (!token) { document.getElementById("sp-cfg-board-status").textContent = "⚠️ Ingresa un token primero"; return; }
        document.getElementById("sp-cfg-board-status").textContent = "Cargando...";
        try {
          var res = await fetch("https://api.monday.com/v2", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: token },
            body: JSON.stringify({ query: "{ boards(limit:500) { id name } }" }),
          });
          var json = await res.json();
          if (json.errors) throw new Error(json.errors[0].message);
          allBoards = json.data.boards.sort(function(a, b) { return a.name.localeCompare(b.name); });
          document.getElementById("sp-cfg-board-status").textContent = allBoards.length + " boards cargados. Escribe para buscar.";
        } catch(e) {
          document.getElementById("sp-cfg-board-status").textContent = "❌ " + e.message;
        }
      });

      // Board search
      function filterCfgBoards() {
        var query = document.getElementById("sp-cfg-board-search").value.toLowerCase().trim();
        var results = document.getElementById("sp-cfg-board-results");
        if (!query || !allBoards.length) { results.style.display = "none"; return; }
        var filtered = allBoards.filter(function(b) { return b.name.toLowerCase().includes(query); }).slice(0, 15);
        if (!filtered.length) { results.innerHTML = '<div style="padding:6px 8px;color:#888;">Sin resultados</div>'; results.style.display = "block"; return; }
        results.innerHTML = filtered.map(function(b) {
          return '<div class="sp-cfg-board-opt" data-id="' + b.id + '" data-name="' + b.name.replace(/"/g, '&quot;') + '" style="padding:8px;cursor:pointer;border-bottom:1px solid #f0f0f0;">' + b.name + '</div>';
        }).join("");
        results.style.display = "block";
      }
      document.getElementById("sp-cfg-board-search").addEventListener("input", filterCfgBoards);
      document.getElementById("sp-cfg-board-search").addEventListener("focus", filterCfgBoards);
      document.getElementById("sp-cfg-board-results").addEventListener("click", function(e) {
        var opt = e.target.closest(".sp-cfg-board-opt");
        if (!opt) return;
        document.getElementById("sp-cfg-board-id").value = opt.dataset.id;
        document.getElementById("sp-cfg-board-search").value = opt.dataset.name;
        document.getElementById("sp-cfg-board-status").textContent = "✅ " + opt.dataset.name;
        document.getElementById("sp-cfg-board-results").style.display = "none";
      });

      // Save
      document.getElementById("sp-cfg-save").addEventListener("click", function() {
        var token = document.getElementById("sp-cfg-token").value.trim();
        var boardId = document.getElementById("sp-cfg-board-id").value;
        var boardName = document.getElementById("sp-cfg-board-search").value.trim();
        var area = document.getElementById("sp-cfg-area").value;
        var saveData = { mondayToken: token, mondayBoardId: boardId, mondayBoardName: boardName, teamArea: area };
        // Save my profile
        var selectedProfile = myProfileSelect.value;
        if (selectedProfile) saveData.myProfileId = parseInt(selectedProfile);
        // Save visible members (checked ones)
        var memberChecks = membersDiv.querySelectorAll('input[data-pid]');
        if (memberChecks.length && area) {
          var visible = [];
          memberChecks.forEach(function(cb) { if (cb.checked) visible.push(parseInt(cb.dataset.pid)); });
          var vbg = excludedMembers; // reusing variable name but storing visible
          vbg[String(area)] = visible;
          saveData.visibleByGroup = vbg;
        }
        chrome.storage.local.set(saveData, function() {
          overlay.remove();
          showSuccessToast("Configuración guardada");
          // Reload team area
          currentTeamArea = area;
          // Update profile ID
          if (saveData.myProfileId) { sessionProfileId = saveData.myProfileId; myProfileId = saveData.myProfileId; }
          // Clear profiles cache to reload with new visibility
          profilesCache = {};
          // Update visibleByGroup in memory
          if (saveData.visibleByGroup) visibleByGroup = saveData.visibleByGroup;
          // Remove panel to rebuild with new area
          var panel = document.getElementById(TEAM_PANEL_ID);
          if (panel) panel.remove();
          teamPanelLoading = false;
          loadTeamPanel();
        });
      });
    });
  }

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

  // --- Water Role Button ---
  const WATER_BTN_ID = "sp-water-btn";
  function injectWaterButton() {
    if (document.getElementById(WATER_BTN_ID)) return;
    var dashBtn = document.getElementById(DASHBOARD_BTN_ID);
    if (!dashBtn) return;
    // Only show if user's email is in the water table
    chrome.storage.local.get("userEmail", function(r) {
      var email = (r.userEmail || "").toLowerCase();
      if (!email) return;
      chrome.runtime.sendMessage({ type: "notion-query", dbId: "36420e0684b98054a2e6e6e84809a233", body: {} }, function(response) {
        if (!response || !response.success || !response.data.results) return;
        var found = response.data.results.some(function(page) {
          var correo = (page.properties.Correo?.title?.[0]?.plain_text || page.properties.Correo?.rich_text?.[0]?.plain_text || "").toLowerCase();
          return correo === email;
        });
        if (!found) return;
        if (document.getElementById(WATER_BTN_ID)) return;
        var btn = document.createElement("button");
        btn.id = WATER_BTN_ID;
        btn.textContent = "💧 Agua";
        btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#0288D1;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
        btn.addEventListener("click", showWaterModal);
        dashBtn.parentElement.insertBefore(btn, dashBtn.nextSibling);
      });
    });
  }

  function showWaterModal() {
    var existing = document.getElementById("sp-water-modal");
    if (existing) { existing.remove(); return; }
    showLoadingToast("Cargando rol de agua...");
    chrome.runtime.sendMessage({ type: "notion-query", dbId: "36420e0684b98054a2e6e6e84809a233", body: { sorts: [{ property: "Orden", direction: "ascending" }] } }, function(response) {
      var lt = document.getElementById("sp-loading-toast"); if (lt) lt.remove();
      if (!response || !response.success || !response.data.results) { showErrorToast("Error al cargar datos de agua"); return; }
      var rows = response.data.results.map(function(page) {
        var p = page.properties;
        return {
          nombre: p.Nombre?.rich_text?.[0]?.plain_text || "",
          orden: p.Orden?.number || 0,
          g1: p["Garrafón 1"]?.checkbox || false,
          g2: p["Garrafón 2"]?.checkbox || false,
          g3: p["Garrafón 3"]?.checkbox || false,
          chesco: p.Chesco?.checkbox || false
        };
      });
      var overlay = document.createElement("div");
      overlay.id = "sp-water-modal";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
      var tableRows = rows.map(function(r) {
        return '<tr>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' + r.orden + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">' + r.nombre + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">' + (r.g1 ? '✅' : '❌') + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">' + (r.g2 ? '✅' : '❌') + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">' + (r.g3 ? '✅' : '❌') + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">' + (r.chesco ? '✅' : '❌') + '</td>' +
        '</tr>';
      }).join("");
      overlay.innerHTML = '<div style="background:#fff;padding:20px;border-radius:12px;max-width:600px;width:95%;font-family:system-ui;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<h3 style="margin:0;font-size:16px;">💧 Rol de Agua</h3>' +
          '<button id="sp-water-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">✕</button>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          '<thead><tr style="background:#f5f5f5;">' +
            '<th style="padding:6px 10px;text-align:left;">#</th>' +
            '<th style="padding:6px 10px;text-align:left;">Nombre</th>' +
            '<th style="padding:6px 10px;text-align:center;">G1</th>' +
            '<th style="padding:6px 10px;text-align:center;">G2</th>' +
            '<th style="padding:6px 10px;text-align:center;">G3</th>' +
            '<th style="padding:6px 10px;text-align:center;">Chesco</th>' +
          '</tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
      '</div>';
      document.body.appendChild(overlay);
      document.getElementById("sp-water-close").addEventListener("click", function() { overlay.remove(); });
      overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
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

  // --- Monday Stats ---
  const MONDAY_STATS_BTN_ID = "sp-monday-stats-btn";

  function injectMondayStatsButton() {
    if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
    var reportBtn = document.getElementById(REPORT_BTN_ID);
    if (!reportBtn) return;

    // Only show if Monday token is configured
    getMondayToken().then(function(token) {
      if (!token) return;
      getMondayBoardId().then(function(boardId) {
        if (!boardId) return;
        if (document.getElementById(MONDAY_STATS_BTN_ID)) return;
        var btn = document.createElement("button");
        btn.id = MONDAY_STATS_BTN_ID;
        btn.textContent = "📈 Monday Stats";
        btn.style.cssText = "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#6A1B9A;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
        btn.addEventListener("click", handleMondayStats);
        reportBtn.parentElement.insertBefore(btn, reportBtn.nextSibling);
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

      allItems.forEach(function(item) {
        var person = "Sin asignar";
        var status = "Sin estado";

        item.column_values.forEach(function(col) {
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
    btn.style.background = "#6A1B9A";
    btn.disabled = false;
  }

  function showMondayStatsModal(boardName, totalItems, statusCounts, statsByPerson) {
    var existing = document.getElementById("sp-monday-stats-modal");
    if (existing) existing.remove();

    var personSorted = Object.entries(statsByPerson).sort(function(a, b) { return b[1].total - a[1].total; });
    var maxTotal = personSorted[0] ? personSorted[0][1].total : 1;

    var colors = ["#1976D2", "#2E7D32", "#D94040", "#7B1FA2", "#E65100", "#00796B", "#C2185B", "#F57F17", "#283593", "#5D4037"];

    // --- Bar chart per person ---
    var barsHTML = '';
    personSorted.forEach(function(entry, idx) {
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

    var overlay = document.createElement("div");
    overlay.id = "sp-monday-stats-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:24px;border-radius:12px;max-width:700px;width:95%;max-height:90vh;display:flex;flex-direction:column;font-family:system-ui;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h3 style="margin:0;font-size:18px;">📈 ' + boardName + ' <span style="font-size:13px;color:#888;font-weight:400;">(' + totalItems + ' tickets migrados)</span></h3>' +
        '<button id="sp-stats-close" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cerrar</button>' +
      '</div>' +
      '<h4 style="margin:0 0 12px;font-size:14px;color:#555;">Tickets por persona</h4>' +
      '<div style="flex:1;overflow:auto;">' + barsHTML + '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("sp-stats-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
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
    input.addEventListener("keydown", function(e) { if (e.key === "Enter") doQuickSearch(); });

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
      btn.addEventListener("click", function() { showQuickFilterModal("En espera"); });
      parent.insertBefore(btn, userWrapper);
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

  // --- Quick detail button ---
  const DETAIL_QUICK_CLASS = "sp-quick-detail-btn";

  function createQuickDetailButton(ticketId) {
    var btn = document.createElement("button");
    btn.className = DETAIL_QUICK_CLASS + " MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
    btn.textContent = "👁️ Ver";
    btn.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;margin-left:6px;white-space:nowrap;min-width:auto;";
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      e.preventDefault();
      showQuickDetailModal(ticketId);
    });
    return btn;
  }

  async function showQuickDetailModal(ticketId) {
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

      // Remove loading toast
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
        attachments.forEach(function(a) {
          var fileName = a.file?.name || "archivo";
          var fileId = a.file?.id || "";
          attachHTML += '<button class="sp-qd-download" data-file-id="' + fileId + '" data-file-name="' + fileName.replace(/"/g, '&quot;') + '" style="padding:4px 8px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:11px;cursor:pointer;color:#1976D2;">📎 ' + fileName + '</button>';
        });
        attachHTML += '</div></div>';
      }

      // Comments
      var comments = t.ticketComments || [];
      var commentsHTML = "";
      if (comments.length) {
        commentsHTML = '<div style="margin-top:12px;"><b style="font-size:12px;">💬 Comentarios (' + comments.length + '):</b>';
        comments.forEach(function(c) {
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
        participants.forEach(function(p) {
          participantsHTML += '<span style="padding:2px 6px;background:#e8f5e9;border:1px solid #2E7D32;border-radius:4px;font-size:10px;">' + (p.profileFullName || p.email || "") + '</span>';
        });
        participantsHTML += '</div></div>';
      }

      var rowStyle = 'padding:4px 10px;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;font-size:12px;';

      var overlay = document.createElement("div");
      overlay.id = "sp-quick-detail-modal";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
      overlay.innerHTML = '<div style="background:#fff;padding:20px;border-radius:12px;max-width:800px;width:95%;max-height:90vh;display:flex;flex-direction:column;font-family:system-ui;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<h3 style="margin:0;font-size:15px;">📋 ' + (t.uniqueCode || ticketId) + ' <span class="sp-qd-copy-folio" data-copy="' + (t.uniqueCode || ticketId) + '" style="cursor:pointer;font-size:12px;opacity:0.6;" title="Copiar folio">📋</span> <span style="font-weight:400;color:' + (STATUS_TEXT_COLORS[statusName] || '#333') + ';font-size:12px;">(' + statusName + ')</span></h3>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
            '<span id="sp-qd-actions" style="display:flex;gap:4px;"></span>' +
            '<a href="/es/dashboard/tickets/' + ticketId + '" target="_blank" style="padding:5px 10px;border:1px solid #1976D2;border-radius:6px;font-size:11px;text-decoration:none;color:#1976D2;">Abrir ↗</a>' +
            '<button id="sp-qd-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;">✕</button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;overflow:auto;">' +
          // Subject + info grid
          '<div style="background:#f5f5f5;padding:8px 10px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:8px;">' + (t.subject || "Sin asunto") + '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px;font-size:11px;">' +
            '<div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;">' + (statusName === "Cerrado" ? '<span style="color:#2E7D32;font-weight:700;font-size:11px;">Cerrado</span>' : '<span style="color:#888;">Estado:</span> <select id="sp-qd-status-select" style="font-size:11px;border:none;background:transparent;color:' + (STATUS_TEXT_COLORS[statusName] || '#333') + ';font-weight:700;cursor:pointer;"><option value="" selected>' + statusName + '</option><option value="" disabled>Cargando...</option></select>') + '</div>' +
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
              '<button id="sp-qd-take-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">🤚 Tomar</button>' +
              '<select id="sp-qd-assign-select" style="flex:1;padding:6px 8px;font-size:11px;border:1px solid #ddd;border-radius:6px;"><option value="">-- Asignar a --</option></select>' +
            '</div>' +
            '<div id="sp-qd-take-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:11px;">' +
              '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario al tomar</label>' +
              '<input id="sp-qd-take-comment" type="text" value="se revisa" style="width:100%;padding:5px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;">' +
              '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;"><input type="checkbox" id="sp-qd-take-done"> <b>Ticket realizado</b></label>' +
              '<div id="sp-qd-take-extra" style="display:none;margin-top:6px;">' +
                '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario antes de cerrar (opcional)</label>' +
                '<input id="sp-qd-take-close-comment" type="text" placeholder="Comentario de cierre..." style="width:100%;padding:5px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;">' +
                (hasMondayConfig ? '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Migrar a Monday</label><select id="sp-qd-take-group" style="width:100%;padding:5px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;"><option value="">-- Selecciona destino --</option></select>' : '') +
              '</div>' +
              '<button id="sp-qd-take-confirm" style="margin-top:8px;padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:11px;font-weight:600;">Confirmar</button>' +
            '</div>' +
          '</div>' : '') +
          // Action row - only if not closed and not waiting
          (function() {
            if (statusName === "En espera" || statusName === "Cerrado") return '';
            var isMigrated = t.uniqueCode && getCache() && getCache()[t.uniqueCode];
            var showMondayOption = hasMondayConfig && !isMigrated;
            var closeHTML = '<div style="margin-bottom:8px;">' +
              '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
                '<button id="sp-qd-close-btn" style="padding:6px 12px;border:none;border-radius:6px;background:' + (showMondayOption ? '#D94040' : '#616161') + ';color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">' + (showMondayOption ? '🔒 Cerrar y Migrar' : '🔒 Cerrar') + '</button>' +
              '</div>' +
              '<div id="sp-qd-close-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:11px;">' +
                '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario antes de cerrar (opcional)</label>' +
                '<input id="sp-qd-close-comment" type="text" placeholder="Comentario de cierre..." style="width:100%;padding:5px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;">' +
                (showMondayOption ? '<label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Migrar a Monday</label><select id="sp-qd-close-group" style="width:100%;padding:5px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;margin-bottom:6px;"><option value="">-- Selecciona destino --</option></select>' : '') +
                '<button id="sp-qd-close-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:' + (showMondayOption ? '#D94040' : '#616161') + ';color:#fff;cursor:pointer;font-size:11px;font-weight:600;">Confirmar</button>' +
              '</div>' +
            '</div>';
            return closeHTML;
          })() +
          // Migrate only (if closed, not migrated, and Monday configured)
          (statusName === "Cerrado" && hasMondayConfig && !(t.uniqueCode && getCache() && getCache()[t.uniqueCode]) ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
            '<button id="sp-qd-migrate-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">🙂 Migrar a Monday</button>' +
          '</div>' : '') +
          // Reopen row (if closed)
          (statusName === "Cerrado" ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
            '<button id="sp-qd-reopen-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;">🔓 Reabrir</button>' +
            '<select id="sp-qd-reopen-select" style="flex:1;padding:6px 8px;font-size:11px;border:1px solid #ddd;border-radius:6px;"><option value="">-- Reasignar a --</option></select>' +
          '</div>' : '') +
          // People row
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
            '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:11px;">' +
              '<b style="color:#888;">👤 Solicitante:</b> ' + requesterName + ' <span class="sp-qd-copy-name" data-copy="' + requesterName + '" style="cursor:pointer;font-size:10px;opacity:0.6;" title="Copiar nombre">📋</span>' + (requesterEmail ? ' <span style="color:#888;">(' + requesterEmail + ')</span>' : '') +
              (department ? '<br><span style="color:#aaa;">' + department + ' | ' + location + '</span>' : '') +
            '</div>' +
            '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:11px;">' +
              '<b style="color:#888;">🔍 Analista:</b> ' + holderName + (holderEmail ? ' <span style="color:#888;">(' + holderEmail + ')</span>' : '') +
            '</div>' +
          '</div>' +
          // Description (compact)
          '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;margin-bottom:8px;">' +
            '<b style="font-size:10px;color:#888;">📝 Descripción</b>' +
            '<div style="margin:4px 0 0;font-size:11px;line-height:1.5;color:#333;max-height:200px;overflow:auto;">' + desc + '</div>' +
          '</div>' +
          attachHTML +
          participantsHTML +
          // Comments section
          '<div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px;">' +
            '<b style="font-size:12px;">💬 Comentarios (' + comments.length + ')</b>' +
            '<div id="sp-qd-comments-list" style="max-height:150px;overflow-y:auto;margin-top:6px;">' +
              (comments.length ? comments.map(function(c) {
                var cDate = c.createdAt ? c.createdAt.replace("T", " ").substring(0, 16) : "";
                var cContent = (c.content || "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
                var cAttachments = c.attachments || [];
                var cAttachHTML = "";
                if (cAttachments.length) {
                  cAttachHTML = '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">';
                  cAttachments.forEach(function(a) {
                    cAttachHTML += '<button class="sp-qd-download" data-file-id="' + a.id + '" data-file-name="' + (a.name || "archivo").replace(/"/g, '&quot;') + '" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:10px;cursor:pointer;color:#1976D2;">📎 ' + (a.name || "archivo") + '</button>';
                  });
                  cAttachHTML += '</div>';
                }
                var myName = getLoggedUserName();
                var isMyComment = c.fullName === myName || c.email === (t.ticketInfo?.email || "___");
                var addAttachBtn = isMyComment ? ' <label class="sp-qd-add-attach" data-comment-id="' + c.id + '" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar evidencia">📎<input type="file" multiple style="display:none;"></label>' : '';
                return '<div style="padding:5px 8px;background:#f9f9f9;border-left:3px solid #1976D2;border-radius:4px;font-size:11px;margin-bottom:4px;">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;"><b>' + (c.fullName || "") + '</b><span style="color:#888;font-size:10px;">' + cDate + addAttachBtn + '</span></div>' +
                  '<div style="color:#555;margin-top:2px;">' + cContent + '</div>' + cAttachHTML + '</div>';
              }).join("") : '<div style="color:#aaa;font-size:11px;padding:4px;">Sin comentarios</div>') +
            '</div>' +
            // Add comment form (hide if closed, unless DBA)
            (statusName !== "Cerrado" || getTeamConfig().resolutionGroupId === 19 ? (
            '<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">' +
              '<input id="sp-qd-comment-input" type="text" placeholder="Escribe un comentario..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;outline:none;">' +
              '<label style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-attach-input" type="file" multiple style="display:none;"></label>' +
              '<button id="sp-qd-comment-send" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">Enviar</button>' +
            '</div>' +
            '<div id="sp-qd-attach-list" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;"></div>'
            ) : '') +
          '</div>' +
        '</div></div>';
      document.body.appendChild(overlay);

      document.getElementById("sp-qd-close").addEventListener("click", function() { overlay.remove(); });
      overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });

      // Move action buttons to header
      var actionsContainer = document.getElementById("sp-qd-actions");
      if (actionsContainer) {
        var closeBtn = document.getElementById("sp-qd-close-btn");
        if (closeBtn) { closeBtn.style.padding = "5px 10px"; closeBtn.style.fontSize = "11px"; actionsContainer.appendChild(closeBtn); }
        var takeBtn = document.getElementById("sp-qd-take-btn");
        if (takeBtn) { takeBtn.style.padding = "5px 10px"; actionsContainer.appendChild(takeBtn); }
        var migrateBtn = document.getElementById("sp-qd-migrate-btn");
        if (migrateBtn) { migrateBtn.style.padding = "5px 10px"; migrateBtn.style.fontSize = "11px"; actionsContainer.appendChild(migrateBtn); }
        var reopenBtn = document.getElementById("sp-qd-reopen-btn");
        if (reopenBtn) { reopenBtn.style.padding = "5px 10px"; reopenBtn.style.fontSize = "11px"; actionsContainer.appendChild(reopenBtn); }
      }

      // Copy folio button
      var copyFolioBtn = overlay.querySelector(".sp-qd-copy-folio");
      if (copyFolioBtn) {
        copyFolioBtn.addEventListener("click", function() {
          navigator.clipboard.writeText(copyFolioBtn.dataset.copy).then(function() {
            copyFolioBtn.textContent = "✅";
            setTimeout(function() { copyFolioBtn.textContent = "📋"; }, 1500);
          });
        });
      }

      // Copy requester name button
      var copyNameBtn = overlay.querySelector(".sp-qd-copy-name");
      if (copyNameBtn) {
        copyNameBtn.addEventListener("click", function() {
          navigator.clipboard.writeText(copyNameBtn.dataset.copy).then(function() {
            copyNameBtn.textContent = "✅";
            setTimeout(function() { copyNameBtn.textContent = "📋"; }, 1500);
          });
        });
      }

      // Attach files - multiple with remove
      var attachInput = document.getElementById("sp-qd-attach-input");
      var attachListDiv = document.getElementById("sp-qd-attach-list");
      var pendingFiles = [];

      function renderPendingFiles() {
        attachListDiv.innerHTML = "";
        pendingFiles.forEach(function(f, idx) {
          var chip = document.createElement("span");
          chip.style.cssText = "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
          chip.innerHTML = '📎 ' + f.name + ' <span data-idx="' + idx + '" style="cursor:pointer;color:#D94040;font-weight:700;margin-left:2px;">✕</span>';
          chip.querySelector("[data-idx]").addEventListener("click", function() {
            pendingFiles.splice(idx, 1);
            renderPendingFiles();
          });
          attachListDiv.appendChild(chip);
        });
      }

      if (attachInput) { attachInput.addEventListener("change", function() {
        for (var i = 0; i < attachInput.files.length; i++) {
          pendingFiles.push(attachInput.files[i]);
        }
        attachInput.value = "";
        renderPendingFiles();
      }); }

      // Send comment (with optional attachments)
      var commentSendBtn = document.getElementById("sp-qd-comment-send");
      if (commentSendBtn) {
      commentSendBtn.addEventListener("click", async function() {
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
            pendingFiles.forEach(function(f) { formData.append("files", f); });
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
              var attachPayload = uploadedFiles.map(function(f) { uploadedFileNames.push(f.name); return { fileId: f.id }; });
              await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", {
                method: "POST",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ attachments: attachPayload, commentId: commentId, isInternal: false }),
              });
            }
          }

          // Update UI
          var now = new Date();
          var nowStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0") + " " + String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
          var myName = getLoggedUserName() || "Yo";
          var list = document.getElementById("sp-qd-comments-list");
          var noComments = list.querySelector('[style*="color:#aaa"]');
          if (noComments) noComments.remove();
          var attachLabel = uploadedFileNames.length ? ' <div style="margin-top:3px;">' + uploadedFileNames.map(function(n) { return '<span style="color:#1976D2;font-size:10px;">📎 ' + n + '</span>'; }).join(" ") + '</div>' : '';
          list.innerHTML += '<div style="padding:5px 8px;background:#e3f2fd;border-left:3px solid #1976D2;border-radius:4px;font-size:11px;margin-bottom:4px;">' +
            '<div style="display:flex;justify-content:space-between;"><b>' + myName + '</b><span style="color:#888;font-size:10px;">' + nowStr + '</span></div>' +
            '<div style="color:#555;margin-top:2px;">' + commentText + '</div>' + attachLabel + '</div>';
          list.scrollTop = list.scrollHeight;
          input.value = "";
          pendingFiles = [];
          renderPendingFiles();
        } catch(err) {
          showErrorToast("Error: " + err.message);
        }
        sendBtn.disabled = false;
        sendBtn.textContent = "Enviar";
      });
      } // end if commentSendBtn

      // Allow Enter to send
      var commentInputEl = document.getElementById("sp-qd-comment-input");
      if (commentInputEl) {
        commentInputEl.addEventListener("keydown", function(e) {
          if (e.key === "Enter") document.getElementById("sp-qd-comment-send").click();
        });
      }

      // Add attachment to existing comment
      overlay.querySelectorAll(".sp-qd-add-attach").forEach(function(label) {
        var fileInput = label.querySelector("input[type=file]");
        fileInput.addEventListener("change", async function() {
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
              var attachPayload = uploadedFiles.map(function(f) { return { fileId: f.id }; });
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
          } catch(err) {
            showErrorToast("Error: " + err.message);
            label.innerHTML = '📎<input type="file" multiple style="display:none;">';
          }
        });
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
        }).then(function(r) { return r.json(); }).then(function(statusJson) {
          var options = (statusJson.data || []);
          statusSelect.innerHTML = '<option value="" data-id="">' + statusName + ' (actual)</option>';
          options.forEach(function(opt) {
            var ns = opt.nextStatus || {};
            statusSelect.innerHTML += '<option value="' + ns.id + '" data-name="' + (ns.name || opt.name) + '">' + (ns.name || opt.name) + '</option>';
          });
        }).catch(function() {
          statusSelect.innerHTML = '<option value="">' + statusName + '</option>';
        });
      }

      if (statusSelect) statusSelect.addEventListener("change", async function() {
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
          statusSelect.style.color = STATUS_TEXT_COLORS[newStatusName] || "#333";
          // Reload valid options for new status
          var newOptRes = await fetch("https://macropayapi.supportplus.mx/ticket-status/next-status-options/" + newStatusId, {
            headers: { accept: "application/json", authorization: "Bearer " + spToken }
          });
          var newOptJson = await newOptRes.json();
          var newOptions = (newOptJson.data || []);
          statusSelect.innerHTML = '<option value="" data-id="">' + newStatusName + ' (actual)</option>';
          newOptions.forEach(function(opt) {
            var ns = opt.nextStatus || {};
            statusSelect.innerHTML += '<option value="' + ns.id + '" data-name="' + (ns.name || opt.name) + '">' + (ns.name || opt.name) + '</option>';
          });
        } catch(err) {
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

        // Load team members
        var teamConfig = getTeamConfig();
        teamConfig.profiles.forEach(function(p) {
          var opt = document.createElement("option");
          opt.value = p.profileId;
          opt.textContent = p.profileFullName;
          assignSelect.appendChild(opt);
        });

        // Toggle "Ticket realizado" extras
        takeDoneCheck.addEventListener("change", function() {
          takeExtraDiv.style.display = takeDoneCheck.checked ? "block" : "none";
        });

        // Load Monday groups for the select
        getMondayToken().then(function(mondayToken) {
          if (!mondayToken) return;
          getMondayBoardId().then(function(boardId) {
            if (!boardId) return;
            mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }', { boardId }).then(function(gData) {
              var groups = gData.boards[0]?.groups || [];
              groups.forEach(function(g) {
                var opt = document.createElement("option");
                opt.value = g.id;
                opt.textContent = g.title;
                takeGroupSelect.appendChild(opt);
              });
            }).catch(function() {});
          });
        });

        // Take button - just show the form, hide bottom comments
        var takeFormShown = false;
        takeBtn.addEventListener("click", function() {
          if (takeFormShown) return;
          takeFormShown = true;
          // Show take form
          var takeForm = document.getElementById("sp-qd-take-form");
          if (takeForm) takeForm.style.display = "block";
          // Hide assign select
          if (assignSelect) assignSelect.style.display = "none";
          // Hide bottom comment input row
          var allInputs = overlay.querySelectorAll("input[placeholder*='comentario']");
          allInputs.forEach(function(inp) {
            // Only hide the bottom one (not the one inside take form)
            if (!inp.closest("#sp-qd-take-form")) {
              var row = inp.parentElement;
              if (row) row.style.display = "none";
            }
          });
          // Change button appearance
          takeBtn.textContent = "🤚 Tomar";
          takeBtn.style.background = "#0D47A1";
          takeBtn.disabled = true;
        });

        // Confirm button - executes the take action
        var takeConfirmBtn = document.getElementById("sp-qd-take-confirm");
        if (takeConfirmBtn) {
          takeConfirmBtn.addEventListener("click", async function() {
            var comment = document.getElementById("sp-qd-take-comment").value.trim() || "se revisa";
            takeConfirmBtn.disabled = true;
            takeConfirmBtn.textContent = "⏳...";
            try {
              var myProfId = await getMyProfileId();
              if (!myProfId) throw new Error("No se pudo obtener tu perfil");
              var res = await fetch(SP_API + "/reassign/" + ticketId, {
                method: "PUT",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ resolutionGroupId: teamConfig.resolutionGroupId, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: teamConfig.resolutionGroupLabel, value: teamConfig.resolutionGroupId }, ticketCommentRequest: { internal: false, content: comment } }),
              });
              if (!res.ok) throw new Error("HTTP " + res.status);
              var json2 = await res.json();
              if (!json2.success) throw new Error("No success");

              if (takeDoneCheck.checked) {
                var closeComment = document.getElementById("sp-qd-take-close-comment").value.trim();
                if (closeComment) {
                  await fetch(SP_API + "/comment/" + ticketId, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ content: "<p>" + closeComment + "</p>", internal: false }),
                  });
                }
                await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ nextTicketStatusId: 9, ticketCommentRequest: null }),
                });
                var selectedGroup = takeGroupSelect ? takeGroupSelect.value : "";
                if (selectedGroup) {
                  overlay.remove();
                  handleMondayClick(ticketId, selectedGroup);
                  return;
                }
                showSuccessToast("Ticket tomado y cerrado");
              } else {
                showSuccessToast("Ticket tomado");
              }
              overlay.remove();
              showQuickDetailModal(ticketId);
            } catch(err) {
              showErrorToast("Error: " + err.message);
              takeConfirmBtn.disabled = false;
              takeConfirmBtn.textContent = "Confirmar";
            }
          });
        }

        // Assign select - assign to selected member
        assignSelect.addEventListener("change", async function() {
          var selectedId = assignSelect.value;
          if (!selectedId) return;
          var comment = document.getElementById("sp-qd-take-comment")?.value?.trim() || "se revisa";
          assignSelect.disabled = true;
          showLoadingToast("Asignando ticket...");
          try {
            var res = await fetch(SP_API + "/reassign/" + ticketId, {
              method: "PUT",
              headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
              body: JSON.stringify({ resolutionGroupId: teamConfig.resolutionGroupId, serviceId: null, responsibleProfileId: parseInt(selectedId), resolutionGroup: { label: teamConfig.resolutionGroupLabel, value: teamConfig.resolutionGroupId }, ticketCommentRequest: { internal: false, content: comment } }),
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            var json2 = await res.json();
            if (json2.success) {
              showSuccessToast("Ticket asignado");
              overlay.remove();
              showQuickDetailModal(ticketId);
            } else throw new Error("No success");
          } catch(err) {
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
          getMondayToken().then(function(mondayToken) {
            if (!mondayToken) return;
            getMondayBoardId().then(function(boardId) {
              if (!boardId) return;
              mondayQuery(mondayToken, 'query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }', { boardId }).then(function(gData) {
                var groups = gData.boards[0]?.groups || [];
                groups.forEach(function(g) {
                  var opt = document.createElement("option");
                  opt.value = g.id;
                  opt.textContent = g.title;
                  closeGroupSelect.appendChild(opt);
                });
              }).catch(function() {});
            });
          });
        }

        closeActionBtn.addEventListener("click", function() {
          closeForm.style.display = closeForm.style.display === "none" ? "block" : "none";
          // Hide bottom comment input when close form is shown
          if (closeForm.style.display === "block") {
            var allInputs = overlay.querySelectorAll("input[placeholder*='comentario']");
            allInputs.forEach(function(inp) {
              if (!inp.closest("#sp-qd-close-form")) {
                var row = inp.parentElement;
                if (row) row.style.display = "none";
              }
            });
          }
        });

        var closeConfirmBtn = document.getElementById("sp-qd-close-confirm");
        if (closeConfirmBtn) {
          closeConfirmBtn.addEventListener("click", async function() {
            var closeComment = document.getElementById("sp-qd-close-comment").value.trim();
            var selectedGroup = closeGroupSelect ? closeGroupSelect.value : "";
            closeConfirmBtn.disabled = true;
            closeConfirmBtn.textContent = "⏳...";
            showLoadingToast("Cerrando ticket...");
            try {
              // Comment if provided
              if (closeComment) {
                await fetch(SP_API + "/comment/" + ticketId, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                  body: JSON.stringify({ content: "<p>" + closeComment + "</p>", internal: false }),
                });
              }
              // If no one assigned, assign to me first
              if (!holderName || holderName === "Sin asignar") {
                var myProfId = await getMyProfileId();
                if (myProfId) {
                  await fetch(SP_API + "/reassign/" + ticketId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                    body: JSON.stringify({ resolutionGroupId: getTeamConfig().resolutionGroupId, serviceId: null, responsibleProfileId: myProfId, resolutionGroup: { label: getTeamConfig().resolutionGroupLabel, value: getTeamConfig().resolutionGroupId } }),
                  });
                }
              }
              // Close
              var closeRes = await fetch(SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
                body: JSON.stringify({ nextTicketStatusId: 9, ticketCommentRequest: null }),
              });
              if (!closeRes.ok) throw new Error("HTTP " + closeRes.status);
              // Migrate if selected
              if (selectedGroup) {
                overlay.remove();
                handleMondayClick(ticketId, selectedGroup);
                return;
              }
              showSuccessToast("Ticket cerrado");
              overlay.remove();
              showQuickDetailModal(ticketId);
            } catch(err) {
              showErrorToast("Error: " + err.message);
              closeConfirmBtn.disabled = false;
              closeConfirmBtn.textContent = "Confirmar";
            }
          });
        }
      }

      // Migrate only button
      var migrateOnlyBtn = document.getElementById("sp-qd-migrate-btn");
      if (migrateOnlyBtn) {
        migrateOnlyBtn.addEventListener("click", function() {
          console.log("[SP] Migrate button clicked, ticketId:", ticketId);
          overlay.remove();
          handleMondayClick(ticketId);
        });
      }

      // Reopen button + select
      var reopenBtn = document.getElementById("sp-qd-reopen-btn");
      var reopenSelect = document.getElementById("sp-qd-reopen-select");
      if (reopenBtn && reopenSelect) {
        var teamConfigReopen = getTeamConfig();
        teamConfigReopen.profiles.forEach(function(p) {
          var opt = document.createElement("option");
          opt.value = p.profileId;
          opt.textContent = p.profileFullName;
          reopenSelect.appendChild(opt);
        });

        reopenBtn.addEventListener("click", async function() {
          var personId = reopenSelect.value;
          if (!personId) { showErrorToast("Selecciona a quién reasignar"); return; }
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
              showSuccessToast("Ticket reabierto y reasignado");
              overlay.remove();
              showQuickDetailModal(ticketId);
            } else throw new Error("No success");
          } catch(err) {
            showErrorToast("Error: " + err.message);
            reopenBtn.disabled = false;
            reopenBtn.textContent = "🔓 Reabrir";
          }
        });

        reopenSelect.addEventListener("change", function() {
          if (reopenSelect.value) reopenBtn.textContent = "🔓 Reabrir y reasignar";
          else reopenBtn.textContent = "🔓 Reabrir";
        });
      }

      // View attachments in modal
      console.log("[SP] Registering download listeners, found:", overlay.querySelectorAll(".sp-qd-download").length);
      overlay.querySelectorAll(".sp-qd-download").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          var fileId = btn.dataset.fileId;
          var fileName = btn.dataset.fileName;
          btn.textContent = "⏳ ...";
          btn.disabled = true;
          try {
            var fileRes = await fetch("https://macropayapi.supportplus.mx/files/" + fileId, {
              headers: { accept: "application/json", authorization: "Bearer " + spToken }
            });
            if (!fileRes.ok) throw new Error("HTTP " + fileRes.status);
            var fileJson = await fileRes.json();
            var fileData = fileJson.data || fileJson;
            var base64Content = fileData.content;
            if (!base64Content) throw new Error("Sin contenido");

            // Decode base64 to blob
            var byteChars = atob(base64Content);
            var byteNumbers = new Array(byteChars.length);
            for (var i = 0; i < byteChars.length; i++) {
              byteNumbers[i] = byteChars.charCodeAt(i);
            }
            var byteArray = new Uint8Array(byteNumbers);

            // Determine mime type
            var mimeType = "application/octet-stream";
            var ext = fileName.split(".").pop().toLowerCase();
            var mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", pdf: "application/pdf", zip: "application/zip", txt: "text/plain" };
            if (mimeMap[ext]) mimeType = mimeMap[ext];

            var blob = new Blob([byteArray], { type: mimeType });
            var url = URL.createObjectURL(blob);
            btn.textContent = "📎 " + fileName;
            btn.disabled = false;

            // Show file in a modal
            var fileModal = document.createElement("div");
            fileModal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.8);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;";
            var isImage = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(fileName);
            var isPdf = /\.pdf$/i.test(fileName);
            var isText = /\.(txt|sql|csv|json|xml|log|md|yml|yaml|ini|conf|sh|bat|ps1|py|js|ts|html|css|env)$/i.test(fileName);
            var contentHTML = '';
            if (isImage) {
              contentHTML = '<img src="' + url + '" style="max-width:90vw;max-height:80vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">';
            } else if (isPdf) {
              contentHTML = '<iframe src="' + url + '" style="width:90vw;height:85vh;border:none;border-radius:8px;"></iframe>';
            } else if (isText) {
              var textContent = new TextDecoder("utf-8").decode(byteArray);
              var escaped = textContent.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
              contentHTML = '<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:85vh;overflow:auto;position:relative;"><button id="sp-file-copy-text" style="position:absolute;top:8px;right:8px;padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:11px;font-weight:600;">📋 Copiar</button><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">' + escaped + '</pre></div>';
            } else {
              contentHTML = '<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 12px;font-size:14px;">No se puede previsualizar: <b>' + fileName + '</b></p><a href="' + url + '" download="' + fileName + '" style="padding:8px 16px;background:#1976D2;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;">📥 Descargar</a></div>';
            }
            fileModal.innerHTML = '<div style="display:flex;justify-content:flex-end;width:90vw;margin-bottom:8px;gap:8px;"><a id="sp-file-download" href="' + url + '" download="' + fileName + '" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;text-decoration:none;">📥 Descargar</a><button id="sp-file-close" style="padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;">✕ Cerrar</button></div>' + contentHTML;
            document.body.appendChild(fileModal);
            document.getElementById("sp-file-close").addEventListener("click", function() { fileModal.remove(); URL.revokeObjectURL(url); });
            fileModal.addEventListener("click", function(e) { if (e.target === fileModal) { fileModal.remove(); URL.revokeObjectURL(url); } });
            var copyTextBtn = document.getElementById("sp-file-copy-text");
            if (copyTextBtn) {
              copyTextBtn.addEventListener("click", function() {
                navigator.clipboard.writeText(textContent).then(function() {
                  copyTextBtn.textContent = "✅ Copiado";
                  setTimeout(function() { copyTextBtn.textContent = "📋 Copiar"; }, 2000);
                });
              });
            }
          } catch(err) {
            btn.textContent = "❌ Error";
            setTimeout(function() { btn.textContent = "📎 " + fileName; btn.disabled = false; }, 2000);
          }
        });
      });

    } catch(err) {
      showErrorToast("Error: " + err.message);
    }
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
    injectConfigButton();
    injectSearchButton();
    injectDashboardButton();
    injectWaterButton();
    injectReportButton();
    injectMondayStatsButton();
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

      // Inject close button for any non-closed ticket in my area
      if (statusText !== "Cerrado" && !row.querySelector("." + CLOSE_BTN_CLASS) && rowBelongsToMe) {
        container.appendChild(createCloseButton(ticketId));
      }

      // Clean up close button if status changed to Cerrado
      if (statusText === "Cerrado") {
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

    // Replace folio label with quick detail button on all rows
    document.querySelectorAll(".MuiDataGrid-row").forEach(function(row) {
      if (row.querySelector("." + DETAIL_QUICK_CLASS)) return;
      var ticketId = row.getAttribute("data-id");
      if (!ticketId) return;
      var firstCell = row.querySelector('[data-field="uniqueCode"]');
      if (!firstCell) return;
      var container = firstCell.querySelector(".MuiBox-root") || firstCell;
      var folioEl = container.querySelector("p.MuiTypography-body1");
      if (!folioEl) return;
      var folioText = folioEl.textContent.trim();
      // Create button with folio text
      var btn = document.createElement("button");
      btn.className = DETAIL_QUICK_CLASS + " MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
      btn.textContent = folioText;
      btn.style.cssText = "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.preventDefault();
        showQuickDetailModal(ticketId);
      });
      // Replace folio with button
      folioEl.replaceWith(btn);
    });
    injectBulkButton();
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
        "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
        { boardId: boards[0].id, groupId: groupId, itemName: itemName, columnValues: columnValues }
      );
      if (result.errors) throw new Error(result.errors[0].message);
      syncPromise = null;
      localStorage.removeItem(CACHE_KEY);
      var lt = document.getElementById("sp-loading-toast"); if (lt) lt.remove();
      showSuccessToast("✅ Migrado a Monday");
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
        Object.values(TEAM_AREAS).forEach(function(area) {
          area.profiles.forEach(function(p) { if (String(p.profileId) === selectedPersonId) selectedProfile = p; });
        });
        if (selectedProfile && selectedProfile.email) {
          try {
            const users = await getMondayUsers(mondayToken);
            var foundUserId = users[selectedProfile.email.toLowerCase()];
            if (!foundUserId) {
              // Fallback: search by partial email match
              var emailPrefix = selectedProfile.email.split("@")[0].toLowerCase();
              Object.entries(users).forEach(function(entry) {
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
    // Resolve profileId from session name
    var myName = getLoggedUserName();
    if (myName && currentTeamArea) {
      loadProfilesForGroup(currentTeamArea).then(function(profiles) {
        var me = profiles.find(function(p) { return p.profileFullName === myName; });
        if (me) { sessionProfileId = me.profileId; myProfileId = me.profileId; }
      }).catch(function() {});
    }
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
  } // end initExtension

  // Re-sync Notion on page focus (detect changes without reload)
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
      try { chrome.runtime.sendMessage({ type: "sync-notion" }); } catch(e) {}
    }
  });

})();
