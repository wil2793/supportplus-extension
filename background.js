// ============================================================
// BACKGROUND.JS - Service Worker (SQL Server API sync + Monday proxy)
// ============================================================

const API_BASE = "https://back-extension-sp.macropay.mx/api";

// ─── Auth: JWT from portal → login → our own token ──────────

let _apiToken = null;
let _apiTokenExpiry = 0; // timestamp ms

async function getPortalToken() {
  // First try storage (saved by content script on session check)
  const stored = await chrome.storage.local.get("portalToken");
  if (stored.portalToken) return stored.portalToken;

  // Fallback: fetch fresh token from SP session API via active tab
  try {
    const tabs = await chrome.tabs.query({ url: "https://macropay.supportplus.mx/*" });
    if (!tabs.length) return "";
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        // Try localStorage first, then sessionStorage
        return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
      }
    });
    const token = results && results[0] && results[0].result;
    if (token) {
      await chrome.storage.local.set({ portalToken: token });
      return token;
    }
  } catch (e) { /* ignore */ }

  return "";
}

async function loginToAPI(portalToken) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: portalToken })
  });
  if (!res.ok) throw new Error("Login API " + res.status);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Login failed");
  _apiToken = data.data.token;
  // Tokens expire in 8 hours — refresh 30 min early
  _apiTokenExpiry = Date.now() + (8 * 60 * 60 * 1000) - (30 * 60 * 1000);
  await chrome.storage.local.set({ apiToken: _apiToken, apiTokenExpiry: _apiTokenExpiry });
  return _apiToken;
}

async function ensureApiToken() {
  // Load from storage if not in memory
  if (!_apiToken || !_apiTokenExpiry) {
    const stored = await chrome.storage.local.get(["apiToken", "apiTokenExpiry"]);
    _apiToken = stored.apiToken || null;
    _apiTokenExpiry = stored.apiTokenExpiry || 0;
  }
  // Check expiry
  if (_apiToken && Date.now() < _apiTokenExpiry) return _apiToken;
  // Token expired or missing — re-login
  const portalToken = await getPortalToken();
  if (!portalToken) throw new Error("No portal token available");
  return loginToAPI(portalToken);
}

// ─── API Helpers ────────────────────────────────────────────

async function apiRequest(method, endpoint, body, _isRetry) {
  let headers = { "Content-Type": "application/json" };

  try {
    const token = await ensureApiToken();
    headers["Authorization"] = `Bearer ${token}`;
  } catch (e) {
    // Fallback a API Key si no hay JWT disponible aún
    const apiKey = "c93666bd500472565a7e183365092191bd8fa734720fd20d04bd5c456949864d";
    headers["X-API-Key"] = apiKey;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${endpoint}`, opts);

  // Token expirado → re-login y retry una sola vez
  if (res.status === 401 && !_isRetry) {
    try {
      const portalToken = await getPortalToken();
      if (portalToken) {
        _apiToken = null; // forzar re-login
        _apiTokenExpiry = 0;
        await loginToAPI(portalToken);
        return apiRequest(method, endpoint, body, true);
      }
    } catch (e) { /* ignore */ }
  }

  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}

async function apiGet(endpoint) { return apiRequest("GET", endpoint); }
async function apiPost(endpoint, body) { return apiRequest("POST", endpoint, body); }
async function apiPut(endpoint, body) { return apiRequest("PUT", endpoint, body); }
async function apiDelete(endpoint, body) { return apiRequest("DELETE", endpoint, body || {}); }

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

  // ─── Resolve SP portal profileId (once per session) ──────
  // Use the email to find the profileId in the SP portal, store it so
  // content script never needs to re-fetch it.
  if (currentEmail && d.usersMap[currentEmail]) {
    const prevData = await chrome.storage.local.get(["spProfileId", "spProfileEmail"]);
    // Clear cached profileId if email changed
    if (prevData.spProfileEmail && prevData.spProfileEmail !== currentEmail) {
      await chrome.storage.local.remove(["spProfileId", "spProfileEmail"]);
      prevData.spProfileId = null;
    }
    if (!prevData.spProfileId) {
      try {
        const portalToken = await getPortalToken();
        if (portalToken) {
          const userData = d.usersMap[currentEmail];
          const groupIds = userData.groups || [];
          const groupId = groupIds[0] || "";
          if (groupId) {
            const spRes = await fetch(
              `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${groupId}`,
              { headers: { accept: "application/json", authorization: "Bearer " + portalToken } }
            );
            if (spRes.ok) {
              const spJson = await spRes.json();
              const profiles = spJson.data || spJson;
              if (Array.isArray(profiles)) {
                const me = profiles.find(function (p) {
                  return p.email && p.email.toLowerCase() === currentEmail;
                }) || profiles.find(function (p) {
                  return (p.profileFullName || "").toLowerCase().includes(
                    (userData.name || "").split(" ")[0].toLowerCase()
                  );
                });
                if (me && me.profileId) {
                  await chrome.storage.local.set({ spProfileId: me.profileId, spProfileEmail: currentEmail });
                  console.log("[SP] profileId resolved:", me.profileId);
                }
              }
            }
          }
        }
      } catch (e) { /* non-critical */ }
    }
  }

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

      case "auth-login": {
        const tok = await loginToAPI(msg.portalToken);
        return { success: true, token: tok };
      }

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
