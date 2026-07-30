// ============================================================
// SRC/FEATURES/HEADER-BUTTONS.TS - Header button injection & SPA observer
// ============================================================

import { createHeaderButton } from "../components";
import { waitForElement } from "../lib/dom-utils";
import * as Storage from "../lib/storage";
import { proxyFetch } from "../lib/api";
import { SP_CONFIG } from "../config";
import { state as sessionState } from "./session";
import type { GroupInfo } from "../types";

const HEADER_SELECTOR = '[class*="warapperNameUserAndLogout"]';

// ─── Button Registry ──────────────────────────────────────────

export interface RegisteredButton {
  id?: string;
  icon?: string;
  label?: string;
  color?: string;
  phase?: "always" | "authenticated" | "session";
  hidden?: boolean;
  style?: string;
  shouldShow?: () => boolean;
  onClick: (e: MouseEvent) => void;
}

const _registeredButtons: RegisteredButton[] = [];

export function registerButton(opts: RegisteredButton): void {
  _registeredButtons.push(opts);
}

// ─── Injection ────────────────────────────────────────────────

export function injectButtons(
  phase: "always" | "authenticated" | "session" | "all",
): void {
  const wrapper = document.querySelector(HEADER_SELECTOR);
  if (!wrapper) return;
  const container = wrapper.parentElement;
  if (!container) return;

  _registeredButtons.forEach((opts) => {
    const btnPhase = opts.phase ?? "always";
    if (phase !== "all" && btnPhase !== phase) return;
    if (opts.id && document.getElementById(opts.id)) return;
    if (opts.shouldShow && !opts.shouldShow()) return;

    const btn = createHeaderButton({
      id: opts.id,
      icon: opts.icon,
      label: opts.label,
      color: opts.color,
      onClick: opts.onClick,
    });

    if (opts.style) btn.style.cssText += opts.style;
    if (opts.hidden) btn.style.display = "none";

    container.insertBefore(btn, wrapper);
  });
}

export function initialInject(): void {
  void waitForElement(HEADER_SELECTOR, { maxAttempts: 50, interval: 100 }).then(
    (wrapper) => {
      if (wrapper) injectButtons("always");
    },
  );
}

// ─── SPA Navigation Observer ──────────────────────────────────

