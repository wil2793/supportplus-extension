// ============================================================
// SRC/COMPONENTS.TS - Reusable UI components
// ============================================================

import type {
  HeaderButtonOptions,
  CreateModalOptions,
  ModalInstance,
} from "./types";

// ─── HTML escape helper ───────────────────────────────────────

export function escHtml(str: unknown): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Deterministic color from string ─────────────────────────

export interface StringColor {
  bg: string;
  border: string;
  text: string;
}

export function stringToColor(str: string): StringColor {
  const hash = Array.from(str).reduce(
    (h, c) => c.charCodeAt(0) + ((h << 5) - h),
    0,
  );
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue},35%,90%)`,
    border: `hsl(${hue},45%,65%)`,
    text: `hsl(${hue},50%,30%)`,
  };
}

// ─── Header Button Component ──────────────────────────────────

export function createHeaderButton(
  opts: HeaderButtonOptions,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = opts.id ?? "";
  btn.className = "sp-hdr-btn";
  btn.innerHTML = `<span class="sp-btn-icon">${opts.icon ?? ""}</span><span class="sp-btn-label"> ${opts.label ?? ""}</span>`;
  btn.style.background = opts.color ?? "#1565C0";
  btn.title = opts.label ?? "";
  if (opts.onClick) btn.addEventListener("click", opts.onClick);
  return btn;
}

// ─── Modal Component ──────────────────────────────────────────

export function createModal(opts: CreateModalOptions): ModalInstance {
  const id = opts.id ?? `sp-modal-${Date.now()}`;
  const title = opts.title ?? "";
  const content = opts.content ?? "";
  const o = opts.options ?? {};

  const maxWidth = o.maxWidth ?? "450px";
  const width = o.width ?? "90%";
  const height = o.height;
  const maxHeight = o.maxHeight ?? "90vh";
  const scroll = o.scroll !== false;
  const zIndex = o.zIndex ?? 99999;
  const textAlign = o.textAlign ?? "left";
  const headerActions = o.headerActions ?? "";
  const onClose = o.onClose ?? null;
  const closeOnBackdrop = o.closeOnBackdrop !== false;
  const blur = o.blur ?? false;
  const showHeader = o.showHeader !== false;
  const padding = o.padding ?? "16px 20px 20px";
  const customClass = o.customClass ?? "";

  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:${zIndex};display:flex;align-items:center;justify-content:center;transition:background 0.3s ease,backdrop-filter 0.3s ease;backdrop-filter:blur(0px);`;

  const heightStyle = height ? `height:${height};` : "";
  const modalStyle = `background:#fff;border-radius:12px;max-width:${maxWidth};width:${width};${heightStyle}max-height:${maxHeight};display:flex;flex-direction:column;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);text-align:${textAlign};overflow:hidden;transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;box-shadow:0 8px 40px rgba(0,0,0,0.25);`;
  const headerStyle =
    "display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid #eee;flex-shrink:0;";
  const bodyStyle = `padding:${padding};${scroll ? "overflow-y:auto;flex:1;" : ""}`;

  const headerHTML = showHeader
    ? `<div class="sp-modal-header" style="${headerStyle}"><h3 style="margin:0;font-size:1.1rem;font-weight:600;">${title}</h3><div style="display:flex;align-items:center;gap:8px;">${headerActions}<button class="sp-modal-close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;padding:0 4px;color:#666;" title="Cerrar">✕</button></div></div>`
    : "";

  overlay.innerHTML = `<div class="sp-modal-box ${customClass}" style="${modalStyle}">${headerHTML}<div class="sp-modal-body" style="${bodyStyle}">${content}</div></div>`;

  document.body.appendChild(overlay);

  const modal = overlay.querySelector<HTMLElement>(".sp-modal-box")!;
  const body = overlay.querySelector<HTMLElement>(".sp-modal-body")!;
  const closeBtn = overlay.querySelector<HTMLElement>(".sp-modal-close-btn");

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.background = "rgba(0,0,0,0.5)";
    if (blur) overlay.style.backdropFilter = "blur(6px)";
    modal.style.transform = "scale(1) translateY(0)";
    modal.style.opacity = "1";
  });

  const close = () => {
    modal.style.transform = "scale(0.9) translateY(10px)";
    modal.style.opacity = "0";
    overlay.style.background = "rgba(0,0,0,0)";
    overlay.style.backdropFilter = "blur(0px)";
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
    }, 250);
  };

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (closeOnBackdrop) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && document.getElementById(id)) {
      close();
      document.removeEventListener("keydown", keyHandler);
    }
  };
  document.addEventListener("keydown", keyHandler);

  return { overlay, modal, body, close };
}

// ─── Toast helpers ────────────────────────────────────────────

