// ============================================================
// SRC/BACKGROUND/INDEX.TS - Service Worker entry point
// ============================================================

import { syncWithRetry } from "./sync";
import { registerMessageRouter } from "./message-router";

// ── Register message handler ──────────────────────────────────
registerMessageRouter();

// ── Lifecycle: sync on install and startup ────────────────────
chrome.runtime.onInstalled.addListener(() => {
  void syncWithRetry();
});

chrome.runtime.onStartup.addListener(() => {
  void syncWithRetry();
});