export function startHeaderObserver(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const wrapper = document.querySelector(HEADER_SELECTOR);
      if (!wrapper) return;
      if (!document.getElementById("sp-config-btn")) {
        injectButtons("all");
      }
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Version Check ────────────────────────────────────────────

const _currentVersion = chrome.runtime.getManifest().version;

export function checkVersion(): void {
  void Storage.getMultiple<{ latestVersion: string; latestZipUrl: string }>([
    "latestVersion",
    "latestZipUrl",
  ]).then((r) => {
    const latest = r.latestVersion ?? "";
    const zipUrl = r.latestZipUrl ?? "";

    if (!latest || latest === _currentVersion) {
      const btn = document.getElementById("sp-update-btn");
      if (btn) btn.style.display = "none";
      return;
    }

    const cur = _currentVersion.split(".").map(Number);
    const lat = latest.split(".").map(Number);

    // Compare semver: [major, minor, patch]
    const isNewer =
      (lat[0] ?? 0) > (cur[0] ?? 0) ||
      ((lat[0] ?? 0) === (cur[0] ?? 0) && (lat[1] ?? 0) > (cur[1] ?? 0)) ||
      ((lat[0] ?? 0) === (cur[0] ?? 0) &&
        (lat[1] ?? 0) === (cur[1] ?? 0) &&
        (lat[2] ?? 0) > (cur[2] ?? 0));

    if (!isNewer) {
      const btn = document.getElementById("sp-update-btn");
      if (btn) btn.style.display = "none";
      return;
    }

    // Major version bump → block usage and show prominent alert
    if ((lat[0] ?? 0) > (cur[0] ?? 0)) {
      sessionState.versionBlocked = true;
      showVersionAlert(latest, zipUrl);
    } else {
      // Minor/patch → just show the update button
      const btn = document.getElementById("sp-update-btn");
      if (btn) btn.style.display = "inline-flex";
    }
  });
}

function showVersionAlert(latest: string, zipUrl: string): void {
  if (document.getElementById("sp-version-alert")) return;

  void waitForElement(HEADER_SELECTOR, { maxAttempts: 30, interval: 200 }).then(
    (wrapper) => {
      if (!wrapper || document.getElementById("sp-version-alert")) return;

      const alert = document.createElement("div");
      alert.id = "sp-version-alert";
      alert.style.cssText =
        "padding:6px 14px;font-size:11px;border-radius:6px;background:rgba(217,64,64,0.15);color:#D94040;border:1px solid rgba(217,64,64,0.3);margin-right:8px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;";
      alert.innerHTML = `⚠️ Actualiza a v${latest} <span style="padding:2px 8px;background:#D94040;color:#fff;border-radius:4px;font-size:10px;">Descargar</span>`;
      alert.addEventListener("click", () => downloadZip(zipUrl, latest));
      wrapper.parentElement?.insertBefore(alert, wrapper);
    },
  );
}

export function downloadZip(
  url: string,
  version: string,
  btnEl?: HTMLButtonElement | null,
): void {
  if (btnEl) {
    btnEl.textContent = "⏳ Descargando...";
    btnEl.disabled = true;
  }

  const filename = `v${version || "update"}.zip`;

  // Base64 mode
  if (url.startsWith("base64:")) {
    try {
      const b64 = url.substring(7);
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      triggerDownload(new Blob([bytes], { type: "application/zip" }), filename);
      if (btnEl) btnEl.textContent = "✅ Descargado";
    } catch {
      if (btnEl) {
        btnEl.textContent = "❌ Error";
        setTimeout(() => {
          if (btnEl) {
            btnEl.textContent = "📥 Descargar";
            btnEl.disabled = false;
          }
        }, 3000);
      }
    }
    return;
  }

  // URL mode — fetch via proxy
  void proxyFetch(url)
    .then((byteArray) => {
      triggerDownload(
        new Blob([byteArray], { type: "application/zip" }),
        getFileNameFromUrl(url) ?? filename,
      );
      if (btnEl) btnEl.textContent = "✅ Descargado";
    })
    .catch(() => {
      // Fallback: direct link
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.click();
      if (btnEl) {
        btnEl.textContent = "📥 Abriendo...";
        setTimeout(() => {
          if (btnEl) {
            btnEl.textContent = "📥 Descargar";
            btnEl.disabled = false;
          }
        }, 3000);
      }
    });
}

function triggerDownload(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function getFileNameFromUrl(url: string): string | null {
  try {
    const urlPath = new URL(url).pathname;
    const name = urlPath.split("/").pop();
    return name?.endsWith(".zip") ? name : null;
  } catch {
    return null;
  }
}

// ─── Group Info ───────────────────────────────────────────────

let _groupInfo: GroupInfo[] = SP_CONFIG.GROUP_INFO;

export function getGroupInfo(): GroupInfo[] {
  return _groupInfo;
}

export function loadGroupInfo(): void {
  void Storage.get<Record<string, string>>("groupNames").then((groupNames) => {
    if (groupNames && Object.keys(groupNames).length > 0) {
      _groupInfo = Object.keys(groupNames).map((id) => ({
        id: parseInt(id),
        name: groupNames[id],
      }));
    }
  });
}

// ─── Initialize ───────────────────────────────────────────────

export function initHeaderButtons(showDBAInfo?: () => void): void {
  // Config button (always visible)
  registerButton({
    id: "sp-config-btn",
    icon: "⚙️",
    label: "Config",
    color: "rgba(255,255,255,0.15)",
    phase: "always",
    onClick: () => document.dispatchEvent(new CustomEvent("sp-open-config")),
  });

  // Update button (hidden until version check)
  registerButton({
    id: "sp-update-btn",
    icon: "🔄",
    label: "Actualizar",
    color: "#FF8F00",
    phase: "always",
    hidden: true,
    onClick: () => {
      void Storage.getMultiple<{ latestZipUrl: string; latestVersion: string }>(
        ["latestZipUrl", "latestVersion"],
      ).then((stored) => {
        if (stored.latestZipUrl)
          downloadZip(stored.latestZipUrl, stored.latestVersion ?? "");
      });
    },
  });

  // DBA Info button (session-gated)
  registerButton({
    id: "sp-dba-info-btn",
    icon: "🏠",
    label: "DBA Info",
    color: "#4CAF50",
    phase: "session",
    shouldShow: () => {
      return !!(
        sessionState.canGuardias ||
        sessionState.canAddParticipant ||
        sessionState.canAddProduct ||
        sessionState.canAdelantar
      );
    },
    onClick: () => {
      if (showDBAInfo) showDBAInfo();
    },
  });

  initialInject();
  startHeaderObserver();
  loadGroupInfo();

  setTimeout(checkVersion, 3000);
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      !sessionState.versionBlocked
    ) {
      checkVersion();
    }
  });
}

const SP_Header = {
  registerButton,
  injectButtons,
  checkVersion,
  downloadZip,
  getGroupInfo,
  initHeaderButtons,
};
export default SP_Header;
