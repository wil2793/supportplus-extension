// ============================================================
// SRC/BACKGROUND/MESSAGE-ROUTER.TS - chrome.runtime message handler
// Routes all incoming messages to the appropriate handler.
// ============================================================

import { syncWithRetry } from "./sync";
import { apiGet, apiPost, apiPut, apiDelete } from "./api-client";
import { executeMondayQuery } from "./monday-proxy";
import { getPortalToken, loginToAPI } from "./auth";
import type { ExtensionMessage, ExtensionResponse } from "../types";

type SendResponse = (response: ExtensionResponse) => void;

/** Register the single chrome.runtime.onMessage listener. */
export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: SendResponse,
    ): boolean => {
      // All handlers are async — we must return `true` to keep
      // the message channel open for the async response.
      void handleMessage(message, sendResponse);
      return true;
    },
  );
}

async function handleMessage(
  msg: ExtensionMessage,
  sendResponse: SendResponse,
): Promise<void> {
  try {
    switch (msg.type) {
      // ── Sync ──────────────────────────────────────────────
      case "sync": {
        await syncWithRetry();
        sendResponse({ success: true });
        break;
      }

      // ── Auth login (explicit) ─────────────────────────────
      case "auth-login": {
        const portalToken = await getPortalToken();
        if (!portalToken) {
          sendResponse({ success: false, error: "No portal token" });
          break;
        }
        const apiToken = await loginToAPI(portalToken);
        sendResponse({ success: true, data: { token: apiToken } });
        break;
      }

      // ── Generic API calls ─────────────────────────────────
      case "api-get": {
        if (!msg.endpoint) {
          sendResponse({ success: false, error: "No endpoint" });
          break;
        }
        const data = await apiGet(msg.endpoint);
        sendResponse({ success: true, data });
        break;
      }

      case "api-post": {
        if (!msg.endpoint) {
          sendResponse({ success: false, error: "No endpoint" });
          break;
        }
        const data = await apiPost(msg.endpoint, msg.body);
        sendResponse({ success: true, data });
        break;
      }

      case "api-put": {
        if (!msg.endpoint) {
          sendResponse({ success: false, error: "No endpoint" });
          break;
        }
        const data = await apiPut(msg.endpoint, msg.body);
        sendResponse({ success: true, data });
        break;
      }

      case "api-delete": {
        if (!msg.endpoint) {
          sendResponse({ success: false, error: "No endpoint" });
          break;
        }
        const data = await apiDelete(msg.endpoint, msg.body);
        sendResponse({ success: true, data });
        break;
      }

      // ── Monday.com GraphQL proxy ───────────────────────────
      case "monday-query": {
        if (!msg.token || !msg.query) {
          sendResponse({ success: false, error: "Missing token or query" });
          break;
        }
        const result = await executeMondayQuery({
          token: msg.token,
          query: msg.query,
          variables: msg.variables,
        });
        sendResponse(result);
        break;
      }

      // ── Proxy fetch (for binary downloads, e.g. zip files) ─
      case "proxy-fetch": {
        if (!msg.url) {
          sendResponse({ success: false, error: "No URL provided" });
          break;
        }
        const headers: Record<string, string> = {};
        if (msg.token) headers["Authorization"] = `Bearer ${msg.token}`;
        if (msg.accept) headers["Accept"] = msg.accept;
        const res = await fetch(msg.url, { headers });
        if (!res.ok) {
          sendResponse({ success: false, error: `HTTP ${res.status}` });
          break;
        }
        const buffer = await res.arrayBuffer();
        sendResponse({
          success: true,
          data: Array.from(new Uint8Array(buffer)),
        });
        break;
      }

      default: {
        sendResponse({
          success: false,
          error: `Unknown message type: ${String(msg.type)}`,
        });
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[SP BG] Error handling message:", msg.type, error);
    sendResponse({ success: false, error });
  }
}
