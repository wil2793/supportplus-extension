// ============================================================
// COMPONENTS.JS - Reusable UI components
// ============================================================

(function() {

  // --- HTML escape helper ---
  window.esc = function(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // --- Deterministic color from string ---
  window.stringToColor = function(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    var hue = Math.abs(hash) % 360;
    return { bg: "hsl(" + hue + ",35%,90%)", border: "hsl(" + hue + ",45%,65%)", text: "hsl(" + hue + ",50%,30%)" };
  };

  // --- Responsive header button style ---
  (function() {
    var style = document.createElement("style");
    style.textContent = ".sp-hdr-btn { transition: all 0.2s; } " +
      "@media (max-width: 1600px) { .sp-hdr-btn .sp-btn-label { display:none; } .sp-hdr-btn { padding:6px 10px !important; min-width:auto !important; } } " +
      "@media (max-width: 1100px) { .sp-hdr-btn { padding:4px 8px !important; font-size:11px !important; } }";
    document.head.appendChild(style);
  })();

  // --- Header Button Component ---
  // Usage: createHeaderButton({ id, icon, label, color, onClick })
  window.createHeaderButton = function(opts) {
    var btn = document.createElement("button");
    btn.id = opts.id || "";
    btn.className = "sp-hdr-btn";
    btn.innerHTML = '<span class="sp-btn-icon">' + (opts.icon || "") + '</span><span class="sp-btn-label"> ' + (opts.label || "") + '</span>';
    btn.style.cssText = "padding:6px 12px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:" + (opts.color || "#1565C0") + ";color:#fff;font-weight:600;white-space:nowrap;margin-right:4px;display:inline-flex;align-items:center;gap:2px;";
    btn.title = opts.label || "";
    if (opts.onClick) btn.addEventListener("click", opts.onClick);
    return btn;
  };

  // --- Modal Component ---
  // Usage: createModal({ id, title, content, options })
  // Returns: { overlay, modal, body, close }
  window.createModal = function(opts) {
    var id = opts.id || "sp-modal-" + Date.now();
    var title = opts.title || "";
    var content = opts.content || "";
    var o = opts.options || {};
    var maxWidth = o.maxWidth || "450px";
    var width = o.width || "90%";
    var maxHeight = o.maxHeight || "90vh";
    var scroll = o.scroll !== false;
    var zIndex = o.zIndex || 99999;
    var textAlign = o.textAlign || "left";
    var headerActions = o.headerActions || "";
    var onClose = o.onClose || null;
    var closeOnBackdrop = o.closeOnBackdrop !== false;

    // Remove existing modal with same id
    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:" + zIndex + ";display:flex;align-items:center;justify-content:center;transition:background 0.3s ease;";

    var modalStyle = "background:#fff;border-radius:12px;max-width:" + maxWidth + ";width:" + width + ";max-height:" + maxHeight + ";display:flex;flex-direction:column;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);text-align:" + textAlign + ";overflow:hidden;transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;";
    var headerStyle = "display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid #eee;flex-shrink:0;";
    var bodyStyle = "padding:16px 20px 20px;" + (scroll ? "overflow-y:auto;flex:1;" : "");

    overlay.innerHTML = '<div class="sp-modal-box" style="' + modalStyle + '">' +
      '<div class="sp-modal-header" style="' + headerStyle + '">' +
        '<h3 style="margin:0;font-size:1.1rem;font-weight:600;">' + title + '</h3>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          headerActions +
          '<button class="sp-modal-close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;padding:0 4px;color:#666;" title="Cerrar">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="sp-modal-body" style="' + bodyStyle + '">' + content + '</div>' +
    '</div>';

    document.body.appendChild(overlay);

    var modal = overlay.querySelector(".sp-modal-box");
    var body = overlay.querySelector(".sp-modal-body");
    var closeBtn = overlay.querySelector(".sp-modal-close-btn");

    // Trigger open animation
    requestAnimationFrame(function() {
      overlay.style.background = "rgba(0,0,0,.6)";
      modal.style.transform = "scale(1) translateY(0)";
      modal.style.opacity = "1";
    });

    function close() {
      modal.style.transform = "scale(0.9) translateY(10px)";
      modal.style.opacity = "0";
      overlay.style.background = "rgba(0,0,0,0)";
      setTimeout(function() { overlay.remove(); if (onClose) onClose(); }, 250);
    }

    closeBtn.addEventListener("click", close);
    if (closeOnBackdrop) {
      overlay.addEventListener("click", function(e) { if (e.target === overlay) close(); });
    }
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape" && document.getElementById(id)) { close(); document.removeEventListener("keydown", handler); }
    });

    return { overlay: overlay, modal: modal, body: body, close: close };
  };

})();
