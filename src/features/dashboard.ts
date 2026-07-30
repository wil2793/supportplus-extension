// ============================================================
// SRC/FEATURES/DASHBOARD.TS - Closed-tickets dashboard
// ============================================================

import { GROUP_INFO } from "../config";
import SP_Modal from "../lib/modal-builder";
import {


  createHeaderButton,
  showSuccessToast,
  showErrorToast,
} from "../components";
import { spGetHeaders } from "../lib/sp-fetch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;



const DASHBOARD_BTN_ID = "sp-dashboard-btn";
const DASHBOARD_CACHE_KEY = "sp_dashboard_cache";

// ─── localStorage cache ───────────────────────────────────────

function loadCache(): JsonObject | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    return raw ? (JSON.parse(raw) as JsonObject) : null;
  } catch {
    return null;
  }
}
function saveCache(
  data: JsonObject[],
  from: string,
  to: string,
  groupId?: number | string,
): void {
  localStorage.setItem(
    DASHBOARD_CACHE_KEY,
    JSON.stringify({ data, from, to, groupId: groupId ?? "", ts: Date.now() }),
  );
}
export function clearDashboardCache(): void {
  localStorage.removeItem(DASHBOARD_CACHE_KEY);
}

// ─── State ────────────────────────────────────────────────────

let _data: JsonObject[] | null = null;
let _from = "";
let _to = "";

function initState(): void {
  const cached = loadCache();
  if (
    cached &&
    new Date(cached["ts"] as number).toDateString() !==
      new Date().toDateString()
  ) {
    clearDashboardCache();
    return;
  }
  if (cached?.data?.length) {
    _data = cached.data as JsonObject[];
    _from = cached.from ?? "";
    _to = cached.to ?? "";
  }
}
initState();

function ensureDateRange(): void {
  if (_from && _to) return;
  const now = new Date();
  _from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00`;
  _to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59`;
}

// ─── Chart builder ────────────────────────────────────────────

