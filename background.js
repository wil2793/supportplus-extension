// ============================================================
// BACKGROUND.JS - Service Worker (SQL Server API sync + Monday proxy)
// ============================================================

const API_BASE = "http://localhost:3500/api";
const API_KEY = "c93666bd500472565a7e183365092191bd8fa734720fd20d04bd5c456949864d";

// ─── API Helpers ────────────────────────────────────────────

async function apiGet(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "X-API-Key": API_KEY }
  });
  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}

async function apiPut(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-API-Key": API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}

async function apiDelete(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, { method: "DELETE", headers: { "Content-Type": "application/json", "X-API-Key": API_KEY }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}

// ─── Sync (1 request) ───────────────────────────────────────

async function syncFromAPI() {
  const resp = await apiGet("/sync");
  if (!resp.success) throw new Error("Sync failed");
  const d = resp.data;

  const storedData = await chrome.storage.local.get(["userEmail", "userConfig", "groupMondayConfig"]);
  const currentEmail = (storedData.userEmail || "").toLowerCase();

  // Monday token
  let mondayToken = "";
  if (currentEmail && d.usersMap[currentEmail] && d.usersMap[currentEmail].tokenMonday) {
    try { mondayToken = atob(d.usersMap[currentEmail].tokenMonday); } catch (e) { mondayToken = d.usersMap[currentEmail].tokenMonday; }
  }

  // User config — fetch from API or preserve local
  let userConfig = storedData.userConfig || {};
  if (currentEmail && d.usersMap[currentEmail]) {
    try {
      const cfgResp = await apiGet(`/configuracion/usuario/${d.usersMap[currentEmail].idUsuario}`);
      if (cfgResp.data) {
        userConfig = {
          onlyWithTickets: !!cfgResp.data.MostrarSoloConTickets,
          blacklist: cfgResp.data.blacklist || []
        };
      }
    } catch (e) { /* keep existing */ }
  }

  // Work schedule
  const workSchedule = {
    horaEntrada: parseInt(d.config.HorarioEntrada) || 9,
    horaSalida: parseInt(d.config.HorarioSalida) || 19,
    diaInicio: d.config.DiaInicio || "Lunes",
    diaFinal: d.config.DiaFinal || "Viernes"
  };

  await chrome.storage.local.set({
    usersMap: d.usersMap,
    rolesList: d.rolesList,
    groupNames: d.groupNames,
    groupMondayConfig: storedData.groupMondayConfig || {},
    suggestedComments: d.suggestedComments,
    mondayToken,
    latestVersion: d.latestVersion,
    latestZipUrl: d.latestZipUrl,
    allVersions: d.allVersions,
    userConfig,
    workSchedule,
    syncTime: Date.now()
  });

  console.log("[SP] Synced:", Object.keys(d.usersMap).length, "users, v:", d.latestVersion);
}

// ─── Retry ──────────────────────────────────────────────────

let _retries = 0;
async function syncWithRetry() {
  try { await syncFromAPI(); _retries = 0; }
  catch (e) {
    _retries++;
    if (_retries <= 3) setTimeout(syncWithRetry, _retries * 5000);
    else { console.error("[SP] Sync failed:", e.message); _retries = 0; }
  }
}

// ─── Lifecycle ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => syncWithRetry());
chrome.runtime.onStartup.addListener(() => syncWithRetry());

// ─── Message Router ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    switch (msg.type) {
      case "sync":
        await syncFromAPI();
        return { success: true };

      case "api-get":
        return { success: true, data: await apiGet(msg.endpoint) };

      case "api-post":
        return { success: true, data: await apiPost(msg.endpoint, msg.body) };

      case "api-put":
        return { success: true, data: await apiPut(msg.endpoint, msg.body) };

      case "api-delete":
        return { success: true, data: await apiDelete(msg.endpoint, msg.body) };

      case "monday-query": {
        const data = await fetch("https://api.monday.com/v2", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": msg.token },
          body: JSON.stringify({ query: msg.query, variables: msg.variables })
        }).then(r => r.json());
        if (data.errors) throw new Error(data.errors[0].message);
        return { success: true, data: data.data };
      }

      case "proxy-fetch": {
        const res = await fetch(msg.url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buffer = await res.blob().then(b => b.arrayBuffer());
        return { success: true, data: Array.from(new Uint8Array(buffer)) };
      }

      default:
        return { success: false, error: "Unknown type: " + msg.type };
    }
  };

  handle().then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
  return true;
});