export function showLoadingToast(text: string): HTMLElement {
  const existing = document.getElementById("sp-loading-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "sp-loading-toast";
  toast.className = "sp-toast sp-toast-loading";
  toast.innerHTML = `<span class="sp-spinner"></span> ${text}`;
  document.body.appendChild(toast);
  return toast;
}

export function showSuccessToast(text: string): void {
  const existing = document.getElementById("sp-loading-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "sp-toast sp-toast-success";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "sp-toast-out 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function showErrorToast(text: string): void {
  const existing = document.getElementById("sp-loading-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "sp-toast sp-toast-error";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "sp-toast-out 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/** Returns inline spinner HTML for use inside buttons. */
export function spinnerHTML(size = 12, text?: string): string {
  return `<span class="sp-spinner" style="width:${size}px;height:${size}px;"></span>${text ? ` ${text}` : ""}`;
}

// No-op kept for backward compatibility
export function ensureToastStyles(): void {
  // Styles now live in styles.ts
}

// ─── User Search Input ────────────────────────────────────────

export interface UserSearchItem {
  id: number;
  name: string;
  correo: string;
}

/**
 * Genera el HTML de un input de búsqueda de usuario con dropdown.
 * Úsalo dentro del `content` de cualquier formModal/createModal.
 *
 * Después llama a initUserSearch() en el onReady del modal.
 *
 * @param inputId  ID del input visible de búsqueda
 * @param hiddenId ID del input hidden que almacena el userId seleccionado
 * @param users    Lista de usuarios disponibles
 */
export function userSearchHtml(
  inputId: string,
  hiddenId: string,
  users: UserSearchItem[],
): string {
  const encoded = encodeURIComponent(JSON.stringify(users));
  return (
    `<div style="position:relative;" id="${inputId}-wrap" data-users="${encoded}">` +
    `<input id="${inputId}" type="text" placeholder="🔍 Buscar usuario..." autocomplete="off"` +
    ` style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;` +
    `box-sizing:border-box;outline:none;">` +
    `<input id="${hiddenId}" type="hidden" value="">` +
    `<div id="${inputId}-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;` +
    `max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ddd;border-radius:6px;` +
    `box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:99999;margin-top:2px;"></div>` +
    `</div>`
  );
}

/**
 * Activa la lógica de búsqueda en un input creado con userSearchHtml().
 * Llamar desde onReady del modal, después de que el DOM esté listo.
 *
 * @param inputId   ID del input de búsqueda (mismo que se pasó a userSearchHtml)
 * @param hiddenId  ID del input hidden (mismo que se pasó a userSearchHtml)
 * @param onSelect  Callback opcional al seleccionar un usuario (userId, userName)
 */
export function initUserSearch(
  inputId: string,
  hiddenId: string,
  onSelect?: (userId: string, userName: string) => void,
): void {
  const wrap = document.getElementById(`${inputId}-wrap`);
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  const hidden = document.getElementById(hiddenId) as HTMLInputElement | null;
  const dropdown = document.getElementById(`${inputId}-dropdown`);
  if (!wrap || !input || !hidden || !dropdown) return;

  const users: UserSearchItem[] = JSON.parse(
    decodeURIComponent(wrap.dataset["users"] ?? "[]"),
  );

  const renderDropdown = (query: string) => {
    const q = query.toLowerCase().trim();
    const matches = q
      ? users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.correo.toLowerCase().includes(q),
        )
      : [];

    if (!matches.length) {
      dropdown.style.display = "none";
      return;
    }

    dropdown.innerHTML = matches
      .slice(0, 12)
      .map(
        (u) =>
          `<div class="sp-usearch-opt" data-uid="${u.id}" data-uname="${escHtml(u.name)}"` +
          ` style="padding:8px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;` +
          `transition:background .1s;" ` +
          `onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''">` +
          `<div style="font-weight:500;">${escHtml(u.name)}</div>` +
          `<div style="font-size:11px;color:#888;">${escHtml(u.correo)}</div>` +
          `</div>`,
      )
      .join("");
    dropdown.style.display = "block";
  };

  input.addEventListener("input", () => renderDropdown(input.value));
  input.addEventListener("focus", () => {
    if (input.value) renderDropdown(input.value);
  });

  dropdown.addEventListener("mousedown", (e) => {
    const opt = (e.target as Element).closest<HTMLElement>(".sp-usearch-opt");
    if (!opt) return;
    e.preventDefault();
    const uid = opt.dataset["uid"] ?? "";
    const uname = opt.dataset["uname"] ?? "";
    hidden.value = uid;
    input.value = uname;
    dropdown.style.display = "none";
    if (onSelect) onSelect(uid, uname);
  });

  // Cerrar al hacer click fuera
  document.addEventListener("mousedown", (e) => {
    if (!wrap.contains(e.target as Node)) dropdown.style.display = "none";
  });
}
