// ============================================================
// FEATURES/HEADER-BUTTONS.JS - Header button injection & SPA observer
// ============================================================

(function () {
  "use strict";

  const createHeaderButton = window.createHeaderButton;
  const SP_DOM = window.SP_DOM;
  const SP_Session = window.SP_Session;

  const HEADER_SELECTOR = '[class*="warapperNameUserAndLogout"]';

  // ─── Button Registry ──────────────────────────────────────
  // Each button is registered here with its injection logic.
  // Buttons marked "always" inject regardless of session.
  // Buttons marked "authenticated" only inject after session check.

  const _registeredButtons = [];

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
    const wrapper = document.querySelector(HEADER_SELECTOR);
    if (!wrapper) return;
    const container = wrapper.parentElement;
    if (!container) return;

    _registeredButtons.forEach(function (opts) {
      // Skip if wrong phase
      const btnPhase = opts.phase || "always";
      if (phase && btnPhase !== phase && phase !== "all") return;

      // Skip if already injected
      if (opts.id && document.getElementById(opts.id)) return;

      // Skip if shouldShow returns false
      if (opts.shouldShow && !opts.shouldShow()) return;

      const btn = createHeaderButton({
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
    const _headerRefs = { timer: null };

    const observer = new MutationObserver(function () {
      if (_headerRefs.timer) clearTimeout(_headerRefs.timer);
      _headerRefs.timer = setTimeout(function () {
        const wrapper = document.querySelector(HEADER_SELECTOR);
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

  const _currentVersion = chrome.runtime.getManifest().version;

  function checkVersion() {
    SP_Storage.getMultiple(["latestVersion", "latestZipUrl"]).then(function (r) {
      const latest = r.latestVersion || "";
      const zipUrl = r.latestZipUrl || "";

      if (!latest || latest === _currentVersion) {
        const btn = document.getElementById("sp-update-btn");
        if (btn) btn.style.display = "none";
        return;
      }

      const cur = _currentVersion.split(".").map(Number);
      const lat = latest.split(".").map(Number);

      if (lat[0] > cur[0]) {
        // Major version — show alert in header (non-blocking)
        SP_Session.state.versionBlocked = true;
        showVersionAlert(latest, zipUrl);
      } else {
        // Minor/patch — show update button
        const btn = document.getElementById("sp-update-btn");
        if (btn) btn.style.display = "inline-flex";
      }
    });
  }

  function showVersionAlert(latest, zipUrl) {
    if (document.getElementById("sp-version-alert")) return;
    SP_DOM.waitForElement('[class*="warapperNameUserAndLogout"]', { maxAttempts: 30, interval: 200 })
      .then(function (wrapper) {
        if (!wrapper) return;
        if (document.getElementById("sp-version-alert")) return;
        const alert = document.createElement("div");
        alert.id = "sp-version-alert";
        alert.style.cssText = "padding:6px 14px;font-size:11px;border-radius:6px;background:rgba(217,64,64,0.15);color:#D94040;border:1px solid rgba(217,64,64,0.3);margin-right:8px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;";
        alert.innerHTML = '⚠️ Actualiza a v' + latest + ' <span style="padding:2px 8px;background:#D94040;color:#fff;border-radius:4px;font-size:10px;">Descargar</span>';
        alert.addEventListener("click", function () {
          if (zipUrl) {
            downloadZip(zipUrl, latest, null);
          }
        });
        wrapper.parentElement.insertBefore(alert, wrapper);
      });
  }

  function downloadZip(url, version, e) {
    const btn = e && e.target ? e.target : null;
    if (btn) { btn.textContent = "⏳ Descargando..."; btn.disabled = true; }

    // Determine filename
    const _fnRef = { name: "v" + (version || "update") + ".zip" };

    // ─── Base64 mode: decode directly without fetch ───
    if (url && url.startsWith("base64:")) {
      try {
        const b64 = url.substring(7); // remove "base64:" prefix
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (var i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/zip" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = _fnRef.name;
        a.click();
        URL.revokeObjectURL(a.href);
        if (btn) btn.textContent = "✅ Descargado";
      } catch (ex) {
        console.error("[SP] Error decoding base64 zip:", ex);
        if (btn) { btn.textContent = "❌ Error"; setTimeout(function () { btn.textContent = "📥 Descargar"; btn.disabled = false; }, 3000); }
      }
      return;
    }

    // ─── URL mode: fetch via proxy ───
    try {
      const urlPath = new URL(url).pathname;
      const urlFileName = urlPath.split("/").pop();
      if (urlFileName && urlFileName.endsWith(".zip")) _fnRef.name = urlFileName;
    } catch (ex) { /* use default */ }

    window.SP_API_Lib.proxyFetch(url)
      .then(function (byteArray) {
        const blob = new Blob([byteArray], { type: "application/zip" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = _fnRef.name;
        a.click();
        URL.revokeObjectURL(a.href);
        if (btn) btn.textContent = "✅ Descargado";
      })
      .catch(function () {
        // Fallback: direct link
        const a = document.createElement("a");
        a.href = url;
        a.download = _fnRef.name;
        a.target = "_blank";
        a.click();
        if (btn) {
          btn.textContent = "📥 Abriendo...";
          setTimeout(function () { btn.textContent = "📥 Descargar"; btn.disabled = false; }, 3000);
        }
      });
  }

  // ─── Row Coloring: delegated to features/row-colors.js ────

  // ─── GROUP_INFO loader ────────────────────────────────────
  const _groupRefs = { info: window.SP_CONFIG.GROUP_INFO };

  function loadGroupInfo() {
    SP_Storage.get("groupNames").then(function (groupNames) {
      if (groupNames && Object.keys(groupNames).length > 0) {
        _groupRefs.info = Object.keys(groupNames).map(function (id) {
          return { id: parseInt(id), name: groupNames[id] };
        });
        window.SP_GroupInfo = _groupRefs.info;
      }
    }).catch(function () { });
    window.SP_GroupInfo = _groupRefs.info;
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
      SP_Storage.getMultiple(["latestZipUrl", "latestVersion"]).then(function (stored) {
        if (stored.latestZipUrl) downloadZip(stored.latestZipUrl, stored.latestVersion || "", null);
      });
    }
  });

  registerButton({
    id: "sp-dba-info-btn",
    icon: "🏠",
    label: "DBA Info",
    color: "#4CAF50",
    phase: "session",
    shouldShow: function () {
      const ss = window.SP_Session.state;
      return !!(ss.canGuardias || ss.canAddParticipant || ss.canAddProduct || ss.canAdelantar);
    },
    onClick: function () {
      if (window.SP_ManagerView && window.SP_ManagerView.showDBAInfo) {
        window.SP_ManagerView.showDBAInfo();
      }
    }
  });

  // Start everything
  initialInject();
  startHeaderObserver();
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
    getGroupInfo: function () { return window.SP_GroupInfo || _groupRefs.info; }
  };

})();
