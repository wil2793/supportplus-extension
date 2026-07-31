// ============================================================
// SRC/CONTENT.TS - Content script orchestrator (~300 lines)
// All feature logic lives in dedicated modules under src/features/
// and src/lib/. This file only boots and wires them together.
// ============================================================

// ─── Lib imports ─────────────────────────────────────────────
import SP_Log from "./lib/logger";
import SP_API_Lib from "./lib/api";
import SP_DOM from "./lib/dom-utils";
import {
  ensureSyncStarted,
  resetSyncPromise,
  invalidateCache,
  createSyncedBadge,
} from "./lib/monday-cache";
import { spHeaders, spGetHeaders } from "./lib/sp-fetch";
import { SP_CONFIG, GROUP_INFO } from "./config";

// ─── Feature imports ──────────────────────────────────────────
import { injectStyles } from "./styles";
import SP_Session from "./features/session";
import SP_Header from "./features/header-buttons";
import SP_ManagerView from "./features/manager-view";
import SP_RowColors from "./features/row-colors";
import SP_Reports from "./features/reports";
import SP_DetailView from "./features/detail-view";

import { showSuccessToast, showErrorToast, spinnerHTML } from "./components";
import SP_Modal from "./lib/modal-builder";
import { injectDashboardButton } from "./features/dashboard";
import { showConfigModal } from "./features/config-modal";
import {
  injectSearchButton,
  injectQuickSearch,
  injectQuickFilterButton,
  triggerActiveModalRefresh,
} from "./features/search";
import { showHistoryModal } from "./features/history";
import {
  checkPendingCloseAlert,
  resetPendingAlert,
} from "./features/pending-close";
import { showQuickDetailModal } from "./features/ticket-detail";
import {
  showTakeModal,
  showCloseModal,
  showReopenModal,
  showReassignAppModal,
  createTakeButton,
  createStealButton,
  createCloseButton,
  createMigrateButton,
  TAKE_BTN_CLASS,
  STEAL_BTN_CLASS,
  CLOSE_BTN_CLASS,
  BTN_CLASS,
} from "./features/ticket-modals";

import type { DetailModalContext } from "./features/ticket-detail";
import type { SpProfile } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

// ─── Boot ─────────────────────────────────────────────────────
injectStyles();
SP_Log.info("Extension loading...");

// Initialize header button registry (registers sp-config-btn, sp-update-btn, sp-dba-info-btn)
SP_Header.initHeaderButtons(() => SP_ManagerView.showDBAInfo());

// ─── Session state ────────────────────────────────────────────
const _ss = SP_Session.state;
let currentUserGroups = _ss.groups;
let _btnDashboard = _ss.btnDashboard;
let _btnReassignApp = _ss.btnReassignApp;
let _canShowLabels = _ss.canShowLabels;
let _canReopenTickets = _ss.canReopenTickets;
let _canCommentClosed = _ss.canCommentClosed;
let _canRejectTickets = _ss.canRejectTickets;
let _userConfig = _ss.userConfig;
let _workSchedule = _ss.workSchedule;
let _sessionProfileId: number | null = null;

// ─── Team config helpers ───────────────────────────────────────
const TEAM_AREAS: Record<
  number,
  {
    resolutionGroupId: number;
    resolutionGroupLabel: string;
    profiles: SpProfile[];
  }
> = {};
GROUP_INFO.forEach((g) => {
  TEAM_AREAS[g.id] = {
    resolutionGroupId: g.id,
    resolutionGroupLabel: g.name,
    profiles: [] as SpProfile[],
  };
});
let _currentTeamArea = "";

function _getTeamConfig() {
  return (
    TEAM_AREAS[parseInt(_currentTeamArea)] ??
    TEAM_AREAS[currentUserGroups[0]] ?? {
      resolutionGroupId: currentUserGroups[0] ?? 0,
      resolutionGroupLabel: "",
      profiles: [] as SpProfile[],
    }
  );
}

function _getLoggedUserName() {
  return SP_Session.getLoggedUserNameFromDOM?.() ?? "";
}
function _getLoggedUserEmail() {
  return SP_Session.state.userEmail ?? "";
}

