// ============================================================
// SRC/FEATURES/SEARCH.TS - Search modal, quick filter, quick search
// ============================================================

import { SP_CONFIG } from "../config";
import SP_Modal from "../lib/modal-builder";
import { createHeaderButton, showErrorToast } from "../components";
import { spGetHeaders } from "../lib/sp-fetch";
import { renderTicketCards } from "./ticket-summary";
import { getCache, createSyncedBadge } from "../lib/monday-cache";
import type { TicketRow } from "./ticket-summary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export const SEARCH_BTN_ID = "sp-search-btn";
const QUICK_SEARCH_ID = "sp-quick-search";
const QUICK_FILTER_ID = "sp-quick-filter";

let _activeModalRefresh: (() => void | Promise<void>) | null = null;
export function setActiveModalRefresh(
  fn: (() => void | Promise<void>) | null,
): void {
  _activeModalRefresh = fn;
}
export function triggerActiveModalRefresh(): void {
  if (_activeModalRefresh) void _activeModalRefresh();
}

// ─── Search button ────────────────────────────────────────────

export function injectSearchButton(
  getLoggedUserName: () => string,
  openTicketCallback: (id: number) => void,
  createTakeBtn: (
    id: string | number,
    onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
  ) => HTMLButtonElement,
  createCloseBtn: (
    id: string | number,
    onClose: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
  ) => HTMLButtonElement,
  createStealBtn: (
    id: string | number,
    name: string,
    onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
  ) => HTMLButtonElement,
): void {
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
    onClick: () =>
      showSearchModal(
        getLoggedUserName,
        openTicketCallback,
        createTakeBtn,
        createCloseBtn,
        createStealBtn,
      ),
  });
  btn.style.marginRight = "12px";
  userWrapper.parentElement?.insertBefore(btn, userWrapper);
}

// ─── Quick search input ───────────────────────────────────────

export function injectQuickSearch(
  openTicketCallback: (id: number) => void,
): void {
  if (document.getElementById(QUICK_SEARCH_ID)) return;
  const userWrapper = document.querySelector<HTMLElement>(
    '[class*="warapperNameUserAndLogout"]',
  );
  if (!userWrapper) return;

  const wrapper = document.createElement("div");
  wrapper.id = QUICK_SEARCH_ID;
  wrapper.style.cssText =
    "display:inline-flex;align-items:center;gap:4px;margin-right:12px;";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Folio o ID...";
  input.style.cssText =
    "padding:5px 10px;font-size:12px;border:1px solid #ccc;border-radius:6px;width:130px;outline:none;";

  const goBtn = document.createElement("button");
  goBtn.textContent = "→";
  goBtn.style.cssText =
    "padding:5px 10px;font-size:12px;cursor:pointer;border:none;border-radius:6px;background:#4CAF50;color:#fff;font-weight:600;";

  const doSearch = async () => {
    const val = input.value.trim();
    if (!val) return;
    goBtn.disabled = true;
    goBtn.textContent = "...";
    try {
      const res = await fetch(
        `${SP_CONFIG.SP_SEARCH_API}?uniqueCode=${encodeURIComponent(val)}&page=0&size=1`,
        { headers: spGetHeaders() },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AnyObj;
      const tickets: AnyObj[] = (json["data"] ?? json)["content"] ?? [];
      if (tickets.length > 0) openTicketCallback(tickets[0].id as number);
      else showErrorToast(`Ticket no encontrado: ${val}`);
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
    }
    goBtn.textContent = "→";
    goBtn.disabled = false;
    input.value = "";
  };

  goBtn.addEventListener("click", () => void doSearch());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void doSearch();
  });
  wrapper.appendChild(input);
  wrapper.appendChild(goBtn);
  userWrapper.parentElement?.insertBefore(wrapper, userWrapper);
}

// ─── Quick filter button ──────────────────────────────────────

