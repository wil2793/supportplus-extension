// ============================================================
// SRC/BACKGROUND/API-CLIENT.TS - HTTP client for our backend
// ============================================================

import { ensureApiToken, getPortalToken, loginToAPI, invalidateToken } from "./auth";

const API_BASE = "https://back-extension-sp.macropay.mx/api";

// Fallback API key (used if JWT auth is not yet available)
const API_KEY = "c93666bd500472565a7e183365092191bd8fa734720fd20d04bd5c456949864d";

/**
 * Make an authenticated request to our backend API.
 * Automatically handles 401 by refreshing the token once.
 */
export async function apiRequest<T = unknown>(
  method: string,
  endpoint: string,
  body?: unknown,
  isRetry = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const token = await ensureApiToken();
    headers["Authorization"] = `Bearer ${token}`;
  } catch {
    // Fallback to API key while JWT isn't available yet
    headers["X-API-Key"] = API_KEY;
  }

  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, opts);

  // 401 → refresh token and retry once
  if (res.status === 401 && !isRetry) {
    try {
      const portalToken = await getPortalToken();
      if (portalToken) {
        invalidateToken();
        await loginToAPI(portalToken);
        return apiRequest<T>(method, endpoint, body, true);
      }
    } catch {
      // Ignore — fall through to throw
    }
  }

  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

export const apiGet = <T = unknown>(endpoint: string) =>
  apiRequest<T>("GET", endpoint);

export const apiPost = <T = unknown>(endpoint: string, body: unknown) =>
  apiRequest<T>("POST", endpoint, body);

export const apiPut = <T = unknown>(endpoint: string, body: unknown) =>
  apiRequest<T>("PUT", endpoint, body);

export const apiDelete = <T = unknown>(endpoint: string, body?: unknown) =>
  apiRequest<T>("DELETE", endpoint, body ?? {});
