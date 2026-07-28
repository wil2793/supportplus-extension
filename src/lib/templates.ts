// ============================================================
// SRC/LIB/TEMPLATES.TS - Reusable HTML templates
// ============================================================

import { escHtml } from "../components";
import type { SpTicket, PendingCloseTicket } from "../types";

// ─── Ticket Card ──────────────────────────────────────────────

export interface TicketCardOptions {
  draggable?: boolean;
  borderColor?: string;
  codeColor?: string;
  showStatus?: boolean;
  showResponsible?: boolean;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  "En espera": "#FF8F00",
  Asignado: "#1976D2",
  "En atención": "#FF9800",
  Cerrado: "#2E7D32",
  Rechazado: "#D32F2F",
  Reabierto: "#FF5722",
};

export function getStatusColor(statusName: string): string {
  return STATUS_COLOR_MAP[statusName] ?? "#888";
}

export function ticketCard(
  ticket: Partial<SpTicket> & { id: number },
  options: TicketCardOptions = {}
): string {
  const draggable = options.draggable ? 'draggable="true" ' : "";
  const cursor = options.draggable ? "cursor:grab;" : "";
  const borderColor = options.borderColor ?? "#eee";
  const codeColor = options.codeColor ?? "#1976D2";
  const t = ticket;

  const parts: string[] = [];
  parts.push(
    `<div ${draggable}data-ticket-id="${t.id}" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid ${borderColor};font-size:9px;line-height:1.3;${cursor}">`
  );
  parts.push(
    `<div style="font-weight:600;color:${codeColor};">${escHtml(t.uniqueCode ?? "")}</div>`
  );
  parts.push(
    `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">${escHtml((t.subject ?? "").substring(0, 25))}</div>`
  );

  if (options.showStatus) {
    const statusColor = getStatusColor(t.ticketStatusName ?? "");
    const nameToShow = options.showResponsible
      ? (t.responsibleName ?? "")
      : (t.requesterName ?? "");
    parts.push('<div style="display:flex;justify-content:space-between;">');
    parts.push(
      `<span style="color:${statusColor};font-weight:600;font-size:8px;">${escHtml(t.ticketStatusName ?? "")}</span>`
    );
    parts.push(
      `<span style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;" title="${escHtml(nameToShow)}">${escHtml(nameToShow.split(" ")[0])}</span>`
    );
    parts.push("</div>");
  } else {
    const person = options.showResponsible
      ? (t.responsibleName ?? "")
      : (t.requesterName ?? "");
    parts.push(
      `<div style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(person)}">${escHtml(person.split(" ")[0])}</div>`
    );
  }

  parts.push("</div>");
  return parts.join("");
}

// ─── Column Header ────────────────────────────────────────────

export function columnHeader(
  title: string,
  bgColor: string,
  countClass = "sp-mgr-pcount"
): string {
  return `<div style="background:${bgColor};color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">${title} <span class="${countClass}">(...)</span></div>`;
}

// ─── Empty State ──────────────────────────────────────────────

export function emptyState(text = "Sin tickets"): string {
  return `<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">${escHtml(text)}</div>`;
}

// ─── Column Container ─────────────────────────────────────────

export interface ColumnOptions {
  borderColor: string;
  headerHtml: string;
  profileId: string;
  groupId: string;
}

export function createColumn(options: ColumnOptions): HTMLElement {
  const col = document.createElement("div");
  col.style.cssText = `min-width:160px;max-width:200px;border:1px solid ${options.borderColor};border-radius:6px;overflow:hidden;flex-shrink:0;`;
  col.innerHTML =
    options.headerHtml +
    `<div class="sp-mgr-ptickets" data-profile-id="${options.profileId}" data-group-id="${options.groupId}" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>`;
  return col;
}

// ─── Ticket list ──────────────────────────────────────────────

export function ticketList(
  tickets: Array<Partial<SpTicket> & { id: number }>,
  options: TicketCardOptions = {}
): string {
  if (!tickets.length) return emptyState("Sin tickets");
  return tickets.map((t) => ticketCard(t, options)).join("");
}

// ─── Pending close ticket card ────────────────────────────────

export function pendingTicketCard(
  pt: PendingCloseTicket,
  withinHours: boolean
): string {
  const cursor = withinHours
    ? "cursor:pointer;"
    : "cursor:not-allowed;opacity:0.6;";
  const parts: string[] = [];
  parts.push(
    `<div class="sp-mgr-ticket sp-pending-ticket" data-ticket-id="${pt.ticketId}" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;${cursor}">`
  );
  parts.push(
    `<div style="font-weight:600;color:#E65100;">${escHtml(pt.ticket)}</div>`
  );
  if (!withinHours) {
    parts.push(
      '<div style="color:#888;font-size:8px;">🔒 Fuera de horario</div>'
    );
  }
  parts.push("</div>");
  return parts.join("");
}

const SP_Templates = {
  ticketCard,
  ticketList,
  columnHeader,
  emptyState,
  createColumn,
  getStatusColor,
  pendingTicketCard,
};
export default SP_Templates;
