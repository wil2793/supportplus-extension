// ============================================================
// SRC/FEATURES/TEAM-PANEL.TS - Legacy team kanban panel
// Used when SP_ManagerView is not available or as fallback.
// ============================================================

import { SP_CONFIG, GROUP_INFO } from "../config";
import SP_Templates from "../lib/templates";
import SP_Session from "./session";
import SP_Guardias from "./guardias";
import SP_TicketActions from "./ticket-actions";
import { spGetHeaders, spHeaders, getTodayRange } from "../lib/sp-fetch";
import { showErrorToast, showSuccessToast } from "../components";
import type { UserConfig } from "../types";


// ─── Team area registry ───────────────────────────────────────



export const TEAM_AREAS: Record<
  number,
  { resolutionGroupId: number; resolutionGroupLabel: string; profiles: JsonObject[] }
> = {};
GROUP_INFO.forEach((g) => {
  TEAM_AREAS[g.id] = {
    resolutionGroupId: g.id,
    resolutionGroupLabel: g.name,
    profiles: [],
  };
});

export let currentTeamArea = "";
export function setCurrentTeamArea(area: string): void {
  currentTeamArea = area;
}

export function getTeamConfig(
  currentUserGroups: number[],
): { resolutionGroupId: number; resolutionGroupLabel: string; profiles: JsonObject[] } {
  return (
    TEAM_AREAS[parseInt(currentTeamArea)] ??
    TEAM_AREAS[currentUserGroups[0]] ?? {
      resolutionGroupId: currentUserGroups[0] ?? 0,
      resolutionGroupLabel: "",
      profiles: [],
    }
  );
}

export function getActiveAreas(
  currentUserGroups: number[],
): Array<{ resolutionGroupId: number; resolutionGroupLabel: string; profiles: JsonObject[] }> {
  return currentUserGroups.map((gId) => TEAM_AREAS[gId]).filter(Boolean);
}

// ─── Profile cache ────────────────────────────────────────────

const _profilesCache: Record<number, JsonObject[]> = {};
const _pendingProfileRequests: Record<number, Promise<JsonObject[]>> = {};

export function clearProfilesCache(): void {
  Object.keys(_profilesCache).forEach((k) => delete _profilesCache[parseInt(k)]);
}

export function loadProfilesForGroup(
  groupId: number,
  userConfig: UserConfig,
): Promise<JsonObject[]> {
  if (_profilesCache[groupId]) return Promise.resolve(_profilesCache[groupId]);
  if (Object.prototype.hasOwnProperty.call(_pendingProfileRequests, groupId))
    return _pendingProfileRequests[groupId];

  const spToken = localStorage.getItem("token");
  if (!spToken) return Promise.resolve([]);

  const p = fetch(
    `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${groupId}`,
    { headers: spGetHeaders(spToken) },
  )
    .then((r) => r.json())
    .then((json: JsonObject) => {
      let profiles: JsonObject[] = json.data || json;
      if (!Array.isArray(profiles)) profiles = [];
      const blacklist: number[] = (userConfig.blacklist as unknown as number[]) ?? [];
      const applyBlacklist = (bl: number[]) => {
        if (bl.length > 0)
          profiles = profiles.filter((p) => !bl.includes(p.profileId));
        _profilesCache[groupId] = profiles;
        if (TEAM_AREAS[groupId]) TEAM_AREAS[groupId].profiles = profiles;
        return profiles;
      };
      if (blacklist.length > 0) return applyBlacklist(blacklist);
      return new Promise<JsonObject[]>((resolve) => {
        chrome.storage.local.get("userConfig", (stored: JsonObject) => {
          resolve(applyBlacklist(
            ((stored["userConfig"] || {}).blacklist as unknown as number[]) ?? [],
          ));
        });
      });
    })
    .catch(() => { delete _pendingProfileRequests[groupId]; return []; })
    .then((r: JsonObject[]) => { delete _pendingProfileRequests[groupId]; return r; });

  _pendingProfileRequests[groupId] = p;
  return p;
}

export function loadTeamArea(): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get("teamArea", (result: JsonObject) => {
        const val: string = result["teamArea"] ?? "";
        if (val) currentTeamArea = val;
        void SP_Session.resolveProfileId();
        resolve();
      });
    } catch { resolve(); }
  });
}

// ─── Panel constants ──────────────────────────────────────────

export const TEAM_PANEL_ID = "sp-team-panel";
export const GUARDIAS_PANEL_ID = "sp-guardias-calendar-panel";

// ─── Guardias calendar ────────────────────────────────────────

