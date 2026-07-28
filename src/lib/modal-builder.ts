// ============================================================
// SRC/LIB/MODAL-BUILDER.TS - High-level modal factories
// ============================================================

import { createModal, escHtml, spinnerHTML } from "../components";

const BTN_STYLES = {
  primary:
    "flex:1;padding:10px;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
  secondary:
    "flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;",
  danger:
    "flex:1;padding:10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
  success:
    "flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
  warning:
    "flex:1;padding:10px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:14px;font-weight:600;",
};

// ─── Types ────────────────────────────────────────────────────

export interface ModalApi {
  close: () => void;
  setLoading: (text?: string) => void;
  setMessage?: (text: string, color?: string) => void;
  resetButton: () => void;
  getElement?: (selector: string) => Element | null;
  overlay: HTMLElement;
}

// ─── Confirm Modal ────────────────────────────────────────────

export interface ConfirmModalOptions {
  id: string;
  title: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  maxWidth?: string;
  onConfirm: (api: ModalApi) => void | Promise<void>;
}

export function confirmModal(
  opts: ConfirmModalOptions
): { overlay: HTMLElement; close: () => void; api: ModalApi } {
  const confirmColor = opts.confirmColor ?? "#1976D2";
  const confirmText = opts.confirmText ?? "Confirmar";
  const cancelText = opts.cancelText ?? "Cancelar";
  const descHtml = opts.description
    ? `<p style="font-size:13px;color:#888;margin:0 0 20px;">${opts.description}</p>`
    : "";

  const m = createModal({
    id: opts.id,
    title: opts.title,
    content:
      `<p style="font-size:14px;color:#555;margin:0 0 8px;">${opts.message}</p>` +
      descHtml +
      `<div id="${opts.id}-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>` +
      `<div style="display:flex;gap:8px;">` +
      `<button id="${opts.id}-confirm" style="${BTN_STYLES.primary}background:${confirmColor};">${escHtml(confirmText)}</button>` +
      `<button id="${opts.id}-cancel" style="${BTN_STYLES.secondary}">${escHtml(cancelText)}</button>` +
      `</div>`,
    options: { maxWidth: opts.maxWidth ?? "420px", textAlign: "center" },
  });

  const confirmBtn = document.getElementById(`${opts.id}-confirm`) as HTMLButtonElement;
  const cancelBtn = document.getElementById(`${opts.id}-cancel`) as HTMLButtonElement;
  const msgEl = document.getElementById(`${opts.id}-msg`) as HTMLElement;

  cancelBtn.addEventListener("click", m.close);

  const api: ModalApi = {
    overlay: m.overlay,
    close: m.close,
    setLoading(text = "Procesando...") {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = spinnerHTML(14, text);
      cancelBtn.style.display = "none";
    },
    setMessage(text: string, color = "#555") {
      msgEl.textContent = text;
      msgEl.style.color = color;
    },
    resetButton() {
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmText;
      cancelBtn.style.display = "";
    },
  };

  confirmBtn.addEventListener("click", () => {
    void opts.onConfirm(api);
  });

  return { overlay: m.overlay, close: m.close, api };
}

// ─── Form Modal ───────────────────────────────────────────────

export interface FormModalOptions {
  id: string;
  title: string;
  content: string;
  submitText?: string;
  submitColor?: string;
  cancelText?: string;
  maxWidth?: string;
  modalOptions?: Record<string, unknown>;
  onSubmit: (api: ModalApi) => void | Promise<void>;
  onReady?: (api: ModalApi) => void;
}