let _myProfileId: number | null = null;
async function _getMyProfileId(): Promise<number | null> {
  if (_sessionProfileId) return _sessionProfileId;
  if (_myProfileId) return _myProfileId;
  const token = SP_API_Lib.getSpToken();
  if (!token) return null;
  const name = _getLoggedUserName();
  const email = _getLoggedUserEmail();
  if (!name && !email) return null;
  try {
    const res = await fetch(
      `${SP_CONFIG.SP_API}/active-profiles-by-resolution-group/${_getTeamConfig().resolutionGroupId}`,
      { headers: spGetHeaders() },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as JsonObject;
    const profiles = (json["data"] ?? json) as SpProfile[];
    const found = profiles.find(
      (p) =>
        (email && p.email?.toLowerCase() === email.toLowerCase()) ||
        p.profileFullName === name ||
        (name &&
          name
            .toLowerCase()
            .split(/\s+/)
            .filter(
              (w: string) =>
                w.length > 2 &&
                (p.profileFullName ?? "").toLowerCase().includes(w),
            ).length >= 2),
    );
    if (found) {
      _myProfileId = (found as SpProfile).profileId;
      _sessionProfileId = (found as SpProfile).profileId;
    }
    return _myProfileId;
  } catch {
    return null;
  }
}

// ─── Monday migrate (single ticket) ──────────────────────────
async function _handleMondayClick(ticketId: number | string): Promise<void> {
  const tok = await SP_API_Lib.getMondayToken();
  if (!tok) {
    alert("⚠️ Configura tu token de Monday primero.");
    return;
  }
  const boardId = await SP_API_Lib.getMondayBoardId(SP_API_Lib.getSpToken());
  if (!boardId) {
    alert("⚠️ No se encontró el board de Monday.");
    return;
  }
  try {
    const gData = await SP_API_Lib.mondayQuery(
      tok,
      "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
      { boardId },
    );
    const groups = gData.boards?.[0]?.groups ?? [];
    if (!groups.length) {
      alert("No hay grupos en el tablero");
      return;
    }
    const tRes = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, {
      headers: spGetHeaders(),
    });
    const tJson = (await tRes.json()) as JsonObject;
    const ticket = tJson["data"] ?? tJson;
    const { default: SP_MondayUtils } = await import("./lib/monday-utils");
    await SP_MondayUtils.createMondayItem(tok, {
      boardId,
      groupId: groups[0].id,
      ticket: ticket as import("./types").SpTicket,
    });
    showSuccessToast("Ticket migrado a Monday");
  } catch (err) {
    showErrorToast(`Error: ${(err as Error).message}`);
  }
}

async function _updateMondayStatus(
  ticketId: number | string,
  uniqueCode: string,
  newStatus: string,
): Promise<void> {
  try {
    const tok = await SP_API_Lib.getMondayToken();
    if (!tok) return;
    const code = uniqueCode || String(ticketId);
    const { default: SP_MondayUtils } = await import("./lib/monday-utils");
    await SP_MondayUtils.updateMondayStatus(tok, code, newStatus);
  } catch (e) {
    SP_Log.warn("Monday status update failed:", (e as Error).message);
  }
}

// ─── Build detail modal context ───────────────────────────────
function _buildDetailCtx(): DetailModalContext {
  return {
    canShowLabels: _canShowLabels,
    canCommentClosed: _canCommentClosed,
    canReopenTickets: _canReopenTickets,
    canRejectTickets: _canRejectTickets,
    canReassignApp: _btnReassignApp,
    getLoggedUserName: _getLoggedUserName,
    getLoggedUserEmail: _getLoggedUserEmail,
    getMyProfileId: _getMyProfileId,
    getTeamResolutionGroupId: () => _getTeamConfig().resolutionGroupId,
    getTeamResolutionGroupLabel: () => _getTeamConfig().resolutionGroupLabel,
    getTeamProfiles: () => _getTeamConfig().profiles,
    showTakeModalFn: async (id, btn) =>
      showTakeModal(id, btn, {
        canShowLabels: _canShowLabels,
        getMyProfileId: _getMyProfileId,
        getTeamResolutionGroupId: () => _getTeamConfig().resolutionGroupId,
        getTeamResolutionGroupLabel: () =>
          _getTeamConfig().resolutionGroupLabel,
        createCloseBtn: (id2, onClose) => createCloseButton(id2, onClose),
      }),
    showReopenModalFn: (id, holder) =>
      showReopenModal(
        id,
        holder,
        () => _getTeamConfig().resolutionGroupId,
        () => _getTeamConfig().resolutionGroupLabel,
        _getTeamConfig().profiles,
      ),
    showReassignAppModalFn: (id) =>
      showReassignAppModal(
        id,
        () => _getTeamConfig().resolutionGroupId,
        () => _getTeamConfig().resolutionGroupLabel,
        _getMyProfileId,
      ),
    handleMondayClick: _handleMondayClick,
    updateMondayStatus: _updateMondayStatus,
  };
}

