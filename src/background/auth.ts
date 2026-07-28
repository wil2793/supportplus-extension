// ============================================================
// SRC/BACKGROUND/AUTH.TS - JWT auth flow for our backend API
// ============================================================

import type { BackendLoginResponse } from "../types";

const API_BASE = "https://back-extension-sp.macropay.mx/api";

let _apiToken: string | null = null;
let _apiTokenExpiry = 0;

/** Read the SP portal token saved by the content script, or fetch it fresh. */
export async function getPortalToken(): Promise<string> {
  const stored = await chrome.storage.local.get("portalToken");
  if (stored["portalToken"]) return stored["portalToken"] as string;

  // Fallback: inject a script into the SP tab to read localStorage
  try {
    const tabs = await chrome.tabs.query({ url: "https://macropay.supportplus.mx/*" });
    if (!tabs.length || tabs[0].id == null) return "";

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () =>
        localStorage.getItem("token") ??
        sessionStorage.getItem("token") ??
        "",
    });

    const token = results?.[0]?.result ?? "";
    if (token) {
      await chrome.storage.local.set({ portalToken: token });
      return token;
    }
  } catch {
    // Tab not accessible or scripting permission denied — ignore
  }

  return "";
}

/** Exchange a portal JWT for our own backend JWT. */
export async function loginToAPI(portalToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: portalToken }),
  });

  if (!res.ok) throw new Error(`Login API ${res.status}`);

  const data = (await res.json()) as BackendLoginResponse;
  if (!data.success) throw new Error(data.error ?? "Login failed");

  _apiToken = data.data.token;
  // Tokens expire in 8 hours — refresh 30 min early
  _apiTokenExpiry = Date.now() + 8 * 60 * 60 * 1000 - 30 * 60 * 1000;

  await chrome.storage.local.set({
    apiToken: _apiToken,
    apiTokenExpiry: _apiTokenExpiry,
  });

  return _apiToken;
}

/**
 * Ensure a valid API token is available.
 * Loads from storage, refreshes if expired.
 */
export async function ensureApiToken(): Promise<string> {
  // Load from storage if not in memory
  if (!_apiToken || !_apiTokenExpiry) {
    const stored = await chrome.storage.local.get(["apiToken", "apiTokenExpiry"]);
    _apiToken = (stored["apiToken"] as string | null) ?? null;
    _apiTokenExpiry = (stored["apiTokenExpiry"] as number) ?? 0;
  }

  if (_apiToken && Date.now() < _apiTokenExpiry) return _apiToken;

  // Token expired or missing — re-login
  const portalToken = await getPortalToken();
  if (!portalToken) throw new Error("No portal token available");
  return loginToAPI(portalToken);
}

/** Force token invalidation (used after a 401). */
export function invalidateToken(): void {
  _apiToken = null;
  _apiTokenExpiry = 0;
}