export function injectQuickFilterButton(
  getResolutionGroupId: () => number,
  getLoggedUserName: () => string,
  openTicketCallback: (id: number) => void,
  createTakeBtn: (
    id: string | number,
    onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
  ) => HTMLButtonElement,
  createCloseBtn: (
    id: string | number,
    onClose: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
  ) => HTMLButtonElement,
  createStealBtn: (
    id: string | number,
    name: string,
    onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
  ) => HTMLButtonElement,
): void {
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
  btn.addEventListener(
    "click",
    () =>
      void showQuickFilterModal(
        "En espera",
        getResolutionGroupId,
        undefined,
        undefined,
        getLoggedUserName,
        openTicketCallback,
        createTakeBtn,
        createCloseBtn,
        createStealBtn,
      ),
  );
  userWrapper.parentElement?.insertBefore(btn, userWrapper);
}

// ─── Shared ticket fetcher for modals ─────────────────────────

async function fetchTickets(
  url: string,
): Promise<{
  tickets: TicketRow[];
  totalPages: number;
  totalElements: number;
}> {
  const res = await fetch(url, { headers: spGetHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as AnyObj;
  const data: AnyObj = json["data"] ?? json;
  return {
    tickets: (data["content"] ?? []) as TicketRow[],
    totalPages: (data["totalPages"] as number) ?? 1,
    totalElements: (data["totalElements"] as number) ?? 0,
  };
}

// ─── Stubs for button factories (injected at call time) ───────

type TakeFactory = (
  id: string | number,
  onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
) => HTMLButtonElement;
type CloseFactory = (
  id: string | number,
  onClose: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
) => HTMLButtonElement;
type StealFactory = (
  id: string | number,
  name: string,
  onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
) => HTMLButtonElement;

function noop(_id: string | number, _btn: HTMLButtonElement): Promise<void> {
  return Promise.resolve();
}

function buildActionFactories(
  _openTicketCallback: (id: number) => void,
  createTakeBtn: TakeFactory,
  createCloseBtn: CloseFactory,
  createStealBtn: StealFactory,
) {
  // The factories already receive the onTake/onClose callback in their constructor.
  // We provide a stub that opens the detail modal (same as clicking the folio).
  // The full modal logic is injected from content.ts via the factory closures.
  return {
    take: (id: string | number) =>
      createTakeBtn(id, (_id2, _btn2) => {
        _openTicketCallback(parseInt(String(_id2)));
        return Promise.resolve();
      }),
    close: (id: string | number) =>
      createCloseBtn(id, (_id2, _btn2) => {
        _openTicketCallback(parseInt(String(_id2)));
        return Promise.resolve();
      }),
    steal: (id: string | number, name: string) =>
      createStealBtn(id, name, (_id2, _btn2) => {
        _openTicketCallback(parseInt(String(_id2)));
        return Promise.resolve();
      }),
    badge: (itemId: string) => createSyncedBadge(itemId),
  };
}

// ─── Quick filter modal ───────────────────────────────────────

export async function showQuickFilterModal(
  statusName: string,
  getResolutionGroupId: () => number,
  extraParams: string | undefined,
  title: string | undefined,
  getLoggedUserName: () => string,
  _openTicketCallback: (id: number) => void,
  createTakeBtn: TakeFactory,
  createCloseBtn: CloseFactory,
  createStealBtn: StealFactory,
  customApiUrl?: string,
): Promise<void> {
  document.getElementById("sp-search-modal")?.remove();
  const modalTitle = title ?? `Tickets: ${statusName}`;
  const m = SP_Modal.info({
    id: "sp-search-modal",
    title: modalTitle,
    content:
      '<div id="sp-qf-results" style="flex:1;overflow:auto;min-height:100px;"><div style="text-align:center;padding:20px;color:#888;">Buscando...</div></div>' +
      '<div id="sp-qf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>',
    maxWidth: "900px",
    modalOptions: {
      width: "95%",
      maxHeight: "90vh",
      headerActions:
        '<button id="sp-qf-refresh" style="padding:6px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:13px;">🔄 Actualizar</button>',
    },
    onClose: () => {
      _activeModalRefresh = null;
    },
  });
  (
    document.getElementById("sp-qf-refresh") as HTMLButtonElement
  ).addEventListener("click", () => {
    if (_activeModalRefresh) void _activeModalRefresh();
  });

  let currentPage = 1;
  _activeModalRefresh = doSearch;
  await doSearch();

  async function doSearch() {
    const results = document.getElementById("sp-qf-results") as HTMLElement;
    const paging = document.getElementById("sp-qf-paging") as HTMLElement;
    results.innerHTML =
      '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
    paging.innerHTML = "";
    try {
      const baseUrl = customApiUrl ?? SP_CONFIG.SP_SEARCH_API;
      let url = `${baseUrl}?page=${currentPage - 1}&size=25`;
      if (!customApiUrl) url += `&resolutionGroupId=${getResolutionGroupId()}`;
      if (statusName)
        url += `&ticketStatusName=${encodeURIComponent(statusName)}`;
      if (extraParams) url += `&${extraParams}`;
      const { tickets, totalPages, totalElements } = await fetchTickets(url);
      if (!tickets.length) {
        results.innerHTML = `<div style="text-align:center;padding:20px;color:#888;">Sin tickets con estado: ${statusName || "todos"}</div>`;
        return;
      }
      const fac = buildActionFactories(
        _openTicketCallback,
        createTakeBtn,
        createCloseBtn,
        createStealBtn,
      );
      renderTicketCards(
        results,
        tickets,
        getLoggedUserName(),
        getCache() ?? {},
        fac.take,
        fac.close,
        fac.steal,
        fac.badge,
      );
      renderPaging(paging, totalElements, totalPages, currentPage, (n) => {
        currentPage = n;
        void doSearch();
      });
    } catch (err) {
      results.innerHTML = `<div style="color:#D94040;padding:12px;">Error: ${(err as Error).message}</div>`;
    }
  }
}

// ─── Search modal ─────────────────────────────────────────────

export function showSearchModal(
  getLoggedUserName: () => string,
  _openTicketCallback: (id: number) => void,
  createTakeBtn: TakeFactory,
  createCloseBtn: CloseFactory,
  createStealBtn: StealFactory,
): void {
  document.getElementById("sp-search-modal")?.remove();
  const inputStyle =
    "width:100%;padding:6px 8px;font-size:12px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;";
  const statusOpts = [
    "",
    "Asignado",
    "En espera",
    "En atención",
    "En validación",
    "Por confirmar",
    "Por ejecutar",
    "Por revisar",
    "En aplicaciones",
    "Cerrado",
    "Rechazado",
    "Cancelado",
    "Reabierto",
  ]
    .map((s) => `<option value="${s}">${s || "Todos"}</option>`)
    .join("");

  const m = SP_Modal.info({
    id: "sp-search-modal",
    title: "🔍 Buscar tickets",
    content:
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">` +
      `<div><label style="font-size:11px;color:#888;">Folio</label><input id="sp-sf-code" style="${inputStyle}" placeholder="Ej: 123"></div>` +
      `<div><label style="font-size:11px;color:#888;">Solicitante</label><input id="sp-sf-requester" style="${inputStyle}" placeholder="Nombre"></div>` +
      `<div><label style="font-size:11px;color:#888;">Estado</label><select id="sp-sf-status" style="${inputStyle}">${statusOpts}</select></div>` +
      `<div><label style="font-size:11px;color:#888;">Tipo</label><select id="sp-sf-type" style="${inputStyle}"><option value="">Todos</option><option value="5">Solicitud</option><option value="6">Incidente</option></select></div>` +
      `<div><label style="font-size:11px;color:#888;">Prioridad</label><select id="sp-sf-priority" style="${inputStyle}"><option value="">Todas</option><option value="6">Critico</option><option value="7">Alto</option><option value="8">Medio</option><option value="9">Bajo</option></select></div>` +
      `<div><label style="font-size:11px;color:#888;">Desde</label><input id="sp-sf-from" type="datetime-local" style="${inputStyle}"></div>` +
      `<div><label style="font-size:11px;color:#888;">Hasta</label><input id="sp-sf-to" type="datetime-local" style="${inputStyle}"></div>` +
      `</div>` +
      `<div style="display:flex;gap:8px;margin-bottom:12px;">` +
      `<button id="sp-sf-search" style="flex:1;padding:10px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;cursor:pointer;font-size:14px;">🔍 Buscar</button>` +
      `<button id="sp-sf-refresh" style="padding:10px 14px;border:1px solid #2196F3;border-radius:6px;background:#fff;color:#2196F3;cursor:pointer;font-size:14px;">🔄</button>` +
      `</div>` +
      `<div id="sp-sf-results" style="flex:1;overflow:auto;min-height:100px;"></div>` +
      `<div id="sp-sf-paging" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#888;"></div>`,
    maxWidth: "900px",
    modalOptions: { width: "95%", maxHeight: "90vh" },
    onClose: () => {
      _activeModalRefresh = null;
    },
  });

  (
    document.getElementById("sp-sf-refresh") as HTMLButtonElement
  ).addEventListener("click", () => {
    if (_activeModalRefresh) void _activeModalRefresh();
  });
  let currentPage = 1;
  (
    document.getElementById("sp-sf-search") as HTMLButtonElement
  ).addEventListener("click", () => {
    currentPage = 1;
    _activeModalRefresh = doSearch;
    void doSearch();
  });

  async function doSearch() {
    const results = document.getElementById("sp-sf-results") as HTMLElement;
    const paging = document.getElementById("sp-sf-paging") as HTMLElement;
    results.innerHTML =
      '<div style="text-align:center;padding:20px;color:#888;">Buscando...</div>';
    paging.innerHTML = "";

    // Gather search params
    const g = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)
        ?.value ?? "";
    let url = `${SP_CONFIG.SP_SEARCH_API}?page=${currentPage - 1}&size=25`;
    if (g("sp-sf-code"))
      url += `&uniqueCode=${encodeURIComponent(g("sp-sf-code"))}`;
    if (g("sp-sf-requester"))
      url += `&requesterName=${encodeURIComponent(g("sp-sf-requester"))}`;
    if (g("sp-sf-status"))
      url += `&ticketStatusName=${encodeURIComponent(g("sp-sf-status"))}`;
    if (g("sp-sf-type")) url += `&reportTypeId=${g("sp-sf-type")}`;
    if (g("sp-sf-priority")) url += `&priorityId=${g("sp-sf-priority")}`;
    if (g("sp-sf-from")) url += `&initDate=${g("sp-sf-from")}`;
    if (g("sp-sf-to")) url += `&endDate=${g("sp-sf-to")}`;

    try {
      const { tickets, totalPages, totalElements } = await fetchTickets(url);
      if (!tickets.length) {
        results.innerHTML =
          '<div style="text-align:center;padding:20px;color:#888;">Sin resultados</div>';
        return;
      }
      const fac = buildActionFactories(
        _openTicketCallback,
        createTakeBtn,
        createCloseBtn,
        createStealBtn,
      );
      renderTicketCards(
        results,
        tickets,
        getLoggedUserName(),
        getCache() ?? {},
        fac.take,
        fac.close,
        fac.steal,
        fac.badge,
      );
      renderPaging(paging, totalElements, totalPages, currentPage, (n) => {
        currentPage = n;
        void doSearch();
      });
    } catch (err) {
      results.innerHTML = `<div style="color:#D94040;padding:12px;">Error: ${(err as Error).message}</div>`;
    }
  }
}

// ─── Pagination helper ────────────────────────────────────────

function renderPaging(
  container: HTMLElement,
  total: number,
  totalPages: number,
  current: number,
  onPage: (page: number) => void,
): void {
  container.innerHTML =
    `<span>${total} tickets | Pag ${current} de ${totalPages}</span>` +
    `<div style="display:flex;gap:4px;">` +
    `<button id="sp-pg-prev" ${current <= 1 ? "disabled" : ""} style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">&lt;</button>` +
    `<button id="sp-pg-next" ${current >= totalPages ? "disabled" : ""} style="padding:4px 10px;font-size:11px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">&gt;</button>` +
    `</div>`;
  document.getElementById("sp-pg-prev")?.addEventListener("click", () => {
    if (current > 1) onPage(current - 1);
  });
  document.getElementById("sp-pg-next")?.addEventListener("click", () => {
    if (current < totalPages) onPage(current + 1);
  });
}