export function injectGuardiasCalendar(): void {
  if (document.getElementById(GUARDIAS_PANEL_ID)) return;
  const panel = document.getElementById("sp-manager-panel") || document.getElementById(TEAM_PANEL_ID);
  if (!panel) return;

  const calPanel = document.createElement("div");
  calPanel.id = GUARDIAS_PANEL_ID;
  calPanel.style.cssText =
    "margin-top:12px;padding:16px;border-radius:8px;border:2px solid #1976D2;font-family:system-ui;color:inherit;";
  calPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
    '<button id="sp-dba-guardias-prev" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:14px;">◀</button>' +
    '<h4 style="margin:0;font-size:15px;font-weight:600;">📅 Guardias</h4>' +
    '<button id="sp-dba-guardias-next" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:14px;">▶</button>' +
    '</div><div id="sp-dba-guardias-content"><div style="text-align:center;padding:20px;opacity:.6;">Cargando guardias...</div></div>';

  panel.after(calPanel);

  const userName = SP_Session.state.userName || SP_Session.getLoggedUserNameFromDOM() || "";
  const userId = String(SP_Session.state.profileId ?? "");
  SP_Guardias.load(0, { currentUserName: userName, currentUserId: userId });
}

// ─── Column refresh helpers ───────────────────────────────────

export function refreshTeamColumn(profileId: string): void {
  void fetch(
    `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${profileId}&ticketStatusName=Asignado`,
    { headers: spGetHeaders() },
  )
    .then((r) => r.json())
    .then((json: JsonObject) => {
      const tickets = (json.data ?? json).content ?? [];
      const col = document.getElementById(`sp-team-col-${profileId}`);
      if (!col) return;
      const countEl = col.querySelector(".sp-team-count");
      if (countEl) countEl.textContent = `(${tickets.length})`;
      const listEl = col.querySelector<HTMLElement>(".sp-team-tickets");
      if (listEl)
        listEl.innerHTML = SP_Templates.ticketList(
          tickets as unknown as import("../types").SpTicket[],
          { draggable: true, showStatus: true },
        );
    })
    .catch(() => {});
}

export function refreshUnassignedColumn(currentUserGroups: number[]): void {
  getActiveAreas(currentUserGroups).forEach((area) => {
    void fetch(
      `${SP_CONFIG.SP_SEARCH_API}?page=0&size=50&resolutionGroupId=${area.resolutionGroupId}&ticketStatusName=En%20espera`,
      { headers: spGetHeaders() },
    )
      .then((r) => r.json())
      .then((json: JsonObject) => {
        const tickets = (json.data ?? json).content ?? [];
        const col = document.getElementById(`sp-team-col-unassigned-${area.resolutionGroupId}`);
        if (!col) return;
        const countEl = col.querySelector(".sp-team-count");
        if (countEl) countEl.textContent = `(${tickets.length})`;
        const listEl = col.querySelector<HTMLElement>(".sp-team-tickets");
        if (listEl)
          listEl.innerHTML = SP_Templates.ticketList(
            tickets as unknown as import("../types").SpTicket[],
            { draggable: true, borderColor: "#FF8F00", codeColor: "#E65100" },
          );
      })
      .catch(() => {});
  });
}

export function renderClosedColumn(tickets: import("../types").SpTicket[]): void {
  const col = document.getElementById("sp-team-col-closed");
  if (!col) return;
  const countEl = col.querySelector(".sp-team-count");
  if (countEl) countEl.textContent = `(${tickets.length})`;
  const listEl = col.querySelector<HTMLElement>(".sp-team-tickets");
  if (!listEl) return;
  if (!tickets.length) {
    listEl.innerHTML =
      '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets cerrados hoy</div>';
    return;
  }
  listEl.innerHTML = tickets
    .map(
      (t) =>
        `<div class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #2E7D32;font-size:10px;line-height:1.3;">` +
        `<div style="font-weight:600;color:#2E7D32;">${t.uniqueCode ?? ""}</div>` +
        `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">${(t.subject ?? "").substring(0, 30)}</div>` +
        `<div style="display:flex;justify-content:space-between;align-items:center;">` +
        `<span style="color:#2E7D32;font-weight:600;font-size:9px;">Cerrado</span>` +
        `<span style="color:#888;font-size:9px;">${((t.responsibleName ?? "") as string).split(" ")[0]}</span>` +
        `</div></div>`,
    )
    .join("");
}

