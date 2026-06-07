// ============================================================
// COMPONENTS.JS - Reusable UI components
// ============================================================

(function() {

  // --- HTML escape helper ---
  window.esc = (str) => {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // --- Deterministic color from string ---
  window.stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    const hue = Math.abs(hash) % 360;
    return { bg: `hsl(${hue},35%,90%)`, border: `hsl(${hue},45%,65%)`, text: `hsl(${hue},50%,30%)` };
  };

  // --- Responsive header button style ---
  (() => {
    const style = document.createElement("style");
    style.textContent = ".sp-hdr-btn { transition: all 0.2s; } " +
      "@media (max-width: 1600px) { .sp-hdr-btn .sp-btn-label { display:none; } .sp-hdr-btn { padding:6px 10px !important; min-width:auto !important; } } " +
      "@media (max-width: 1100px) { .sp-hdr-btn { padding:4px 8px !important; font-size:11px !important; } }";
    document.head.appendChild(style);
  })();

  // --- Header Button Component ---
  window.createHeaderButton = (opts) => {
    const btn = document.createElement("button");
    btn.id = opts.id || "";
    btn.className = "sp-hdr-btn";
    btn.innerHTML = `<span class="sp-btn-icon">${opts.icon || ""}</span><span class="sp-btn-label"> ${opts.label || ""}</span>`;
    btn.style.cssText = `padding:6px 12px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:${opts.color || "#1565C0"};color:#fff;font-weight:600;white-space:nowrap;margin-right:4px;display:inline-flex;align-items:center;gap:2px;`;
    btn.title = opts.label || "";
    if (opts.onClick) btn.addEventListener("click", opts.onClick);
    return btn;
  };

  // --- Modal Component ---
  window.createModal = (opts) => {
    const id = opts.id || "sp-modal-" + Date.now();
    const title = opts.title || "";
    const content = opts.content || "";
    const o = opts.options || {};
    const maxWidth = o.maxWidth || "450px";
    const width = o.width || "90%";
    const maxHeight = o.maxHeight || "90vh";
    const scroll = o.scroll !== false;
    const zIndex = o.zIndex || 99999;
    const textAlign = o.textAlign || "left";
    const headerActions = o.headerActions || "";
    const onClose = o.onClose || null;
    const closeOnBackdrop = o.closeOnBackdrop !== false;

    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:${zIndex};display:flex;align-items:center;justify-content:center;transition:background 0.3s ease;`;

    const modalStyle = `background:#fff;border-radius:12px;max-width:${maxWidth};width:${width};max-height:${maxHeight};display:flex;flex-direction:column;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);text-align:${textAlign};overflow:hidden;transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;`;
    const headerStyle = "display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid #eee;flex-shrink:0;";
    const bodyStyle = `padding:16px 20px 20px;${scroll ? "overflow-y:auto;flex:1;" : ""}`;

    overlay.innerHTML = `<div class="sp-modal-box" style="${modalStyle}">
      <div class="sp-modal-header" style="${headerStyle}">
        <h3 style="margin:0;font-size:1.1rem;font-weight:600;">${title}</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          ${headerActions}
          <button class="sp-modal-close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;padding:0 4px;color:#666;" title="Cerrar">✕</button>
        </div>
      </div>
      <div class="sp-modal-body" style="${bodyStyle}">${content}</div>
    </div>`;

    document.body.appendChild(overlay);

    const modal = overlay.querySelector(".sp-modal-box");
    const body = overlay.querySelector(".sp-modal-body");
    const closeBtn = overlay.querySelector(".sp-modal-close-btn");

    requestAnimationFrame(() => {
      overlay.style.background = "rgba(0,0,0,.6)";
      modal.style.transform = "scale(1) translateY(0)";
      modal.style.opacity = "1";
    });

    const close = () => {
      modal.style.transform = "scale(0.9) translateY(10px)";
      modal.style.opacity = "0";
      overlay.style.background = "rgba(0,0,0,0)";
      setTimeout(() => { overlay.remove(); if (onClose) onClose(); }, 250);
    };

    closeBtn.addEventListener("click", close);
    if (closeOnBackdrop) {
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    }
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape" && document.getElementById(id)) { close(); document.removeEventListener("keydown", handler); }
    });

    return { overlay, modal, body, close };
  };

  // --- Toast helpers ---
  const ensureToastStyles = () => {
    if (!document.getElementById("sp-toast-style")) {
      const s = document.createElement("style");
      s.id = "sp-toast-style";
      s.textContent = "@keyframes sp-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes sp-toast-out{from{opacity:1}to{opacity:0;transform:translateX(-50%) translateY(-10px)}}@keyframes sp-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }
  };
  window.ensureToastStyles = ensureToastStyles;

  window.showLoadingToast = (text) => {
    ensureToastStyles();
    const existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "sp-loading-toast";
    toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#333;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
    toast.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.6s linear infinite;"></span> ' + text;
    document.body.appendChild(toast);
    return toast;
  };

  window.showSuccessToast = (text) => {
    ensureToastStyles();
    const existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#2E7D32;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = "sp-toast-out 0.3s ease forwards"; setTimeout(() => toast.remove(), 300); }, 3000);
  };

  window.showErrorToast = (text) => {
    ensureToastStyles();
    const existing = document.getElementById("sp-loading-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100000;background:#D94040;color:#fff;padding:12px 20px;border-radius:8px;font-family:system-ui;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:sp-toast-in 0.3s ease;";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = "sp-toast-out 0.3s ease forwards"; setTimeout(() => toast.remove(), 300); }, 4000);
  };

})();
