// ============================================================
// SRC/LIB/MONDAY-CACHE.TS - Monday sync cache + synced badge
// localStorage-backed cache of ticketCode -> mondayItemId
// ============================================================

import SP_MondayUtils from "./monday-utils";
import SP_API_Lib from "./api";
import SP_Log from "./logger";
import { SP_CONFIG } from "../config";

const CACHE_KEY = "sp_monday_synced";
const CACHE_TTL = 1000 * 60 * 30; // 30 min

// ─── localStorage cache ───────────────────────────────────────

export function getCache(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as { ts: number; ids: Record<string, string> };
    if (Date.now() - cache.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cache.ids;
  } catch {
    return null;
  }
}

export function setCache(ids: Record<string, string>): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ids }));
}

export function addToCache(ticketCode: string, mondayItemId: string): void {
  const ids = getCache() || {};
  ids[ticketCode] = mondayItemId;
  setCache(ids);
}

export function invalidateCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

// ─── Sync promise (ensures only one fetch at a time) ─────────

let _syncPromise: Promise<Record<string, string>> | null = null;

export async function fetchSyncedTickets(): Promise<Record<string, string>> {
  const cached = getCache();
  if (cached) return cached;
  const tok = await SP_API_Lib.getMondayToken();
  if (!tok) return {};
  try {
    const synced = await SP_MondayUtils.fetchAllSyncedTickets(tok);
    setCache(synced as Record<string, string>);
    return synced as Record<string, string>;
  } catch (err) {
    SP_Log.warn("Monday sync error:", err);
    return {};
  }
}

export function ensureSyncStarted(): Promise<Record<string, string>> {
  if (!_syncPromise) _syncPromise = fetchSyncedTickets();
  return _syncPromise;
}

export function resetSyncPromise(): void {
  _syncPromise = null;
}

// ─── Synced badge element ─────────────────────────────────────

export function createSyncedBadge(mondayItemId: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "sp-monday-synced";
  link.href = `${SP_CONFIG.MONDAY_BASE_URL}/boards/${SP_CONFIG.MONDAY_BOARD_ID}/pulses/${mondayItemId}`;
  link.target = "_blank";
  link.textContent = "↗";
  link.title = "Ver en Monday";
  link.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;width:0;opacity:0;overflow:hidden;" +
    "font-size:11px;font-weight:700;color:#fff;background:#2E7D32;border-radius:0 4px 4px 0;" +
    "text-decoration:none;transition:width 0.25s cubic-bezier(0.4,0,0.2,1),opacity 0.25s ease,padding 0.25s ease;" +
    "padding:4px 0;margin-left:-1px;cursor:pointer;height:100%;box-sizing:border-box;vertical-align:middle;";
  link.addEventListener("click", (e) => e.stopPropagation());
  return link;
}