export function refreshClosedColumn(currentUserGroups: number[]): void {
  const { start, end } = getTodayRange();
  const areas = getActiveAreas(currentUserGroups);
  const allClosed: import("../types").SpTicket[] = [];
  let pending = areas.length;

  areas.forEach((area) => {
    void fetch(
      `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${area.resolutionGroupId}&ticketStatusName=Cerrado&initDate=${start}&endDate=${end}&page=0&size=100`,
      { headers: spGetHeaders() },
    )
      .then((r) => r.json())
      .then((json: JsonObject) => { allClosed.push(...((json["data"] ?? json as JsonObject)["content"] ?? []) as import("../types").SpTicket[]); })
      .catch(() => {})
      .finally(() => { pending--; if (pending <= 0) renderClosedColumn(allClosed); });
  });
}

// ─── Team panel refresh ───────────────────────────────────────

let _teamRefreshing = false;

export function refreshTeamPanel(currentUserGroups: number[]): void {
  if (_teamRefreshing) return;
  _teamRefreshing = true;
  const panel = document.getElementById(TEAM_PANEL_ID);
  if (!panel) {
    _teamRefreshing = false;
    void loadTeamPanel(currentUserGroups, {}, false);
    return;
  }

  const areas = getActiveAreas(currentUserGroups);
  const allProfiles: JsonObject[] = areas.flatMap((a) => a.profiles as JsonObject[]);
  let remaining = allProfiles.length;

  allProfiles.forEach((p) => {
    void fetch(
      `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${p.profileId}&ticketStatusName=Asignado`,
      { headers: spGetHeaders() },
    )
      .then((r) => r.json())
      .then((json: JsonObject) => {
        const tickets = (json.data ?? json).content ?? [];
        const col = document.getElementById(`sp-team-col-${p.profileId}`);
        if (!col) return;
        const countEl = col.querySelector(".sp-team-count");
        if (countEl) countEl.textContent = `(${tickets.length})`;
        const listEl = col.querySelector<HTMLElement>(".sp-team-tickets");
        if (listEl)
          listEl.innerHTML = SP_Templates.ticketList(
            tickets as unknown as import("../types").SpTicket[],
            { draggable: true, showStatus: true },
          );
      })
      .catch(() => {})
      .finally(() => { remaining--; if (remaining <= 0) _teamRefreshing = false; });
  });

  refreshUnassignedColumn(currentUserGroups);
  refreshClosedColumn(currentUserGroups);
}

// ─── Main panel loader ────────────────────────────────────────

let _teamPanelLoading = false;