// ─── Open ticket event ────────────────────────────────────────
document.addEventListener("sp-open-config", () =>
  showConfigModal({
    currentUserGroups,
    currentTeamArea: _currentTeamArea,
    userConfig: _userConfig,
    onSave: (area, cfg) => {
      _currentTeamArea = area;
      _userConfig = cfg;
    },
  }),
);
document.addEventListener("sp-open-ticket", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.ticketId)
    showQuickDetailModal(detail.ticketId, _buildDetailCtx());
});

// Intercept clicks on kanban cards at document capture phase.
// This fires BEFORE React's listeners. We open our modal and stop
// the event so React's native ticket-detail modal never appears.
document.addEventListener(
  "click",
  (e: MouseEvent) => {
    const ticket = (e.target as Element)?.closest<HTMLElement>(
      "#sp-manager-panel .sp-mgr-ticket, #sp-manager-panel .sp-pending-ticket, #sp-team-panel .sp-team-ticket, #sp-team-panel .sp-pending-ticket",
    );
    if (!ticket) return;
    const ticketId = parseInt(ticket.dataset["ticketId"] ?? "0");
    if (!ticketId) return;
    e.stopImmediatePropagation();
    showQuickDetailModal(ticketId, _buildDetailCtx());
  },
  true, // capture phase
);

// ─── Session initialization ───────────────────────────────────
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
  _btnReassignApp = ss.btnReassignApp;
  _canShowLabels = ss.canShowLabels;
  _canReopenTickets = ss.canReopenTickets;
  _canCommentClosed = ss.canCommentClosed;
  _canRejectTickets = ss.canRejectTickets;
  _userConfig = ss.userConfig;
  _workSchedule = ss.workSchedule;
  _sessionProfileId = ss.profileId;
  // Load team area then start extension
  chrome.storage.local.get("teamArea", (r: JsonObject) => {
    if (r["teamArea"]) _currentTeamArea = r["teamArea"] as string;
    SP_Header.injectButtons("session");
    SP_Header.injectButtons("authenticated");
    SP_Reports.injectReportButton();
    if (currentUserGroups.length > 0) SP_ManagerView.initManagerView();
    SP_Session.injectRoleLabel?.();
    // Re-check version after sync completes (sync may have updated latestVersion)
    SP_Header.checkVersion();
    void ensureSyncStarted().then(() => void injectButtons());
    void injectButtons();
  });
});

// ─── Button injection ─────────────────────────────────────────

const DETAIL_QUICK_CLASS = "sp-quick-detail-btn";
const HISTORY_BTN_CLASS = "sp-history-btn";
const HIGHLIGHT_CLASS = "sp-my-row";
const SEARCH_BTN_ID = "sp-search-btn";
const BULK_CLOSE_BTN_ID = "sp-close-bulk";
const BULK_BTN_ID = "sp-monday-bulk";
const NEW_TICKET_BTN_ID = "sp-new-ticket";

