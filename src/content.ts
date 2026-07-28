// ============================================================
// SRC/CONTENT.TS - Content script entry point
// Full port of content.js (9487 lines) to TypeScript.
// Strategy: minimal typing — keep all logic identical to the
// original JS, replace window.* globals with TS module imports.
// ============================================================

// ─── Imports from migrated TS modules ────────────────────────
import SP_Log from "./lib/logger";
import * as Storage from "./lib/storage";
import SP_DOM from "./lib/dom-utils";
import SP_Templates from "./lib/templates";
import SP_API_Lib from "./lib/api";
import SP_MondayUtils from "./lib/monday-utils";
import SP_Session from "./features/session";
import SP_Header from "./features/header-buttons";
import SP_ManagerView from "./features/manager-view";
import SP_DetailView from "./features/detail-view";
import SP_TicketActions from "./features/ticket-actions";
import SP_Reports from "./features/reports";
import SP_RowColors from "./features/row-colors";
import SP_Guardias from "./features/guardias";
import SP_Modal from "./lib/modal-builder";
import {
  escHtml as esc,
  createHeaderButton,
  stringToColor,
  showLoadingToast,
  showSuccessToast,
  showErrorToast,
  spinnerHTML,
} from "./components";
import { injectStyles } from "./styles";
import {
  SP_CONFIG,
  mapStatusToMonday,
  GROUP_INFO,
  PRIORITY_MAP,
  MONTH_NAMES,
  STATUS_COLORS,
  STATUS_TEXT_COLORS,
} from "./config";

// ─── Type aliases for runtime interop ─────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// ─── pdfjsLib global (loaded by pdf.min.js content script) ────
declare const pdfjsLib: AnyObj;

// ─── Boot: inject CSS immediately ─────────────────────────────
injectStyles();

SP_Log.info("Extension loading...");

// ─── State bridge from SP_Session ────────────────────────────
const _ss = SP_Session.state;
let currentUserGroups = _ss.groups;
let _btnDashboard = _ss.btnDashboard;
let _btnComments = _ss.btnComments;
let _btnReassignApp = _ss.btnReassignApp;
let _canShowLabels = _ss.canShowLabels;
let _canReopenTickets = _ss.canReopenTickets;
let _canCommentClosed = _ss.canCommentClosed;
let _canRejectTickets = _ss.canRejectTickets;
let _userConfig = _ss.userConfig;
let _workSchedule = _ss.workSchedule;
let sessionProfileId: number | null = null;

function isWithinWorkHours() {
  return SP_Session.isWithinWorkHours();
}

const saveTicketPendingClose = SP_TicketActions.saveTicketPendingClose;
const fetchPendingCloseTickets = SP_TicketActions.fetchPendingCloseTickets;

// ─── Session initialization ───────────────────────────────────
let _showConfigModal: (() => void) | null = null;
let _showQuickDetailModal: ((id: number | string) => void) | null = null;

document.addEventListener("sp-open-config", () => {
  if (_showConfigModal) _showConfigModal();
});
document.addEventListener("sp-open-ticket", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.ticketId && _showQuickDetailModal)
    _showQuickDetailModal(detail.ticketId);
});

void SP_Session.checkSession().then((result: unknown) => {
  if (result === null) {
    SP_Session.showAccessMessage?.(
      "⚠️ Usuario no registrado en SupportPlus Tools. Solicite su alta con el administrador.",
    );
    return;
  }
  if (result === "inactive") {
    SP_Session.showAccessMessage?.(
      "⚠️ Usuario inactivo en SupportPlus Tools. Solicite su reactivación con el administrador.",
    );
    return;
  }
  const ss = SP_Session.state;
  currentUserGroups = ss.groups;
  _btnDashboard = ss.btnDashboard;
  _btnComments = ss.btnComments;

  _btnReassignApp = ss.btnReassignApp;

  _canShowLabels = ss.canShowLabels;
  _canReopenTickets = ss.canReopenTickets;
  _canCommentClosed = ss.canCommentClosed;
  _canRejectTickets = ss.canRejectTickets;
  _userConfig = ss.userConfig;
  _workSchedule = ss.workSchedule;

  sessionProfileId = ss.profileId;
  initByRole();
  SP_Session.injectRoleLabel?.();
});

function initByRole() {
  void Storage.get("groupMondayConfig")
    .then(() => {})
    .catch(() => {});
  initExtension();
  if (currentUserGroups.length > 0) initManagerView();
}

function initManagerView() {
  if (SP_ManagerView) {
    (SP_ManagerView as AnyObj)._fetchPendingClose =
      SP_TicketActions.fetchPendingCloseTickets;
  }
  SP_ManagerView.initManagerView();
}