export function buildDashboardChart(tickets: JsonObject[]): string {
  if (!tickets.length)
    return '<div style="text-align:center;padding:40px;color:#888;">Sin tickets cerrados en este periodo</div>';
  const counts: Record<string, number> = {};
  tickets.forEach((t) => {
    const n: string = t.responsibleName || "Sin asignar";
    counts[n] = (counts[n] ?? 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;
  const colors = [
    "#1976D2",
    "#2E7D32",
    "#D94040",
    "#7B1FA2",
    "#E65100",
    "#00796B",
    "#C2185B",
    "#F57F17",
    "#283593",
    "#5D4037",
  ];
  let html = `<div style="margin-bottom:12px;font-size:13px;color:#888;">Total: <b>${tickets.length}</b> tickets cerrados</div>`;
  sorted.forEach(([name, count], i) => {
    const pct = Math.round((count / max) * 100);
    html +=
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">` +
      `<div style="width:180px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</div>` +
      `<div style="flex:1;background:#eee;border-radius:4px;height:24px;overflow:hidden;">` +
      `<div style="width:${pct}%;background:${colors[i % colors.length]};height:100%;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">` +
      `<span style="color:#fff;font-size:11px;font-weight:700;">${count}</span></div></div></div>`;
  });
  return html;
}

// ─── Data fetcher ─────────────────────────────────────────────

export async function generateDashboard(
  btn: HTMLButtonElement,
  groupId: number,
): Promise<void> {
  ensureDateRange();
  btn.disabled = true;
  btn.innerHTML =
    '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Creando dashboard...</span>';
  btn.style.background = "#999";
  const restore = () => {
    btn.innerHTML =
      '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>';
    btn.style.background = "#00796B";
    btn.disabled = false;
  };

  const allTickets: import("../types").SpTicket[] = [];
  let page = 0;
  try {
    while (true) {
      let url = `https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=${page}&size=100&resolutionGroupId=${groupId}`;
      if (_from) url += `&initDate=${_from}`;
      if (_to) url += `&endDate=${_to}`;
      const res = await fetch(url, { headers: spGetHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as JsonObject;
      const data = (json["data"] ?? json) as JsonObject;
      const tickets = (data["content"] ?? []) as import("../types").SpTicket[];
      tickets.forEach((t) => {
        if ((t as import("../types").SpTicket).ticketStatusName === "Cerrado") allTickets.push(t as import("../types").SpTicket);
      });
      btn.innerHTML = `<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> ${allTickets.length} tickets...</span>`;
      if (page >= ((data["totalPages"] as number) || 1) - 1) break;
      page++;
    }
  } catch (err) {
    showErrorToast(`Error: ${(err as Error).message}`);
    restore();
    return;
  }

  _data = allTickets;
  saveCache(allTickets, _from, _to, groupId);
  restore();
  btn.innerHTML =
    '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Ver dashboard</span>';
  showSuccessToast(`Dashboard listo: ${allTickets.length} tickets cerrados`);
}

// ─── Modal ────────────────────────────────────────────────────

export function showDashboardModal(
  currentUserGroups: number[],
  getTeamGroupId: () => number,
): void {
  document.getElementById("sp-dashboard-modal")?.remove();
  ensureDateRange();
  let groupHTML = "";
  if (currentUserGroups.length > 1) {
    const cached = loadCache();
    const currentGId = cached?.["groupId"] ?? currentUserGroups[0];
    const opts = currentUserGroups
      .map((gId) => {
        const g = GROUP_INFO.find((gi) => gi.id === gId) ?? {
          id: gId,
          name: `Grupo ${gId}`,
        };
        return `<option value="${g.id}"${String(g.id) === String(currentGId) ? " selected" : ""}>${g.name}</option>`;
      })
      .join("");
    groupHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;"><label style="font-size:12px;white-space:nowrap;">Grupo:</label><select id="sp-dash-group-change" style="flex:1;padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">${opts}</select></div>`;
  }
  const m = SP_Modal.info({
    id: "sp-dashboard-modal",
    title: "📊 Tickets cerrados por analista",
    content:
      groupHTML +
      `<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;"><label style="font-size:12px;">Desde:</label><input id="sp-dash-from" type="datetime-local" value="${_from}" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;"><label style="font-size:12px;">Hasta:</label><input id="sp-dash-to" type="datetime-local" value="${_to}" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;"><button id="sp-dash-refresh" style="padding:5px 14px;font-size:12px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-weight:600;">Regenerar</button></div>` +
      `<div id="sp-dash-results" style="flex:1;overflow:auto;min-height:200px;"></div>`,
    maxWidth: "700px",
    modalOptions: { width: "95%", maxHeight: "90vh" },
  });

  (document.getElementById("sp-dash-results") as HTMLElement).innerHTML =
    buildDashboardChart(_data ?? []);

  const groupChangeEl = document.getElementById(
    "sp-dash-group-change",
  ) as HTMLSelectElement | null;
  if (groupChangeEl) {
    groupChangeEl.addEventListener("change", () => {
      const newGId = parseInt(groupChangeEl.value);
      const cached = loadCache();
      if (
        cached?.data?.length &&
        String(cached["groupId"]) === String(newGId)
      ) {
        _data = cached["data"] as JsonObject[];
        _from = cached["from"] ?? "";
        _to = cached["to"] ?? "";
        (document.getElementById("sp-dash-from") as HTMLInputElement).value =
          _from;
        (document.getElementById("sp-dash-to") as HTMLInputElement).value = _to;
        (document.getElementById("sp-dash-results") as HTMLElement).innerHTML =
          buildDashboardChart(_data);
      } else {
        _data = null;
        (document.getElementById("sp-dash-results") as HTMLElement).innerHTML =
          '<div style="text-align:center;padding:40px;color:#888;">No hay datos para este grupo. Presiona <b>Regenerar</b>.</div>';
      }
    });
  }

  (
    document.getElementById("sp-dash-refresh") as HTMLButtonElement
  ).addEventListener("click", () => {
    _from = (document.getElementById("sp-dash-from") as HTMLInputElement).value;
    _to = (document.getElementById("sp-dash-to") as HTMLInputElement).value;
    _data = null;
    clearDashboardCache();
    const selGId = groupChangeEl
      ? parseInt(groupChangeEl.value)
      : getTeamGroupId();
    m.close();
    const btn = document.getElementById(DASHBOARD_BTN_ID) as HTMLButtonElement;
    void generateDashboard(btn, selGId);
  });
}

// ─── Click handler ────────────────────────────────────────────

export async function handleDashboardClick(
  currentUserGroups: number[],
  getTeamGroupId: () => number,
): Promise<void> {
  const btn = document.getElementById(
    DASHBOARD_BTN_ID,
  ) as HTMLButtonElement | null;
  if (!btn) return;
  if (currentUserGroups.length > 1 && !_data?.length) {
    const opts = currentUserGroups
      .map((gId) => {
        const g = GROUP_INFO.find((gi) => gi.id === gId) ?? {
          id: gId,
          name: `Grupo ${gId}`,
        };
        return `<option value="${g.id}">${g.name}</option>`;
      })
      .join("");
    const mm = SP_Modal.info({
      id: "sp-dashboard-group-modal",
      title: "📊 Generar Dashboard",
      content: `<p style="font-size:0.85rem;color:#555;margin:0 0 12px;">Selecciona el grupo:</p><select id="sp-dash-group-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;">${opts}</select><button id="sp-dash-group-confirm" style="width:100%;padding:10px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-weight:600;">Generar</button>`,
      maxWidth: "400px",
    });
    (
      document.getElementById("sp-dash-group-confirm") as HTMLButtonElement
    ).addEventListener("click", () => {
      const selG = parseInt(
        (document.getElementById("sp-dash-group-select") as HTMLSelectElement)
          .value,
      );
      mm.close();
      _data = null;
      void generateDashboard(btn, selG);
    });
    return;
  }
  if (_data?.length) {
    showDashboardModal(currentUserGroups, getTeamGroupId);
    return;
  }
  void generateDashboard(btn, getTeamGroupId());
}

// ─── Button injector ──────────────────────────────────────────

export function injectDashboardButton(
  canShow: boolean,
  currentUserGroups: number[],
  getTeamGroupId: () => number,
  searchBtnId: string,
): void {
  if (!canShow || document.getElementById(DASHBOARD_BTN_ID)) return;
  const searchBtn = document.getElementById(searchBtnId);
  if (!searchBtn) return;
  ensureDateRange();
  const btn = createHeaderButton({
    id: DASHBOARD_BTN_ID,
    icon: "📊",
    label: _data ? "Ver dashboard" : "Dashboard",
    color: "#00796B",
    onClick: () => void handleDashboardClick(currentUserGroups, getTeamGroupId),
  });
  searchBtn.parentElement?.insertBefore(btn, searchBtn);
  const sep = document.createElement("span");
  sep.style.cssText =
    "color:rgba(255,255,255,0.4);font-size:16px;margin-right:8px;";
  sep.textContent = "|";
  searchBtn.parentElement?.insertBefore(sep, searchBtn);
}
