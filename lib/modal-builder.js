// ============================================================
// LIB/MODAL-BUILDER.JS - High-level modal factories
// Builds on top of window.createModal (components.js) to provide
// standardized modal patterns without duplicating HTML/logic.
// ============================================================

(function () {
  "use strict";

  const esc = window.esc;

  // ─── Shared Styles ────────────────────────────────────────
  const BTN_STYLES = {
    primary: "flex:1;padding:10px;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
    secondary: "flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;",
    danger: "flex:1;padding:10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
    success: "flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
    warning: "flex:1;padding:10px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:14px;font-weight:600;"
  };

  // ─── Confirmation Modal ───────────────────────────────────
  /**
   * Show a confirmation dialog with customizable buttons and action.
   *
   * @param {Object} opts
   * @param {string} opts.id - Modal DOM id
   * @param {string} opts.title - Modal title
   * @param {string} opts.message - Main message (HTML allowed)
   * @param {string} [opts.description] - Secondary description text
   * @param {string} [opts.confirmText="Confirmar"] - Confirm button text
   * @param {string} [opts.cancelText="Cancelar"] - Cancel button text
   * @param {string} [opts.confirmColor="#1976D2"] - Confirm button color
   * @param {string} [opts.maxWidth="420px"]
   * @param {Function} opts.onConfirm - Async function called on confirm. Receives { close, setLoading }
   * @returns {{ overlay, close }}
   */
  function confirmModal(opts) {
    const confirmColor = opts.confirmColor || "#1976D2";
    const confirmText = opts.confirmText || "Confirmar";
    const cancelText = opts.cancelText || "Cancelar";
    const descHtml = opts.description
      ? '<p style="font-size:13px;color:#888;margin:0 0 20px;">' + opts.description + '</p>'
      : '';

    const m = window.createModal({
      id: opts.id,
      title: opts.title,
      content:
        '<p style="font-size:14px;color:#555;margin:0 0 8px;">' + opts.message + '</p>' +
        descHtml +
        '<div id="' + opts.id + '-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="' + opts.id + '-confirm" style="' + BTN_STYLES.primary + 'background:' + confirmColor + ';">' + esc(confirmText) + '</button>' +
        '<button id="' + opts.id + '-cancel" style="' + BTN_STYLES.secondary + '">' + esc(cancelText) + '</button>' +
        '</div>',
      options: { maxWidth: opts.maxWidth || "420px", textAlign: "center" }
    });

    const confirmBtn = document.getElementById(opts.id + "-confirm");
    const cancelBtn = document.getElementById(opts.id + "-cancel");
    const msgEl = document.getElementById(opts.id + "-msg");

    cancelBtn.addEventListener("click", m.close);

    const api = {
      close: m.close,
      setLoading: function (text) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = window.spinnerHTML(14, text || "Procesando...");
        cancelBtn.style.display = "none";
      },
      setMessage: function (text, color) {
        msgEl.textContent = text;
        msgEl.style.color = color || "#555";
      },
      resetButton: function () {
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmText;
        cancelBtn.style.display = "";
      }
    };

    confirmBtn.addEventListener("click", function () {
      if (opts.onConfirm) opts.onConfirm(api);
    });

    return { overlay: m.overlay, close: m.close, api: api };
  }

  // ─── Form Modal ───────────────────────────────────────────
  /**
   * Show a modal with form fields and a submit action.
   *
   * @param {Object} opts
   * @param {string} opts.id - Modal DOM id
   * @param {string} opts.title - Modal title
   * @param {string} opts.content - HTML content for the form body
   * @param {string} [opts.submitText="Guardar"] - Submit button text
   * @param {string} [opts.submitColor="#1976D2"] - Submit button color
   * @param {string} [opts.cancelText="Cancelar"]
   * @param {string} [opts.maxWidth="480px"]
   * @param {Object} [opts.modalOptions] - Extra options for createModal
   * @param {Function} opts.onSubmit - Async function called on submit. Receives { close, setLoading, getElement }
   * @param {Function} [opts.onReady] - Called after modal is rendered (for attaching extra listeners)
   * @returns {{ overlay, close, api }}
   */
  function formModal(opts) {
    const submitText = opts.submitText || "Guardar";
    const submitColor = opts.submitColor || "#1976D2";
    const cancelText = opts.cancelText || "Cancelar";

    const footerHtml =
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
      '<button id="' + opts.id + '-submit" style="' + BTN_STYLES.primary + 'background:' + submitColor + ';">' + esc(submitText) + '</button>' +
      '<button id="' + opts.id + '-cancel" style="' + BTN_STYLES.secondary + '">' + esc(cancelText) + '</button>' +
      '</div>';

    const modalOpts = Object.assign({ maxWidth: opts.maxWidth || "480px" }, opts.modalOptions || {});

    const m = window.createModal({
      id: opts.id,
      title: opts.title,
      content: opts.content + footerHtml,
      options: modalOpts
    });

    const submitBtn = document.getElementById(opts.id + "-submit");
    const cancelBtn = document.getElementById(opts.id + "-cancel");

    cancelBtn.addEventListener("click", m.close);

    const api = {
      overlay: m.overlay,
      close: m.close,
      setLoading: function (text) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = window.spinnerHTML(14, text || "Procesando...");
        cancelBtn.style.display = "none";
      },
      resetButton: function () {
        submitBtn.disabled = false;
        submitBtn.textContent = submitText;
        cancelBtn.style.display = "";
      },
      getElement: function (selector) {
        return m.overlay.querySelector(selector);
      }
    };

    submitBtn.addEventListener("click", function () {
      if (opts.onSubmit) opts.onSubmit(api);
    });

    if (opts.onReady) opts.onReady(api);

    return { overlay: m.overlay, close: m.close, api: api };
  }

  // ─── Info Modal ───────────────────────────────────────────
  /**
   * Show an informational modal with just content and a close button.
   *
   * @param {Object} opts
   * @param {string} opts.id
   * @param {string} opts.title
   * @param {string} opts.content - HTML content
   * @param {string} [opts.closeText="Cerrar"]
   * @param {string} [opts.maxWidth="500px"]
   * @param {Object} [opts.modalOptions]
   * @returns {{ overlay, close }}
   */
  function infoModal(opts) {
    const modalOpts = Object.assign(
      { maxWidth: opts.maxWidth || "500px" },
      opts.modalOptions || {},
      opts.onClose ? { onClose: opts.onClose } : {}
    );

    const m = window.createModal({
      id: opts.id,
      title: opts.title,
      content: opts.content,
      options: modalOpts
    });

    return { overlay: m.overlay, close: m.close };
  }

  // ─── Success Modal ────────────────────────────────────────
  /**
   * Show a success result modal with optional action buttons.
   *
   * @param {Object} opts
   * @param {string} opts.id
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {Array} [opts.buttons] - [{text, color, onClick}]
   * @param {string} [opts.maxWidth="360px"]
   * @returns {{ overlay, close }}
   */
  function successModal(opts) {
    const buttonsHtml = (opts.buttons || [{ text: "Aceptar", color: "#2E7D32", onClick: null }])
      .map(function (btn, idx) {
        const style = idx === 0
          ? BTN_STYLES.primary + "background:" + (btn.color || "#2E7D32") + ";"
          : BTN_STYLES.secondary;
        return '<button id="' + opts.id + '-btn-' + idx + '" style="' + style + '">' + esc(btn.text) + '</button>';
      }).join("");

    const m = window.createModal({
      id: opts.id,
      title: opts.title,
      content:
        '<p style="font-size:14px;color:#555;margin:0 0 16px;">' + opts.message + '</p>' +
        '<div style="display:flex;gap:8px;">' + buttonsHtml + '</div>',
      options: { maxWidth: opts.maxWidth || "360px", textAlign: "center", closeOnBackdrop: false }
    });

    (opts.buttons || [{ text: "Aceptar", onClick: null }]).forEach(function (btn, idx) {
      const el = document.getElementById(opts.id + "-btn-" + idx);
      if (el) {
        el.addEventListener("click", function () {
          if (btn.onClick) btn.onClick(m.close);
          else m.close();
        });
      }
    });

    return { overlay: m.overlay, close: m.close };
  }

  // Expose
  window.SP_Modal = {
    confirm: confirmModal,
    form: formModal,
    info: infoModal,
    success: successModal,
    BTN_STYLES: BTN_STYLES
  };

})();
