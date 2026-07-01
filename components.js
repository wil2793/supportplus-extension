// ============================================================
// COMPONENTS.JS - Reusable UI components
// ============================================================

(function () {
  "use strict";

  // ─── HTML escape helper ───────────────────────────────────
  window.esc = function (str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // ─── Deterministic color from string ──────────────────────
  window.stringToColor = function (str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    var hue = Math.abs(hash) % 360;
    return {
      bg: "hsl(" + hue + ",35%,90%)",
      border: "hsl(" + hue + ",45%,65%)",
      text: "hsl(" + hue + ",50%,30%)"
    };
  };

  // ─── Header Button Component ──────────────────────────────
  window.createHeaderButton = function (opts) {
    var btn = document.createElement("button");
    btn.id = opts.id || "";
    btn.className = "sp-hdr-btn";
    btn.innerHTML = '<span class="sp-btn-icon">' + (opts.icon || "") + '</span><span class="sp-btn-label"> ' + (opts.label || "") + '</span>';
    btn.style.background = opts.color || "#1565C0";
    btn.title = opts.label || "";
    if (opts.onClick) btn.addEventListener("click", opts.onClick);
    return btn;
  };

  // ─── Modal Component ──────────────────────────────────────
  window.createModal = function (opts) {
    var id = opts.id || "sp-modal-" + Date.now();
    var title = opts.title || "";
    var content = opts.content || "";
    var o = opts.options || {};
    var maxWidth = o.maxWidth || "450px";
    var width = o.width || "90%";
    var height = o.height || null;
    var maxHeight = o.maxHeight || "90vh";
    var scroll = o.scroll !== false;
    var zIndex = o.zIndex || 99999;
    var textAlign = o.textAlign || "left";
    var headerActions = o.headerActions || "";
    var onClose = o.onClose || null;
    var closeOnBackdrop = o.closeOnBackdrop !== undefined ? o.closeOnBackdrop : true;
    var blur = o.blur || false;
    var showHeader = o.showHeader !== false;
    var padding = o.padding || "16px 20px 20px";
    var customClass = o.customClass || "";

    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:" + zIndex + ";display:flex;align-items:center;justify-content:center;transition:background 0.3s ease,backdrop-filter 0.3s ease;backdrop-filter:blur(0px);";

    var heightStyle = height ? "height:" + height + ";" : "";
    var modalStyle = "background:#fff;border-radius:12px;max-width:" + maxWidth + ";width:" + width + ";" + heightStyle + "max-height:" + maxHeight + ";display:flex;flex-direction:column;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);text-align:" + textAlign + ";overflow:hidden;transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;box-shadow:0 8px 40px rgba(0,0,0,0.25);";
    var headerStyle = "display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid #eee;flex-shrink:0;";
    var bodyStyle = "padding:" + padding + ";" + (scroll ? "overflow-y:auto;flex:1;" : "");

    var headerHTML = showHeader
      ? '<div class="sp-modal-header" style="' + headerStyle + '"><h3 style="margin:0;font-size:1.1rem;font-weight:600;">' + title + '</h3><div style="display:flex;align-items:center;gap:8px;">' + headerActions + '<button class="sp-modal-close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;padding:0 4px;color:#666;" title="Cerrar">✕</button></div></div>'
      : "";

    overlay.innerHTML = '<div class="sp-modal-box ' + customClass + '" style="' + modalStyle + '">' + headerHTML + '<div class="sp-modal-body" style="' + bodyStyle + '">' + content + '</div></div>';

    document.body.appendChild(overlay);

    var modal = overlay.querySelector(".sp-modal-box");
    var body = overlay.querySelector(".sp-modal-body");
    var closeBtn = overlay.querySelector(".sp-modal-close-btn");

    // Animate in
    requestAnimationFrame(function () {
      overlay.style.background = "rgba(0,0,0,0.5)";
      if (blur) overlay.style.backdropFilter = "blur(6px)";
      modal.style.transform = "scale(1) translateY(0)";
      modal.style.opacity = "1";
    });

    var close = function () {
      modal.style.transform = "scale(0.9) translateY(10px)";
      modal.style.opacity = "0";
      overlay.style.background = "rgba(0,0,0,0)";
      overlay.style.backdropFilter = "blur(0px)";
      setTimeout(function () {
        overlay.remove();
        if (onClose) onClose();
      }, 250);
    };

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (closeOnBackdrop) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });
    }
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape" && document.getElementById(id)) {
        close();
        document.removeEventListener("keydown", handler);
      }
    });

    return { overlay: overlay, modal: modal, body: body, close: close };
  };

  // ─── Toast helpers ────────────────────────────────────────
  // Note: CSS animations now live in styles.js, no need to inject keyframes

  window.ensureToastStyles = function () {
    // No-op: styles are now in styles.js (kept for backward compatibility)
  };

  window.showLoadingToast = function (text) {
    var existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.id = "sp-loading-toast";
    toast.className = "sp-toast sp-toast-loading";
    toast.innerHTML = '<span class="sp-spinner"></span> ' + text;
    document.body.appendChild(toast);
    return toast;
  };

  window.showSuccessToast = function (text) {
    var existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.className = "sp-toast sp-toast-success";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = "sp-toast-out 0.3s ease forwards";
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  };

  window.showErrorToast = function (text) {
    var existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.className = "sp-toast sp-toast-error";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = "sp-toast-out 0.3s ease forwards";
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  };

  // ─── Spinner HTML helper ──────────────────────────────────
  /**
   * Returns inline spinner HTML for buttons
   * @param {number} [size=12] - Size in px
   * @param {string} [text] - Optional text after spinner
   * @returns {string}
   */
  window.spinnerHTML = function (size, text) {
    var s = size || 12;
    var html = '<span class="sp-spinner" style="width:' + s + 'px;height:' + s + 'px;"></span>';
    if (text) html += " " + text;
    return html;
  };

})();
