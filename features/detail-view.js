// ============================================================
// FEATURES/DETAIL-VIEW.JS - Detail view detections & helpers
// ============================================================

(function () {
  "use strict";

  const esc = window.esc;

  // ─── Pattern Detection Engine ─────────────────────────────
  // Detects SL/PR codes, service users, and DB objects from text

  /**
   * Detect SL and PR codes (e.g., SL1234567890, PR9876543210)
   * @param {string} text
   * @returns {string[]}
   */
  function detectSLCodes(text) {
    const raw = text.match(/(?:SL|PR)\d{10,}/g);
    if (!raw) return [];
    return raw.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  /**
   * Detect service/system users (mp-, srv-, usr_, dba-, app-)
   * @param {string} text
   * @returns {string[]}
   */
  function detectUsers(text) {
    const raw = text.match(/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g);
    if (!raw) return [];
    const seen = {};
    return raw.map(function (v) {
      const m = v.match(/(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i);
      return m ? m[1] : v;
    }).filter(function (v) {
      const low = v.toLowerCase();
      if (seen[low]) return false;
      seen[low] = true;
      return true;
    });
  }

  /**
   * Detect database objects (tables, views, stored procedures, functions)
   * @param {string} text
   * @returns {string[]}
   */
  function detectDBObjects(text) {
    const matches = [];

    // Pattern 1: schema.object (e.g. HANA_Plata.HN_ZVW_PEDIDOS_CENT)
    const schemaRaw = text.match(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]{3,}/g);
    if (schemaRaw) {
      schemaRaw.forEach(function (v) {
        if (v.match(/\.(com|mx|net|org|jpg|png|pdf|xlsx|csv|txt|html|js|css)$/i)) return;
        matches.push(v);
      });
    }

    // Pattern 2: SP/USP prefixed (stored procedures)
    const spRaw = text.match(/\b(?:sp_|usp_|SP_|USP_)[A-Za-z0-9_]{3,}/g);
    if (spRaw) spRaw.forEach(function (v) { matches.push(v); });

    // Pattern 3: Common DB prefixes (HN_, VW_, ZVW_, FN_, TBL_, V_, T_)
    const prefixRaw = text.match(/\b(?:HN_|VW_|ZVW_|FN_|TBL_|V_|T_)[A-Za-z0-9_]{3,}/g);
    if (prefixRaw) prefixRaw.forEach(function (v) { matches.push(v); });

    // Pattern 4: Contextual - word after keywords
    const contextRaw = text.match(/(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*([A-Za-z_][A-Za-z0-9_.]{3,})/gi);
    if (contextRaw) {
      contextRaw.forEach(function (match) {
        const obj = match.replace(/^(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*/i, "").trim();
        if (obj && obj.length > 3) matches.push(obj);
      });
    }

    // Pattern 5: UPPER_CASE words with underscores (3+ segments)
    const upperRaw = text.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g);
    if (upperRaw) {
      upperRaw.forEach(function (v) {
        if (v.length < 8) return;
        matches.push(v);
      });
    }

    // Deduplicate
    const seen = {};
    return matches.filter(function (v) {
      const low = v.toLowerCase();
      if (seen[low]) return false;
      seen[low] = true;
      return true;
    });
  }

  /**
   * Run all detections on a text and return results
   * @param {string} text
   * @returns {{ slCodes: string[], users: string[], dbObjects: string[] }}
   */
  function detectAll(text) {
    return {
      slCodes: detectSLCodes(text),
      users: detectUsers(text),
      dbObjects: detectDBObjects(text)
    };
  }

  // ─── Copy Button Factory ──────────────────────────────────

  /**
   * Create a copy-to-clipboard button
   * @param {string} text - Text to copy
   * @returns {HTMLElement}
   */
  function createCopyButton(text) {
    const btn = document.createElement("button");
    btn.className = "sp-copy-btn";
    btn.innerHTML = "📋";
    btn.title = "Copiar";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      navigator.clipboard.writeText(text).then(function () {
        btn.innerHTML = "✅";
        setTimeout(function () { btn.innerHTML = "📋"; }, 1500);
      });
    });
    return btn;
  }

  // ─── Render Detections Container ──────────────────────────

  /**
   * Create the detections DOM container from detection results
   * @param {{ slCodes: string[], users: string[], dbObjects: string[] }} detections
   * @param {Object} options
   * @param {boolean} [options.showLabels=true] - Whether to show SL/DB detections
   * @returns {HTMLElement|null} - Returns null if nothing detected
   */
  function renderDetections(detections, options) {
    const opts = options || {};
    const showLabels = opts.showLabels !== false;

    const hasContent = (detections.slCodes.length && showLabels) ||
                     detections.users.length ||
                     (detections.dbObjects.length && showLabels);

    if (!hasContent) return null;

    const container = document.createElement("div");
    container.id = "sp-detail-detections";
    container.style.cssText = "margin-bottom:12px;";

    if (detections.slCodes.length && showLabels) {
      const slDiv = document.createElement("div");
      slDiv.className = "sp-detection-box";
      slDiv.style.background = "#E3F2FD";
      slDiv.innerHTML = '<b style="font-size:12px;color:#1976D2;">SL/PR detectadas:</b> ';
      detections.slCodes.forEach(function (sl) {
        const span = document.createElement("span");
        span.className = "sp-detection-tag";
        span.style.border = "1px solid #1976D2";
        span.textContent = sl;
        span.appendChild(createCopyButton(sl));
        slDiv.appendChild(span);
      });
      container.appendChild(slDiv);
    }

    if (detections.users.length) {
      const userDiv = document.createElement("div");
      userDiv.className = "sp-detection-box";
      userDiv.style.background = "#FFF3E0";
      userDiv.innerHTML = '<b style="font-size:12px;color:#E65100;">Usuarios detectados:</b> ';
      detections.users.forEach(function (u) {
        const span = document.createElement("span");
        span.className = "sp-detection-tag";
        span.style.cssText += "border:1px solid #E65100;font-family:monospace;";
        span.textContent = u;
        span.appendChild(createCopyButton(u));
        userDiv.appendChild(span);
      });
      container.appendChild(userDiv);
    }

    if (detections.dbObjects.length && showLabels) {
      const dbDiv = document.createElement("div");
      dbDiv.className = "sp-detection-box";
      dbDiv.style.background = "#E8F5E9";
      dbDiv.innerHTML = '<b style="font-size:12px;color:#2E7D32;">🗄️ Objetos de BD detectados:</b> ';
      detections.dbObjects.forEach(function (obj) {
        const span = document.createElement("span");
        span.className = "sp-detection-tag";
        span.style.cssText += "border:1px solid #2E7D32;font-family:monospace;";
        span.textContent = obj;
        span.appendChild(createCopyButton(obj));
        dbDiv.appendChild(span);
      });
      container.appendChild(dbDiv);
    }

    return container;
  }

  // ─── Detail View Helpers ──────────────────────────────────

  function isDetailView() {
    return /\/tickets\/\d+/.test(window.location.pathname);
  }

  function getDetailTicketId() {
    const m = window.location.pathname.match(/\/tickets\/(\d+)/);
    return m ? m[1] : null;
  }

  // Expose
  window.SP_DetailView = {
    // Detections
    detectSLCodes: detectSLCodes,
    detectUsers: detectUsers,
    detectDBObjects: detectDBObjects,
    detectAll: detectAll,
    renderDetections: renderDetections,

    // Helpers
    createCopyButton: createCopyButton,
    isDetailView: isDetailView,
    getDetailTicketId: getDetailTicketId
  };

})();