export function formModal(
  opts: FormModalOptions
): { overlay: HTMLElement; close: () => void; api: ModalApi } {
  const submitText = opts.submitText ?? "Guardar";
  const submitColor = opts.submitColor ?? "#1976D2";
  const cancelText = opts.cancelText ?? "Cancelar";

  const footerHtml =
    `<div style="display:flex;gap:8px;margin-top:16px;">` +
    `<button id="${opts.id}-submit" style="${BTN_STYLES.primary}background:${submitColor};">${escHtml(submitText)}</button>` +
    `<button id="${opts.id}-cancel" style="${BTN_STYLES.secondary}">${escHtml(cancelText)}</button>` +
    `</div>`;

  const modalOpts = { maxWidth: opts.maxWidth ?? "480px", ...(opts.modalOptions ?? {}) };

  const m = createModal({
    id: opts.id,
    title: opts.title,
    content: opts.content + footerHtml,
    options: modalOpts,
  });

  const submitBtn = document.getElementById(`${opts.id}-submit`) as HTMLButtonElement;
  const cancelBtn = document.getElementById(`${opts.id}-cancel`) as HTMLButtonElement;

  cancelBtn.addEventListener("click", m.close);

  const api: ModalApi = {
    overlay: m.overlay,
    close: m.close,
    setLoading(text = "Procesando...") {
      submitBtn.disabled = true;
      submitBtn.innerHTML = spinnerHTML(14, text);
      cancelBtn.style.display = "none";
    },
    resetButton() {
      submitBtn.disabled = false;
      submitBtn.textContent = submitText;
      cancelBtn.style.display = "";
    },
    getElement(selector: string) {
      return m.overlay.querySelector(selector);
    },
  };

  submitBtn.addEventListener("click", () => {
    void opts.onSubmit(api);
  });

  if (opts.onReady) opts.onReady(api);

  return { overlay: m.overlay, close: m.close, api };
}

// ─── Info Modal ───────────────────────────────────────────────

export interface InfoModalOptions {
  id: string;
  title: string;
  content: string;
  closeText?: string;
  maxWidth?: string;
  modalOptions?: Record<string, unknown>;
  onClose?: () => void;
}

export function infoModal(
  opts: InfoModalOptions
): { overlay: HTMLElement; close: () => void } {
  const modalOpts = {
    maxWidth: opts.maxWidth ?? "500px",
    ...(opts.modalOptions ?? {}),
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  };

  const m = createModal({
    id: opts.id,
    title: opts.title,
    content: opts.content,
    options: modalOpts,
  });

  return { overlay: m.overlay, close: m.close };
}

// ─── Success Modal ────────────────────────────────────────────

export interface SuccessModalButton {
  text: string;
  color?: string;
  onClick?: ((close: () => void) => void) | null;
}

export interface SuccessModalOptions {
  id: string;
  title: string;
  message: string;
  buttons?: SuccessModalButton[];
  maxWidth?: string;
}

export function successModal(
  opts: SuccessModalOptions
): { overlay: HTMLElement; close: () => void } {
  const buttons = opts.buttons ?? [{ text: "Aceptar", color: "#2E7D32", onClick: null }];

  const buttonsHtml = buttons
    .map((btn, idx) => {
      const style =
        idx === 0
          ? `${BTN_STYLES.primary}background:${btn.color ?? "#2E7D32"};`
          : BTN_STYLES.secondary;
      return `<button id="${opts.id}-btn-${idx}" style="${style}">${escHtml(btn.text)}</button>`;
    })
    .join("");

  const m = createModal({
    id: opts.id,
    title: opts.title,
    content:
      `<p style="font-size:14px;color:#555;margin:0 0 16px;">${opts.message}</p>` +
      `<div style="display:flex;gap:8px;">${buttonsHtml}</div>`,
    options: { maxWidth: opts.maxWidth ?? "360px", textAlign: "center", closeOnBackdrop: false },
  });

  buttons.forEach((btn, idx) => {
    const el = document.getElementById(`${opts.id}-btn-${idx}`);
    if (el) {
      el.addEventListener("click", () => {
        if (btn.onClick) btn.onClick(m.close);
        else m.close();
      });
    }
  });

  return { overlay: m.overlay, close: m.close };
}

const SP_Modal = {
  confirm: confirmModal,
  form: formModal,
  info: infoModal,
  success: successModal,
  BTN_STYLES,
};
export default SP_Modal;