export async function loadTeamPanel(
  currentUserGroups: number[],
  userConfig: UserConfig,
  canDrag: boolean,
  openTicketCallback?: (ticketId: number) => void,
): Promise<void> {
  if (SP_DOM.isDetailView()) return;
  if (_teamPanelLoading || !currentTeamArea) return;
  if (document.getElementById("sp-manager-panel") || document.getElementById(TEAM_PANEL_ID)) return;

  _teamPanelLoading = true;
  await new Promise<void>((r) => setTimeout(r, 50));
  if (document.getElementById(TEAM_PANEL_ID)) { _teamPanelLoading = false; return; }

  const grid = document.querySelector(".MuiDataGrid-root");
  if (!grid || !SP_API_Lib.getSpToken()) { _teamPanelLoading = false; return; }

  const panel = document.createElement("div");
  panel.id = TEAM_PANEL_ID;
  panel.style.cssText = "margin-bottom:12px;overflow-x:auto;font-family:system-ui;";
  grid.parentElement?.insertBefore(panel, grid);

  try {
    const areas = getActiveAreas(currentUserGroups);
    await Promise.all(areas.map((area) =>
      loadProfilesForGroup(area.resolutionGroupId, userConfig).then((p) => { area.profiles = p; }),
    ));

    const myName = SP_Session.getLoggedUserNameFromDOM();
    const container = document.createElement("div");
    container.style.cssText = "display:flex;gap:8px;flex-wrap:nowrap;min-width:max-content;";
    panel.innerHTML = "";
    panel.appendChild(container);

    areas.forEach((area, idx) => {
      if (idx > 0) {
        const sep = document.createElement("div");
        sep.style.cssText = "width:3px;background:#ddd;border-radius:2px;margin:0 4px;align-self:stretch;";
        container.appendChild(sep);
      }
      if (areas.length > 1) {
        const label = document.createElement("div");
        label.style.cssText = "min-width:180px;max-width:220px;display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0;";
        label.innerHTML = `<div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;color:#555;letter-spacing:1px;">${idx === 0 ? "🗄️ DBA" : "📦 APPS"}</div>`;
        container.appendChild(label);
      }

      const unCol = document.createElement("div");
      unCol.id = `sp-team-col-unassigned-${area.resolutionGroupId}`;
      unCol.style.cssText = "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;";
      unCol.innerHTML =
        `<div style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">⏳ Sin asignar <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>` +
        `<div class="sp-team-tickets" data-profile-id="unassigned" data-area-group="${area.resolutionGroupId}" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>`;
      container.appendChild(unCol);

      area.profiles.forEach((p) => {
        const isMe = myName && p.profileFullName === myName;
        const col = document.createElement("div");
        col.id = `sp-team-col-${p.profileId}`;
        col.style.cssText = `min-width:180px;max-width:220px;border:2px solid ${isMe ? "#D94040" : "#ddd"};border-radius:8px;overflow:hidden;flex-shrink:0;`;
        col.innerHTML =
          `<div style="background:${isMe ? "#D94040" : idx === 0 ? "#2196F3" : "#7B1FA2"};color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">${p.profileFullName.split(" ")[0]} <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>` +
          `<div class="sp-team-tickets" data-profile-id="${p.profileId}" data-area-group="${area.resolutionGroupId}" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>`;
        container.appendChild(col);
      });
    });

    // Closed today + Pending close columns
    const closedCol = document.createElement("div");
    closedCol.id = "sp-team-col-closed";
    closedCol.style.cssText = "min-width:180px;max-width:220px;border:2px solid #2E7D32;border-radius:8px;overflow:hidden;flex-shrink:0;";
    closedCol.innerHTML =
      `<div style="background:#2E7D32;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-team-count" style="opacity:0.7;">(...)</span></div>` +
      `<div class="sp-team-tickets" data-profile-id="closed" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>`;
    container.appendChild(closedCol);

    // Pending close
    const pendingCol = document.createElement("div");
    pendingCol.id = "sp-team-col-pending-close";
    pendingCol.style.cssText = "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;display:none;";
    pendingCol.innerHTML =
      `<div style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">🕐 Pendientes <span id="sp-pending-close-count" style="opacity:0.7;">(...)</span></div>` +
      `<div id="sp-pending-close-list" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>`;
    container.insertBefore(pendingCol, closedCol);

    void SP_TicketActions.fetchPendingCloseTickets().then((pts) => {
      if (!pts.length) return;
      pendingCol.style.display = "";
      const countEl = document.getElementById("sp-pending-close-count");
      if (countEl) countEl.textContent = `(${pts.length})`;
      const listEl = document.getElementById("sp-pending-close-list");
      if (!listEl) return;
      const withinHours = SP_Session.isWithinWorkHours();
      listEl.innerHTML = pts
        .map((pt) => {
          const cursor = withinHours ? "cursor:pointer;" : "cursor:not-allowed;opacity:0.6;";
          return `<div class="sp-pending-ticket" data-ticket-id="${pt.ticketId}" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;${cursor}"><div style="font-weight:600;color:#E65100;">${pt.ticket}</div>${!withinHours ? '<div style="color:#888;font-size:8px;">🔒 Fuera de horario</div>' : ""}</div>`;
        })
        .join("");
      listEl.addEventListener("click", (e: MouseEvent) => {
        if (!SP_Session.isWithinWorkHours()) {
          showErrorToast("⏰ Fuera de horario laboral.");
          return;
        }
        const ticket = (e.target as Element).closest<HTMLElement>(".sp-pending-ticket");
        if (ticket && openTicketCallback) openTicketCallback(parseInt(ticket.dataset["ticketId"] ?? "0"));
      });
    });

    // Click handler
    panel.addEventListener("click", (e: MouseEvent) => {
      const ticket = (e.target as Element).closest<HTMLElement>(".sp-team-ticket");
      if (ticket && openTicketCallback) openTicketCallback(parseInt(ticket.dataset["ticketId"] ?? "0"));
    });

    // Drag & drop (reassign on drop)
    panel.addEventListener("dragstart", (e: DragEvent) => {
      const ticket = (e.target as Element).closest<HTMLElement>(".sp-team-ticket");
      if (!ticket) return;
      e.dataTransfer?.setData("text/plain", ticket.dataset["ticketId"] ?? "");
      (ticket as HTMLElement).style.opacity = "0.4";
    });
    panel.addEventListener("dragend", (e: DragEvent) => {
      const ticket = (e.target as Element).closest<HTMLElement>(".sp-team-ticket");
      if (ticket) ticket.style.opacity = "1";
    });
    panel.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      (e.target as Element).closest<HTMLElement>("[id^='sp-team-col-']")?.querySelector<HTMLElement>(".sp-team-tickets")?.style.setProperty("background", "#e3f2fd");
    });
    panel.addEventListener("dragleave", (e: DragEvent) => {
      const col = (e.target as Element).closest<HTMLElement>("[id^='sp-team-col-']");
      if (col && !col.contains(e.relatedTarget as Node))
        col.querySelector<HTMLElement>(".sp-team-tickets")?.style.setProperty("background", "#fafafa");
    });
    panel.addEventListener("drop", async (e: DragEvent) => {
      e.preventDefault();
      const col = (e.target as Element).closest<HTMLElement>("[id^='sp-team-col-']");
      if (!col) return;
      const dropZone = col.querySelector<HTMLElement>(".sp-team-tickets");
      if (!dropZone) return;
      dropZone.style.background = "#fafafa";
      const ticketId = e.dataTransfer?.getData("text/plain") ?? "";
      const targetProfileId = dropZone.dataset["profileId"] ?? "";
      if (!ticketId || !targetProfileId || targetProfileId === "unassigned") return;

      if (targetProfileId === "closed") {
        showLoadingToast("Cerrando ticket...");
        try {
          const res = await fetch(
            `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
            { method: "PATCH", headers: spHeaders(), body: JSON.stringify({ nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"], ticketCommentRequest: null }) },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          showSuccessToast("Ticket cerrado"); refreshClosedColumn(currentUserGroups);
        } catch (err) { showErrorToast(`Error: ${(err as Error).message}`); }
        return;
      }

      const sourceEl = panel.querySelector<HTMLElement>(`.sp-team-ticket[data-ticket-id="${ticketId}"]`);
      if (sourceEl?.closest<HTMLElement>(".sp-team-tickets")?.dataset["profileId"] === targetProfileId) return;

      const dropAreaGroupId = parseInt(dropZone.dataset["areaGroup"] ?? "0") || getTeamConfig(currentUserGroups).resolutionGroupId;
      const dropAreaConfig = Object.values(TEAM_AREAS).find((a) => a.resolutionGroupId === dropAreaGroupId) || getTeamConfig(currentUserGroups);

      showLoadingToast("Reasignando...");
      try {
        const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
          method: "PUT", headers: spHeaders(),
          body: JSON.stringify({ resolutionGroupId: dropAreaConfig.resolutionGroupId, serviceId: null, responsibleProfileId: parseInt(targetProfileId), resolutionGroup: { label: dropAreaConfig.resolutionGroupLabel, value: dropAreaConfig.resolutionGroupId } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showSuccessToast("Reasignado"); refreshTeamColumn(targetProfileId);
      } catch (err) { showErrorToast(`Error: ${(err as Error).message}`); }
    });

    // Fetch tickets
    areas.forEach((area) => {
      area.profiles.forEach((p) => {
        void fetch(`${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${p.profileId}&ticketStatusName=Asignado`, { headers: spGetHeaders() })
          .then((r) => r.json())
          .then((json: JsonObject) => {
            const tickets = (json.data ?? json).content ?? [];
            const col = document.getElementById(`sp-team-col-${p.profileId}`);
            if (!col) return;
            col.querySelector(".sp-team-count")!.textContent = `(${tickets.length})`;
            const listEl = col.querySelector<HTMLElement>(".sp-team-tickets");
            if (listEl)
              listEl.innerHTML = SP_Templates.ticketList(
                tickets as unknown as import("../types").SpTicket[],
                { draggable: canDrag, showStatus: true },
              );
          }).catch(() => {});
      });
      void fetch(`${SP_CONFIG.SP_SEARCH_API}?page=0&size=50&resolutionGroupId=${area.resolutionGroupId}&ticketStatusName=En%20espera`, { headers: spGetHeaders() })
        .then((r) => r.json())
        .then((json: JsonObject) => {
          const tickets = (json.data ?? json).content ?? [];
          const col = document.getElementById(`sp-team-col-unassigned-${area.resolutionGroupId}`);
          if (!col) return;
          col.querySelector(".sp-team-count")!.textContent = `(${tickets.length})`;
          const listEl = col.querySelector<HTMLElement>(".sp-team-tickets");
          if (listEl)
            listEl.innerHTML = SP_Templates.ticketList(
              tickets as unknown as import("../types").SpTicket[],
              { draggable: canDrag, borderColor: "#FF8F00", codeColor: "#E65100" },
            );
        }).catch(() => {});
    });
    refreshClosedColumn(currentUserGroups);
  } catch (err) {
    panel.innerHTML = `<div style="color:#D94040;padding:8px;font-size:12px;">Error: ${(err as Error).message}</div>`;
  }
  _teamPanelLoading = false;
  injectGuardiasCalendar();
}

// Need SP_DOM import late to avoid circular
import SP_DOM from "../lib/dom-utils";
import SP_API_Lib from "../lib/api";
import { showLoadingToast } from "../components";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

