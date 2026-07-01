// ============================================================
// FEATURES/HEADER-BUTTONS.JS - Header button injection & SPA observer
// ============================================================

(function () {
  "use strict";

  var createHeaderButton = window.createHeaderButton;
  var SP_DOM = window.SP_DOM;
  var SP_Session = window.SP_Session;

  var HEADER_SELECTOR = '[class*="warapperNameUserAndLogout"]';

  // ─── Button Registry ──────────────────────────────────────
  // Each button is registered here with its injection logic.
  // Buttons marked "always" inject regardless of session.
  // Buttons marked "authenticated" only inject after session check.

  var _registeredButtons = [];

  /**
   * Register a header button to be injected
   * @param {Object} opts
   * @param {string} opts.id - DOM id for the button
   * @param {string} opts.icon - Emoji/icon
   * @param {string} opts.label - Button label
   * @param {string} opts.color - Background color
   * @param {Function} opts.onClick - Click handler
   * @param {string} [opts.phase="always"] - "always" or "authenticated"
   * @param {Function} [opts.shouldShow] - Optional: return false to skip injection
   */
  function registerButton(opts) {
    _registeredButtons.push(opts);
  }

  // ─── Injection Logic ──────────────────────────────────────

  function injectButtons(phase) {
    var wrapper = document.querySelector(HEADER_SELECTOR);
    if (!wrapper) return;
    var container = wrapper.parentElement;
    if (!container) return;

    _registeredButtons.forEach(function (opts) {
      // Skip if wrong phase
      var btnPhase = opts.phase || "always";
      if (phase && btnPhase !== phase && phase !== "all") return;

      // Skip if already injected
      if (opts.id && document.getElementById(opts.id)) return;

      // Skip if shouldShow returns false
      if (opts.shouldShow && !opts.shouldShow()) return;

      var btn = createHeaderButton({
        id: opts.id,
        icon: opts.icon,
        label: opts.label,
        color: opts.color,
        onClick: opts.onClick
      });

      // Apply any extra attributes
      if (opts.style) btn.style.cssText += opts.style;
      if (opts.hidden) btn.style.display = "none";

      container.insertBefore(btn, wrapper);
    });
  }

  // ─── Initial Injection (retry until header appears) ───────

  function initialInject() {
    SP_DOM.waitForElement(HEADER_SELECTOR, { maxAttempts: 50, interval: 100 })
      .then(function (wrapper) {
        if (wrapper) injectButtons("always");
      });
  }

  // ─── SPA Navigation Observer ──────────────────────────────
  // Re-inject buttons when SPA navigation rebuilds the header

  function startHeaderObserver() {
    var debounceTimer = null;

    var observer = new MutationObserver(function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var wrapper = document.querySelector(HEADER_SELECTOR);
        if (!wrapper) return;
        // Check if our buttons are gone (SPA re-rendered the header)
        if (!document.getElementById("sp-config-btn")) {
          injectButtons("all");
        }
      }, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Version Check & Update Button ────────────────────────

  var _currentVersion = chrome.runtime.getManifest().version;

  function checkVersion() {
    SP_Storage.getMultiple(["latestVersion", "latestZipUrl"]).then(function (r) {
      var latest = r.latestVersion || "";
      var zipUrl = r.latestZipUrl || "";

      if (!latest || latest === _currentVersion) {
        var btn = document.getElementById("sp-update-btn");
        if (btn) btn.style.display = "none";
        return;
      }

      var cur = _currentVersion.split(".").map(Number);
      var lat = latest.split(".").map(Number);

      if (lat[0] > cur[0]) {
        // Major version — block
        SP_Session.state.versionBlocked = true;
        showVersionBlocker(latest, zipUrl);
      } else {
        // Minor/patch — show update button
        var btn = document.getElementById("sp-update-btn");
        if (btn) btn.style.display = "inline-flex";
      }
    });
  }

  function showVersionBlocker(latest, zipUrl) {
    var blocker = document.createElement("div");
    blocker.id = "sp-version-blocker";
    blocker.className = "sp-version-blocker";

    var downloadBtn = zipUrl
      ? '<button id="sp-blocker-download" style="margin-top:10px;padding:8px 16px;background:#1976D2;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">📥 Descargar v' + latest + '</button>'
      : '';

    blocker.innerHTML = '<div style="background:#fff;padding:30px;border-radius:12px;text-align:center;max-width:400px;font-family:system-ui;">' +
      '<h2 style="margin:0 0 12px;color:#D32F2F;">⚠️ Actualización requerida</h2>' +
      '<p style="margin:0 0 8px;font-size:14px;">Tu versión (<b>' + _currentVersion + '</b>) está muy desactualizada.<br>La versión actual es <b>' + latest + '</b>.</p>' +
      '<p style="margin:0;font-size:13px;color:#555;">Actualiza la extensión para continuar usando SupportPlus Tools.</p>' +
      downloadBtn + '</div>';

    document.body.appendChild(blocker);

    if (zipUrl) {
      document.getElementById("sp-blocker-download").addEventListener("click", function (e) {
        downloadZip(zipUrl, latest, e);
      });
    }
  }

  function downloadZip(url, version, e) {
    var btn = e && e.target ? e.target : null;
    if (btn) { btn.textContent = "⏳ Descargando..."; btn.disabled = true; }

    // Extract filename from URL if possible, otherwise use default
    var fileName = "v" + version + ".zip";
    try {
      var urlPath = new URL(url).pathname;
      var urlFileName = urlPath.split("/").pop();
      if (urlFileName && urlFileName.endsWith(".zip")) fileName = urlFileName;
    } catch (e) { /* use default */ }

    window.SP_API_Lib.proxyFetch(url)
      .then(function (byteArray) {
        var blob = new Blob([byteArray], { type: "application/zip" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
        if (btn) btn.textContent = "✅ Descargado";
      })
      .catch(function () {
        // Fallback: direct link
        var a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.target = "_blank";
        a.click();
        if (btn) {
          btn.textContent = "📥 Abriendo...";
          setTimeout(function () { btn.textContent = "📥 Descargar"; btn.disabled = false; }, 3000);
        }
      });
  }

  // ─── Row Coloring ─────────────────────────────────────────
  // Colors rows by ticket status using CSS classes from styles.js

  function colorRows() {
    var STATUS_CLASS_MAP = window.SP_Styles.STATUS_CLASS_MAP;
    document.querySelectorAll('.MuiDataGrid-row').forEach(function (row) {
      if (row.dataset.spColored) return;
      var cell = row.querySelector('[data-field="ticketStatusName"]');
      if (!cell) return;
      var status = cell.textContent.trim();
      var cls = STATUS_CLASS_MAP[status];
      if (cls) {
        row.classList.add(cls);
        row.dataset.spColored = "1";
      }
    });
  }

  function startRowColorObserver() {
    var observer = new MutationObserver(SP_DOM.throttle(colorRows, 200));
    observer.observe(document.body, { childList: true, subtree: true });
    colorRows();
  }

  // ─── GROUP_INFO loader ────────────────────────────────────
  var GROUP_INFO = window.SP_CONFIG.GROUP_INFO;

  function loadGroupInfo() {
    SP_Storage.get("groupNames").then(function (groupNames) {
      if (groupNames && Object.keys(groupNames).length > 0) {
        GROUP_INFO = Object.keys(groupNames).map(function (id) {
          return { id: parseInt(id), name: groupNames[id] };
        });
        window.SP_GroupInfo = GROUP_INFO;
      }
    }).catch(function () { });
    window.SP_GroupInfo = GROUP_INFO;
  }

  // ─── Initialize ───────────────────────────────────────────

  // Register core buttons (always visible, even before session)
  registerButton({
    id: "sp-config-btn",
    icon: "⚙️",
    label: "Config",
    color: "rgba(255,255,255,0.15)",
    phase: "always",
    onClick: function () { document.dispatchEvent(new CustomEvent("sp-open-config")); }
  });

  registerButton({
    id: "sp-update-btn",
    icon: "🔄",
    label: "Actualizar",
    color: "#FF8F00",
    phase: "always",
    hidden: true,
    onClick: function () {
      SP_Storage.get("latestZipUrl").then(function (url) {
        if (url) downloadZip(url, "", null);
      });
    }
  });

  // Start everything
  initialInject();
  startHeaderObserver();
  startRowColorObserver();
  loadGroupInfo();

  // Version check: after 3s, and on tab focus
  setTimeout(checkVersion, 3000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !SP_Session.state.versionBlocked) {
      checkVersion();
    }
  });

  // Expose for other modules to register buttons
  window.SP_Header = {
    registerButton: registerButton,
    injectButtons: injectButtons,
    checkVersion: checkVersion,
    downloadZip: downloadZip,
    getGroupInfo: function () { return window.SP_GroupInfo || GROUP_INFO; }
  };

})();