function injectFolioButtons(): void {
  if (SP_DOM.isDetailView()) return;
  document.querySelectorAll<HTMLElement>(".MuiDataGrid-row").forEach((row) => {
    const ticketId = row.getAttribute("data-id");
    if (!ticketId) return;
    const firstCell = row.querySelector<HTMLElement>(
      '[data-field="uniqueCode"]',
    );
    if (!firstCell) return;
    const container =
      firstCell.querySelector<HTMLElement>(".MuiBox-root") ?? firstCell;
    if (!row.querySelector(".sp-copy-btn")) {
      const code =
        firstCell
          .querySelector<HTMLElement>("p.MuiTypography-body1")
          ?.textContent?.trim() ?? "";
      if (code) container.appendChild(SP_DetailView.createCopyButton(code));
    }
    if (!row.querySelector("." + DETAIL_QUICK_CLASS)) {
      const folioEl = container.querySelector<HTMLElement>(
        "p.MuiTypography-body1",
      );
      if (folioEl) {
        const btn = document.createElement("button");
        btn.className = `${DETAIL_QUICK_CLASS} MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary`;
        btn.textContent = folioEl.textContent ?? "";
        btn.style.cssText =
          "padding:2px 8px;font-size:11px;cursor:pointer;min-width:auto;white-space:nowrap;";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          showQuickDetailModal(ticketId, _buildDetailCtx());
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

const _folioObserver = new MutationObserver(() => injectFolioButtons());
_folioObserver.observe(document.body, { childList: true, subtree: true });
setTimeout(injectFolioButtons, 500);

function highlightMyRows(): void {
  const myName = _getLoggedUserName();
  if (!myName) return;
  document.querySelectorAll<HTMLElement>(".MuiDataGrid-row").forEach((row) => {
    if (row.classList.contains(HIGHLIGHT_CLASS)) return;
    const cell = row.querySelector<HTMLElement>(
      '[data-field="responsibleName"]',
    );
    if (cell?.textContent?.trim() === myName) {
      row.classList.add(HIGHLIGHT_CLASS);
      row.style.position = "relative";
      const ind = document.createElement("span");
      ind.textContent = "❗";
      ind.style.cssText =
        "position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:14px;z-index:1;pointer-events:none;";
      row.appendChild(ind);
    }
  });
}

function injectBulkButtons(): void {
  // Bulk close button
  if (!document.getElementById(BULK_CLOSE_BTN_ID)) {
    const ref = document.getElementById(BULK_BTN_ID);
    if (!ref) return;
    const parent = ref.parentElement;
    if (!parent) return;
    const btn = document.createElement("button");
    btn.id = BULK_CLOSE_BTN_ID;
    btn.textContent = "🔒 Cerrar varios";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#616161;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("click", () => void _handleBulkClose());
    parent.insertBefore(btn, ref.nextSibling);
  }
  // New ticket button
  if (!document.getElementById(NEW_TICKET_BTN_ID)) {
    const ref = document.getElementById(BULK_BTN_ID);
    if (!ref) return;
    const parent = ref.parentElement;
    if (!parent) return;
    const btn = document.createElement("button");
    btn.id = NEW_TICKET_BTN_ID;
    btn.textContent = "➕ Nuevo ticket";
    btn.style.cssText =
      "padding:6px 14px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#1976D2;color:#fff;font-weight:600;white-space:nowrap;margin-right:8px;";
    btn.addEventListener("click", () => {
      window.location.href = "/es/dashboard/tickets/nuevo";
    });
    parent.insertBefore(btn, ref);
  }
}

async function injectButtons(): Promise<void> {
  // Immediate: folio buttons, row highlights, status colors
  injectFolioButtons();
  highlightMyRows();
  SP_RowColors.colorRows();

  // Wait for sync
  const synced = await ensureSyncStarted();

  // Header buttons
  injectDashboardButton(
    _btnDashboard,
    currentUserGroups,
    () => _getTeamConfig().resolutionGroupId,
    SEARCH_BTN_ID,
  );
  const _onClose = async (id: string | number, btn: HTMLButtonElement) =>
    showCloseModal(id, btn, {
      canShowLabels: _canShowLabels,
      getMyProfileId: _getMyProfileId,
      getTeamResolutionGroupId: () => _getTeamConfig().resolutionGroupId,
      getTeamResolutionGroupLabel: () => _getTeamConfig().resolutionGroupLabel,
      createMigrateBtn: (id2) => createMigrateButton(id2, _handleMondayClick),
    });
  const _onTake = async (id: string | number, btn: HTMLButtonElement) =>
    showTakeModal(id, btn, {
      canShowLabels: _canShowLabels,
      getMyProfileId: _getMyProfileId,
      getTeamResolutionGroupId: () => _getTeamConfig().resolutionGroupId,
      getTeamResolutionGroupLabel: () => _getTeamConfig().resolutionGroupLabel,
      createCloseBtn: (id2, onClose2) => createCloseButton(id2, onClose2),
    });

  injectSearchButton(
    _getLoggedUserName,
    (id) => createTakeButton(id, _onTake),
    (id) => createCloseButton(id, _onClose),
    (id, name) => createStealButton(id, name, _onTake),
  );
  injectQuickSearch((id) => showQuickDetailModal(id, _buildDetailCtx()));
  injectQuickFilterButton(
    () => _getTeamConfig().resolutionGroupId,
    _getLoggedUserName,
    (id) => createTakeButton(id, _onTake),
    (id) => createCloseButton(id, _onClose),
    (id, name) => createStealButton(id, name, _onTake),
  );
  SP_Reports.injectReportButton();

  if (SP_DOM.isDetailView()) return;

  // Row action buttons
  document.querySelectorAll<HTMLElement>(".MuiDataGrid-row").forEach((row) => {
    const ticketId = row.getAttribute("data-id");
    if (!ticketId) return;
    const statusCell = row.querySelector<HTMLElement>(
      '[data-field="ticketStatusName"]',
    );
    const status = statusCell?.textContent?.trim() ?? "";
    const firstCell = row.querySelector<HTMLElement>(
      '[data-field="uniqueCode"]',
    );
    if (!firstCell) return;
    const container =
      firstCell.querySelector<HTMLElement>(".MuiBox-root") ?? firstCell;

    // Clean up stale buttons
    if (status !== "En espera")
      row.querySelector("." + TAKE_BTN_CLASS)?.remove();
    if (status !== "Cerrado") row.querySelector("." + BTN_CLASS)?.remove();
    if (status !== "Asignado")
      row.querySelector("." + STEAL_BTN_CLASS)?.remove();
    if (status === "Cerrado")
      row.querySelector("." + CLOSE_BTN_CLASS)?.remove();
    row.querySelector("." + TAKE_BTN_CLASS)?.remove();
    row.querySelector("." + STEAL_BTN_CLASS)?.remove();
    row.querySelector("." + CLOSE_BTN_CLASS)?.remove();

    // Synced badge
    const codeEl = firstCell.querySelector<HTMLElement>(
      "p.MuiTypography-body1",
    );
    const uniqueCode = codeEl?.textContent?.trim() ?? "";
    if (
      uniqueCode &&
      synced[uniqueCode] &&
      !row.querySelector("." + "sp-monday-synced")
    )
      container.appendChild(createSyncedBadge(synced[uniqueCode]));
  });

  highlightMyRows();
  SP_RowColors.colorRows();
  _makeDraggable();
  injectBulkButtons();
  void checkPendingCloseAlert(_workSchedule, (id) =>
    showQuickDetailModal(id, _buildDetailCtx()),
  );
}

function _makeDraggable(): void {
  document.querySelectorAll<HTMLElement>(".MuiDataGrid-row").forEach((row) => {
    const ticketId = row.getAttribute("data-id");
    if (!ticketId) return;
    const sc = row.querySelector<HTMLElement>(
      '[data-field="ticketStatusName"]',
    );
    if (sc?.textContent?.trim() !== "En espera") return;
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

// ─── Bulk close ────────────────────────────────────────────────
async function _handleBulkClose(): Promise<void> {
  const assigned = Array.from(
    document.querySelectorAll<HTMLElement>(".MuiDataGrid-row"),
  )
    .filter(
      (row) =>
        row
          .querySelector<HTMLElement>('[data-field="ticketStatusName"]')
          ?.textContent?.trim() === "Asignado",
    )
    .map((row) => ({
      ticketId: row.getAttribute("data-id") ?? "",
      code:
        row
          .querySelector<HTMLElement>('[data-field="uniqueCode"]')
          ?.textContent?.trim() ?? "",
      subject:
        row
          .querySelector<HTMLElement>('[data-field="subject"]')
          ?.textContent?.trim() ?? "",
      row,
    }))
    .filter((r) => r.ticketId);
  if (!assigned.length) {
    alert("No hay tickets asignados en esta pagina.");
    return;
  }
  const ticketRows = assigned
    .map(
      (p, i) =>
        `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;"><input type="checkbox" data-idx="${i}" class="sp-close-check" style="cursor:pointer;"><span style="flex:1;font-size:12px;">${p.code}${p.subject ? " - " + p.subject.substring(0, 35) : ""}</span></div>`,
    )
    .join("");
  const m = SP_Modal.info({
    id: "sp-close-modal",
    title: `🔒 Cerrar tickets (${assigned.length} asignados)`,
    content: `<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:12px;cursor:pointer;"><input type="checkbox" id="sp-close-all"> Seleccionar todos</label><div style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px;">${ticketRows}</div><div id="sp-close-msg" style="font-size:13px;margin-bottom:8px;min-height:20px;"></div><div style="display:flex;gap:8px;"><button id="sp-close-start" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;">🔐 Cerrar seleccionados</button><button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>`,
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
  (
    document.getElementById("sp-close-cancel") as HTMLButtonElement
  ).addEventListener("click", m.close);
  (
    document.getElementById("sp-close-start") as HTMLButtonElement
  ).addEventListener("click", async () => {
    const selected = Array.from(
      overlay.querySelectorAll<HTMLInputElement>(".sp-close-check:checked"),
    ).map((cb) => parseInt(cb.dataset["idx"] ?? "0"));
    if (!selected.length) {
      (document.getElementById("sp-close-msg") as HTMLElement).textContent =
        "Selecciona al menos un ticket.";
      return;
    }
    const startBtn = document.getElementById(
      "sp-close-start",
    ) as HTMLButtonElement;
    startBtn.disabled = true;
    startBtn.innerHTML = spinnerHTML(16, "Cerrando...");
    const msgEl = document.getElementById("sp-close-msg") as HTMLElement;
    let ok = 0,
      fail = 0;
    for (let i = 0; i < selected.length; i++) {
      const t = assigned[selected[i]];
      msgEl.textContent = `Cerrando ${i + 1} / ${selected.length}...`;
      try {
        const res = await fetch(
          `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${t.ticketId}`,
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
          ?.replaceWith(createMigrateButton(t.ticketId, _handleMondayClick));
      } catch {
        fail++;
      }
    }
    msgEl.textContent = `Completado: ${ok} cerrados, ${fail} errores`;
    startBtn.innerHTML = "✅ Listo";
    startBtn.style.background = "#2E7D32";
    (
      document.getElementById("sp-close-cancel") as HTMLButtonElement
    ).textContent = "Cerrar";
  });
}

// ─── Main MutationObserver + focus handler ───────────────────
let _injectTimeout: ReturnType<typeof setTimeout>;
const _observer = new MutationObserver(() => {
  clearTimeout(_injectTimeout);
  _injectTimeout = setTimeout(() => void injectButtons(), 200);
});
_observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("focus", () => {
  resetSyncPromise();
  invalidateCache();
  void ensureSyncStarted().then(() => void injectButtons());
  triggerActiveModalRefresh();
  resetPendingAlert();
  chrome.storage.local.get("workSchedule", (r: JsonObject) => {
    if (r["workSchedule"]) _workSchedule = r["workSchedule"];
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void chrome.runtime.sendMessage({ type: "sync" }, () => {
      chrome.storage.local.get("workSchedule", (ws: JsonObject) => {
        if (ws["workSchedule"]) _workSchedule = ws["workSchedule"];
      });
    });
  }
});

setInterval(() => {
  if (
    !document.getElementById("sp-manager-panel") &&
    !document.getElementById("sp-team-panel")
  )
    return;
  if (!SP_DOM.isDetailView())
    document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
}, 60000);