// ─── initExtension ────────────────────────────────────────────
function initExtension() {
  _showQuickDetailModal = showQuickDetailModal;
  SP_Header.injectButtons("session");
  void SP_DOM.waitForElement('[class*="warapperNameUserAndLogout"]', {
    maxAttempts: 20,
    interval: 150,
  }).then(() => {
    injectConfigButton();
    injectSearchButton();
    injectQuickSearch();
    injectUpdateButton();
  });

  // ─── Constants ──────────────────────────────────────────────
  const SP_API = SP_CONFIG.SP_API;
  const SP_SEARCH_API = SP_CONFIG.SP_SEARCH_API;
  const BTN_CLASS = "sp-monday-btn";
  const SYNCED_CLASS = "sp-monday-synced";
  const TAKE_BTN_CLASS = "sp-take-btn";
  const STEAL_BTN_CLASS = "sp-steal-btn";
  const CLOSE_BTN_CLASS = "sp-close-btn";
  const BULK_BTN_ID = "sp-monday-bulk";
  const BULK_CLOSE_BTN_ID = "sp-close-bulk";
  const BASE_URL = "https://macropay.supportplus.mx/es/dashboard/tickets";
  const CACHE_KEY = "sp_monday_synced";
  const CACHE_TTL = 1000 * 60 * 30;
  const DETAIL_QUICK_CLASS = "sp-quick-detail-btn";
  const HISTORY_BTN_CLASS = "sp-history-btn";
  const SEARCH_BTN_ID = "sp-search-btn";
  const DASHBOARD_BTN_ID = "sp-dashboard-btn";
  const DASHBOARD_CACHE_KEY = "sp_dashboard_cache";
  // const CONFIG_BTN_ID = "sp-config-btn"; // unused, handled by SP_Header
  const QUICK_SEARCH_ID = "sp-quick-search";
  const QUICK_FILTER_ID = "sp-quick-filter";
  const SUGGESTED_BTN_ID = "sp-suggested-btn";
  const NEW_TICKET_BTN_ID = "sp-new-ticket";
  const TEAM_PANEL_ID = "sp-team-panel";
  const GUARDIAS_PANEL_ID = "sp-guardias-calendar-panel";
  const HIGHLIGHT_CLASS = "sp-my-row";

  // ─── API helpers ─────────────────────────────────────────────
  const getToken = SP_API_Lib.getSpToken;
  const getMondayToken = SP_API_Lib.getMondayToken;
  const getMondayWorkspaceId = (SP_API_Lib as AnyObj).getMondayWorkspaceId;
  const getMondayTicketBoards = SP_API_Lib.getMondayTicketBoards;
  const mondayQuery = SP_API_Lib.mondayQuery;
  const getMondayUsers = SP_API_Lib.getMondayUsers;
  const checkTicketExistsInMonday = (SP_API_Lib as AnyObj).checkTicketInMonday;

  function getMondayBoardForMonth(
    year: number,
    month: number,
    _groupId?: unknown,
  ) {
    return SP_API_Lib.getMondayBoardForMonth(
      SP_API_Lib.getSpToken(),
      year,
      month,
    );
  }
  function getMondayBoardId(_groupId?: unknown) {
    return SP_API_Lib.getMondayBoardId(SP_API_Lib.getSpToken());
  }

  function spHeaders(token?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token || getToken()}`,
    };
  }
  function spGetHeaders(token?: string): Record<string, string> {
    return {
      accept: "application/json",
      authorization: `Bearer ${token || getToken()}`,
    };
  }
  function hoverText(btn: HTMLButtonElement, normal: string, hover: string) {
    btn.addEventListener("mouseenter", () => {
      if (!btn.disabled) btn.textContent = hover;
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.disabled) btn.textContent = normal;
    });
  }
  function utcToLocal(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
    if (isNaN(d.getTime())) return dateStr.replace("T", " ").substring(0, 16);
    d.setHours(d.getHours() - 6);
    return (
      d.getUTCFullYear() +
      "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getUTCDate()).padStart(2, "0") +
      " " +
      String(d.getUTCHours()).padStart(2, "0") +
      ":" +
      String(d.getUTCMinutes()).padStart(2, "0")
    );
  }

  function parseBoardDate(boardName: string) {
    const m = boardName.match(/- (\w+) - (\d{4})/);
    if (!m) return null;
    const monthIdx = MONTH_NAMES.indexOf(m[1] as (typeof MONTH_NAMES)[number]);
    if (monthIdx === -1) return null;
    return { month: monthIdx, year: parseInt(m[2]) };
  }
  async function canMigrateTicket(ticketCreatedAt: string): Promise<boolean> {
    try {
      const tok = await getMondayToken();
      const bid = await getMondayBoardId();
      if (!tok || !bid) return false;
      const bd = await mondayQuery(
        tok,
        "query ($boardId: [ID!]!) { boards(ids: $boardId) { name } }",
        { boardId: bid },
      );
      const boardName = bd.boards?.[0]?.name || "";
      const boardDate = parseBoardDate(boardName);
      if (!boardDate) return true;
      const ticketDate = new Date(ticketCreatedAt);
      return (
        ticketDate.getMonth() === boardDate.month &&
        ticketDate.getFullYear() === boardDate.year
      );
    } catch {
      return true;
    }
  }

  // ─── Cache ────────────────────────────────────────────────────
  function getCache(): Record<string, string> | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw) as {
        ts: number;
        ids: Record<string, string>;
      };
      if (Date.now() - cache.ts > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return cache.ids;
    } catch {
      return null;
    }
  }
  function setCache(ids: Record<string, string>) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ids }));
  }
  function addToCache(ticketId: string, mondayItemId: string) {
    const ids = getCache() || {};
    ids[ticketId] = mondayItemId;
    setCache(ids);
  }

  // ─── Sync ──────────────────────────────────────────────────────
  let syncPromise: Promise<Record<string, string>> | null = null;
  async function fetchSyncedTickets() {
    const cached = getCache();
    if (cached) return cached;
    const tok = await getMondayToken();
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
  function ensureSyncStarted() {
    if (!syncPromise) syncPromise = fetchSyncedTickets();
    return syncPromise;
  }

  // ─── UI helpers ───────────────────────────────────────────────
  function createSyncedBadge(mondayItemId: string) {
    const link = document.createElement("a");
    link.className = SYNCED_CLASS;
    link.href = `${SP_CONFIG.MONDAY_BASE_URL}/boards/${SP_CONFIG.MONDAY_BOARD_ID}/pulses/${mondayItemId}`;
    link.target = "_blank";
    link.textContent = "↗";
    link.title = "Ver en Monday";
    link.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;width:0;opacity:0;overflow:hidden;font-size:11px;font-weight:700;color:#fff;background:#2E7D32;border-radius:0 4px 4px 0;text-decoration:none;transition:width 0.25s cubic-bezier(0.4,0,0.2,1),opacity 0.25s ease,padding 0.25s ease;padding:4px 0;margin-left:-1px;cursor:pointer;height:100%;box-sizing:border-box;vertical-align:middle;";
    link.addEventListener("click", (e) => e.stopPropagation());
    return link;
  }
  const createCopyButton = SP_DetailView.createCopyButton;

  function createButton(ticketId: string | number) {
    const btn = document.createElement("button");
    btn.className = BTN_CLASS;
    btn.textContent = "🙂 Migrar";
    btn.title = "Migrar a Monday";
    btn.style.cssText =
      "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #D94040;border-radius:4px;background:#D94040;color:#fff;margin-left:6px;white-space:nowrap;";
    hoverText(btn, "🙂 Migrar", "🫡 Migrar");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.textContent = "⏳";
      btn.disabled = true;
      void handleMondayClick(ticketId).finally(() => {
        btn.textContent = "🙂 Migrar";
        btn.disabled = false;
      });
    });
    return btn;
  }

  // ─── Team areas ───────────────────────────────────────────────
  const TEAM_AREAS: Record<
    number,
    {
      resolutionGroupId: number;
      resolutionGroupLabel: string;
      profiles: AnyObj[];
    }
  > = {};
  GROUP_INFO.forEach((g) => {
    TEAM_AREAS[g.id] = {
      resolutionGroupId: g.id,
      resolutionGroupLabel: g.name,
      profiles: [],
    };
  });
  let currentTeamArea = "";

  function isMultiGroup() {
    return currentUserGroups.length > 1;
  }
  function getTeamConfig() {
    return (
      TEAM_AREAS[parseInt(currentTeamArea)] ||
      TEAM_AREAS[currentUserGroups[0]] || {
        resolutionGroupId: currentUserGroups[0] || 0,
        resolutionGroupLabel: "",
        profiles: [],
      }
    );
  }
  function getActiveAreas() {
    return currentUserGroups.map((gId) => TEAM_AREAS[gId]).filter(Boolean);
  }
  function getLoggedUserName() {
    const el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
    return el ? (el.textContent?.trim() ?? "") : "";
  }
  function getLoggedUserEmail() {
    return SP_Session.state.userEmail || "";
  }
  function highlightMyRows() {
    const myName = getLoggedUserName();
    if (!myName) return;
    document
      .querySelectorAll<HTMLElement>(".MuiDataGrid-row")
      .forEach((row) => {
        if (row.classList.contains(HIGHLIGHT_CLASS)) return;
        const cell = row.querySelector<HTMLElement>(
          '[data-field="responsibleName"]',
        );
        if (cell && cell.textContent?.trim() === myName) {
          row.classList.add(HIGHLIGHT_CLASS);
          row.style.position = "relative";
          const indicator = document.createElement("span");
          indicator.textContent = "❗";
          indicator.style.cssText =
            "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
          row.appendChild(indicator);
        }
      });
  }
  function colorRowsByStatus() {
    SP_RowColors.colorRows();
  }

  // ─── Profile cache ────────────────────────────────────────────
  const profilesCache: Record<number, AnyObj[]> = {};
  const _pendingProfileRequests: Record<number, Promise<AnyObj[]>> = {};
  function loadProfilesForGroup(groupId: number): Promise<AnyObj[]> {
    if (profilesCache[groupId]) return Promise.resolve(profilesCache[groupId]);
    if (Object.prototype.hasOwnProperty.call(_pendingProfileRequests, groupId))
      return _pendingProfileRequests[groupId];
    const spToken = localStorage.getItem("token");
    if (!spToken) return Promise.resolve([]);
    const p = fetch(
      `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${groupId}`,
      { headers: spGetHeaders() },
    )
      .then((r) => r.json())
      .then((json: AnyObj) => {
        let profiles: AnyObj[] = json.data || json;
        if (!Array.isArray(profiles)) profiles = [];
        const blacklist: number[] =
          (_userConfig.blacklist as unknown as number[]) || [];
        const applyBlacklist = (bl: number[]) => {
          if (bl.length > 0)
            profiles = profiles.filter(
              (p) => !bl.includes(p.profileId || p.id),
            );
          profilesCache[groupId] = profiles;
          if (TEAM_AREAS[groupId]) TEAM_AREAS[groupId].profiles = profiles;
          return profiles;
        };
        if (blacklist.length > 0) return applyBlacklist(blacklist);
        return new Promise<AnyObj[]>((resolve) => {
          chrome.storage.local.get("userConfig", (stored: AnyObj) => {
            resolve(
              applyBlacklist(
                ((stored["userConfig"] || {})
                  .blacklist as unknown as number[]) || [],
              ),
            );
          });
        });
      })
      .catch(() => {
        delete _pendingProfileRequests[groupId];
        return [] as AnyObj[];
      })
      .then((r: AnyObj[]) => {
        delete _pendingProfileRequests[groupId];
        return r;
      });
    _pendingProfileRequests[groupId] = p;
    return p;
  }

  function loadTeamArea(): Promise<void> {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get("teamArea", (result: AnyObj) => {
          const val: string = result["teamArea"] || "";
          if (val) currentTeamArea = val;
          void SP_Session.resolveProfileId();
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  // ─── My profile ID ────────────────────────────────────────────
  let myProfileId: number | null = null;
  async function getMyProfileId(): Promise<number | null> {
    if (sessionProfileId) return sessionProfileId;
    if (myProfileId) return myProfileId;
    const spToken = getToken();
    if (!spToken) return null;
    const myName = getLoggedUserName();
    const myEmail = getLoggedUserEmail();
    if (!myName && !myEmail) return null;
    try {
      const res = await fetch(
        `${SP_CONFIG.SP_API}/active-profiles-by-resolution-group/${getTeamConfig().resolutionGroupId}`,
        { headers: spGetHeaders() },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as AnyObj;
      const profiles: AnyObj[] = json.data || json;
      let found: AnyObj | undefined;
      if (myEmail)
        found = profiles.find(
          (p) => p.email && p.email.toLowerCase() === myEmail.toLowerCase(),
        );
      if (!found && myName)
        found = profiles.find((p) => p.profileFullName === myName);
      if (!found && myName) {
        const nameLower = myName.toLowerCase();
        found = profiles.find((p) => {
          const full = (p.profileFullName || "").toLowerCase();
          const parts = nameLower.split(/\s+/);
          return (
            parts.filter((w: string) => w.length > 2 && full.includes(w))
              .length >= 2
          );
        });
      }
      if (found) {
        myProfileId = found.profileId;
        sessionProfileId = found.profileId;
      }
      return myProfileId;
    } catch {
      return null;
    }
  }

  // ─── Ticket info / summary ────────────────────────────────────
  async function fetchTicketInfo(
    ticketId: number | string,
  ): Promise<AnyObj | null> {
    const spToken = getToken();
    if (!spToken) return null;
    try {
      const res = await fetch(`${SP_API}/${ticketId}`, {
        headers: spGetHeaders(),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as AnyObj;
      const t: AnyObj = json.data || json;
      return {
        uniqueCode: t.uniqueCode || "N/A",
        subject: t.subject || "Sin asunto",
        desc: (t.description || "").replace(/<[^>]*>/g, "").substring(0, 200),
        holder: t.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar",
        holderEmail: t.ticketHolder?.ticketHolderLog?.email || "",
        priority: t.incidentPriority?.name || "",
        status: t.ticketStatus?.name || "",
        requester: t.ticketInfo?.fullName || "",
        createdAt: t.createdAt || "",
        createdAtFormatted: t.createdAt
          ? t.createdAt.replace("T", " ").substring(0, 16)
          : "",
      };
    } catch {
      return null;
    }
  }

  function ticketSummaryHTML(info: AnyObj | null): string {
    if (!info) return "";
    const fullText = (info.subject || "") + " " + (info.desc || "");
    const detections = SP_DetailView.detectAll(fullText);
    const cardBorderColor = STATUS_TEXT_COLORS[info.status] || "#2196F3";
    const rowStyle =
      "padding:10px 14px;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;gap:8px;";
    const card =
      `<div style="border:2px solid ${cardBorderColor};border-top:5px solid ${cardBorderColor};border-radius:10px;overflow:hidden;margin-bottom:16px;font-size:13px;font-family:system-ui;background:#fff;">` +
      `<div style="${rowStyle}justify-content:space-between;"><span>📁 <b>Folio:</b> <span style="color:#1976D2;font-weight:700;">${info.uniqueCode}</span></span><span>📅 <b>Fecha:</b> ${info.createdAtFormatted || "N/A"}</span></div>` +
      `<div style="${rowStyle}"><span>✉️ <b>Asunto:</b> ${info.subject}</span></div>` +
      `<div style="${rowStyle}"><span>👤 <b>Solicitante:</b> ${info.requester || "N/A"}</span></div>` +
      `<div style="${rowStyle}"><span>🔍 <b>Analista:</b> ${info.holder}${info.holderEmail ? ` <span style="color:#888;">(${info.holderEmail})</span>` : ""}</span></div>` +
      `<div style="${rowStyle}"><span>✅ <b>Estatus:</b> <span style="color:${STATUS_TEXT_COLORS[info.status] || "#333"};font-weight:700;">${info.status || "N/A"}</span></span></div>` +
      (info.desc
        ? `<div style="${rowStyle}flex-direction:column;align-items:flex-start;"><b>📝 Descripción:</b><div style="margin-top:4px;max-height:60px;overflow:auto;font-size:12px;color:#555;width:100%;">${info.desc}</div></div>`
        : "") +
      "</div>";
    const slHTML =
      detections.slCodes.length && _canShowLabels
        ? `<div style="margin-bottom:8px;padding:8px 10px;background:#E3F2FD;border-radius:6px;border-left:4px solid #1976D2;"><b style="font-size:11px;color:#1976D2;">📋 SL/PR detectadas:</b> ${detections.slCodes.map((sl) => `<span class="sp-sl-copy" data-sl="${sl}" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #1976D2;border-radius:4px;font-weight:600;font-size:12px;">${sl}</span>`).join("")}</div>`
        : "";
    const userHTML = detections.users.length
      ? `<div style="margin-bottom:8px;padding:8px 10px;background:#FFF3E0;border-radius:6px;border-left:4px solid #E65100;"><b style="font-size:11px;color:#E65100;">🖥️ Usuarios detectados:</b> ${detections.users.map((u) => `<span class="sp-user-copy" data-user="${u}" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #E65100;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">${u}</span>`).join("")}</div>`
      : "";
    const dbHTML =
      detections.dbObjects.length && _canShowLabels
        ? `<div style="margin-bottom:8px;padding:8px 10px;background:#E8F5E9;border-radius:6px;border-left:4px solid #2E7D32;"><b style="font-size:11px;color:#2E7D32;">🗄️ Objetos de BD:</b> ${detections.dbObjects.map((obj) => `<span class="sp-db-copy" data-db="${obj}" style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;border:1px solid #2E7D32;border-radius:4px;font-weight:600;font-size:12px;font-family:monospace;">${obj}</span>`).join("")}</div>`
        : "";
    return card + slHTML + userHTML + dbHTML;
  }

  function injectSLCopyButtons(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>(".sp-sl-copy").forEach((span) => {
      if (!span.querySelector(".sp-copy-btn")) {
        const sl = span.dataset["sl"];
        if (sl) span.appendChild(createCopyButton(sl));
      }
    });
    container.querySelectorAll<HTMLElement>(".sp-user-copy").forEach((span) => {
      if (!span.querySelector(".sp-copy-btn")) {
        const u = span.dataset["user"];
        if (u) span.appendChild(createCopyButton(u));
      }
    });
    container.querySelectorAll<HTMLElement>(".sp-db-copy").forEach((span) => {
      if (!span.querySelector(".sp-copy-btn")) {
        const db = span.dataset["db"];
        if (db) span.appendChild(createCopyButton(db));
      }
    });
  }

  // ─── Ticket table renderer ────────────────────────────────────
  function renderTicketCards(
    container: HTMLElement,
    tickets: AnyObj[],
    myName: string,
    synced: Record<string, string>,
    _boardDate: { month: number; year: number } | null,
  ) {
    let html =
      '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:rgba(0,0,0,0.05);text-align:left;"><th style="padding:6px;">Folio</th><th style="padding:6px;">Fecha</th><th style="padding:6px;">Asunto</th><th style="padding:6px;">Solicitante</th><th style="padding:6px;">Estado</th><th style="padding:6px;">Analista</th><th style="padding:6px;min-width:200px;">Acciones</th></tr></thead><tbody>';
    tickets.forEach((t: AnyObj) => {
      const statusColor = STATUS_COLORS[t.ticketStatusName] || "transparent";
      const textColor = STATUS_TEXT_COLORS[t.ticketStatusName] || "#333";
      const date = (t.createdAt || "").replace("T", " ").substring(0, 16);
      const subject =
        (t.subject || "").substring(0, 40) +
        ((t.subject || "").length > 40 ? "..." : "");
      html += `<tr style="background:${statusColor};border-bottom:1px solid #eee;">`;
      html += `<td style="padding:6px;font-weight:600;white-space:nowrap;"><a href="/es/dashboard/tickets/${t.id}" target="_blank" style="color:inherit;text-decoration:none;">${t.uniqueCode || t.id}</a><span class="sp-card-copy" data-code="${t.uniqueCode || ""}"></span></td>`;
      html += `<td style="padding:6px;font-size:11px;">${date}</td><td style="padding:6px;" title="${esc(t.subject || "")}">${subject}</td><td style="padding:6px;">${t.requesterName || ""}</td>`;
      html += `<td style="padding:6px;font-size:11px;font-weight:700;color:${textColor};">${t.ticketStatusName || ""}</td><td style="padding:6px;">${t.responsibleName || "Sin asignar"}</td>`;
      html += `<td style="padding:8px;white-space:nowrap;display:flex;align-items:center;gap:6px;flex-wrap:wrap;" class="sp-card-actions" data-id="${t.id}" data-status="${t.ticketStatusName || ""}" data-responsible="${t.responsibleName || ""}" data-code="${t.uniqueCode || ""}"></td></tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
    container.querySelectorAll<HTMLElement>(".sp-card-copy").forEach((span) => {
      const code = span.dataset["code"];
      if (code) span.appendChild(createCopyButton(code));
    });
    container
      .querySelectorAll<HTMLElement>(".sp-card-actions")
      .forEach((cell) => {
        const id = cell.dataset["id"] || "";
        const status = cell.dataset["status"] || "";
        const responsible = cell.dataset["responsible"] || "";
        const code = cell.dataset["code"] || "";
        if (status === "En espera") cell.appendChild(createTakeButton(id));
        if (
          (status === "Asignado" || status === "En atención") &&
          responsible &&
          myName &&
          responsible === myName
        )
          cell.appendChild(createCloseButton(id));
        if (
          (status === "Asignado" || status === "En atención") &&
          responsible &&
          myName &&
          responsible !== myName
        )
          cell.appendChild(createStealButton(id, responsible));
        if (status === "Cerrado" && code && synced[code])
          cell.appendChild(createSyncedBadge(synced[code]));
        const link = document.createElement("a");
        link.href = `/es/dashboard/tickets/${id}`;
        link.target = "_blank";
        link.textContent = "Ir al ticket";
        link.style.cssText =
          "display:inline-block;padding:4px 12px;background:#2196F3;color:#fff;font-size:11px;font-weight:600;text-decoration:none;border-radius:4px;white-space:nowrap;";
        cell.appendChild(link);
      });
  }

  // ─── Action buttons ───────────────────────────────────────────
  function createTakeButton(ticketId: string | number) {
    const btn = document.createElement("button");
    btn.className = TAKE_BTN_CLASS;
    btn.textContent = "🤚 Tomar";
    btn.title = "Tomar ticket";
    btn.style.cssText =
      "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #1976D2;border-radius:4px;background:#1976D2;color:#fff;margin-left:6px;white-space:nowrap;";
    hoverText(btn, "🤚 Tomar", "✊ Tomar");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.disabled = true;
      const origText = btn.textContent ?? "";
      btn.innerHTML = spinnerHTML(12);
      await showTakeModal(ticketId, btn);
      btn.textContent = origText;
      btn.disabled = false;
    });
    return btn;
  }
  function createStealButton(
    ticketId: string | number,
    responsibleName?: string,
  ) {
    const btn = document.createElement("button");
    btn.className = STEAL_BTN_CLASS;
    btn.textContent = "🥷 Robar";
    btn.title = responsibleName
      ? `Asignado a: ${responsibleName}`
      : "Robar ticket";
    btn.style.cssText =
      "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #E65100;border-radius:4px;background:#E65100;color:#fff;margin-left:6px;white-space:nowrap;";
    hoverText(btn, "🥷 Robar", "💀 Robar");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.disabled = true;
      const origText = btn.textContent ?? "";
      btn.innerHTML = spinnerHTML(12);
      await showTakeModal(ticketId, btn);
      btn.textContent = origText;
      btn.disabled = false;
    });
    return btn;
  }
  function createCloseButton(ticketId: string | number) {
    const btn = document.createElement("button");
    btn.className = CLOSE_BTN_CLASS;
    btn.textContent = "🔒 Cerrar";
    btn.title = "Cerrar ticket";
    btn.style.cssText =
      "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #616161;border-radius:4px;background:#616161;color:#fff;margin-left:6px;white-space:nowrap;";
    hoverText(btn, "🔒 Cerrar", "🔐 Cerrar");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.disabled = true;
      const origText = btn.textContent ?? "";
      btn.innerHTML = spinnerHTML(12);
      await showCloseModal(ticketId, btn);
      btn.textContent = origText;
      btn.disabled = false;
    });
    return btn;
  }

  // ─── Monday helpers ───────────────────────────────────────────
  async function ensureTicketInMonday(
    ticketId: number | string,
    uniqueCode: string,
  ): Promise<boolean> {
    if (!uniqueCode) return false;
    const mondayToken = await SP_API_Lib.getMondayToken();
    if (!mondayToken) return false;
    const cached = getCache() || {};
    if (cached[uniqueCode]) return true;
    const existingId = (await (SP_API_Lib as AnyObj).checkTicketInMonday?.(
      mondayToken,
      uniqueCode,
    )) as string | null;
    if (existingId) {
      addToCache(uniqueCode, existingId);
      return true;
    }
    try {
      const spToken = getToken();
      if (!spToken) return false;
      const res = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      });
      if (!res.ok) return false;
      const json = (await res.json()) as AnyObj;
      const t: AnyObj = json.data || json;
      const ticketDate = new Date(t.createdAt);
      const boardId = await getMondayBoardForMonth(
        ticketDate.getFullYear(),
        ticketDate.getMonth(),
      );
      if (!boardId) return false;
      const boardData = await SP_API_Lib.mondayQuery(
        mondayToken,
        "query ($boardId: [ID!]!) { boards(ids: $boardId) { id groups { id title } } }",
        { boardId },
      );
      const boards = boardData.boards || [];
      if (!boards.length) return false;
      const department: string =
        (t.ticketInfo && t.ticketInfo.departmentName) || "Macropay";
      const boardGroups: AnyObj[] = boards[0].groups || [];
      let targetGroup = boardGroups.find(
        (g: AnyObj) =>
          g.title.trim().toLowerCase() === department.trim().toLowerCase(),
      );
      let groupId: string;
      if (targetGroup) {
        groupId = targetGroup.id;
      } else {
        const createGroupRes = await SP_API_Lib.mondayQuery(
          mondayToken,
          "mutation ($boardId: ID!, $groupName: String!) { create_group(board_id: $boardId, group_name: $groupName) { id } }",
          { boardId, groupName: department },
        );
        groupId = createGroupRes.create_group?.id ?? "";
        if (!groupId) return false;
      }
      const url = `${BASE_URL}/${ticketId}`;
      const desc = (t.description || "").replace(/<[^>]*>/g, "");
      const itemName: string = t.subject || "Sin asunto";
      const createdDate = ticketDate.toISOString().slice(0, 10);
      const spPriority: string = (
        t.incidentPriorityName ||
        (t.incidentPriority && t.incidentPriority.name) ||
        ""
      )
        .toLowerCase()
        .trim();
      const priorityIndex: number =
        PRIORITY_MAP[spPriority] !== undefined
          ? PRIORITY_MAP[spPriority]
          : PRIORITY_MAP["medio"];
      const holderEmail: string = t.ticketHolder?.ticketHolderLog
        ? t.ticketHolder.ticketHolderLog.email || ""
        : "";
      let personValue: AnyObj = {};
      if (holderEmail) {
        const users = await SP_API_Lib.getMondayUsers(mondayToken);
        const userId = users[holderEmail.toLowerCase()];
        if (userId)
          personValue = {
            personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
          };
      }
      const columnValues = JSON.stringify({
        descripci_n_mkn9e5f4: { text: desc },
        ...(personValue.personsAndTeams
          ? { multiple_person_mm25nvfq: personValue }
          : {}),
        status: { index: 1 },
        priority_mkn9kbe9: { index: priorityIndex },
        cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
        link_mknkdctz: { url, text: uniqueCode || url },
        text_mm2c9nhc: uniqueCode || String(ticketId),
        text_mm44vbfc: String(ticketId),
      });
      const result = await SP_API_Lib.mondayQuery(
        mondayToken,
        "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
        { boardId, groupId, itemName, columnValues },
      );
      if (result.create_item?.id) {
        addToCache(uniqueCode, result.create_item.id);
        return true;
      }
    } catch (e) {
      SP_Log.warn("ensureTicketInMonday failed:", (e as Error).message);
    }
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function updateMondayPerson(
    ticketId: number | string,
    uniqueCode: string,
    analystEmail: string,
  ) {
    try {
      const mondayToken = await SP_API_Lib.getMondayToken();
      if (!mondayToken || !analystEmail) return;
      const code = uniqueCode || String(ticketId);
      await ensureTicketInMonday(ticketId, code);
      await SP_MondayUtils.updateMondayPerson(mondayToken, code, analystEmail);
      SP_Log.info("Monday person updated:", code, "->", analystEmail);
    } catch (e) {
      SP_Log.warn("Monday person update failed:", (e as Error).message);
    }
  }

  async function updateMondayStatus(
    ticketId: number | string,
    uniqueCode: string,
    newStatusName: string,
  ) {
    try {
      const mondayToken = await SP_API_Lib.getMondayToken();
      if (!mondayToken) return;
      const code = uniqueCode || String(ticketId);
      await ensureTicketInMonday(ticketId, code);
      await SP_MondayUtils.updateMondayStatus(mondayToken, code, newStatusName);
      SP_Log.info("Monday status updated:", code, "->", newStatusName);
    } catch (e) {
      SP_Log.warn("Monday status update failed:", (e as Error).message);
    }
  }

  // ─── showTakeModal ───────────────────────────────────────────
  async function showTakeModal(
    ticketId: number | string,
    originalBtn: HTMLButtonElement,
  ) {
    document.getElementById("sp-take-modal")?.remove();
    const info = await fetchTicketInfo(ticketId);
    const summaryHTML = ticketSummaryHTML(info);
    const mondayToken = await getMondayToken();
    const boardId = await getMondayBoardId();
    let groups: AnyObj[] = [];
    if (mondayToken && boardId) {
      try {
        const gData = await mondayQuery(
          mondayToken,
          "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
          { boardId },
        );
        groups = gData.boards?.[0]?.groups || [];
      } catch {
        /* ignore */
      }
    }
    const groupOpts =
      '<option value="">-- No migrar --</option>' +
      groups
        .map((g: AnyObj) => `<option value="${g.id}">${g.title}</option>`)
        .join("");
    const m = SP_Modal.info({
      id: "sp-take-modal",
      title: `🤚 Tomar ticket #${ticketId}`,
      content:
        summaryHTML +
        '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario al tomar</label>' +
        '<textarea id="sp-take-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="se revisa"></textarea>' +
        '<div style="margin-bottom:12px;"><label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="sp-take-done"> <b>Ticket realizado</b></label></div>' +
        '<div id="sp-take-migrate-section" style="display:none;margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Migrar a Monday (opcional)</label><select id="sp-take-group" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:8px;">' +
        groupOpts +
        "</select></div>" +
        '<div id="sp-take-close-comment-section" style="display:none;margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario antes de cerrar (opcional)</label><textarea id="sp-take-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;" placeholder="Comentario de cierre..."></textarea></div>' +
        '<div id="sp-take-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
        '<div style="display:flex;gap:8px;"><button id="sp-take-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">✊ Tomar ticket</button><button id="sp-take-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>',
      maxWidth: "420px",
    });
    const overlay = m.overlay;
    injectSLCopyButtons(overlay);
    const confirmBtn = document.getElementById(
      "sp-take-confirm",
    ) as HTMLButtonElement;
    const cancelBtn = document.getElementById(
      "sp-take-cancel",
    ) as HTMLButtonElement;
    const doneCheck = document.getElementById(
      "sp-take-done",
    ) as HTMLInputElement;
    const migrateSection = document.getElementById(
      "sp-take-migrate-section",
    ) as HTMLElement;
    const closeCommentSection = document.getElementById(
      "sp-take-close-comment-section",
    ) as HTMLElement;
    const takeGroupSelect = document.getElementById(
      "sp-take-group",
    ) as HTMLSelectElement;

    doneCheck.addEventListener("change", () => {
      migrateSection.style.display = doneCheck.checked ? "block" : "none";
      closeCommentSection.style.display = doneCheck.checked ? "block" : "none";
      confirmBtn.textContent =
        doneCheck.checked && takeGroupSelect.value
          ? "Tomar, cerrar y migrar"
          : doneCheck.checked
            ? "Tomar y cerrar"
            : "✊ Tomar ticket";
    });
    takeGroupSelect.addEventListener("change", () => {
      if (doneCheck.checked)
        confirmBtn.textContent = takeGroupSelect.value
          ? "Tomar, cerrar y migrar"
          : "Tomar y cerrar";
    });
    cancelBtn.addEventListener("click", m.close);
    confirmBtn.addEventListener("click", async () => {
      const comment =
        (
          document.getElementById("sp-take-comment") as HTMLTextAreaElement
        ).value.trim() || "se revisa";
      const closeComment = doneCheck.checked
        ? (
            document.getElementById(
              "sp-take-close-comment",
            ) as HTMLTextAreaElement
          ).value.trim()
        : "";
      overlay.remove();
      originalBtn.disabled = true;
      originalBtn.innerHTML = spinnerHTML(12);
      showLoadingToast("Tomando ticket...");
      const profileId = await getMyProfileId();
      if (!profileId) {
        showErrorToast("No se pudo obtener tu perfil");
        originalBtn.textContent = "🤚 Tomar";
        originalBtn.disabled = false;
        return;
      }
      try {
        const body: AnyObj = {
          resolutionGroupId: getTeamConfig().resolutionGroupId,
          serviceId: null,
          responsibleProfileId: profileId,
          resolutionGroup: {
            label: getTeamConfig().resolutionGroupLabel,
            value: getTeamConfig().resolutionGroupId,
          },
          ticketCommentRequest: { internal: false, content: comment },
        };
        const res = await fetch(`${SP_API}/reassign/${ticketId}`, {
          method: "PUT",
          headers: spHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnyObj;
        if (json.success) {
          if (doneCheck.checked) {
            if (!isWithinWorkHours()) {
              const stored = await new Promise<AnyObj>((r) =>
                chrome.storage.local.get(["usersMap", "userEmail"], (d) =>
                  r(d as AnyObj),
                ),
              );
              const pEmail = (
                (stored["userEmail"] as string) || ""
              ).toLowerCase();
              const pUser = ((stored["usersMap"] as AnyObj) || {})[pEmail];
              if (pUser?.idUsuario)
                await saveTicketPendingClose(
                  info?.uniqueCode || `T${ticketId}`,
                  ticketId as number,
                  String(pUser.idUsuario),
                  "",
                );
              showSuccessToast(
                "Ticket tomado. Cierre pendiente (fuera de horario).",
              );
              originalBtn.textContent = "✅ Tomado";
              originalBtn.disabled = false;
              return;
            }
            if (closeComment)
              await fetch(`${SP_API}/comment/${ticketId}`, {
                method: "POST",
                headers: spHeaders(),
                body: JSON.stringify({
                  content: `<p>${closeComment}</p>`,
                  internal: false,
                }),
              });
            const closeRes = await fetch(
              `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
              {
                method: "PATCH",
                headers: spHeaders(),
                body: JSON.stringify({
                  nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                  ticketCommentRequest: null,
                }),
              },
            );
            if (!closeRes.ok)
              throw new Error(`Error al cerrar: HTTP ${closeRes.status}`);
            const selectedGroup = takeGroupSelect.value;
            const canMigrateTake = selectedGroup
              ? await canMigrateTicket(info?.createdAt || "")
              : false;
            if (selectedGroup && canMigrateTake && mondayToken && boardId) {
              const tRes = await fetch(`${SP_API}/${ticketId}`, {
                headers: spGetHeaders(),
              });
              const tJson = (await tRes.json()) as AnyObj;
              const ticket: AnyObj = tJson.data || tJson;
              await SP_MondayUtils.createMondayItem(mondayToken, {
                boardId,
                groupId: selectedGroup,
                ticket: ticket as unknown as import("./types").SpTicket,
              });
            }
            showSuccessToast(
              selectedGroup && canMigrateTake
                ? "Ticket tomado, cerrado y migrado"
                : "Ticket tomado y cerrado",
            );
          } else {
            const newCloseBtn = createCloseButton(ticketId);
            originalBtn.replaceWith(newCloseBtn);
            showSuccessToast("Ticket tomado");
          }
        } else throw new Error("No success");
      } catch (err) {
        showErrorToast(`Error: ${(err as Error).message}`);
        originalBtn.textContent = "🤚 Tomar";
        originalBtn.disabled = false;
      }
    });
  }

  // ─── showCloseModal ───────────────────────────────────────────
  async function showCloseModal(
    ticketId: number | string,
    originalBtn: HTMLButtonElement,
  ) {
    document.getElementById("sp-close-modal-single")?.remove();
    const mondayToken = await getMondayToken();
    const boardId = await getMondayBoardId();
    const [info, groupsData] = await Promise.all([
      fetchTicketInfo(ticketId),
      mondayToken && boardId
        ? mondayQuery(
            mondayToken,
            "query ($boardId: [ID!]!) { boards(ids: $boardId) { name groups { id title } } }",
            { boardId },
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    const summaryHTML = ticketSummaryHTML(info);
    const groups: AnyObj[] = (groupsData as AnyObj)?.boards?.[0]?.groups || [];
    const groupOpts =
      '<option value="">-- Selecciona destino --</option>' +
      groups
        .map((g: AnyObj) => `<option value="${g.id}">${g.title}</option>`)
        .join("");
    const m = SP_Modal.info({
      id: "sp-close-modal-single",
      title: `🔒 Cerrar ticket #${ticketId}`,
      content:
        summaryHTML +
        '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Destino en Monday (opcional)</label>' +
        `<select id="sp-close-group" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:12px;">${groupOpts}</select>` +
        '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario (opcional)</label>' +
        '<textarea id="sp-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe un comentario..."></textarea>' +
        '<div id="sp-close-msg" style="font-size:13px;margin-bottom:12px;min-height:20px;"></div>' +
        '<div style="display:flex;gap:8px;"><button id="sp-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;">🔐 Cerrar ticket</button><button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>',
      maxWidth: "420px",
    });
    const overlay = m.overlay;
    injectSLCopyButtons(overlay);
    const confirmBtn = document.getElementById(
      "sp-close-confirm",
    ) as HTMLButtonElement;
    const cancelBtn = document.getElementById(
      "sp-close-cancel",
    ) as HTMLButtonElement;
    const groupSelect = document.getElementById(
      "sp-close-group",
    ) as HTMLSelectElement;
    groupSelect.addEventListener("change", () => {
      confirmBtn.innerHTML = groupSelect.value
        ? "🔐 Cerrar y migrar"
        : "🔐 Cerrar ticket";
    });
    cancelBtn.addEventListener("click", m.close);
    confirmBtn.addEventListener("click", async () => {
      const selectedGroup = groupSelect.value;
      const commentText = (
        document.getElementById("sp-close-comment") as HTMLTextAreaElement
      ).value.trim();
      overlay.remove();
      originalBtn.disabled = true;
      originalBtn.innerHTML = spinnerHTML(12);
      showLoadingToast(
        selectedGroup ? "Cerrando y migrando..." : "Cerrando ticket...",
      );
      try {
        if (commentText) {
          const cr = await fetch(`${SP_API}/comment/${ticketId}`, {
            method: "POST",
            headers: spHeaders(),
            body: JSON.stringify({
              content: `<p>${commentText}</p>`,
              internal: false,
            }),
          });
          if (!cr.ok) throw new Error(`Error al comentar: HTTP ${cr.status}`);
        }
        if (!info?.holder || info.holder === "Sin asignar") {
          const pid = await getMyProfileId();
          if (pid)
            await fetch(`${SP_API}/reassign/${ticketId}`, {
              method: "PUT",
              headers: spHeaders(),
              body: JSON.stringify({
                resolutionGroupId: getTeamConfig().resolutionGroupId,
                serviceId: null,
                responsibleProfileId: pid,
                resolutionGroup: {
                  label: getTeamConfig().resolutionGroupLabel,
                  value: getTeamConfig().resolutionGroupId,
                },
              }),
            });
        }
        const res = await fetch(
          `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
          {
            method: "PATCH",
            headers: spHeaders(),
            body: JSON.stringify({
              nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
              ticketCommentRequest: null,
            }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const canMigrate = selectedGroup
          ? await canMigrateTicket(info?.createdAt || "")
          : false;
        if (selectedGroup && canMigrate && mondayToken && boardId && info) {
          const tRes = await fetch(`${SP_API}/${ticketId}`, {
            headers: spGetHeaders(),
          });
          const tJson = (await tRes.json()) as AnyObj;
          const ticket: AnyObj = tJson.data || tJson;
          await SP_MondayUtils.createMondayItem(mondayToken, {
            boardId,
            groupId: selectedGroup,
            ticket: ticket as unknown as import("./types").SpTicket,
          });
        }
        const row = originalBtn.closest(
          ".MuiDataGrid-row",
        ) as HTMLElement | null;
        originalBtn.replaceWith(createButton(ticketId));
        if (row) {
          row.querySelector("." + STEAL_BTN_CLASS)?.remove();
          row.querySelector("." + CLOSE_BTN_CLASS)?.remove();
          const sc = row.querySelector('[data-field="ticketStatusName"]');
          if (sc) sc.textContent = "Cerrado";
        }
        showSuccessToast(
          selectedGroup ? "Ticket cerrado y migrado" : "Ticket cerrado",
        );
      } catch (err) {
        showErrorToast(`Error: ${(err as Error).message}`);
        originalBtn.textContent = "🔒 Cerrar";
        originalBtn.disabled = false;
      }
    });
  }

  // ─── showReopenModal ──────────────────────────────────────────
  function showReopenModal(ticketId: number | string, currentHolder?: string) {
    document.getElementById("sp-reopen-modal")?.remove();
    const profiles = getTeamConfig().profiles;
    const opts = profiles
      .map(
        (p: AnyObj) =>
          `<option value="${p.profileId}">${esc(p.profileFullName)}</option>`,
      )
      .join("");
    const holderInfo =
      currentHolder && currentHolder !== "Sin asignar"
        ? `<p style="font-size:12px;color:#888;margin:0 0 12px;">Asignado actualmente a: <b>${esc(currentHolder)}</b></p>`
        : "";
    SP_Modal.form({
      id: "sp-reopen-modal",
      title: `🔓 Reabrir ticket #${ticketId}`,
      content: `<p style="font-size:13px;color:#555;margin:0 0 12px;">Al reasignar un ticket cerrado a otra persona, se reabrirá automáticamente.</p>${holderInfo}<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Reasignar a:</label><select id="sp-reopen-person" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;"><option value="">-- Selecciona --</option>${opts}</select>`,
      submitText: "🔄 Reabrir",
      submitColor: "#FF8F00",
      maxWidth: "400px",
      onSubmit: async (api) => {
        const personId = (
          api.getElement?.("#sp-reopen-person") as HTMLSelectElement
        )?.value;
        if (!personId) {
          showErrorToast("Selecciona a quién reasignar.");
          return;
        }
        api.close();
        showLoadingToast("Reabriendo ticket...");
        try {
          const res = await fetch(`${SP_API}/reassign/${ticketId}`, {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              resolutionGroupId: getTeamConfig().resolutionGroupId,
              serviceId: null,
              responsibleProfileId: parseInt(personId),
              resolutionGroup: {
                label: getTeamConfig().resolutionGroupLabel,
                value: getTeamConfig().resolutionGroupId,
              },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as AnyObj;
          if (json.success) {
            showSuccessToast("Ticket reabierto y reasignado");
            setTimeout(() => window.location.reload(), 1500);
          } else throw new Error("No se pudo reabrir");
        } catch (err) {
          showErrorToast(`Error: ${(err as Error).message}`);
        }
      },
    });
  }

  // ─── showReassignAppModal ─────────────────────────────────────
  function showReassignAppModal(ticketId: number | string) {
    SP_Modal.confirm({
      id: "sp-reassign-app-modal",
      title: "⚠️ Reasignar a Aplicaciones",
      message: "Este ticket será reasignado al equipo de Aplicaciones.",
      description: "El ticket dejará de estar bajo nuestra responsabilidad.",
      confirmText: "Sí, reasignar",
      confirmColor: "#C62828",
      onConfirm: async (api) => {
        api.close();
        showLoadingToast("Tomando ticket para reasignar...");
        try {
          const profileId = await getMyProfileId();
          if (!profileId) throw new Error("No se pudo obtener tu perfil");
          const takeRes = await fetch(`${SP_API}/reassign/${ticketId}`, {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              resolutionGroupId: getTeamConfig().resolutionGroupId,
              serviceId: null,
              responsibleProfileId: profileId,
              resolutionGroup: {
                label: getTeamConfig().resolutionGroupLabel,
                value: getTeamConfig().resolutionGroupId,
              },
            }),
          });
          if (!takeRes.ok)
            throw new Error(`Error al tomar: HTTP ${takeRes.status}`);
          const takeJson = (await takeRes.json()) as AnyObj;
          if (!takeJson.success) throw new Error("No se pudo tomar el ticket");
          showLoadingToast("Reasignando a Aplicaciones...");
          const res = await fetch(`${SP_API}/reassign/${ticketId}`, {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              ticketCommentRequest: {
                internal: false,
                content: "Se reasigna ticket",
              },
              resolutionGroupId: SP_CONFIG.APPS_GROUP.id,
              serviceId: null,
              responsibleProfileId: null,
              resolutionGroup: {
                label: SP_CONFIG.APPS_GROUP.label,
                value: SP_CONFIG.APPS_GROUP.id,
              },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as AnyObj;
          if (!json.success) throw new Error("No success");
          SP_Modal.success({
            id: "sp-reassign-success",
            title: "✅ Ticket reasignado",
            message: "El ticket fue reasignado a Aplicaciones exitosamente.",
            buttons: [
              {
                text: "Aceptar",
                color: "#2E7D32",
                onClick: () => {
                  window.location.href = "/es/dashboard/tickets-mesa";
                },
              },
            ],
          });
        } catch (err) {
          showErrorToast(`Error: ${(err as Error).message}`);
        }
      },
    });
  }

  // ─── Bulk close ───────────────────────────────────────────────
  function getAssignedRows(): Array<{
    ticketId: string;
    code: string;
    subject: string;
    responsible: string;
    row: HTMLElement;
  }> {
    const rows: Array<{
      ticketId: string;
      code: string;
      subject: string;
      responsible: string;
      row: HTMLElement;
    }> = [];
    document
      .querySelectorAll<HTMLElement>(".MuiDataGrid-row")
      .forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const statusCell = row.querySelector<HTMLElement>(
          '[data-field="ticketStatusName"]',
        );
        if (!statusCell || statusCell.textContent?.trim() !== "Asignado")
          return;
        rows.push({
          ticketId,
          code:
            row
              .querySelector<HTMLElement>('[data-field="uniqueCode"]')
              ?.textContent?.trim() || ticketId,
          subject:
            row
              .querySelector<HTMLElement>('[data-field="subject"]')
              ?.textContent?.trim() || "",
          responsible:
            row
              .querySelector<HTMLElement>('[data-field="responsibleName"]')
              ?.textContent?.trim() || "",
          row,
        });
      });
    return rows;
  }

  async function handleBulkClose() {
    const bulkCloseBtn = document.getElementById(
      BULK_CLOSE_BTN_ID,
    ) as HTMLButtonElement | null;
    if (bulkCloseBtn) {
      bulkCloseBtn.disabled = true;
      bulkCloseBtn.innerHTML = spinnerHTML(14, "Cargando...");
    }
    const restore = () => {
      if (bulkCloseBtn) {
        bulkCloseBtn.disabled = false;
        bulkCloseBtn.textContent = "🔒 Cerrar varios";
      }
    };
    if (!getToken()) {
      restore();
      alert("No se encontro token de SupportPlus.");
      return;
    }
    const assigned = getAssignedRows();
    if (!assigned.length) {
      restore();
      alert("No hay tickets asignados en esta pagina.");
      return;
    }
    restore();
    const ticketRows = assigned
      .map((p, i) => {
        const label =
          p.code +
          (p.subject
            ? " - " +
              p.subject.substring(0, 35) +
              (p.subject.length > 35 ? "..." : "")
            : "");
        const resp = p.responsible
          ? ` <span style="color:#888;font-size:10px;">(${p.responsible})</span>`
          : "";
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;"><input type="checkbox" data-idx="${i}" class="sp-close-check" style="cursor:pointer;"><span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}${resp}</span></div>`;
      })
      .join("");
    const m = SP_Modal.info({
      id: "sp-close-modal",
      title: `🔒 Cerrar tickets (${assigned.length} asignados)`,
      content:
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><label style="font-size:12px;color:#555;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="sp-close-all"> Seleccionar todos</label></div><div style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px;">' +
        ticketRows +
        '</div><div id="sp-close-msg" style="font-size:13px;margin-bottom:8px;min-height:20px;"></div><div style="display:flex;gap:8px;"><button id="sp-close-start" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">🔐 Cerrar seleccionados</button><button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>',
      maxWidth: "560px",
      modalOptions: { maxHeight: "85vh" },
    });
    const overlay = m.overlay;
    (
      document.getElementById("sp-close-all") as HTMLInputElement
    ).addEventListener("change", function (this: HTMLInputElement) {
      overlay
        .querySelectorAll<HTMLInputElement>(".sp-close-check")
        .forEach((cb) => {
          cb.checked = this.checked;
        });
    });
    const startBtn = document.getElementById(
      "sp-close-start",
    ) as HTMLButtonElement;
    const cancelBtn = document.getElementById(
      "sp-close-cancel",
    ) as HTMLButtonElement;
    const msgEl = document.getElementById("sp-close-msg") as HTMLElement;
    cancelBtn.addEventListener("click", m.close);
    startBtn.addEventListener("click", async () => {
      const selected: number[] = [];
      overlay
        .querySelectorAll<HTMLInputElement>(".sp-close-check")
        .forEach((cb) => {
          if (cb.checked) selected.push(parseInt(cb.dataset["idx"] ?? "0"));
        });
      if (!selected.length) {
        msgEl.textContent = "Selecciona al menos un ticket.";
        return;
      }
      startBtn.disabled = true;
      startBtn.style.background = "#999";
      startBtn.innerHTML = spinnerHTML(16, "Cerrando...");
      cancelBtn.style.display = "none";
      let ok = 0,
        fail = 0;
      for (let i = 0; i < selected.length; i++) {
        const t = assigned[selected[i]];
        msgEl.textContent = `Cerrando ${i + 1} / ${selected.length}...`;
        try {
          const res = await fetch(
            `${SP_API}/update-ticket-status-with-optional-comment/${t.ticketId}`,
            {
              method: "PATCH",
              headers: spHeaders(),
              body: JSON.stringify({
                nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                ticketCommentRequest: null,
              }),
            },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          ok++;
          t.row
            .querySelector("." + CLOSE_BTN_CLASS)
            ?.replaceWith(createButton(t.ticketId));
          t.row.querySelector("." + STEAL_BTN_CLASS)?.remove();
        } catch {
          fail++;
        }
      }
      msgEl.textContent = `Completado: ${ok} cerrados, ${fail} errores`;
      startBtn.innerHTML = "✅ Listo";
      startBtn.style.background = "#2E7D32";
      cancelBtn.style.display = "";
      cancelBtn.textContent = "Cerrar";
      cancelBtn.addEventListener("click", () => overlay.remove());
    });
  }

  function injectBulkCloseButton() {
    if (document.getElementById(BULK_CLOSE_BTN_ID)) return;
    const bulkMigrateBtn = document.getElementById(BULK_BTN_ID);
    if (!bulkMigrateBtn) return;
    const parent = bulkMigrateBtn.parentElement;
    if (!parent) return;
    const btn = document.createElement("button");
    btn.id = BULK_CLOSE_BTN_ID;
    btn.textContent = "🔒 Cerrar varios";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#616161;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    hoverText(btn, "🔒 Cerrar varios", "🔐 Cerrar varios");
    btn.addEventListener("click", () => void handleBulkClose());
    parent.insertBefore(btn, bulkMigrateBtn.nextSibling);
  }

  function injectNewTicketButton() {
    if (document.getElementById(NEW_TICKET_BTN_ID)) return;
    const bulkMigrateBtn = document.getElementById(BULK_BTN_ID);
    if (!bulkMigrateBtn) return;
    const parent = bulkMigrateBtn.parentElement;
    if (!parent) return;
    const btn = document.createElement("button");
    btn.id = NEW_TICKET_BTN_ID;
    btn.textContent = "➕ Nuevo ticket";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("click", () => {
      window.location.href = "/es/dashboard/tickets/nuevo";
    });
    parent.insertBefore(btn, bulkMigrateBtn);
  }

  // ─── Bulk migrate button ──────────────────────────────────────
  function injectBulkButton() {
    if (document.getElementById(BULK_BTN_ID)) return;
    let container = document.querySelector<HTMLElement>(
      ".MuiBox-root .MuiStack-root",
    );
    let insertMethod = "prepend";
    if (!container) {
      const searchBtn = document.querySelector<HTMLElement>(
        'button[aria-label="Buscar"]',
      );
      if (searchBtn) {
        container = searchBtn.parentElement;
        insertMethod = "beforeSearch";
      }
    }
    if (!container) return;
    const btn = createHeaderButton({
      id: BULK_BTN_ID,
      icon: "🔄",
      label: "Sync Monday",
      color: "#1565C0",
    });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML =
        '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Sincronizando...</span>';
      try {
        const spToken = getToken();
        const mondayToken = await getMondayToken();
        if (!spToken || !mondayToken) throw new Error("Sin token");
        const rows = document.querySelectorAll<HTMLElement>(".MuiDataGrid-row");
        const ticketIds: string[] = [];
        rows.forEach((row) => {
          const id =
            row
              .querySelector<HTMLElement>('[data-field="id"]')
              ?.textContent?.trim() ||
            row.getAttribute("data-id") ||
            "";
          if (id) ticketIds.push(id);
        });
        if (!ticketIds.length) throw new Error("Sin tickets visibles");
        // Use SP_MondayUtils for sync
        const wsId = await getMondayWorkspaceId?.();
        const boards = await SP_API_Lib.getMondayTicketBoards(
          mondayToken,
          wsId,
        );
        const usersMap = await SP_API_Lib.getMondayUsers(mondayToken);
        let synced = 0;
        for (const tid of ticketIds) {
          try {
            const tRes = await fetch(`${SP_API}/${tid}`, {
              headers: spGetHeaders(),
            });
            if (!tRes.ok) continue;
            const tJson = (await tRes.json()) as AnyObj;
            const ticket: AnyObj = tJson.data || tJson;
            if (!ticket.uniqueCode) continue;
            const found = await SP_MondayUtils.findMondayItem(
              mondayToken,
              ticket.uniqueCode,
              { boards },
            );
            if (!found) continue;
            const colValues: AnyObj = {
              status: {
                index: mapStatusToMonday(
                  (ticket.ticketStatus?.name || "").toLowerCase(),
                ),
              },
            };
            const hEmail: string =
              ticket.ticketHolder?.ticketHolderLog?.email || "";
            if (hEmail && usersMap[hEmail.toLowerCase()])
              colValues["multiple_person_mm25nvfq"] = {
                personsAndTeams: [
                  {
                    id: parseInt(usersMap[hEmail.toLowerCase()]),
                    kind: "person",
                  },
                ],
              };
            await mondayQuery(
              mondayToken,
              "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
              {
                boardId: found.boardId,
                itemId: found.itemId,
                columnValues: JSON.stringify(colValues),
              },
            );
            synced++;
          } catch {
            continue;
          }
        }
        btn.innerHTML = `<span class="sp-btn-icon">✅</span><span class="sp-btn-label"> ${synced} actualizados</span>`;
        setTimeout(() => {
          btn.innerHTML =
            '<span class="sp-btn-icon">🔄</span><span class="sp-btn-label"> Sync Monday</span>';
          btn.disabled = false;
        }, 3000);
      } catch (e) {
        btn.innerHTML =
          '<span class="sp-btn-icon">❌</span><span class="sp-btn-label"> Error</span>';
        setTimeout(() => {
          btn.innerHTML =
            '<span class="sp-btn-icon">🔄</span><span class="sp-btn-label"> Sync Monday</span>';
          btn.disabled = false;
        }, 3000);
      }
    });
    if (insertMethod === "beforeSearch") {
      const sb = container!.querySelector<HTMLElement>(
        'button[aria-label="Buscar"]',
      );
      container!.insertBefore(btn, sb);
    } else container!.prepend(btn);
  }

  // ─── Dashboard ────────────────────────────────────────────────
  function loadDashboardCache(): AnyObj | null {
    try {
      const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      return raw ? (JSON.parse(raw) as AnyObj) : null;
    } catch {
      return null;
    }
  }
  function saveDashboardCache(
    data: AnyObj[],
    from: string,
    to: string,
    groupId?: number | string,
  ) {
    localStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify({
        data,
        from,
        to,
        groupId: groupId || "",
        ts: Date.now(),
      }),
    );
  }
  function clearDashboardCache() {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
  }

  let cachedDash = loadDashboardCache();
  if (
    cachedDash &&
    new Date(cachedDash.ts as number).toDateString() !==
      new Date().toDateString()
  ) {
    clearDashboardCache();
    cachedDash = null;
  }
  let dashboardData: AnyObj[] | null = cachedDash?.data?.length
    ? (cachedDash.data as AnyObj[])
    : null;
  let dashboardFrom: string = cachedDash?.from ?? "";
  let dashboardTo: string = cachedDash?.to ?? "";

  function buildDashboardChart(allTickets: AnyObj[]): string {
    if (!allTickets.length)
      return '<div style="text-align:center;padding:40px;color:#888;">Sin tickets cerrados en este periodo</div>';
    const counts: Record<string, number> = {};
    allTickets.forEach((t) => {
      const name: string = t.responsibleName || "Sin asignar";
      counts[name] = (counts[name] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const maxCount = sorted[0]?.[1] ?? 1;
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
    let html = `<div style="margin-bottom:12px;font-size:13px;color:#888;">Total: <b>${allTickets.length}</b> tickets cerrados</div>`;
    sorted.forEach(([name, count], i) => {
      const pct = Math.round((count / maxCount) * 100);
      const color = colors[i % colors.length];
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div style="width:180px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</div><div style="flex:1;background:#eee;border-radius:4px;height:24px;overflow:hidden;"><div style="width:${pct}%;background:${color};height:100%;border-radius:4px;transition:width 0.5s;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;"><span style="color:#fff;font-size:11px;font-weight:700;">${count}</span></div></div></div>`;
    });
    return html;
  }

  async function generateDashboard(btn: HTMLButtonElement, groupId: number) {
    if (!dashboardFrom || !dashboardTo) {
      const now = new Date();
      dashboardFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00`;
      dashboardTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59`;
    }
    btn.disabled = true;
    btn.innerHTML =
      '<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> Creando dashboard...</span>';
    btn.style.background = "#999";
    if (!getToken()) {
      showErrorToast("No hay token");
      btn.innerHTML =
        '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>';
      btn.style.background = "#00796B";
      btn.disabled = false;
      return;
    }
    const allTickets: AnyObj[] = [];
    let page = 0;
    try {
      while (true) {
        let url = `https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=${page}&size=100&resolutionGroupId=${groupId}`;
        if (dashboardFrom) url += `&initDate=${dashboardFrom}`;
        if (dashboardTo) url += `&endDate=${dashboardTo}`;
        const res = await fetch(url, { headers: spGetHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnyObj;
        const data: AnyObj = json.data || json;
        const tickets: AnyObj[] = data.content || [];
        tickets.forEach((t) => {
          if (t.ticketStatusName === "Cerrado") allTickets.push(t);
        });
        btn.innerHTML = `<span class="sp-btn-icon">⏳</span><span class="sp-btn-label"> ${allTickets.length} tickets...</span>`;
        if (page >= (data.totalPages || 1) - 1) break;
        page++;
      }
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
      btn.innerHTML =
        '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Dashboard</span>';
      btn.style.background = "#00796B";
      btn.disabled = false;
      return;
    }
    dashboardData = allTickets;
    saveDashboardCache(allTickets, dashboardFrom, dashboardTo, groupId);
    btn.innerHTML =
      '<span class="sp-btn-icon">📊</span><span class="sp-btn-label"> Ver dashboard</span>';
    btn.style.background = "#00796B";
    btn.disabled = false;
    showSuccessToast(`Dashboard listo: ${allTickets.length} tickets cerrados`);
  }

  function showDashboardModal() {
    document.getElementById("sp-dashboard-modal")?.remove();
    let groupSelectorHTML = "";
    if (currentUserGroups.length > 1) {
      const currentGroupId =
        loadDashboardCache()?.groupId || currentUserGroups[0];
      const gOpts = currentUserGroups
        .map((gId) => {
          const g = GROUP_INFO.find((gi) => gi.id === gId) || {
            id: gId,
            name: `Grupo ${gId}`,
          };
          return `<option value="${g.id}"${String(g.id) === String(currentGroupId) ? " selected" : ""}>${g.name}</option>`;
        })
        .join("");
      groupSelectorHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;"><label style="font-size:12px;white-space:nowrap;">Grupo:</label><select id="sp-dash-group-change" style="flex:1;padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;">${gOpts}</select></div>`;
    }
    const m = SP_Modal.info({
      id: "sp-dashboard-modal",
      title: "📊 Tickets cerrados por analista",
      content:
        groupSelectorHTML +
        `<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;"><label style="font-size:12px;">Desde:</label><input id="sp-dash-from" type="datetime-local" value="${dashboardFrom}" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;"><label style="font-size:12px;">Hasta:</label><input id="sp-dash-to" type="datetime-local" value="${dashboardTo}" style="padding:5px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;"><button id="sp-dash-refresh" style="padding:5px 14px;font-size:12px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-weight:600;">Regenerar</button></div><div id="sp-dash-results" style="flex:1;overflow:auto;min-height:200px;"></div>`,
      maxWidth: "700px",
      modalOptions: { width: "95%", maxHeight: "90vh" },
    });
    (document.getElementById("sp-dash-results") as HTMLElement).innerHTML =
      buildDashboardChart(dashboardData || []);
    const groupChangeEl = document.getElementById(
      "sp-dash-group-change",
    ) as HTMLSelectElement | null;
    if (groupChangeEl) {
      groupChangeEl.addEventListener("change", () => {
        const newGId = parseInt(groupChangeEl.value);
        const cached = loadDashboardCache();
        if (cached?.data?.length && String(cached.groupId) === String(newGId)) {
          dashboardData = cached.data as AnyObj[];
          dashboardFrom = cached.from ?? "";
          dashboardTo = cached.to ?? "";
          (document.getElementById("sp-dash-from") as HTMLInputElement).value =
            dashboardFrom;
          (document.getElementById("sp-dash-to") as HTMLInputElement).value =
            dashboardTo;
          (
            document.getElementById("sp-dash-results") as HTMLElement
          ).innerHTML = buildDashboardChart(dashboardData);
        } else {
          dashboardData = null;
          (
            document.getElementById("sp-dash-results") as HTMLElement
          ).innerHTML =
            '<div style="text-align:center;padding:40px;color:#888;">No hay datos para este grupo. Presiona <b>Regenerar</b>.</div>';
        }
      });
    }
    (
      document.getElementById("sp-dash-refresh") as HTMLButtonElement
    ).addEventListener("click", () => {
      dashboardFrom = (
        document.getElementById("sp-dash-from") as HTMLInputElement
      ).value;
      dashboardTo = (document.getElementById("sp-dash-to") as HTMLInputElement)
        .value;
      dashboardData = null;
      clearDashboardCache();
      const selGId = groupChangeEl
        ? parseInt(groupChangeEl.value)
        : getTeamConfig().resolutionGroupId;
      m.close();
      const btn = document.getElementById(
        DASHBOARD_BTN_ID,
      ) as HTMLButtonElement;
      void generateDashboard(btn, selGId);
    });
  }

  async function handleDashboardClick() {
    const btn = document.getElementById(
      DASHBOARD_BTN_ID,
    ) as HTMLButtonElement | null;
    if (!btn) return;
    if (
      currentUserGroups.length > 1 &&
      (!dashboardData || !dashboardData.length)
    ) {
      const groupOpts = currentUserGroups
        .map((gId) => {
          const g = GROUP_INFO.find((gi) => gi.id === gId) || {
            id: gId,
            name: `Grupo ${gId}`,
          };
          return `<option value="${g.id}">${g.name}</option>`;
        })
        .join("");
      const mm = SP_Modal.info({
        id: "sp-dashboard-group-modal",
        title: "📊 Generar Dashboard",
        content: `<p style="margin:0 0 12px;font-size:0.85rem;color:#555;">Selecciona el grupo:</p><select id="sp-dash-group-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:0.9rem;margin-bottom:12px;">${groupOpts}</select><button id="sp-dash-group-confirm" style="width:100%;padding:10px;border:none;border-radius:6px;background:#00796B;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Generar</button>`,
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
        dashboardData = null;
        void generateDashboard(btn, selG);
      });
      return;
    }
    if (dashboardData && dashboardData.length) {
      showDashboardModal();
      return;
    }
    void generateDashboard(btn, getTeamConfig().resolutionGroupId);
  }

  function injectDashboardButton() {
    if (!_btnDashboard || document.getElementById(DASHBOARD_BTN_ID)) return;
    const searchBtn = document.getElementById(SEARCH_BTN_ID);
    if (!searchBtn) return;
    if (!dashboardFrom || !dashboardTo) {
      const now = new Date();
      dashboardFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00`;
      dashboardTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59`;
    }
    const btn = createHeaderButton({
      id: DASHBOARD_BTN_ID,
      icon: "📊",
      label: dashboardData ? "Ver dashboard" : "Dashboard",
      color: "#00796B",
      onClick: () => void handleDashboardClick(),
    });
    searchBtn.parentElement?.insertBefore(btn, searchBtn);
    const sep = document.createElement("span");
    sep.style.cssText =
      "color:rgba(255,255,255,0.4);font-size:16px;margin-right:8px;";
    sep.textContent = "|";
    searchBtn.parentElement?.insertBefore(sep, searchBtn);
  }

  // ─── History modal ────────────────────────────────────────────
  function formatLogDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} - ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function getFieldLabel(field: string): string {
    const map: Record<string, string> = {
      ticket: "Creación de ticket",
      attachments: "Carga de archivos",
      attachment_delete: "Eliminación",
      status: "Cambio de estado",
      responsible_info: "Reasignación",
      ticket_visitor_participant: "Participante",
      comment: "Comentario",
      priority: "Prioridad",
      resolution_group: "Grupo de resolución",
    };
    return map[field] || field || "";
  }
  function buildLogDetail(log: AnyObj): string {
    const { field, before, after } = log;
    if (field === "responsible_info" && after?.content) {
      const a: AnyObj = after.content;
      const b: AnyObj | null = before?.content?.fullName
        ? before.content
        : null;
      return b
        ? `${esc(b.fullName)} (${esc(b.email || "")}) - ${esc(b.roleName || "")} &nbsp;→&nbsp; ${esc(a.fullName)} (${esc(a.email || "")}) - ${esc(a.roleName || "")}`
        : `${esc(a.fullName)} (${esc(a.email || "")}) - ${esc(a.roleName || "")}`;
    }
    if (field === "status" && after?.content) {
      const bs: string = before?.content?.name || "";
      const as_: string = after.content.name || "";
      return bs ? `${esc(bs)} &nbsp;→&nbsp; ${esc(as_)}` : esc(as_);
    }
    if (field === "attachments" && Array.isArray(after?.content)) {
      const files = (after.content as AnyObj[]).map((f) => f.name || "archivo");
      const vis = after.content[0]?.isInternal ? "Interno" : "Público";
      return `Archivo: ${esc(files.join(", "))} | ${vis}`;
    }
    if (field === "attachment_delete" && before?.content) {
      const f: AnyObj = before.content;
      return `Archivo: ${esc(f.name || "archivo")} | ${f.isInternal ? "Interno" : "Público"}`;
    }
    if (field === "ticket_visitor_participant" && after?.content) {
      const p: AnyObj = after.content;
      return `${esc(p.fullName || "")} (${esc(p.email || "")}) - ${p.isParticipant ? "Participante" : "Visitante"}`;
    }
    if (field === "ticket" && after?.content) return esc(String(after.content));
    return "";
  }

  async function showHistoryModal(ticketId: number | string) {
    document.getElementById("sp-history-modal")?.remove();
    showLoadingToast("Cargando historial...");
    if (!getToken()) {
      showErrorToast("No hay token");
      return;
    }
    try {
      const res = await fetch(`${SP_API}/logs/${ticketId}`, {
        headers: spGetHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const logs = ((await res.json()) as AnyObj[]).sort(
        (a, b) =>
          new Date(b.createdAt as string).getTime() -
          new Date(a.createdAt as string).getTime(),
      );
      const actionMap: Record<string, { label: string; color: string }> = {
        create: { label: "Creado", color: "#1976D2" },
        add: { label: "Añadido", color: "#2E7D32" },
        delete: { label: "Eliminado", color: "#C62828" },
        update: { label: "Actualizado", color: "#F57C00" },
        reassign: { label: "Reasignado", color: "#7B1FA2" },
        close: { label: "Cerrado", color: "#616161" },
        reopen: { label: "Reabierto", color: "#FF8F00" },
      };
      const cardsHtml = logs
        .map((log) => {
          const ai = actionMap[log.action?.name] || {
            label: log.action?.name || "Acción",
            color: "#757575",
          };
          const initial = (log.fullName || "?")[0].toUpperCase();
          const detail = buildLogDetail(log);
          return `<div style="background:#1E1E1E;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:3px solid ${ai.color};"><div style="display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:50%;background:${ai.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;">${esc(initial)}</div><div><div style="font-weight:600;font-size:13px;color:#E0E0E0;">${esc(log.fullName || "Desconocido")}</div><div style="font-size:11px;color:#9E9E9E;">${esc(getFieldLabel(log.field))}</div></div></div><span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:${ai.color};">${esc(ai.label)}</span></div>${detail ? `<div style="margin-top:8px;font-size:12px;color:#BDBDBD;">${detail}</div>` : ""}<div style="margin-top:6px;font-size:11px;color:#757575;">Fecha y hora: ${esc(formatLogDate(log.createdAt))}</div></div>`;
        })
        .join("");
      document.getElementById("sp-loading-toast")?.remove();
      SP_Modal.info({
        id: "sp-history-modal",
        title: `📋 Historial del ticket #${ticketId}`,
        maxWidth: "600px",
        content: `<div style="max-height:500px;overflow-y:auto;padding:4px;">${cardsHtml || '<div style="text-align:center;color:#9E9E9E;padding:20px;">Sin historial</div>'}</div>`,
      });
    } catch (err) {
      showErrorToast(`Error al cargar historial: ${(err as Error).message}`);
    }
  }

  // ─── Config modal ─────────────────────────────────────────────
  function injectConfigButton() {
    /* no-op: handled by SP_Header */
  }
  _showConfigModal = showConfigModal;

  function showConfigModal() {
    document.getElementById("sp-config-modal")?.remove();
    chrome.storage.local.get(
      [
        "mondayToken",
        "mondayBoardId",
        "teamArea",
        "ignoredEmails",
        "myProfileId",
      ],
      (stored: AnyObj) => {
        const currentToken: string = stored["mondayToken"] || "";
        const currentArea: string = stored["teamArea"] || "";
        const cfgM = SP_Modal.info({
          id: "sp-config-modal",
          title: "⚙️ Configuración",
          content:
            '<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #eee;"><button id="sp-cfg-tab-area" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid #D94040;color:#D94040;">Área de trabajo</button><button id="sp-cfg-tab-monday" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;color:#888;">Monday.com</button></div>' +
            '<div id="sp-cfg-panel-area">' +
            '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Área de trabajo</label>' +
            '<select id="sp-cfg-area" style="width:100%;padding:8px;font-size:13px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">' +
            '<option value="">-- Selecciona tu grupo --</option>' +
            (currentUserGroups.length > 0
              ? currentUserGroups
              : GROUP_INFO.map((g) => g.id)
            )
              .map((gId: number) => {
                const g = GROUP_INFO.find((gi) => gi.id === gId) || {
                  id: gId,
                  name: `Grupo ${gId}`,
                };
                return `<option value="${g.id}"${String(currentArea) === String(g.id) ? " selected" : ""}>${g.name}</option>`;
              })
              .join("") +
            "</select>" +
            `<div id="sp-cfg-members" style="margin-bottom:8px;max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:6px;display:${currentArea ? "block" : "none"};"><div style="color:#888;font-size:11px;">Cargando miembros...</div></div>` +
            '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:12px;cursor:pointer;"><input type="checkbox" id="sp-cfg-only-with-tickets"> Solo mostrar personas con tickets</label></div>' +
            '<div id="sp-cfg-panel-monday" style="display:none;">' +
            '<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Token de Monday</label>' +
            `<input id="sp-cfg-monday-token" type="password" value="${currentToken ? "••••••••" : ""}" placeholder="Pega tu token de Monday aquí..." style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:4px;">` +
            '<div style="font-size:10px;color:#999;margin-bottom:12px;">Tu token personal de Monday.</div></div>' +
            '<div style="display:flex;gap:8px;margin-top:12px;"><button id="sp-cfg-save" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">💾 Guardar</button><button id="sp-cfg-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>',
          maxWidth: "450px",
        });
        const overlay = cfgM.overlay;
        (
          document.getElementById("sp-cfg-cancel") as HTMLButtonElement
        ).addEventListener("click", cfgM.close);
        const tabArea = document.getElementById(
          "sp-cfg-tab-area",
        ) as HTMLButtonElement;
        const tabMonday = document.getElementById(
          "sp-cfg-tab-monday",
        ) as HTMLButtonElement;
        const panelArea = document.getElementById(
          "sp-cfg-panel-area",
        ) as HTMLElement;
        const panelMonday = document.getElementById(
          "sp-cfg-panel-monday",
        ) as HTMLElement;
        tabArea.addEventListener("click", () => {
          panelArea.style.display = "block";
          panelMonday.style.display = "none";
          tabArea.style.borderBottom = "2px solid #D94040";
          tabArea.style.color = "#D94040";
          tabMonday.style.borderBottom = "none";
          tabMonday.style.color = "#888";
        });
        tabMonday.addEventListener("click", () => {
          panelArea.style.display = "none";
          panelMonday.style.display = "block";
          tabMonday.style.borderBottom = "2px solid #D94040";
          tabMonday.style.color = "#D94040";
          tabArea.style.borderBottom = "none";
          tabArea.style.color = "#888";
        });
        const membersDiv = document.getElementById(
          "sp-cfg-members",
        ) as HTMLElement;
        const onlyWithTicketsEl = document.getElementById(
          "sp-cfg-only-with-tickets",
        ) as HTMLInputElement;
        if (_userConfig.onlyWithTickets) onlyWithTicketsEl.checked = true;

        function loadMembersForConfig(groupId: string) {
          if (!groupId) {
            membersDiv.style.display = "none";
            return;
          }
          membersDiv.style.display = "block";
          membersDiv.innerHTML =
            '<div style="color:#888;font-size:11px;">Cargando...</div>';
          void fetch(
            `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${groupId}`,
            { headers: spGetHeaders() },
          )
            .then((r) => r.json())
            .then((json: AnyObj) => {
              const profiles: AnyObj[] = json.data || json;
              if (!Array.isArray(profiles) || !profiles.length) {
                membersDiv.innerHTML =
                  '<div style="color:#888;font-size:11px;">Sin miembros</div>';
                return;
              }
              const blacklistProfileIds: number[] =
                (_userConfig.blacklist as unknown as number[]) || [];
              membersDiv.innerHTML =
                '<div style="font-size:10px;color:#888;margin-bottom:4px;">Desmarca los que no quieras ver:</div>';
              profiles.forEach((p) => {
                const isVisible = !blacklistProfileIds.includes(p.profileId);
                const label = document.createElement("label");
                label.style.cssText =
                  "display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;cursor:pointer;";
                label.innerHTML = `<input type="checkbox" data-pid="${p.profileId}"${isVisible ? " checked" : ""}> ${esc(p.profileFullName)}`;
                membersDiv.appendChild(label);
              });
            })
            .catch(() => {
              membersDiv.innerHTML =
                '<div style="color:#D94040;font-size:11px;">Error</div>';
            });
        }

        (
          document.getElementById("sp-cfg-area") as HTMLSelectElement
        ).addEventListener("change", function (this: HTMLSelectElement) {
          loadMembersForConfig(this.value);
        });
        if (currentArea) loadMembersForConfig(currentArea);

        (
          document.getElementById("sp-cfg-save") as HTMLButtonElement
        ).addEventListener("click", async () => {
          const mondayTokenInput = (
            document.getElementById("sp-cfg-monday-token") as HTMLInputElement
          ).value.trim();
          const area = (
            document.getElementById("sp-cfg-area") as HTMLSelectElement
          ).value;
          const onlyWithTickets = onlyWithTicketsEl.checked;
          if (mondayTokenInput && mondayTokenInput !== "••••••••") {
            const encoded = btoa(mondayTokenInput);
            chrome.storage.local.get(
              ["usersMap", "userEmail"],
              (nd: AnyObj) => {
                const email: string = (
                  (nd["userEmail"] as string) || ""
                ).toLowerCase();
                const user: AnyObj = ((nd["usersMap"] as AnyObj) || {})[email];
                if (user?.idUsuario)
                  chrome.runtime.sendMessage({
                    type: "api-put",
                    endpoint: `/usuarios/${user.idUsuario}`,
                    body: { tokenMonday: encoded },
                  });
              },
            );
          }
          const memberChecks =
            membersDiv.querySelectorAll<HTMLInputElement>("input[data-pid]");
          let blacklistProfileIds: number[] | null = null;
          if (memberChecks.length > 0 && area) {
            blacklistProfileIds = [];
            memberChecks.forEach((cb) => {
              if (!cb.checked)
                blacklistProfileIds!.push(parseInt(cb.dataset["pid"] ?? "0"));
            });
          }
          chrome.storage.local.get(
            ["userConfig", "usersMap", "userEmail"],
            (nd: AnyObj) => {
              const email: string = (
                (nd["userEmail"] as string) || ""
              ).toLowerCase();
              const user: AnyObj = ((nd["usersMap"] as AnyObj) || {})[email];
              chrome.runtime.sendMessage(
                {
                  type: "api-get",
                  endpoint: `/usuarios/correo/${encodeURIComponent(email)}`,
                },
                (userResp: AnyObj) => {
                  const apiUserId: number | null =
                    userResp?.success && userResp.data?.data
                      ? userResp.data.data.IdUsuario
                      : user?.idUsuario || null;
                  if (apiUserId)
                    chrome.runtime.sendMessage({
                      type: "api-post",
                      endpoint: "/configuracion/usuario",
                      body: {
                        fkIdUsuario: apiUserId,
                        mostrarSoloConTickets: onlyWithTickets,
                        blacklistByProfileId: blacklistProfileIds || [],
                        usuarioAlta: email,
                      },
                    });
                  _userConfig = {
                    onlyWithTickets,
                    blacklist:
                      (blacklistProfileIds as unknown as string[]) ||
                      (_userConfig.blacklist as unknown as string[]) ||
                      [],
                  };
                  chrome.storage.local.set(
                    {
                      mondayToken:
                        mondayTokenInput && mondayTokenInput !== "••••••••"
                          ? mondayTokenInput
                          : undefined,
                      teamArea: area,
                      userConfig: _userConfig,
                    },
                    () => {
                      overlay.remove();
                      showSuccessToast("Configuración guardada");
                      currentTeamArea = area;
                      Object.keys(profilesCache).forEach(
                        (k) => delete profilesCache[parseInt(k)],
                      );
                      const panel = document.getElementById(TEAM_PANEL_ID);
                      if (panel) panel.remove();
                      teamPanelLoading = false;
                      void loadTeamPanel();
                    },
                  );
                },
              );
            },
          );
        });
      },
    );
  }

  // ─── Search / Quick filter ────────────────────────────────────
  let activeModalRefresh: (() => void | Promise<void>) | null = null;

  function injectSearchButton() {
    if (document.getElementById(SEARCH_BTN_ID)) return;
    const userWrapper = document.querySelector<HTMLElement>(
      '[class*="warapperNameUserAndLogout"]',
    );
    if (!userWrapper) return;
    const btn = createHeaderButton({
      id: SEARCH_BTN_ID,
      icon: "🔍",
      label: "Buscar",
      color: "#7B1FA2",
      onClick: showSearchModal,
    });
    btn.style.marginRight = "12px";
    userWrapper.parentElement?.insertBefore(btn, userWrapper);
  }

  function showSearchModal() {
    document.getElementById("sp-search-modal")?.remove();
    const statusOpts =
      '<option value="">Todos</option><option value="Asignado">Asignado</option><option value="En espera">En espera</option><option value="En atención">En atención</option><option value="En validación">En validación</option><option value="Por confirmar">Por confirmar</option><option value="Por ejecutar">Por ejecutar</option><option value="Por revisar">Por revisar</option><option value="En aplicaciones">En aplicaciones</option><option value="Cerrado">Cerrado</option><option value="Rechazado">Rechazado</option><option value="Cancelado">Cancelado</option><option value="Reabierto">Reabierto</option>';
    const inputStyle =
      "width:100%;padding:6px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;";
    void SP_Modal.info({
      id: "sp-search-modal",
      title: "🔍 Buscar tickets",
      content:
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;"><div><label style="font-size:11px;color:#888;">Folio</label><input id="sp-sf-code" style="${inputStyle}" placeholder="Ej: 123"></div><div><label style="font-size:11px;color:#888;">Solicitante</label><input id="sp-sf-requester" style="${inputStyle}" placeholder="Nombre"></div><div><label style="font-size:11px;color:#888;">Estado</label><select id="sp-sf-status" style="${inputStyle}">${statusOpts}</select></div><div><label style="font-size:11px;color:#888;">Tipo</label><select id="sp-sf-type" style="${inputStyle}"><option value="">Todos</option><option value="5">Solicitud</option><option value="6">Incidente</option></select></div><div><label style="font-size:11px;color:#888;">Prioridad</label><select id="sp-sf-priority" style="${inputStyle}"><option value="">Todas</option><option value="6">Critico</option><option value="7">Alto</option><option value="8">Medio</option><option value="9">Bajo</option></select></div><div><label style="font-size:11px;color:#888;">Desde</label><input id="sp-sf-from" type="datetime-local" style="${inputStyle}"></div><div><label style="font-size:11px;color:#888;">Hasta</label><input id="sp-sf-to" type="datetime-local" style="${inputStyle}"></div></div>` +
        '<div style="display:flex;gap:8px;margin-bottom:12px;"><button id="sp-sf-search" style="flex:1;padding:10px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:14px;">🔍 Buscar</button><button id="sp-sf-refresh" style="padding:10px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:14px;">🔄</button></div>' +
        '<div id="sp-sf-results" style="flex:1;overflow:auto;min-height:100px;"></div><div id="sp-sf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
      maxWidth: "900px",
      modalOptions: { width: "95%", maxHeight: "90vh" },
      onClose: () => {
        activeModalRefresh = null;
      },
    });
    (
      document.getElementById("sp-sf-refresh") as HTMLButtonElement
    ).addEventListener("click", () => {
      if (activeModalRefresh) void activeModalRefresh();
    });
    let currentPage = 1;
    (
      document.getElementById("sp-sf-search") as HTMLButtonElement
    ).addEventListener("click", () => {
      currentPage = 1;
      activeModalRefresh = doSearch;
      void doSearch();
    });

    async function doSearch() {
      const results = document.getElementById("sp-sf-results") as HTMLElement;
      const paging = document.getElementById("sp-sf-paging") as HTMLElement;
      results.innerHTML =
        '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
      paging.innerHTML = "";
      if (!getToken()) {
        results.innerHTML =
          '<div style="color:#D94040;padding:12px;">No hay token de SupportPlus</div>';
        return;
      }
      let params = `page=${currentPage - 1}&size=25&resolutionGroupId=${getTeamConfig().resolutionGroupId}`;
      const code = (
        document.getElementById("sp-sf-code") as HTMLInputElement
      ).value.trim();
      const requester = (
        document.getElementById("sp-sf-requester") as HTMLInputElement
      ).value.trim();
      const status = (
        document.getElementById("sp-sf-status") as HTMLSelectElement
      ).value;
      const type = (document.getElementById("sp-sf-type") as HTMLSelectElement)
        .value;
      const priority = (
        document.getElementById("sp-sf-priority") as HTMLSelectElement
      ).value;
      const from = (document.getElementById("sp-sf-from") as HTMLInputElement)
        .value;
      const to = (document.getElementById("sp-sf-to") as HTMLInputElement)
        .value;
      if (code) params += `&uniqueCode=${encodeURIComponent(code)}`;
      if (requester)
        params += `&requesterName=${encodeURIComponent(requester)}`;
      if (status) params += `&ticketStatusName=${encodeURIComponent(status)}`;
      if (type) params += `&reportTypeId=${type}`;
      if (priority) params += `&priorityId=${priority}`;
      if (from) params += `&initDate=${from}`;
      if (to) params += `&endDate=${to}`;
      try {
        const res = await fetch(`${SP_SEARCH_API}?${params}`, {
          headers: spGetHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnyObj;
        const data: AnyObj = json.data || json;
        const tickets: AnyObj[] = data.content || [];
        const totalPages: number = data.totalPages || 1;
        const totalElements: number = data.totalElements || 0;
        if (!tickets.length) {
          results.innerHTML =
            '<div style="text-align:center;padding:20px;color:#888;">Sin resultados</div>';
          return;
        }
        renderTicketCards(
          results,
          tickets,
          getLoggedUserName(),
          getCache() || {},
          cachedBoardDate,
        );
        paging.innerHTML = `<span>${totalElements} resultados | Pag ${currentPage} de ${totalPages}</span><div style="display:flex;gap:4px;"><button id="sp-sf-prev" ${currentPage <= 1 ? "disabled" : ""} style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">&lt;</button><button id="sp-sf-next" ${currentPage >= totalPages ? "disabled" : ""} style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">&gt;</button></div>`;
        document.getElementById("sp-sf-prev")?.addEventListener("click", () => {
          if (currentPage > 1) {
            currentPage--;
            void doSearch();
          }
        });
        document.getElementById("sp-sf-next")?.addEventListener("click", () => {
          if (currentPage < totalPages) {
            currentPage++;
            void doSearch();
          }
        });
      } catch (err) {
        results.innerHTML = `<div style="color:#D94040;padding:12px;">Error: ${(err as Error).message}</div>`;
      }
    }
  }

  async function showQuickFilterModal(
    statusName: string,
    extraParams?: string,
    title?: string,
    customApiUrl?: string,
  ) {
    document.getElementById("sp-search-modal")?.remove();
    const modalTitle = title || `Tickets: ${statusName}`;
    void SP_Modal.info({
      id: "sp-search-modal",
      title: modalTitle,
      content:
        '<div id="sp-qf-results" style="flex:1;overflow:auto;min-height:100px;"><div style="text-align:center;padding:20px;color:#888;">Buscando...</div></div><div id="sp-qf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
      maxWidth: "900px",
      modalOptions: {
        width: "95%",
        maxHeight: "90vh",
        headerActions:
          '<button id="sp-qf-refresh" style="padding:6px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:13px;">🔄 Actualizar</button>',
      },
      onClose: () => {
        activeModalRefresh = null;
      },
    });
    (
      document.getElementById("sp-qf-refresh") as HTMLButtonElement
    ).addEventListener("click", () => {
      if (activeModalRefresh) void activeModalRefresh();
    });
    let currentPage = 1;
    activeModalRefresh = doQuickSearch;
    await doQuickSearch();
    async function doQuickSearch() {
      const results = document.getElementById("sp-qf-results") as HTMLElement;
      const paging = document.getElementById("sp-qf-paging") as HTMLElement;
      results.innerHTML =
        '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
      paging.innerHTML = "";
      if (!getToken()) {
        results.innerHTML =
          '<div style="color:#D94040;padding:12px;">No hay token</div>';
        return;
      }
      try {
        const baseUrl = customApiUrl || SP_SEARCH_API;
        let url = `${baseUrl}?page=${currentPage - 1}&size=25`;
        if (!customApiUrl)
          url += `&resolutionGroupId=${getTeamConfig().resolutionGroupId}`;
        if (statusName)
          url += `&ticketStatusName=${encodeURIComponent(statusName)}`;
        if (extraParams) url += `&${extraParams}`;
        const res = await fetch(url, { headers: spGetHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnyObj;
        const data: AnyObj = json.data || json;
        const tickets: AnyObj[] = data.content || [];
        const totalPages: number = data.totalPages || 1;
        const totalElements: number = data.totalElements || 0;
        if (!tickets.length) {
          results.innerHTML = `<div style="text-align:center;padding:20px;color:#888;">Sin tickets con estado: ${statusName || "todos"}</div>`;
          return;
        }
        renderTicketCards(
          results,
          tickets,
          getLoggedUserName(),
          getCache() || {},
          cachedBoardDate,
        );
        paging.innerHTML = `<span>${totalElements} tickets | Pag ${currentPage} de ${totalPages}</span><div style="display:flex;gap:4px;"><button id="sp-qf-prev" ${currentPage <= 1 ? "disabled" : ""} style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">&lt;</button><button id="sp-qf-next" ${currentPage >= totalPages ? "disabled" : ""} style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">&gt;</button></div>`;
        document.getElementById("sp-qf-prev")?.addEventListener("click", () => {
          if (currentPage > 1) {
            currentPage--;
            void doQuickSearch();
          }
        });
        document.getElementById("sp-qf-next")?.addEventListener("click", () => {
          if (currentPage < totalPages) {
            currentPage++;
            void doQuickSearch();
          }
        });
      } catch (err) {
        results.innerHTML = `<div style="color:#D94040;padding:12px;">Error: ${(err as Error).message}</div>`;
      }
    }
  }

  // ─── Quick search input ───────────────────────────────────────
  function injectQuickSearch() {
    if (document.getElementById(QUICK_SEARCH_ID)) return;
    const userWrapper = document.querySelector<HTMLElement>(
      '[class*="warapperNameUserAndLogout"]',
    );
    if (!userWrapper) return;
    const parent = userWrapper.parentElement!;
    const wrapper = document.createElement("div");
    wrapper.id = QUICK_SEARCH_ID;
    wrapper.style.cssText =
      "display:inline-flex;align-items:center;gap:4px;margin-right:12px;";
    const input = document.createElement("input");
    input.id = "sp-quick-search-input";
    input.type = "text";
    input.placeholder = "Folio o ID...";
    input.style.cssText =
      "padding:5px 10px;font-size:12px;border:1px solid #ccc;border-radius:6px;width:130px;outline:none;";
    const goBtn = document.createElement("button");
    goBtn.textContent = "→";
    goBtn.style.cssText =
      "padding:5px 10px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#4CAF50;color:#fff;font-weight:600;";
    async function doQuickSearch() {
      const val = input.value.trim();
      if (!val) return;
      goBtn.disabled = true;
      goBtn.textContent = "...";
      if (!getToken()) {
        showErrorToast("No hay token");
        goBtn.textContent = "→";
        goBtn.disabled = false;
        return;
      }
      try {
        const res = await fetch(
          `${SP_SEARCH_API}?uniqueCode=${encodeURIComponent(val)}&page=0&size=1`,
          { headers: spGetHeaders() },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnyObj;
        const tickets: AnyObj[] = (json.data || json).content || [];
        if (tickets.length > 0) showQuickDetailModal(tickets[0].id as number);
        else showErrorToast(`Ticket no encontrado: ${val}`);
      } catch (err) {
        showErrorToast(`Error: ${(err as Error).message}`);
      }
      goBtn.textContent = "→";
      goBtn.disabled = false;
      input.value = "";
    }
    goBtn.addEventListener("click", () => void doQuickSearch());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void doQuickSearch();
    });
    wrapper.appendChild(input);
    wrapper.appendChild(goBtn);
    parent.insertBefore(wrapper, userWrapper);
  }

  function injectQuickFilterButton() {
    if (document.getElementById(QUICK_FILTER_ID)) return;
    const userWrapper = document.querySelector<HTMLElement>(
      '[class*="warapperNameUserAndLogout"]',
    );
    if (!userWrapper) return;
    const btn = document.createElement("button");
    btn.id = QUICK_FILTER_ID;
    btn.textContent = "⏳ En espera";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#FF8F00;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("click", () => void showQuickFilterModal("En espera"));
    userWrapper.parentElement?.insertBefore(btn, userWrapper);
  }

  // ─── Suggested comments ───────────────────────────────────────
  function injectSuggestedCommentsButton() {
    if (!_btnComments || document.getElementById(SUGGESTED_BTN_ID)) return;
    const refBtn =
      document.getElementById(DASHBOARD_BTN_ID) ||
      document.getElementById(SEARCH_BTN_ID);
    if (!refBtn) return;
    const btn = createHeaderButton({
      id: SUGGESTED_BTN_ID,
      icon: "💬",
      label: "Comentarios",
      color: "#00897B",
      onClick: showSuggestedCommentsModal,
    });
    refBtn.parentElement?.insertBefore(btn, refBtn.nextSibling);
  }

  function showSuggestedCommentsModal() {
    document.getElementById("sp-suggested-modal")?.remove();
    void SP_Modal.info({
      id: "sp-suggested-modal",
      title: "💬 Comentarios sugeridos",
      content:
        '<div style="display:flex;gap:6px;margin-bottom:12px;"><input id="sp-sug-new-input" type="text" placeholder="Nuevo comentario sugerido..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;"><button id="sp-sug-add" style="padding:6px 12px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">+ Agregar</button></div><div id="sp-sug-list" style="flex:1;overflow:auto;"></div>',
      maxWidth: "600px",
      modalOptions: { width: "95%", maxHeight: "80vh" },
    });
    const groupId = getTeamConfig().resolutionGroupId;
    function loadList() {
      const listDiv = document.getElementById("sp-sug-list");
      if (!listDiv) return;
      chrome.storage.local.get("suggestedComments", (r: AnyObj) => {
        const comments: AnyObj = r["suggestedComments"] || {};
        const items: AnyObj[] = comments[groupId] || [];
        if (!items.length) {
          listDiv.innerHTML =
            '<div style="text-align:center;color:#888;padding:20px;font-size:12px;">No hay comentarios sugeridos para este grupo</div>';
          return;
        }
        listDiv.innerHTML = items
          .map(
            (c: AnyObj) =>
              `<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;" data-id="${c.id}"><span style="flex:1;font-size:12px;">${c.text}</span><button class="sp-sug-del" data-id="${c.id}" style="padding:3px 8px;border:1px solid #D32F2F;border-radius:4px;background:#fff;color:#D32F2F;cursor:pointer;font-size:10px;">🗑️</button></div>`,
          )
          .join("");
        listDiv
          .querySelectorAll<HTMLButtonElement>(".sp-sug-del")
          .forEach((btn) => {
            btn.addEventListener("click", () => {
              if (!confirm("¿Eliminar este comentario sugerido?")) return;
              btn.textContent = "⏳";
              chrome.runtime.sendMessage({ type: "sync" }, () => loadList());
            });
          });
      });
    }
    chrome.runtime.sendMessage({ type: "sync" }, () => loadList());
    (
      document.getElementById("sp-sug-add") as HTMLButtonElement
    ).addEventListener("click", () => {
      const input = document.getElementById(
        "sp-sug-new-input",
      ) as HTMLInputElement;
      const text = input.value.trim();
      if (!text) return;
      const addBtn = document.getElementById("sp-sug-add") as HTMLButtonElement;
      addBtn.disabled = true;
      addBtn.textContent = "⏳";
      chrome.runtime.sendMessage({ type: "sync" }, () => {
        input.value = "";
        addBtn.disabled = false;
        addBtn.textContent = "+ Agregar";
        showSuccessToast("Comentario agregado");
        loadList();
      });
    });
  }

  // ─── Report & update buttons ──────────────────────────────────
  function injectReportButton() {
    SP_Reports.injectReportButton();
  }
  function injectMondayStatsButton() {
    SP_Reports.injectMondayStatsButton?.();
  }

  function injectUpdateButton() {
    if (document.getElementById("sp-update-btn")) return;
    const refBtn =
      document.getElementById(DASHBOARD_BTN_ID) ||
      document.getElementById(SEARCH_BTN_ID);
    if (!refBtn) return;
    chrome.storage.local.get(["latestVersion", "latestZipUrl"], (r: AnyObj) => {
      const latestVersion: string = r["latestVersion"] || "";
      const latestZipUrl: string = r["latestZipUrl"] || "";
      const currentVersion = chrome.runtime.getManifest().version;
      if (!latestVersion || latestVersion === currentVersion || !latestZipUrl)
        return;
      if (document.getElementById("sp-update-btn")) return;
      const btn = createHeaderButton({
        id: "sp-update-btn",
        icon: "📥",
        label: `Actualizar v${latestVersion}`,
        color: "#5D4037",
        onClick: showUpdateModal,
      });
      refBtn.parentElement?.insertBefore(btn, refBtn);
    });
  }

  function showUpdateModal() {
    chrome.storage.local.get(["allVersions", "latestVersion"], (r: AnyObj) => {
      const allVersions: AnyObj[] = r["allVersions"] || [];
      const latestVersion: string = r["latestVersion"] || "";
      const currentVersion = chrome.runtime.getManifest().version;
      if (!allVersions.length) {
        showErrorToast("No hay versiones disponibles");
        return;
      }
      const curParts = currentVersion.split(".").map(Number);
      const isNewer = (v: string) => {
        const p = v.split(".").map(Number);
        return (
          p[0] > curParts[0] ||
          (p[0] === curParts[0] && p[1] > curParts[1]) ||
          (p[0] === curParts[0] &&
            p[1] === curParts[1] &&
            (p[2] ?? 0) > (curParts[2] ?? 0))
        );
      };
      const newerVersions = allVersions.filter((v) => isNewer(v.version));
      const changelogHTML = newerVersions.length
        ? newerVersions
            .map(
              (v) =>
                `<div style="padding:6px 0;border-bottom:1px solid #eee;"><b style="color:#1976D2;">v${v.version}</b> <span style="font-size:0.85rem;color:#555;">— ${v.changes || "Sin descripción"}</span></div>`,
            )
            .join("")
        : '<div style="color:#888;padding:8px;">Estás en la versión más reciente.</div>';
      const selectOpts = allVersions
        .map(
          (v) =>
            `<option value="${v.version}"${v.version === latestVersion ? " selected" : ""}>${v.version}${v.version === latestVersion ? " (última)" : ""}</option>`,
        )
        .join("");
      SP_Modal.info({
        id: "sp-update-modal",
        title: "📥 Actualización disponible",
        content: `<div style="margin-bottom:12px;"><div style="font-size:0.85rem;color:#888;margin-bottom:8px;">Versión instalada: <b>${currentVersion}</b> → Última: <b>${latestVersion}</b></div><div style="font-size:0.9rem;font-weight:600;margin-bottom:6px;">📋 Cambios desde tu versión:</div><div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;">${changelogHTML}</div></div><div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;"><label style="font-size:0.85rem;white-space:nowrap;">Descargar versión:</label><select id="sp-update-version-select" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;">${selectOpts}</select></div><div id="sp-update-selected-changes" style="margin-bottom:12px;font-size:0.85rem;color:#555;min-height:20px;"></div><button id="sp-update-download" style="width:100%;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">📥 Descargar</button>`,
        maxWidth: "500px",
      });
      const vSelect = document.getElementById(
        "sp-update-version-select",
      ) as HTMLSelectElement;
      const changesDiv = document.getElementById(
        "sp-update-selected-changes",
      ) as HTMLElement;
      const downloadBtn = document.getElementById(
        "sp-update-download",
      ) as HTMLButtonElement;
      const updateSelected = () => {
        const sel = allVersions.find((v) => v.version === vSelect.value);
        changesDiv.textContent = sel?.changes || "Sin descripción";
      };
      vSelect.addEventListener("change", updateSelected);
      updateSelected();
      downloadBtn.addEventListener("click", () => {
        const sel = allVersions.find((v) => v.version === vSelect.value);
        if (!sel?.zipUrl) {
          showErrorToast("No hay archivo para esta versión");
          return;
        }
        downloadBtn.textContent = "⏳ Descargando...";
        downloadBtn.disabled = true;
        SP_Header.downloadZip(sel.zipUrl, sel.version);
        setTimeout(() => {
          downloadBtn.textContent = "📥 Descargar";
          downloadBtn.disabled = false;
        }, 5000);
      });
    });
  }

  // ─── Session timer ────────────────────────────────────────────
  function injectSessionTimer() {
    if (document.getElementById("sp-session-timer")) return;
    const userWrapper = document.querySelector<HTMLElement>(
      '[class*="warapperNameUserAndLogout"]',
    );
    if (!userWrapper) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const payload = token.split(".")[1];
      const decoded = JSON.parse(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
      ) as { exp?: number };
      const expMs = (decoded.exp ?? 0) * 1000;
      if (!expMs || expMs < Date.now()) return;
      const timerEl = document.createElement("span");
      timerEl.id = "sp-session-timer";
      timerEl.title = "Tiempo restante de sesión";
      timerEl.style.cssText =
        "font-size:11px;color:inherit;opacity:0.8;margin-right:10px;font-family:monospace;white-space:nowrap;";
      userWrapper.parentElement?.insertBefore(timerEl, userWrapper);
      const updateTimer = () => {
        const diff = expMs - Date.now();
        if (diff <= 0) {
          timerEl.textContent = "⏱️ Sesión expirada";
          timerEl.style.color = "#FF5252";
          timerEl.style.opacity = "1";
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerEl.textContent = `⏱️ ${h > 0 ? h + "h " : ""}${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
        if (diff < 300000) {
          timerEl.style.color = "#FF5252";
          timerEl.style.opacity = "1";
        } else if (diff < 900000) {
          timerEl.style.color = "#FFD740";
          timerEl.style.opacity = "1";
        }
      };
      updateTimer();
      setInterval(updateTimer, 1000);
    } catch {
      /* ignore */
    }
  }

  // ─── Board date cache ──────────────────────────────────────────
  let cachedBoardDate: { month: number; year: number } | null = null;
  let boardDateLoaded = false;
  async function getBoardDate() {
    if (boardDateLoaded) return cachedBoardDate;
    try {
      const tok = await getMondayToken();
      const bid = await getMondayBoardId();
      if (tok && bid) {
        const bd = await mondayQuery(
          tok,
          "query ($boardId: [ID!]!) { boards(ids: $boardId) { name } }",
          { boardId: bid },
        );
        cachedBoardDate = parseBoardDate(bd.boards?.[0]?.name || "");
      }
    } catch {
      /* ignore */
    }
    boardDateLoaded = true;
    return cachedBoardDate;
  }

  // ─── Monday click (migrate single ticket) ────────────────────
  async function handleMondayClick(
    ticketId: number | string,
    autoGroupId?: string,
  ) {
    const mondayToken = await getMondayToken();
    if (!mondayToken) {
      alert(
        "⚠️ Configura tu token de Monday en el popup de la extensión primero.",
      );
      return;
    }
    const boardId = await getMondayBoardId();
    if (!boardId) {
      alert("⚠️ Configura el Board ID en el popup de la extensión primero.");
      return;
    }
    if (!getToken()) {
      alert("⚠️ No se encontró token de SupportPlus. ¿Estás logueado?");
      return;
    }
    try {
      const tRes = await fetch(`${SP_API}/${ticketId}`, {
        headers: spGetHeaders(),
      });
      if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`);
      const ticketJson = (await tRes.json()) as AnyObj;
      const t: AnyObj = ticketJson.data || ticketJson;
      const boardRes = await mondayQuery(
        mondayToken,
        "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
        { boardId },
      );
      const groups: AnyObj[] = boardRes.boards?.[0]?.groups || [];
      if (!groups.length) {
        showErrorToast("No hay grupos en el tablero");
        return;
      }
      const groupId = autoGroupId || groups[0].id;
      await SP_MondayUtils.createMondayItem(mondayToken, {
        boardId,
        groupId,
        ticket: t as unknown as import("./types").SpTicket,
      });
      showSuccessToast("Ticket migrado a Monday");
    } catch (err) {
      showErrorToast(`Error al migrar: ${(err as Error).message}`);
    }
  }

  // ─── Team panel ───────────────────────────────────────────────
  let teamPanelLoading = false;

  function injectGuardiasCalendar() {
    if (document.getElementById(GUARDIAS_PANEL_ID)) return;
    const panel =
      document.getElementById("sp-manager-panel") ||
      document.getElementById(TEAM_PANEL_ID);
    if (!panel) return;
    const calPanel = document.createElement("div");
    calPanel.id = GUARDIAS_PANEL_ID;
    calPanel.style.cssText =
      "margin-top:12px;padding:16px;border-radius:8px;border:2px solid #1976D2;font-family:system-ui;color:inherit;";
    calPanel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><button id="sp-dba-guardias-prev" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:14px;">◀</button><h4 style="margin:0;font-size:15px;font-weight:600;">📅 Guardias</h4><button id="sp-dba-guardias-next" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:14px;">▶</button></div><div id="sp-dba-guardias-content"><div style="text-align:center;padding:20px;opacity:.6;">Cargando guardias...</div></div>';
    panel.after(calPanel);
    const userName = SP_Session.state.userName || getLoggedUserName() || "";
    const userId = String(SP_Session.state.profileId || "");
    SP_Guardias.load(0, { currentUserName: userName, currentUserId: userId });
  }

  async function loadTeamPanel() {
    if (SP_DOM.isDetailView()) return;
    if (teamPanelLoading) return;
    if (!currentTeamArea) return;
    if (
      document.getElementById("sp-manager-panel") ||
      document.getElementById(TEAM_PANEL_ID)
    )
      return;
    teamPanelLoading = true;
    await new Promise<void>((r) => setTimeout(r, 50));
    if (document.getElementById(TEAM_PANEL_ID)) {
      teamPanelLoading = false;
      return;
    }
    const grid = document.querySelector(".MuiDataGrid-root");
    if (!grid) {
      teamPanelLoading = false;
      return;
    }
    if (!getToken()) {
      teamPanelLoading = false;
      return;
    }
    const panel = document.createElement("div");
    panel.id = TEAM_PANEL_ID;
    panel.style.cssText =
      "margin-bottom:12px;overflow-x:auto;font-family:system-ui;";
    grid.parentElement?.insertBefore(panel, grid);
    try {
      const areas = getActiveAreas();
      const myName = getLoggedUserName();
      await Promise.all(
        areas.map((area) =>
          loadProfilesForGroup(area.resolutionGroupId).then((profiles) => {
            area.profiles = profiles;
          }),
        ),
      );
      const containerDiv = document.createElement("div");
      containerDiv.style.cssText =
        "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
      panel.innerHTML = "";
      panel.appendChild(containerDiv);
      areas.forEach((area, areaIdx) => {
        if (areaIdx > 0) {
          const sep = document.createElement("div");
          sep.style.cssText =
            "width:3px;background:#ddd;border-radius:2px;margin:0 4px;align-self:stretch;";
          containerDiv.appendChild(sep);
        }
        if (areas.length > 1) {
          const areaLabel = document.createElement("div");
          areaLabel.style.cssText =
            "min-width:180px;max-width:220px;display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0;";
          areaLabel.innerHTML = `<div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;color:#555;letter-spacing:1px;">${areaIdx === 0 ? "🗄️ DBA" : "📦 APPS"}</div>`;
          containerDiv.appendChild(areaLabel);
        }
        const unassignedCol = document.createElement("div");
        unassignedCol.id = `sp-team-col-unassigned-${area.resolutionGroupId}`;
        unassignedCol.style.cssText =
          "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;";
        unassignedCol.innerHTML = `<div class="sp-team-header" data-profile-id="unassigned" style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">⏳ Sin asignar <span class="sp-team-count" style="opacity:0.7;">(...)</span></div><div class="sp-team-tickets" data-profile-id="unassigned" data-area-group="${area.resolutionGroupId}" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>`;
        containerDiv.appendChild(unassignedCol);
        area.profiles.forEach((p: AnyObj) => {
          const isMe = myName && p.profileFullName === myName;
          const borderColor = isMe ? "#D94040" : "#ddd";
          const headerBg = isMe
            ? "#D94040"
            : areaIdx === 0
              ? "#2196F3"
              : "#7B1FA2";
          const firstName: string = (p.profileFullName as string).split(" ")[0];
          const col = document.createElement("div");
          col.id = `sp-team-col-${p.profileId}`;
          col.style.cssText = `min-width:180px;max-width:220px;border:2px solid ${borderColor};border-radius:8px;overflow:hidden;flex-shrink:0;`;
          col.innerHTML = `<div class="sp-team-header" data-profile-id="${p.profileId}" style="background:${headerBg};color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">${esc(firstName)} <span class="sp-team-count" style="opacity:0.7;">(...)</span></div><div class="sp-team-tickets" data-profile-id="${p.profileId}" data-area-group="${area.resolutionGroupId}" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>`;
          containerDiv.appendChild(col);
        });
      });

      // Closed today column
      const closedCol = document.createElement("div");
      closedCol.id = "sp-team-col-closed";
      closedCol.style.cssText =
        "min-width:180px;max-width:220px;border:2px solid #2E7D32;border-radius:8px;overflow:hidden;flex-shrink:0;";
      closedCol.innerHTML =
        '<div class="sp-team-header" data-profile-id="closed" style="background:#2E7D32;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">✅ Cerrados hoy <span class="sp-team-count" style="opacity:0.7;">(...)</span></div><div class="sp-team-tickets" data-profile-id="closed" data-area-group="closed" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
      containerDiv.appendChild(closedCol);

      // Pending close column
      const pendingCloseCol = document.createElement("div");
      pendingCloseCol.id = "sp-team-col-pending-close";
      pendingCloseCol.style.cssText =
        "min-width:180px;max-width:220px;border:2px solid #FF8F00;border-radius:8px;overflow:hidden;flex-shrink:0;display:none;";
      pendingCloseCol.innerHTML =
        '<div style="background:#FF8F00;color:#fff;padding:6px 10px;font-size:11px;font-weight:700;text-align:center;">🕐 Pendientes <span id="sp-pending-close-count" style="opacity:0.7;">(...)</span></div><div id="sp-pending-close-list" style="padding:4px;max-height:200px;overflow-y:auto;background:#fafafa;min-height:30px;"></div>';
      containerDiv.insertBefore(pendingCloseCol, closedCol);

      // Load pending close tickets
      void fetchPendingCloseTickets().then((pendingTickets) => {
        if (!pendingTickets.length) return;
        pendingCloseCol.style.display = "";
        const countEl = document.getElementById("sp-pending-close-count");
        if (countEl) countEl.textContent = `(${pendingTickets.length})`;
        const listEl = document.getElementById("sp-pending-close-list");
        if (!listEl) return;
        const withinHours = isWithinWorkHours();
        listEl.innerHTML = pendingTickets
          .map((pt) => {
            const cursor = withinHours
              ? "cursor:pointer;"
              : "cursor:not-allowed;opacity:0.6;";
            return `<div class="sp-mgr-ticket sp-pending-ticket" data-ticket-id="${pt.ticketId}" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;${cursor}"><div style="font-weight:600;color:#E65100;">${esc(pt.ticket)}</div>${!withinHours ? '<div style="color:#888;font-size:8px;">🔒 Fuera de horario</div>' : ""}</div>`;
          })
          .join("");
        listEl.addEventListener("click", (e: MouseEvent) => {
          if (!isWithinWorkHours()) {
            showErrorToast(
              "⏰ Fuera de horario laboral. No puedes cerrar tickets ahora.",
            );
            return;
          }
          const ticket = (e.target as Element).closest<HTMLElement>(
            ".sp-pending-ticket",
          );
          if (!ticket) return;
          const tId = ticket.dataset["ticketId"];
          if (tId)
            document.dispatchEvent(
              new CustomEvent("sp-open-ticket", {
                detail: { ticketId: parseInt(tId) },
              }),
            );
        });
      });

      // Setup drag and drop on panel
      let dragStartPos: { x: number; y: number } | null = null;
      panel.addEventListener("click", (e: MouseEvent) => {
        const ticket = (e.target as Element).closest<HTMLElement>(
          ".sp-team-ticket",
        );
        if (!ticket) return;
        if (
          dragStartPos &&
          (Math.abs(e.clientX - dragStartPos.x) > 5 ||
            Math.abs(e.clientY - dragStartPos.y) > 5)
        )
          return;
        const ticketId = ticket.dataset["ticketId"];
        if (ticketId) showQuickDetailModal(ticketId);
      });
      panel.addEventListener("mousedown", (e: MouseEvent) => {
        dragStartPos = { x: e.clientX, y: e.clientY };
      });
      panel.addEventListener("dragstart", (e: DragEvent) => {
        const ticket = (e.target as Element).closest<HTMLElement>(
          ".sp-team-ticket",
        );
        if (!ticket) return;
        e.dataTransfer!.setData("text/plain", ticket.dataset["ticketId"] ?? "");
        (ticket as HTMLElement).style.opacity = "0.4";
        dragStartPos = null;
      });
      panel.addEventListener("dragend", (e: DragEvent) => {
        const ticket = (e.target as Element).closest<HTMLElement>(
          ".sp-team-ticket",
        );
        if (ticket) ticket.style.opacity = "1";
      });
      panel.addEventListener("dragover", (e: DragEvent) => {
        e.preventDefault();
        const col = (e.target as Element).closest<HTMLElement>(
          "[id^='sp-team-col-']",
        );
        col
          ?.querySelector<HTMLElement>(".sp-team-tickets")
          ?.style.setProperty("background", "#e3f2fd");
      });
      panel.addEventListener("dragleave", (e: DragEvent) => {
        const col = (e.target as Element).closest<HTMLElement>(
          "[id^='sp-team-col-']",
        );
        if (col && !col.contains(e.relatedTarget as Node))
          col
            .querySelector<HTMLElement>(".sp-team-tickets")
            ?.style.setProperty("background", "#fafafa");
      });

      panel.addEventListener("drop", async (e: DragEvent) => {
        e.preventDefault();
        const col = (e.target as Element).closest<HTMLElement>(
          "[id^='sp-team-col-']",
        );
        if (!col) return;
        const dropZone = col.querySelector<HTMLElement>(".sp-team-tickets");
        if (!dropZone) return;
        dropZone.style.background = "#fafafa";
        const ticketId = e.dataTransfer!.getData("text/plain");
        const targetProfileId = dropZone.dataset["profileId"];
        if (!ticketId || !targetProfileId || targetProfileId === "unassigned")
          return;
        if (targetProfileId === "closed") {
          showLoadingToast("Cerrando ticket...");
          try {
            const closeRes = await fetch(
              `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
              {
                method: "PATCH",
                headers: spHeaders(),
                body: JSON.stringify({
                  nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                  ticketCommentRequest: null,
                }),
              },
            );
            if (!closeRes.ok) throw new Error(`HTTP ${closeRes.status}`);
            showSuccessToast("Ticket cerrado");
            void refreshClosedColumn();
          } catch (err) {
            showErrorToast(`Error: ${(err as Error).message}`);
          }
          return;
        }
        const sourceEl = panel.querySelector<HTMLElement>(
          `.sp-team-ticket[data-ticket-id="${ticketId}"]`,
        );
        const sourceZone = sourceEl?.closest<HTMLElement>(".sp-team-tickets");
        if (sourceZone?.dataset["profileId"] === targetProfileId) return;
        if (sourceEl) dropZone.appendChild(sourceEl);
        const dropAreaGroupId =
          parseInt(dropZone.dataset["areaGroup"] ?? "0") ||
          getTeamConfig().resolutionGroupId;
        const dropAreaConfig =
          Object.values(TEAM_AREAS).find(
            (a) => a.resolutionGroupId === dropAreaGroupId,
          ) || getTeamConfig();
        showLoadingToast("Reasignando ticket...");
        try {
          const res = await fetch(`${SP_API}/reassign/${ticketId}`, {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              resolutionGroupId: dropAreaConfig.resolutionGroupId,
              serviceId: null,
              responsibleProfileId: parseInt(targetProfileId),
              resolutionGroup: {
                label: dropAreaConfig.resolutionGroupLabel,
                value: dropAreaConfig.resolutionGroupId,
              },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as AnyObj;
          if (!json.success) throw new Error("No success");
          showSuccessToast("Ticket reasignado");
          void refreshTeamColumn(targetProfileId);
        } catch (err) {
          showErrorToast(`Error: ${(err as Error).message}`);
          void refreshTeamColumn(targetProfileId);
        }
      });

      // Fetch tickets per member
      areas.forEach((area) => {
        area.profiles.forEach((p: AnyObj) => {
          void fetch(
            `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${p.profileId}&ticketStatusName=Asignado`,
            { headers: spGetHeaders() },
          )
            .then((r) => r.json())
            .then((json: AnyObj) => {
              const tickets: AnyObj[] = (json.data || json).content || [];
              const col = document.getElementById(`sp-team-col-${p.profileId}`);
              if (!col) return;
              const countEl = col.querySelector(".sp-team-count");
              if (countEl) countEl.textContent = `(${tickets.length})`;
              const listEl = col.querySelector(".sp-team-tickets");
              if (!listEl) return;
              listEl.innerHTML = SP_Templates.ticketList(
                tickets as unknown as import("./types").SpTicket[],
                {
                  draggable: true,
                  showStatus: true,
                },
              );
            })
            .catch(() => {
              const col = document.getElementById(`sp-team-col-${p.profileId}`);
              if (col) {
                const listEl = col.querySelector(".sp-team-tickets");
                if (listEl)
                  listEl.innerHTML =
                    '<div style="text-align:center;padding:8px;color:#D94040;font-size:10px;">Error</div>';
              }
            });
        });
        void fetch(
          `${SP_SEARCH_API}?page=0&size=50&resolutionGroupId=${area.resolutionGroupId}&ticketStatusName=En%20espera`,
          { headers: spGetHeaders() },
        )
          .then((r) => r.json())
          .then((json: AnyObj) => {
            const tickets: AnyObj[] = (json.data || json).content || [];
            const col = document.getElementById(
              `sp-team-col-unassigned-${area.resolutionGroupId}`,
            );
            if (!col) return;
            const countEl = col.querySelector(".sp-team-count");
            if (countEl) countEl.textContent = `(${tickets.length})`;
            const listEl = col.querySelector(".sp-team-tickets");
            if (!listEl) return;
            listEl.innerHTML = SP_Templates.ticketList(
              tickets as unknown as import("./types").SpTicket[],
              {
                draggable: true,
                borderColor: "#FF8F00",
                codeColor: "#E65100",
              },
            );
          })
          .catch(() => {});
      });
      void refreshClosedColumn();
    } catch (err) {
      panel.innerHTML = `<div style="color:#D94040;padding:8px;font-size:12px;">Error: ${(err as Error).message}</div>`;
    }
    teamPanelLoading = false;
    injectGuardiasCalendar();
  }

  let teamRefreshing = false;
  function refreshTeamPanel() {
    if (teamRefreshing) return;
    teamRefreshing = true;
    const panel = document.getElementById(TEAM_PANEL_ID);
    if (!panel) {
      teamRefreshing = false;
      void loadTeamPanel();
      return;
    }
    if (!getToken()) {
      teamRefreshing = false;
      return;
    }
    const areas = getActiveAreas();
    const allProfiles: AnyObj[] = [];
    areas.forEach((a) => {
      allProfiles.push(...a.profiles);
    });
    let pending = allProfiles.length;
    allProfiles.forEach((p: AnyObj) => {
      void fetch(
        `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${p.profileId}&ticketStatusName=Asignado`,
        { headers: spGetHeaders() },
      )
        .then((r) => r.json())
        .then((json: AnyObj) => {
          const tickets: AnyObj[] = (json.data || json).content || [];
          const col = document.getElementById(`sp-team-col-${p.profileId}`);
          if (!col) return;
          const countEl = col.querySelector(".sp-team-count");
          if (countEl) countEl.textContent = `(${tickets.length})`;
          const listEl = col.querySelector(".sp-team-tickets");
          if (!listEl) return;
          listEl.innerHTML = SP_Templates.ticketList(
            tickets as unknown as import("./types").SpTicket[],
            {
              draggable: true,
              showStatus: true,
            },
          );
        })
        .catch(() => {})
        .finally(() => {
          pending--;
          if (pending <= 0) teamRefreshing = false;
        });
    });
    void refreshUnassignedColumn();
    void refreshClosedColumn();
  }

  function refreshTeamColumn(profileId: string) {
    void fetch(
      `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${profileId}&ticketStatusName=Asignado`,
      { headers: spGetHeaders() },
    )
      .then((r) => r.json())
      .then((json: AnyObj) => {
        const tickets: AnyObj[] = (json.data || json).content || [];
        const col = document.getElementById(`sp-team-col-${profileId}`);
        if (!col) return;
        const countEl = col.querySelector(".sp-team-count");
        if (countEl) countEl.textContent = `(${tickets.length})`;
        const listEl = col.querySelector(".sp-team-tickets");
        if (!listEl) return;
        listEl.innerHTML = SP_Templates.ticketList(
          tickets as unknown as import("./types").SpTicket[],
          {
            draggable: true,
            showStatus: true,
          },
        );
      })
      .catch(() => {});
  }

  function refreshUnassignedColumn() {
    getActiveAreas().forEach((area) => {
      void fetch(
        `${SP_SEARCH_API}?page=0&size=50&resolutionGroupId=${area.resolutionGroupId}&ticketStatusName=En%20espera`,
        { headers: spGetHeaders() },
      )
        .then((r) => r.json())
        .then((json: AnyObj) => {
          const tickets: AnyObj[] = (json.data || json).content || [];
          const col = document.getElementById(
            `sp-team-col-unassigned-${area.resolutionGroupId}`,
          );
          if (!col) return;
          const countEl = col.querySelector(".sp-team-count");
          if (countEl) countEl.textContent = `(${tickets.length})`;
          const listEl = col.querySelector(".sp-team-tickets");
          if (!listEl) return;
          listEl.innerHTML = SP_Templates.ticketList(
            tickets as unknown as import("./types").SpTicket[],
            {
              draggable: true,
              borderColor: "#FF8F00",
              codeColor: "#E65100",
            },
          );
        })
        .catch(() => {});
    });
  }

  function refreshClosedColumn() {
    const today = new Date();
    const todayStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T00:00`;
    const todayEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}T23:59`;
    const areas = getActiveAreas();
    const allClosed: AnyObj[] = [];
    let pending = areas.length;
    areas.forEach((area) => {
      void fetch(
        `https://macropayapi.supportplus.mx/tickets/search-all-tickets?resolutionGroupId=${area.resolutionGroupId}&ticketStatusName=Cerrado&initDate=${todayStart}&endDate=${todayEnd}&page=0&size=100`,
        { headers: spGetHeaders() },
      )
        .then((r) => r.json())
        .then((json: AnyObj) => {
          allClosed.push(...((json.data || json).content || []));
        })
        .catch(() => {})
        .finally(() => {
          pending--;
          if (pending <= 0) renderClosedColumn(allClosed);
        });
    });
  }

  function renderClosedColumn(tickets: AnyObj[]) {
    const col = document.getElementById("sp-team-col-closed");
    if (!col) return;
    const countEl = col.querySelector(".sp-team-count");
    if (countEl) countEl.textContent = `(${tickets.length})`;
    const listEl = col.querySelector(".sp-team-tickets");
    if (!listEl) return;
    if (!tickets.length) {
      listEl.innerHTML =
        '<div style="text-align:center;padding:8px;color:#aaa;font-size:11px;">Sin tickets cerrados hoy</div>';
      return;
    }
    listEl.innerHTML = tickets
      .map(
        (t: AnyObj) =>
          `<div class="sp-team-ticket" style="display:block;padding:4px 6px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #2E7D32;font-size:10px;line-height:1.3;"><div style="font-weight:600;color:#2E7D32;">${t.uniqueCode || ""}</div><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">${(t.subject || "").substring(0, 30)}</div><div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#2E7D32;font-weight:600;font-size:9px;">Cerrado</span><span style="color:#888;font-size:9px;">${(t.responsibleName || "").split(" ")[0]}</span></div></div>`,
      )
      .join("");
  }

  // ─── Pending close alert ──────────────────────────────────────
  let _pendingAlertShown = false;
  async function checkPendingCloseAlert() {
    if (_pendingAlertShown) return;
    const grid = document.querySelector(".MuiDataGrid-root");
    if (!grid) return;
    try {
      const pendingResp = await new Promise<AnyObj>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "api-get", endpoint: "/tickets-por-cerrar" },
          (r: AnyObj) => resolve(r),
        );
      });
      const pendingTickets: AnyObj[] =
        pendingResp?.success && pendingResp.data?.data
          ? pendingResp.data.data
          : [];
      if (!pendingTickets.length) return;
      _pendingAlertShown = true;
      document.getElementById("sp-pending-close-alert")?.remove();
      const alertDiv = document.createElement("div");
      alertDiv.id = "sp-pending-close-alert";
      alertDiv.style.cssText =
        "margin-bottom:8px;padding:10px 16px;background:#FFF3E0;border:1px solid #FF8F00;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;font-family:system-ui;";
      alertDiv.innerHTML = `<span style="font-size:20px;">🕐</span><span style="flex:1;font-size:13px;color:#E65100;font-weight:600;">Hay ${pendingTickets.length} ticket(s) pendientes por cerrar</span><span style="padding:4px 12px;background:#FF8F00;color:#fff;border-radius:6px;font-size:12px;font-weight:600;">Cerrar ahora</span>`;
      const panelEl =
        document.getElementById(TEAM_PANEL_ID) ||
        document.getElementById("sp-manager-panel");
      const insertRef = panelEl || grid;
      insertRef.parentElement?.insertBefore(alertDiv, insertRef);
      alertDiv.addEventListener("click", () => {
        if (!isWithinWorkHours()) {
          SP_Modal.info({
            id: "sp-pending-close-modal",
            title: "⏰ Fuera de horario laboral",
            content: `<p style="font-size:14px;color:#555;margin:0 0 12px;">No se pueden cerrar tickets fuera del horario laboral.</p><p style="font-size:13px;color:#888;margin:0;">Horario: ${_workSchedule.horaEntrada}:00 - ${_workSchedule.horaSalida}:00, ${_workSchedule.diaInicio} a ${_workSchedule.diaFinal}</p>`,
            maxWidth: "380px",
            modalOptions: { textAlign: "center" },
          });
          return;
        }
        const ticketList = pendingTickets
          .map((p: AnyObj) => ({
            ticket: p.Ticket || "",
            ticketId: p.IdSupportPlus || 0,
            pageId: p.IdTicketPorCerrar,
          }))
          .filter((t) => t.ticketId);
        const listHTML = ticketList
          .map(
            (t) =>
              `<div style="padding:4px 8px;font-size:12px;border-bottom:1px solid #eee;">${t.ticket}</div>`,
          )
          .join("");
        const m = SP_Modal.info({
          id: "sp-pending-close-modal",
          title: `🔒 Cerrar ${ticketList.length} tickets pendientes`,
          content: `<p style="font-size:13px;color:#555;margin:0 0 12px;">Se cerrarán los siguientes tickets:</p><div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:16px;">${listHTML}</div><div id="sp-pending-close-progress" style="display:none;margin-bottom:12px;padding:8px;background:#f5f5f5;border-radius:6px;font-size:12px;text-align:center;"></div><div style="display:flex;gap:8px;"><button id="sp-pending-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">✅ Cerrar todos</button><button id="sp-pending-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>`,
          maxWidth: "450px",
        });
        (
          document.getElementById(
            "sp-pending-close-cancel",
          ) as HTMLButtonElement
        ).addEventListener("click", m.close);
        (
          document.getElementById(
            "sp-pending-close-confirm",
          ) as HTMLButtonElement
        ).addEventListener("click", async () => {
          const confirmBtn = document.getElementById(
            "sp-pending-close-confirm",
          ) as HTMLButtonElement;
          const progress = document.getElementById(
            "sp-pending-close-progress",
          ) as HTMLElement;
          confirmBtn.disabled = true;
          confirmBtn.textContent = "⏳ Cerrando...";
          progress.style.display = "block";
          let closed = 0,
            errors = 0,
            skipped = 0;
          for (let i = 0; i < ticketList.length; i++) {
            progress.textContent = `Procesando ${i + 1} de ${ticketList.length}...`;
            try {
              const ticketRes = await fetch(
                `${SP_API}/${ticketList[i].ticketId}`,
                { headers: spGetHeaders() },
              );
              const ticketJson = (await ticketRes.json()) as AnyObj;
              const ticketData: AnyObj = ticketJson.data || ticketJson;
              const alreadyClosed = ticketData.ticketStatus?.name === "Cerrado";
              if (alreadyClosed) {
                chrome.runtime.sendMessage({
                  type: "api-put",
                  endpoint: `/tickets-por-cerrar/cerrar-por-sp/${ticketList[i].ticketId}`,
                  body: { usuarioModificacion: "EXTENSION" },
                });
                skipped++;
              } else {
                const closeRes = await fetch(
                  `${SP_API}/update-ticket-status-with-optional-comment/${ticketList[i].ticketId}`,
                  {
                    method: "PATCH",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                      ticketCommentRequest: null,
                    }),
                  },
                );
                if (!closeRes.ok) throw new Error(`HTTP ${closeRes.status}`);
                chrome.runtime.sendMessage({
                  type: "api-put",
                  endpoint: `/tickets-por-cerrar/cerrar-por-sp/${ticketList[i].ticketId}`,
                  body: { usuarioModificacion: "EXTENSION" },
                });
                closed++;
              }
              void updateMondayStatus(
                ticketList[i].ticketId,
                ticketList[i].ticket,
                "Cerrado",
              );
            } catch {
              errors++;
            }
          }
          m.close();
          alertDiv.remove();
          _pendingAlertShown = false;
          if (errors === 0)
            showSuccessToast(
              `✅ ${closed} cerrados${skipped ? `, ${skipped} ya estaban cerrados` : ""}`,
            );
          else showErrorToast(`${closed} cerrados, ${errors} errores`);
          refreshTeamPanel();
        });
      });
    } catch {
      /* ignore */
    }
  }

  // ─── showQuickDetailModal (entry point for ticket detail) ────
  let _qdCommentsInterval: ReturnType<typeof setInterval> | null = null;
  let _qdLastOpen = 0;

  async function showQuickDetailModal(
    ticketId: number | string,
  ): Promise<void> {
    if (Date.now() - _qdLastOpen < 500) return;
    _qdLastOpen = Date.now();
    if (_qdCommentsInterval) {
      clearInterval(_qdCommentsInterval);
      _qdCommentsInterval = null;
    }
    document.getElementById("sp-quick-detail-modal")?.remove();
    document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
    showLoadingToast("Cargando detalle...");
    if (!getToken()) {
      showErrorToast("No hay token");
      return;
    }
    try {
      const res = await fetch(`${SP_API}/${ticketId}`, {
        headers: spGetHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AnyObj;
      const t: AnyObj = json.data || json;
      document.getElementById("sp-loading-toast")?.remove();
      const desc = (t.description || "").replace(
        /<script[^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      const holderName: string =
        t.ticketHolder?.ticketHolderLog?.fullName || "Sin asignar";
      const holderEmail: string = t.ticketHolder?.ticketHolderLog?.email || "";
      const requesterName: string = t.ticketInfo?.fullName || "";
      const requesterEmail: string = t.ticketInfo?.email || "";
      const statusName: string = t.ticketStatus?.name || "";
      const priorityName: string = t.incidentPriority?.name || "";
      const serviceName: string = t.service?.name || "";
      const groupName: string = t.resolutionGroup?.name || "";
      const reportType: string = t.reportType?.name || "";
      const createdAt: string = t.createdAt
        ? t.createdAt.replace("T", " ").substring(0, 16)
        : "";
      const updatedAt: string = t.updatedAt
        ? t.updatedAt.replace("T", " ").substring(0, 16)
        : "";
      const channel: string = t.attentionChannel?.name || "";
      const department: string = t.ticketInfo?.departmentName || "";
      const location: string = t.ticketInfo?.location || "";
      const attachments: AnyObj[] = t.ticketAttachments?.attachments || [];
      const comments: AnyObj[] = t.ticketComments || [];
      const participants: AnyObj[] = t.participants || [];
      const isUnassigned = statusName === "En espera";

      let _canCommentClosedResolved = _canCommentClosed;
      let _canReopenTicketsResolved = _canReopenTickets;
      if (!_canReopenTicketsResolved || !_canCommentClosedResolved) {
        try {
          const permsData = await new Promise<AnyObj>((r) =>
            chrome.storage.local.get("subgroupPerms", (d: AnyObj) =>
              r(d["subgroupPerms"] || {}),
            ),
          );
          if (!_canReopenTicketsResolved)
            _canReopenTicketsResolved = !!permsData["canReopenTickets"];
          if (!_canCommentClosedResolved)
            _canCommentClosedResolved = !!permsData["canCommentClosed"];
        } catch {
          /* ignore */
        }
      }

      // Sync to Monday (non-blocking)
      void (async () => {
        try {
          let mondayToken = await getMondayToken();
          if (!mondayToken) {
            await new Promise<void>((r) =>
              chrome.runtime.sendMessage({ type: "sync" }, () => r()),
            );
            await new Promise<void>((r) => setTimeout(r, 2000));
            mondayToken = await getMondayToken();
          }
          if (!mondayToken || !t.uniqueCode) return;
          const spStatus: string = (t.ticketStatus?.name || "").toLowerCase();
          const hEmail: string = t.ticketHolder?.ticketHolderLog?.email || "";
          const mondayStatusIndex = mapStatusToMonday(spStatus);
          const boards = await SP_API_Lib.getMondayTicketBoards(mondayToken);
          for (const b of boards) {
            const itemData = await mondayQuery(
              mondayToken,
              "query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }",
              { boardId: b.id, columnId: "text_mm2c9nhc", value: t.uniqueCode },
            );
            const items: AnyObj[] =
              (itemData.items_page_by_column_values as AnyObj)?.items || [];
            if (items.length) {
              const colValues: AnyObj = {
                status: { index: mondayStatusIndex },
              };
              if (hEmail) {
                const usersMap = await SP_API_Lib.getMondayUsers(mondayToken);
                const uId = usersMap[hEmail.toLowerCase()];
                if (uId)
                  colValues["multiple_person_mm25nvfq"] = {
                    personsAndTeams: [{ id: parseInt(uId), kind: "person" }],
                  };
              }
              await mondayQuery(
                mondayToken,
                "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
                {
                  boardId: b.id,
                  itemId: items[0].id,
                  columnValues: JSON.stringify(colValues),
                },
              );
              break;
            }
          }
        } catch (e) {
          SP_Log.warn("Modal Monday sync error:", (e as Error).message);
        }
      })();

      let attachHTML = "";
      if (attachments.length) {
        attachHTML = `<div style="margin-top:12px;"><b style="font-size:12px;">📎 Adjuntos (${attachments.length}):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">`;
        attachments.forEach((a: AnyObj) => {
          const fileName: string = a.file?.name || "archivo";
          const fileId: string = a.file?.id || "";
          attachHTML += `<button class="sp-qd-download" data-file-id="${fileId}" data-file-name="${fileName.replace(/"/g, "&quot;")}" style="padding:4px 8px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:11px;cursor:pointer;color:#1976D2;">📎 ${esc(fileName)}</button>`;
        });
        attachHTML += "</div></div>";
      }
      let participantsHTML = "";
      if (participants.length) {
        participantsHTML = `<div style="margin-top:12px;"><b style="font-size:12px;">👥 Participantes (${participants.length}):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">`;
        participants.forEach((p: AnyObj) => {
          participantsHTML += `<span style="padding:2px 6px;background:#e8f5e9;border:1px solid #2E7D32;border-radius:4px;font-size:10px;">${p.profileFullName || p.email || ""}</span>`;
        });
        participantsHTML += "</div></div>";
      }

      function buildCommentHTML(c: AnyObj): string {
        const cDate = utcToLocal(c.createdAt);
        const cContent = (c.content || "").replace(
          /<script[^>]*>[\s\S]*?<\/script>/gi,
          "",
        );
        const cAttachments: AnyObj[] = c.attachments || [];
        let cAttachHTML = "";
        if (cAttachments.length) {
          cAttachHTML =
            '<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">';
          cAttachments.forEach((a: AnyObj) => {
            const cFileId: string = a.fileId || a.file?.id || a.id;
            const cFileName: string = a.file?.name || a.name || "archivo";
            cAttachHTML += `<button class="sp-qd-download" data-file-id="${cFileId}" data-file-name="${cFileName.replace(/"/g, "&quot;")}" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:0.8rem;cursor:pointer;color:#1976D2;">📎 ${esc(cFileName)}</button>`;
          });
          cAttachHTML += "</div>";
        }
        const myName = getLoggedUserName();
        const myEmail = getLoggedUserEmail();
        const isMyComment =
          (c.email &&
            myEmail &&
            c.email.toLowerCase() === myEmail.toLowerCase()) ||
          c.fullName === myName;
        const addAttachBtn = isMyComment
          ? ` <label class="sp-qd-add-attach" data-comment-id="${c.id}" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar evidencia">📎<input type="file" multiple style="display:none;"></label>`
          : "";
        const align = isMyComment ? "flex-end" : "flex-start";
        const userColor = isMyComment
          ? null
          : stringToColor(c.fullName || "user");
        const bgColor = isMyComment ? "#e3f2fd" : userColor!.bg;
        const borderSide = isMyComment
          ? "border-right:3px solid #1976D2;"
          : `border-left:3px solid ${userColor!.border};`;
        return `<div style="display:flex;justify-content:${align};margin-bottom:6px;"><div class="sp-comment-bubble" style="max-width:85%;padding:6px 10px;background:${bgColor};${borderSide}border-radius:6px;font-size:0.85rem;"><div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;${isMyComment ? "justify-content:flex-end;" : ""}"><span style="font-weight:600;font-size:0.8rem;">${c.fullName || ""}</span><span style="color:#888;font-size:0.75rem;">${cDate}</span>${addAttachBtn}</div><div style="color:#333;">${cContent}</div>${cAttachHTML}</div></div>`;
      }

      const commentsHTML = comments.length
        ? comments.map(buildCommentHTML).join("")
        : '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>';

      const overlay = document.createElement("div");
      overlay.id = "sp-quick-detail-modal";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:99999;display:flex;align-items:center;justify-content:center;transition:background 0.3s ease,backdrop-filter 0.3s ease;backdrop-filter:blur(0px);";

      const actionBtns = `<span id="sp-qd-actions" style="display:flex;gap:4px;"></span>`;
      const statusBadge =
        statusName === "Cerrado"
          ? `<span style="color:#2E7D32;font-weight:700;font-size:0.9rem;">Cerrado</span>`
          : `<select id="sp-qd-status-select" style="font-size:0.9rem;border:none;background:transparent;color:${STATUS_TEXT_COLORS[statusName] || "#333"};font-weight:700;cursor:pointer;"><option value="" selected>${statusName}</option><option value="" disabled>Cargando...</option></select>`;

      const takeFormHTML = isUnassigned
        ? `<div style="margin-bottom:8px;"><div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><button id="sp-qd-take-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🤚 Tomar</button>${_canRejectTickets ? '<button id="sp-qd-reject-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D32F2F;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">❌ Rechazar</button>' : ""}<select id="sp-qd-assign-select" style="flex:1;padding:6px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:6px;"><option value="">-- Asignar a --</option></select></div><div id="sp-qd-take-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:0.9rem;"><label style="display:block;margin-bottom:4px;font-weight:600;color:#555;">Comentario al tomar</label><textarea id="sp-qd-take-comment" style="width:100%;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;">se revisa</textarea><label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.9rem;"><input type="checkbox" id="sp-qd-take-done"> <b>Ticket realizado</b></label><div id="sp-qd-take-extra" style="display:none;margin-top:6px;"><textarea id="sp-qd-take-close-comment" placeholder="Comentario de cierre..." style="width:100%;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;"></textarea></div><div style="display:flex;gap:6px;margin-top:8px;"><button id="sp-qd-take-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Confirmar</button><button id="sp-qd-take-cancel" style="padding:6px 12px;border:1px solid #999;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:0.9rem;font-weight:600;">Cancelar</button></div><div id="sp-qd-take-suggested" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div></div></div>`
        : "";

      const closeFormHTML =
        statusName !== "En espera" && statusName !== "Cerrado"
          ? `<div style="margin-bottom:8px;"><div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><button id="sp-qd-close-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔒 Cerrar</button>${holderEmail && holderEmail.toLowerCase() !== getLoggedUserEmail().toLowerCase() ? '<button id="sp-qd-steal-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🤚 Tomar</button>' : ""}</div><div id="sp-qd-close-form" style="display:none;padding:8px;border:1px solid #e0e0e0;border-radius:6px;font-size:0.9rem;"><textarea id="sp-qd-close-comment" placeholder="Comentario de cierre..." style="width:100%;padding:5px 8px;font-size:0.9rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;margin-bottom:6px;min-height:40px;resize:vertical;font-family:system-ui;"></textarea><div style="display:flex;gap:6px;"><button id="sp-qd-close-confirm" style="padding:6px 12px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Confirmar</button><button id="sp-qd-close-cancel" style="padding:6px 12px;border:1px solid #999;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:0.9rem;font-weight:600;">Cancelar</button></div><div id="sp-qd-close-suggested" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div></div></div>`
          : "";

      const migrateHTML =
        statusName === "Cerrado" &&
        !(t.uniqueCode && getCache()?.[t.uniqueCode])
          ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><button id="sp-qd-migrate-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🙂 Migrar a Monday</button></div>`
          : "";
      const reopenHTML =
        statusName === "Cerrado" && _canReopenTicketsResolved
          ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><button id="sp-qd-reopen-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔓 Reabrir</button></div>`
          : "";

      overlay.innerHTML =
        `<div style="background:#fff;padding:clamp(16px,2vw,28px);border-radius:12px;width:92vw;max-width:900px;max-height:85vh;display:flex;flex-direction:column;overflow-y:auto;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);transform:scale(0.95);opacity:0;transition:transform 0.2s ease,opacity 0.2s ease;box-shadow:0 8px 40px rgba(0,0,0,0.25);">` +
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;font-size:1.1rem;">📋 ${t.uniqueCode || ticketId} <span class="sp-qd-copy-folio" data-copy="${t.uniqueCode || ticketId}" style="cursor:pointer;font-size:0.85rem;opacity:0.6;" title="Copiar folio">⧉</span> <span style="font-weight:400;color:${STATUS_TEXT_COLORS[statusName] || "#333"};font-size:0.85rem;">(${statusName})</span></h3><div style="display:flex;gap:6px;align-items:center;">${actionBtns}<a href="/es/dashboard/tickets/${ticketId}" target="_blank" style="padding:5px 10px;border:1px solid #1976D2;border-radius:6px;font-size:0.9rem;text-decoration:none;color:#1976D2;">Abrir ↗</a><button id="sp-qd-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.9rem;">✕</button></div></div>` +
        `<div style="flex:1;overflow:auto;"><div style="background:#f5f5f5;padding:8px 10px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:8px;">${t.subject || "Sin asunto"}</div>` +
        `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px;font-size:0.9rem;"><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;">${statusBadge}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Prioridad:</span> ${priorityName}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Tipo:</span> ${reportType}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Canal:</span> ${channel}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Grupo:</span> ${groupName}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Servicio:</span> ${serviceName}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Creado:</span> ${createdAt}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Actualizado:</span> ${updatedAt}</div></div>` +
        takeFormHTML +
        closeFormHTML +
        migrateHTML +
        reopenHTML +
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;"><div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.9rem;"><b style="color:#888;">👤 Solicitante:</b> ${requesterName} <span class="sp-qd-copy-name" data-copy="${requesterName}" style="cursor:pointer;font-size:0.8rem;opacity:0.6;" title="Copiar nombre">📋</span>${requesterEmail ? `<br><span style="color:#888;">(${requesterEmail}) <span class="sp-qd-copy-email" data-copy="${requesterEmail}" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>` : ""}${department ? `<br><span style="color:#aaa;">${department} | ${location}</span>` : ""}</div><div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.9rem;"><b style="color:#888;">🔍 Analista:</b> ${holderName}${holderEmail ? `<br><span style="color:#888;">(${holderEmail}) <span class="sp-qd-copy-email" data-copy="${holderEmail}" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>` : ""}</div></div>` +
        `<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;margin-bottom:8px;"><b style="font-size:0.8rem;color:#888;">📝 Descripción</b><div style="margin:4px 0 0;font-size:0.9rem;line-height:1.5;color:#333;max-height:200px;overflow:auto;">${desc}</div></div>` +
        attachHTML +
        participantsHTML +
        `<div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px;"><b style="font-size:12px;">💬 Comentarios (${comments.length})</b><div id="sp-qd-comments-list" style="max-height:250px;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column-reverse;">${commentsHTML}</div>` +
        (statusName !== "Cerrado" || _canCommentClosedResolved
          ? `<div id="sp-qd-comment-section"><div style="display:flex;gap:6px;margin-top:8px;align-items:center;"><textarea id="sp-qd-comment-input" placeholder="Escribe un comentario..." style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;outline:none;min-height:36px;resize:vertical;font-family:system-ui;"></textarea><label style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;" title="Adjuntar archivos">📎<input id="sp-qd-attach-input" type="file" multiple style="display:none;"></label><button id="sp-qd-comment-send" style="padding:6px 12px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:12px;white-space:nowrap;">Enviar</button></div><div id="sp-qd-attach-list" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;"></div><div id="sp-qd-suggested" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;"></div></div>`
          : "") +
        `</div></div></div>`;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.background = "rgba(0,0,0,0.5)";
        overlay.style.backdropFilter = "blur(6px)";
        const modalBox = overlay.querySelector<HTMLElement>("div");
        if (modalBox) {
          modalBox.style.transform = "scale(1)";
          modalBox.style.opacity = "1";
        }
      });

      const closeQdModal = () => {
        if (_qdCommentsInterval) {
          clearInterval(_qdCommentsInterval);
          _qdCommentsInterval = null;
        }
        const modalBox = overlay.querySelector<HTMLElement>("div");
        if (modalBox) {
          modalBox.style.transform = "scale(0.9) translateY(10px)";
          modalBox.style.opacity = "0";
        }
        overlay.style.background = "rgba(0,0,0,0)";
        overlay.style.backdropFilter = "blur(0px)";
        setTimeout(() => overlay.remove(), 250);
      };

      (
        document.getElementById("sp-qd-close") as HTMLButtonElement
      ).addEventListener("click", closeQdModal);
      document.addEventListener(
        "keydown",
        function escHandler(e: KeyboardEvent) {
          if (
            e.key === "Escape" &&
            document.getElementById("sp-quick-detail-modal") &&
            !document.getElementById("sp-carousel-modal")
          ) {
            closeQdModal();
            document.removeEventListener("keydown", escHandler);
          }
        },
      );

      // Auto-refresh comments every 30s
      _qdCommentsInterval = setInterval(() => {
        if (!document.getElementById("sp-quick-detail-modal")) {
          clearInterval(_qdCommentsInterval!);
          _qdCommentsInterval = null;
          return;
        }
        void fetch(`${SP_API}/${ticketId}`, { headers: spGetHeaders() })
          .then((r) => r.json())
          .then((json: AnyObj) => {
            const ticket: AnyObj = json.data || json;
            const newComments: AnyObj[] = ticket.ticketComments || [];
            const list = document.getElementById("sp-qd-comments-list");
            if (!list) return;
            const currentCount =
              list.querySelectorAll(".sp-comment-bubble").length;
            if (newComments.length === currentCount) return;
            list.innerHTML = newComments.length
              ? newComments.map(buildCommentHTML).join("")
              : '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>';
          })
          .catch(() => {});
      }, 30000);

      // Move action buttons to header area
      const actionsContainer = document.getElementById("sp-qd-actions");
      if (actionsContainer) {
        [
          "sp-qd-close-btn",
          "sp-qd-steal-btn",
          "sp-qd-take-btn",
          "sp-qd-reject-btn",
          "sp-qd-migrate-btn",
          "sp-qd-reopen-btn",
        ].forEach((id) => {
          const btn = document.getElementById(id) as HTMLButtonElement | null;
          if (btn) {
            btn.style.padding = "5px 10px";
            btn.style.fontSize = "11px";
            actionsContainer.appendChild(btn);
          }
        });
        if (
          _btnReassignApp &&
          department.toLowerCase().includes("mesa de ayuda") &&
          groupName.toLowerCase().includes("infraestructura dba") &&
          statusName !== "Cerrado"
        ) {
          const reassignAppBtn = document.createElement("button");
          reassignAppBtn.textContent = "🔀 Aplicaciones";
          reassignAppBtn.style.cssText =
            "padding:5px 10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;";
          reassignAppBtn.addEventListener("click", () =>
            showReassignAppModal(ticketId),
          );
          actionsContainer.insertBefore(
            reassignAppBtn,
            actionsContainer.firstChild,
          );
        }
      }

      // Copy buttons
      overlay
        .querySelector<HTMLElement>(".sp-qd-copy-folio")
        ?.addEventListener("click", function (this: HTMLElement) {
          void navigator.clipboard
            .writeText(this.dataset["copy"] || "")
            .then(() => {
              this.textContent = "✅";
              setTimeout(() => {
                this.textContent = "⧉";
              }, 1500);
            });
        });
      overlay
        .querySelector<HTMLElement>(".sp-qd-copy-name")
        ?.addEventListener("click", function (this: HTMLElement) {
          void navigator.clipboard
            .writeText(this.dataset["copy"] || "")
            .then(() => {
              this.textContent = "✅";
              setTimeout(() => {
                this.textContent = "📋";
              }, 1500);
            });
        });
      overlay
        .querySelectorAll<HTMLElement>(".sp-qd-copy-email")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            void navigator.clipboard
              .writeText(btn.dataset["copy"] || "")
              .then(() => {
                btn.textContent = "✅";
                setTimeout(() => {
                  btn.textContent = "📋";
                }, 1500);
              });
          });
        });

      // Status select options loader
      const statusSelect = document.getElementById(
        "sp-qd-status-select",
      ) as HTMLSelectElement | null;
      if (statusSelect && statusName !== "Cerrado") {
        void fetch(
          `https://macropayapi.supportplus.mx/ticket-status/next-status-options/${t.ticketStatus?.id || ""}`,
          { headers: spGetHeaders() },
        )
          .then((r) => r.json())
          .then((json: AnyObj) => {
            const opts: AnyObj[] = json.data || [];
            statusSelect.innerHTML = `<option value="" data-id="">${statusName} (actual)</option>`;
            opts.forEach((opt: AnyObj) => {
              const ns: AnyObj = opt.nextStatus || {};
              statusSelect.innerHTML += `<option value="${ns.id}" data-name="${ns.name || opt.name}">${ns.name || opt.name}</option>`;
            });
          })
          .catch(() => {});
        statusSelect.addEventListener("change", async () => {
          const selectedOpt = statusSelect.options[statusSelect.selectedIndex];
          const newStatusId = statusSelect.value;
          const newStatusName: string =
            selectedOpt.dataset["name"] || selectedOpt.textContent || "";
          if (!newStatusId) return;
          statusSelect.disabled = true;
          showLoadingToast("Cambiando estatus...");
          try {
            const statusRes = await fetch(
              `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
              {
                method: "PATCH",
                headers: spHeaders(),
                body: JSON.stringify({
                  nextTicketStatusId: parseInt(newStatusId),
                  ticketCommentRequest: null,
                }),
              },
            );
            if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
            showSuccessToast(`Estatus cambiado a: ${newStatusName}`);
            void updateMondayStatus(ticketId, t.uniqueCode, newStatusName);
            statusSelect.style.color =
              STATUS_TEXT_COLORS[newStatusName] || "#333";
          } catch (err) {
            showErrorToast(`Error: ${(err as Error).message}`);
          }
          statusSelect.disabled = false;
        });
      }

      // Take form toggle
      const takeBtn = document.getElementById(
        "sp-qd-take-btn",
      ) as HTMLButtonElement | null;
      const takeForm = document.getElementById(
        "sp-qd-take-form",
      ) as HTMLElement | null;
      let takeFormShown = false;
      if (takeBtn && takeForm) {
        const assignSelect = document.getElementById(
          "sp-qd-assign-select",
        ) as HTMLSelectElement | null;
        const ticketGroupId: number =
          t.resolutionGroup?.id || getTeamConfig().resolutionGroupId;
        void fetch(
          `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${ticketGroupId}`,
          { headers: spGetHeaders() },
        )
          .then((r) => r.json())
          .then((json: AnyObj) => {
            const profiles: AnyObj[] = json.data || json;
            if (Array.isArray(profiles) && assignSelect) {
              profiles.forEach((p: AnyObj) => {
                const opt = document.createElement("option");
                opt.value = p.profileId;
                opt.textContent = p.profileFullName;
                opt.dataset["email"] = p.email || "";
                assignSelect.appendChild(opt);
              });
            }
          })
          .catch(() => {});

        takeBtn.addEventListener("click", () => {
          takeFormShown = !takeFormShown;
          takeForm.style.display = takeFormShown ? "block" : "none";
          if (assignSelect)
            assignSelect.style.display = takeFormShown ? "none" : "";
          const commentSection = document.getElementById(
            "sp-qd-comment-section",
          );
          if (commentSection)
            commentSection.style.display = takeFormShown ? "none" : "";
          takeBtn.textContent = takeFormShown ? "✕ Cancelar" : "🤚 Tomar";
          takeBtn.style.background = takeFormShown ? "#999" : "#1976D2";
        });

        const takeDoneCheck = document.getElementById(
          "sp-qd-take-done",
        ) as HTMLInputElement | null;
        const takeExtraDiv = document.getElementById(
          "sp-qd-take-extra",
        ) as HTMLElement | null;
        takeDoneCheck?.addEventListener("change", () => {
          if (takeExtraDiv)
            takeExtraDiv.style.display = takeDoneCheck.checked
              ? "block"
              : "none";
        });

        document
          .getElementById("sp-qd-take-cancel")
          ?.addEventListener("click", () => {
            takeFormShown = false;
            takeForm.style.display = "none";
            if (assignSelect) assignSelect.style.display = "";
            takeBtn.textContent = "🤚 Tomar";
            takeBtn.style.background = "#1976D2";
            const cs = document.getElementById("sp-qd-comment-section");
            if (cs) cs.style.display = "";
          });

        document
          .getElementById("sp-qd-take-confirm")
          ?.addEventListener("click", async () => {
            const comment =
              (
                document.getElementById(
                  "sp-qd-take-comment",
                ) as HTMLTextAreaElement
              ).value.trim() || "se revisa";
            const closeComment = takeDoneCheck?.checked
              ? (
                  document.getElementById(
                    "sp-qd-take-close-comment",
                  ) as HTMLTextAreaElement
                )?.value.trim()
              : "";
            const profileId = await getMyProfileId();
            if (!profileId) {
              showErrorToast("No se pudo obtener tu perfil");
              return;
            }
            const btn = document.getElementById(
              "sp-qd-take-confirm",
            ) as HTMLButtonElement;
            btn.disabled = true;
            btn.innerHTML = spinnerHTML(12, "Tomando...");
            showLoadingToast("Tomando ticket...");
            try {
              const body: AnyObj = {
                resolutionGroupId: getTeamConfig().resolutionGroupId,
                serviceId: null,
                responsibleProfileId: profileId,
                resolutionGroup: {
                  label: getTeamConfig().resolutionGroupLabel,
                  value: getTeamConfig().resolutionGroupId,
                },
                ticketCommentRequest: { internal: false, content: comment },
              };
              const res = await fetch(`${SP_API}/reassign/${ticketId}`, {
                method: "PUT",
                headers: spHeaders(),
                body: JSON.stringify(body),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const json = (await res.json()) as AnyObj;
              if (json.success) {
                if (takeDoneCheck?.checked) {
                  if (!isWithinWorkHours()) {
                    const stored = await new Promise<AnyObj>((r) =>
                      chrome.storage.local.get(["usersMap", "userEmail"], (d) =>
                        r(d as AnyObj),
                      ),
                    );
                    const pEmail = (
                      (stored["userEmail"] as string) || ""
                    ).toLowerCase();
                    const pUser = ((stored["usersMap"] as AnyObj) || {})[
                      pEmail
                    ];
                    if (pUser?.idUsuario)
                      await saveTicketPendingClose(
                        t.uniqueCode || `T${ticketId}`,
                        ticketId as number,
                        String(pUser.idUsuario),
                        "",
                      );
                    showSuccessToast(
                      "Ticket tomado. Cierre pendiente (fuera de horario).",
                    );
                    closeQdModal();
                    return;
                  }
                  if (closeComment)
                    await fetch(`${SP_API}/comment/${ticketId}`, {
                      method: "POST",
                      headers: spHeaders(),
                      body: JSON.stringify({
                        content: `<p>${closeComment}</p>`,
                        internal: false,
                      }),
                    });
                  await fetch(
                    `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
                    {
                      method: "PATCH",
                      headers: spHeaders(),
                      body: JSON.stringify({
                        nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                        ticketCommentRequest: null,
                      }),
                    },
                  );
                  showSuccessToast("Ticket tomado y cerrado");
                } else {
                  showSuccessToast("Ticket tomado");
                }
                closeQdModal();
                void showQuickDetailModal(ticketId);
              } else throw new Error("No success");
            } catch (err) {
              showErrorToast(`Error: ${(err as Error).message}`);
              btn.disabled = false;
              btn.textContent = "Confirmar";
            }
          });
      }

      // Reject button
      document
        .getElementById("sp-qd-reject-btn")
        ?.addEventListener("click", async () => {
          if (!confirm("¿Rechazar este ticket?")) return;
          const rejectBtn = document.getElementById(
            "sp-qd-reject-btn",
          ) as HTMLButtonElement;
          rejectBtn.disabled = true;
          rejectBtn.textContent = "⏳...";
          try {
            const res = await fetch(`${SP_API}/change-status/${ticketId}`, {
              method: "PUT",
              headers: spHeaders(),
              body: JSON.stringify({
                nextTicketStatusId: SP_CONFIG.SP_STATUSES["RECHAZADO"],
                ticketCommentRequest: null,
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showSuccessToast("Ticket rechazado");
            closeQdModal();
            void showQuickDetailModal(ticketId);
          } catch (err) {
            showErrorToast(`Error: ${(err as Error).message}`);
            rejectBtn.disabled = false;
            rejectBtn.textContent = "❌ Rechazar";
          }
        });

      // Close form toggle
      const closeBtn = document.getElementById(
        "sp-qd-close-btn",
      ) as HTMLButtonElement | null;
      const closeForm = document.getElementById(
        "sp-qd-close-form",
      ) as HTMLElement | null;
      let closeFormShown = false;
      if (closeBtn && closeForm) {
        closeBtn.addEventListener("click", () => {
          closeFormShown = !closeFormShown;
          closeForm.style.display = closeFormShown ? "block" : "none";
          closeBtn.textContent = closeFormShown ? "✕ Cancelar" : "🔒 Cerrar";
          closeBtn.style.background = closeFormShown ? "#999" : "#616161";
        });
        document
          .getElementById("sp-qd-close-cancel")
          ?.addEventListener("click", () => {
            closeFormShown = false;
            closeForm.style.display = "none";
            closeBtn.textContent = "🔒 Cerrar";
            closeBtn.style.background = "#616161";
          });
        document
          .getElementById("sp-qd-close-confirm")
          ?.addEventListener("click", async () => {
            const commentText = (
              document.getElementById(
                "sp-qd-close-comment",
              ) as HTMLTextAreaElement
            ).value.trim();
            const confirmBtn = document.getElementById(
              "sp-qd-close-confirm",
            ) as HTMLButtonElement;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = spinnerHTML(12, "Cerrando...");
            showLoadingToast("Cerrando ticket...");
            try {
              if (commentText)
                await fetch(`${SP_API}/comment/${ticketId}`, {
                  method: "POST",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    content: `<p>${commentText}</p>`,
                    internal: false,
                  }),
                });
              const closeRes = await fetch(
                `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
                {
                  method: "PATCH",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                    ticketCommentRequest: null,
                  }),
                },
              );
              if (!closeRes.ok) throw new Error(`HTTP ${closeRes.status}`);
              showSuccessToast("Ticket cerrado");
              closeQdModal();
              void showQuickDetailModal(ticketId);
            } catch (err) {
              showErrorToast(`Error: ${(err as Error).message}`);
              confirmBtn.disabled = false;
              confirmBtn.textContent = "Confirmar";
            }
          });
      }

      // Steal button
      document
        .getElementById("sp-qd-steal-btn")
        ?.addEventListener("click", async () => {
          const stealBtn = document.getElementById(
            "sp-qd-steal-btn",
          ) as HTMLButtonElement;
          stealBtn.disabled = true;
          stealBtn.innerHTML = spinnerHTML(12);
          await showTakeModal(ticketId, stealBtn);
          stealBtn.textContent = "🤚 Tomar";
          stealBtn.disabled = false;
        });

      // Reopen button
      document
        .getElementById("sp-qd-reopen-btn")
        ?.addEventListener("click", () =>
          showReopenModal(ticketId, holderName),
        );

      // Migrate button
      document
        .getElementById("sp-qd-migrate-btn")
        ?.addEventListener("click", async () => {
          const migrateBtn = document.getElementById(
            "sp-qd-migrate-btn",
          ) as HTMLButtonElement;
          migrateBtn.disabled = true;
          migrateBtn.innerHTML = spinnerHTML(12, "Migrando...");
          await handleMondayClick(ticketId);
          migrateBtn.textContent = "🙂 Migrar a Monday";
          migrateBtn.disabled = false;
        });

      // Comment send
      const commentSendBtn = document.getElementById(
        "sp-qd-comment-send",
      ) as HTMLButtonElement | null;
      if (commentSendBtn) {
        const attachInput = document.getElementById(
          "sp-qd-attach-input",
        ) as HTMLInputElement | null;
        const attachListDiv = document.getElementById(
          "sp-qd-attach-list",
        ) as HTMLElement | null;
        let pendingFiles: File[] = [];
        let _pastedFile: File | null = null;
        let _pastedImgUrl: string | null = null;

        const renderPendingFiles = () => {
          if (!attachListDiv) return;
          attachListDiv.innerHTML = "";
          pendingFiles.forEach((f, idx) => {
            const chip = document.createElement("span");
            chip.style.cssText =
              "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
            chip.innerHTML = `📎 ${esc(f.name)} <span data-idx="${idx}" style="cursor:pointer;color:#D94040;font-weight:700;margin-left:2px;">✕</span>`;
            chip
              .querySelector<HTMLElement>("[data-idx]")
              ?.addEventListener("click", () => {
                pendingFiles.splice(idx, 1);
                renderPendingFiles();
              });
            attachListDiv.appendChild(chip);
          });
        };

        attachInput?.addEventListener("change", () => {
          if (attachInput.files) {
            for (let i = 0; i < attachInput.files.length; i++)
              pendingFiles.push(attachInput.files[i]);
          }
          attachInput.value = "";
          renderPendingFiles();
        });

        const commentInput = document.getElementById(
          "sp-qd-comment-input",
        ) as HTMLTextAreaElement | null;
        commentInput?.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") commentSendBtn.click();
        });
        commentInput?.addEventListener("paste", (e: ClipboardEvent) => {
          const items = (
            e.clipboardData || (e as AnyObj).originalEvent?.clipboardData
          )?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
              const file = items[i].getAsFile();
              if (!file) continue;
              e.preventDefault();
              _pastedFile = file;
              document.getElementById("sp-qd-paste-preview")?.remove();
              if (_pastedImgUrl) URL.revokeObjectURL(_pastedImgUrl);
              _pastedImgUrl = URL.createObjectURL(file);
              const previewDiv = document.createElement("div");
              previewDiv.id = "sp-qd-paste-preview";
              previewDiv.style.cssText =
                "margin:8px 0;padding:8px;border:1px solid #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
              previewDiv.innerHTML = `<img src="${_pastedImgUrl}" style="max-width:80px;max-height:60px;border-radius:4px;border:1px solid #ddd;"><span style="flex:1;font-size:0.85rem;color:#333;">📋 Imagen del portapapeles</span><button id="sp-qd-paste-cancel" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>`;
              commentInput.parentElement?.insertAdjacentElement(
                "afterend",
                previewDiv,
              );
              (
                document.getElementById(
                  "sp-qd-paste-cancel",
                ) as HTMLButtonElement
              ).addEventListener("click", () => {
                previewDiv.remove();
                if (_pastedImgUrl) URL.revokeObjectURL(_pastedImgUrl);
                _pastedFile = null;
                _pastedImgUrl = null;
              });
              break;
            }
          }
        });

        commentSendBtn.addEventListener("click", async () => {
          const input = document.getElementById(
            "sp-qd-comment-input",
          ) as HTMLTextAreaElement | null;
          const text = input?.value.trim() || "";
          if (!text && !pendingFiles.length && !_pastedFile) return;
          const sendBtn = document.getElementById(
            "sp-qd-comment-send",
          ) as HTMLButtonElement;
          sendBtn.disabled = true;
          sendBtn.textContent = "...";
          try {
            const commentText = text || "(archivo adjunto)";
            const spToken = getToken();
            const commentRes = await fetch(`${SP_API}/comment/${ticketId}`, {
              method: "POST",
              headers: spHeaders(),
              body: JSON.stringify({
                content: `<p>${commentText}</p>`,
                internal: false,
              }),
            });
            if (!commentRes.ok) throw new Error(`HTTP ${commentRes.status}`);
            const commentJson = (await commentRes.json()) as AnyObj;
            const commentId: string = commentJson.data?.id || commentJson.id;
            const uploadedFileNames: string[] = [];
            if (pendingFiles.length && commentId) {
              const formData = new FormData();
              pendingFiles.forEach((f) => formData.append("files", f));
              const fileRes = await fetch(
                "https://macropayapi.supportplus.mx/files",
                {
                  method: "POST",
                  headers: { authorization: `Bearer ${spToken}` },
                  body: formData,
                },
              );
              if (!fileRes.ok)
                throw new Error(
                  `Error subiendo archivos: HTTP ${fileRes.status}`,
                );
              const fileJson = (await fileRes.json()) as AnyObj;
              const uploadedFiles: AnyObj[] = fileJson.data || fileJson;
              if (Array.isArray(uploadedFiles) && uploadedFiles.length) {
                const attachPayload = uploadedFiles.map((f: AnyObj) => {
                  uploadedFileNames.push(f.name);
                  return { fileId: f.id };
                });
                await fetch(
                  "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                  {
                    method: "POST",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      attachments: attachPayload,
                      commentId,
                      isInternal: false,
                    }),
                  },
                );
              }
            }
            if (_pastedFile && commentId) {
              const namedFile = new File(
                [_pastedFile],
                `clipboard_${Date.now()}.png`,
                { type: _pastedFile.type },
              );
              const imgFormData = new FormData();
              imgFormData.append("files", namedFile);
              const imgRes = await fetch(
                "https://macropayapi.supportplus.mx/files",
                {
                  method: "POST",
                  headers: { authorization: `Bearer ${spToken}` },
                  body: imgFormData,
                },
              );
              if (imgRes.ok) {
                const imgJson = (await imgRes.json()) as AnyObj;
                const imgFiles: AnyObj[] = imgJson.data || imgJson;
                if (Array.isArray(imgFiles) && imgFiles.length) {
                  const imgAttach = imgFiles.map((f: AnyObj) => {
                    uploadedFileNames.push(f.name || "imagen.png");
                    return { fileId: f.id };
                  });
                  await fetch(
                    "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                    {
                      method: "POST",
                      headers: spHeaders(),
                      body: JSON.stringify({
                        attachments: imgAttach,
                        commentId,
                        isInternal: false,
                      }),
                    },
                  );
                }
              }
              document.getElementById("sp-qd-paste-preview")?.remove();
              if (_pastedImgUrl) URL.revokeObjectURL(_pastedImgUrl);
              _pastedFile = null;
              _pastedImgUrl = null;
            }
            if (input) input.value = "";
            pendingFiles = [];
            renderPendingFiles();
            closeQdModal();
            void showQuickDetailModal(ticketId);
          } catch (err) {
            showErrorToast(`Error: ${(err as Error).message}`);
          }
          sendBtn.disabled = false;
          sendBtn.textContent = "Enviar";
        });
      }

      // Suggested comments chips
      const suggestedDiv = document.getElementById(
        "sp-qd-suggested",
      ) as HTMLElement | null;
      if (suggestedDiv) {
        chrome.storage.local.get("suggestedComments", (r: AnyObj) => {
          const comments: AnyObj = r["suggestedComments"] || {};
          const groupId = getTeamConfig().resolutionGroupId;
          const groupComments: AnyObj[] = comments[groupId] || [];
          groupComments.forEach((c: AnyObj) => {
            const chip = document.createElement("button");
            chip.textContent =
              String(c.text).substring(0, 40) +
              (String(c.text).length > 40 ? "..." : "");
            chip.title = c.text;
            const colors = stringToColor(c.text);
            chip.style.cssText = `padding:3px 8px;font-size:0.8rem;border:1px solid ${colors.border};border-radius:12px;background:${colors.bg};color:${colors.text};cursor:pointer;`;
            chip.addEventListener("click", () => {
              const input = document.getElementById(
                "sp-qd-comment-input",
              ) as HTMLTextAreaElement | null;
              if (input) input.value = c.text;
            });
            suggestedDiv.appendChild(chip);
          });
        });
      }

      // File download with carousel
      const allAttachBtns = Array.from(
        overlay.querySelectorAll<HTMLButtonElement>(".sp-qd-download"),
      );

      async function loadFileData(fileId: string, _fileName: string) {
        const data = await SP_API_Lib.proxyFetch(
          `https://macropayapi.supportplus.mx/files/${fileId}`,
        );
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        return { url, byteArray: data };
      }

      function buildFileContentHTML(
        fileName: string,
        url: string,
        byteArray: Uint8Array,
      ): {
        html: string;
        isText: boolean;
        textContent: string | null;
        isPdf: boolean;
      } {
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const textExts = [
          "txt",
          "sql",
          "json",
          "xml",
          "csv",
          "log",
          "js",
          "ts",
          "py",
          "cs",
          "java",
          "html",
          "css",
          "md",
          "ini",
          "yml",
          "yaml",
          "sh",
          "bat",
          "ps1",
        ];
        const imgExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
        if (imgExts.includes(ext))
          return {
            html: `<img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:8px;object-fit:contain;">`,
            isText: false,
            textContent: null,
            isPdf: false,
          };
        if (ext === "pdf")
          return {
            html: `<div id="sp-pdf-viewer" style="max-height:80vh;overflow-y:auto;"></div>`,
            isText: false,
            textContent: null,
            isPdf: true,
          };
        if (ext === "xlsx" || ext === "xls") {
          try {
            const wb = (window as AnyObj).XLSX?.read(byteArray, {
              type: "array",
            });
            if (wb) {
              const ws = wb.Sheets[wb.SheetNames[0]];
              const html = (window as AnyObj).XLSX?.utils.sheet_to_html(ws, {
                header: "",
                footer: "",
              });
              return {
                html: `<div style="max-width:90vw;max-height:80vh;overflow:auto;background:#fff;border-radius:8px;padding:12px;">${html}</div>`,
                isText: false,
                textContent: null,
                isPdf: false,
              };
            }
          } catch {
            /* fall through */
          }
        }
        if (textExts.includes(ext)) {
          try {
            const text = new TextDecoder().decode(byteArray);
            return {
              html: `<pre style="max-width:90vw;max-height:80vh;overflow:auto;background:#1E1E1E;color:#D4D4D4;padding:20px;border-radius:8px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;">${esc(text)}</pre>`,
              isText: true,
              textContent: text,
              isPdf: false,
            };
          } catch {
            /* fall through */
          }
        }
        return {
          html: `<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 8px;font-size:14px;">📄 ${esc(fileName)}</p><a href="${url}" download="${fileName}" style="padding:10px 20px;background:#1976D2;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">📥 Descargar</a></p></div>`,
          isText: false,
          textContent: null,
          isPdf: false,
        };
      }

      function openCarousel(startIndex: number) {
        let currentIndex = startIndex;
        const totalFiles = allAttachBtns.length;
        let currentTextContent: string | null = null;
        const fileModal = document.createElement("div");
        fileModal.id = "sp-carousel-modal";
        fileModal.style.cssText =
          "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background 0.3s ease;";
        fileModal.innerHTML =
          '<div class="sp-file-content" style="transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;display:flex;flex-direction:column;align-items:center;width:100%;"><div id="sp-carousel-header" style="display:flex;justify-content:space-between;align-items:center;width:90vw;margin-bottom:8px;gap:8px;"></div><div id="sp-carousel-body" style="display:flex;align-items:center;justify-content:center;width:100%;position:relative;min-height:200px;"></div></div>';
        document.body.appendChild(fileModal);
        requestAnimationFrame(() => {
          fileModal.style.background = "rgba(0,0,0,.85)";
          const ce = fileModal.querySelector<HTMLElement>(".sp-file-content");
          if (ce) {
            ce.style.transform = "scale(1) translateY(0)";
            ce.style.opacity = "1";
          }
        });

        const closeCarousel = () => {
          const ce = fileModal.querySelector<HTMLElement>(".sp-file-content");
          if (ce) {
            ce.style.transform = "scale(0.9) translateY(10px)";
            ce.style.opacity = "0";
          }
          fileModal.style.background = "rgba(0,0,0,0)";
          document.removeEventListener("keydown", handleKeys);
          setTimeout(() => fileModal.remove(), 250);
        };

        const renderHeader = (
          fileName: string,
          url: string,
          isText: boolean,
        ) => {
          const header = fileModal.querySelector<HTMLElement>(
            "#sp-carousel-header",
          )!;
          const counterHTML =
            totalFiles > 1
              ? `<span style="color:#fff;font-size:13px;font-weight:600;">${currentIndex + 1} / ${totalFiles}</span>`
              : "";
          const copyBtn = isText
            ? '<button id="sp-file-copy-text" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">📋 Copiar</button>'
            : "";
          header.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">${counterHTML}<span style="color:#ccc;font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(fileName)}">${esc(fileName)}</span></div><div style="display:flex;gap:8px;">${copyBtn}<a href="${url}" download="${fileName}" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;text-decoration:none;">📥 Descargar</a><button id="sp-file-close" style="padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;">✕ Cerrar</button></div>`;
          fileModal
            .querySelector("#sp-file-close")
            ?.addEventListener("click", closeCarousel);
          const copyTextBtn =
            fileModal.querySelector<HTMLButtonElement>("#sp-file-copy-text");
          if (copyTextBtn && currentTextContent)
            copyTextBtn.addEventListener("click", () => {
              void navigator.clipboard
                .writeText(currentTextContent!)
                .then(() => {
                  copyTextBtn.textContent = "✅ Copiado";
                  setTimeout(() => {
                    copyTextBtn.textContent = "📋 Copiar";
                  }, 2000);
                });
            });
        };

        const renderBody = (contentHTML: string) => {
          const body =
            fileModal.querySelector<HTMLElement>("#sp-carousel-body")!;
          const navPrev =
            totalFiles > 1
              ? '<button id="sp-carousel-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;">◀</button>'
              : "";
          const navNext =
            totalFiles > 1
              ? '<button id="sp-carousel-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;">▶</button>'
              : "";
          body.innerHTML = `${navPrev}<div style="display:flex;align-items:center;justify-content:center;width:90vw;">${contentHTML}</div>${navNext}`;
          fileModal
            .querySelector("#sp-carousel-prev")
            ?.addEventListener("click", (e) => {
              e.stopPropagation();
              void navigateTo(currentIndex - 1);
            });
          fileModal
            .querySelector("#sp-carousel-next")
            ?.addEventListener("click", (e) => {
              e.stopPropagation();
              void navigateTo(currentIndex + 1);
            });
        };

        const showLoading = () => {
          const body =
            fileModal.querySelector<HTMLElement>("#sp-carousel-body")!;
          body.innerHTML =
            '<div style="color:#fff;font-size:16px;display:flex;flex-direction:column;align-items:center;gap:12px;"><div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.8s linear infinite;"></div><span>Cargando archivo...</span></div>';
        };

        const navigateTo = async (index: number) => {
          if (index < 0) index = totalFiles - 1;
          if (index >= totalFiles) index = 0;
          currentIndex = index;
          const btn = allAttachBtns[currentIndex];
          const fileId = btn.dataset["fileId"] || "";
          const fileName = btn.dataset["fileName"] || "archivo";
          showLoading();
          renderHeader(fileName, "", false);
          try {
            const data = await loadFileData(fileId, fileName);
            const result = buildFileContentHTML(
              fileName,
              data.url,
              data.byteArray,
            );
            currentTextContent = result.textContent;

            renderHeader(fileName, data.url, result.isText);
            renderBody(result.html);
            if (result.isPdf && typeof pdfjsLib !== "undefined") {
              const pdfContainer =
                fileModal.querySelector<HTMLElement>("#sp-pdf-viewer");
              if (!pdfContainer) return;
              pdfjsLib.GlobalWorkerOptions.workerSrc = "";
              const loadingTask = pdfjsLib.getDocument({
                data: data.byteArray,
              });
              let scale = 1.3;
              void (loadingTask.promise as Promise<AnyObj>)
                .then((pdf: AnyObj) => {
                  const totalPages: number = pdf.numPages;
                  for (let i = 1; i <= totalPages; i++) {
                    void pdf.getPage(i).then((page: AnyObj) => {
                      const viewport = page.getViewport({ scale });
                      const canvas = document.createElement("canvas");
                      canvas.width = viewport.width;
                      canvas.height = viewport.height;
                      page.render({
                        canvasContext: canvas.getContext("2d"),
                        viewport,
                      });
                      pdfContainer.appendChild(canvas);
                    });
                  }
                })
                .catch((err: Error) => {
                  pdfContainer.innerHTML = `<p style="color:#fff;text-align:center;padding:20px;">Error al cargar PDF: ${esc(err.message)}</p>`;
                });
            }
          } catch (err) {
            const body =
              fileModal.querySelector<HTMLElement>("#sp-carousel-body")!;
            body.innerHTML = `<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 8px;color:#c62828;font-size:14px;">❌ Error al cargar: ${esc(allAttachBtns[currentIndex]?.dataset["fileName"] || "")}</p><p style="margin:0;color:#666;font-size:12px;">${esc((err as Error).message)}</p></div>`;
          }
        };

        const handleKeys = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            closeCarousel();
            e.preventDefault();
            e.stopImmediatePropagation();
          }
          if (e.key === "ArrowLeft" && totalFiles > 1) {
            void navigateTo(currentIndex - 1);
            e.preventDefault();
          }
          if (e.key === "ArrowRight" && totalFiles > 1) {
            void navigateTo(currentIndex + 1);
            e.preventDefault();
          }
        };
        document.addEventListener("keydown", handleKeys);
        fileModal.addEventListener("click", (e) => {
          if (e.target === fileModal) closeCarousel();
        });
        void navigateTo(currentIndex);
      }

      allAttachBtns.forEach((btn, idx) =>
        btn.addEventListener("click", () => openCarousel(idx)),
      );
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
    }
  }

  // ─── injectFolioButtons ───────────────────────────────────────
  function makeWaitingRowsDraggable() {
    document
      .querySelectorAll<HTMLElement>(".MuiDataGrid-row")
      .forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const statusCell = row.querySelector<HTMLElement>(
          '[data-field="ticketStatusName"]',
        );
        if (!statusCell || statusCell.textContent?.trim() !== "En espera")
          return;
        const folioEl = row.querySelector<HTMLElement>(
          '[data-field="uniqueCode"] p.MuiTypography-body1',
        );
        if (!folioEl || folioEl.getAttribute("draggable") === "true") return;
        folioEl.setAttribute("draggable", "true");
        folioEl.style.cursor = "grab";
        folioEl.addEventListener("dragstart", (e: DragEvent) => {
          e.dataTransfer?.setData("text/plain", ticketId);
          e.dataTransfer!.effectAllowed = "move";
          row.style.opacity = "0.4";
        });
        folioEl.addEventListener("dragend", () => {
          row.style.opacity = "1";
        });
      });
  }

  function injectFolioButtons() {
    if (SP_DOM.isDetailView()) return;
    document
      .querySelectorAll<HTMLElement>(".MuiDataGrid-row")
      .forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const firstCell = row.querySelector<HTMLElement>(
          '[data-field="uniqueCode"]',
        );
        if (!firstCell) return;
        const container =
          firstCell.querySelector<HTMLElement>(".MuiBox-root") || firstCell;
        if (!row.querySelector(".sp-copy-btn")) {
          const codeEl = firstCell.querySelector<HTMLElement>(
            "p.MuiTypography-body1",
          );
          const codeText = codeEl?.textContent?.trim() || "";
          if (codeText) container.appendChild(createCopyButton(codeText));
        }
        if (!row.querySelector("." + DETAIL_QUICK_CLASS)) {
          const folioEl = container.querySelector<HTMLElement>(
            "p.MuiTypography-body1",
          );
          if (folioEl) {
            const folioText = folioEl.textContent?.trim() || "";
            const btn = document.createElement("button");
            btn.className = `${DETAIL_QUICK_CLASS} MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary`;
            btn.textContent = folioText;
            btn.style.cssText =
              "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              e.preventDefault();
              showQuickDetailModal(ticketId);
            });
            folioEl.replaceWith(btn);
          }
        }
        if (!row.querySelector("." + HISTORY_BTN_CLASS)) {
          const histBtn = document.createElement("button");
          histBtn.className = `${HISTORY_BTN_CLASS} sp-copy-btn`;
          histBtn.textContent = "🕐";
          histBtn.title = "Historial";
          histBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            void showHistoryModal(ticketId);
          });
          container.appendChild(histBtn);
        }
      });
  }

  const _folioObserver = new MutationObserver(() => {
    injectFolioButtons();
  });
  _folioObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(injectFolioButtons, 500);

  // ─── injectButtonsImmediate & injectButtons ───────────────────
  function injectButtonsImmediate() {
    injectConfigButton();
    injectSearchButton();
    injectQuickSearch();
    injectUpdateButton();
    injectSessionTimer();
    if (SP_DOM.isDetailView()) return;
    document
      .querySelectorAll<HTMLElement>(".MuiDataGrid-row")
      .forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const firstCell = row.querySelector<HTMLElement>(
          '[data-field="uniqueCode"]',
        );
        if (!firstCell) return;
        const container =
          firstCell.querySelector<HTMLElement>(".MuiBox-root") || firstCell;
        if (!row.querySelector(".sp-copy-btn")) {
          const codeEl = firstCell.querySelector<HTMLElement>(
            "p.MuiTypography-body1",
          );
          const codeText = codeEl?.textContent?.trim() || "";
          if (codeText) container.appendChild(createCopyButton(codeText));
        }
        if (!row.querySelector("." + DETAIL_QUICK_CLASS)) {
          const folioEl = container.querySelector<HTMLElement>(
            "p.MuiTypography-body1",
          );
          if (folioEl) {
            const folioText = folioEl.textContent?.trim() || "";
            const btn = document.createElement("button");
            btn.className = `${DETAIL_QUICK_CLASS} MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary`;
            btn.textContent = folioText;
            btn.style.cssText =
              "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              e.preventDefault();
              showQuickDetailModal(ticketId);
            });
            folioEl.replaceWith(btn);
          }
        }
      });
    highlightMyRows();
    colorRowsByStatus();
  }

  async function injectButtons() {
    injectButtonsImmediate();
    const synced = await ensureSyncStarted();
    void getBoardDate(); // preload board date into cachedBoardDate
    injectDashboardButton();
    injectSuggestedCommentsButton();
    injectReportButton();
    injectMondayStatsButton();
    injectQuickFilterButton();
    if (SP_DOM.isDetailView()) return;
    document
      .querySelectorAll<HTMLElement>(".MuiDataGrid-row")
      .forEach((row) => {
        const ticketId = row.getAttribute("data-id");
        if (!ticketId) return;
        const statusCell = row.querySelector<HTMLElement>(
          '[data-field="ticketStatusName"]',
        );
        const statusText = statusCell?.textContent?.trim() || "";
        const firstCell = row.querySelector<HTMLElement>(
          '[data-field="uniqueCode"]',
        );
        if (!firstCell) return;
        const container =
          firstCell.querySelector<HTMLElement>(".MuiBox-root") || firstCell;
        if (statusText !== "Cerrado") {
          const oldMigrate = row.querySelector("." + BTN_CLASS);
          if (oldMigrate) oldMigrate.remove();
        }
        row.querySelector("." + TAKE_BTN_CLASS)?.remove();
        row.querySelector("." + STEAL_BTN_CLASS)?.remove();
        row.querySelector("." + CLOSE_BTN_CLASS)?.remove();
        const codeEl = firstCell.querySelector<HTMLElement>(
          "p.MuiTypography-body1",
        );
        const uniqueCode = codeEl?.textContent?.trim() || "";
        if (
          uniqueCode &&
          synced[uniqueCode] &&
          !row.querySelector("." + SYNCED_CLASS)
        ) {
          row.querySelector("." + BTN_CLASS)?.remove();
          container.appendChild(createSyncedBadge(synced[uniqueCode]));
        }
      });
    highlightMyRows();
    colorRowsByStatus();
    makeWaitingRowsDraggable();
    injectBulkCloseButton();
    injectBulkButton();
    injectNewTicketButton();
    void checkPendingCloseAlert();
    void loadTeamPanel();
  }

  // ─── Main MutationObserver + init ────────────────────────────
  let injectTimeout: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(() => void injectButtons(), 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  void loadTeamArea().then(() => {
    const myName = getLoggedUserName();
    if (myName && currentTeamArea) {
      void loadProfilesForGroup(parseInt(currentTeamArea)).then((profiles) => {
        const me = profiles.find((p: AnyObj) => p.profileFullName === myName);
        if (me) {
          sessionProfileId = me.profileId;
          myProfileId = me.profileId;
        }
      });
    }
    void ensureSyncStarted().then(() => injectButtons());
    void injectButtons();
  });

  window.addEventListener("focus", () => {
    syncPromise = null;
    localStorage.removeItem(CACHE_KEY);
    void ensureSyncStarted().then(() => injectButtons());
    if (activeModalRefresh) void activeModalRefresh();
    refreshTeamPanel();
    chrome.storage.local.get("workSchedule", (r: AnyObj) => {
      if (r["workSchedule"]) _workSchedule = r["workSchedule"];
    });
  });

  const _teamPanelInterval = setInterval(() => {
    if (!document.getElementById(TEAM_PANEL_ID)) {
      clearInterval(_teamPanelInterval);
      return;
    }
    if (!SP_DOM.isDetailView()) refreshTeamPanel();
  }, 60000);

  // Expose core for debugging
  (window as AnyObj).SP_Core = {
    getTeamConfig,
    getActiveAreas,
    isMultiGroup,
    getLoggedUserName,
    getMyProfileId,
    getToken,
    loadProfilesForGroup,
    getMondayToken,
    getMondayBoardId,
    mondayQuery,
    getMondayUsers,
    getMondayTicketBoards,
    checkTicketExistsInMonday,
    canMigrateTicket,
    ensureSyncStarted,
    getCache,
    addToCache,
    createSyncedBadge,
    createButton,
    createCopyButton,
    isDetailView: SP_DOM.isDetailView,
    getDetailTicketId: SP_DOM.getDetailTicketId,
    updateMondayPerson,
  };

  // Visibility change handler
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void chrome.runtime.sendMessage({ type: "sync" }, () => {
        chrome.storage.local.get("workSchedule", (ws: AnyObj) => {
          if (ws["workSchedule"]) _workSchedule = ws["workSchedule"];
        });
      });
    }
  });
} // end initExtension
