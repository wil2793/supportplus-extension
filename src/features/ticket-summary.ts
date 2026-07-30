// ============================================================
// SRC/FEATURES/TICKET-SUMMARY.TS - Ticket summary card HTML
// Shared by modals: take, close, quick-detail
// ============================================================

import { escHtml as esc } from "../components";
import SP_DetailView from "./detail-view";
import { STATUS_COLORS, STATUS_TEXT_COLORS } from "../config";
import type { TicketInfo } from "../lib/sp-fetch";

// ─── Summary card ─────────────────────────────────────────────

export function ticketSummaryHTML(
  info: TicketInfo | null,
  canShowLabels: boolean,
): string {
  if (!info) return "";

  const fullText = `${info.subject} ${info.desc}`;
  const detections = SP_DetailView.detectAll(fullText);
  const borderColor = STATUS_TEXT_COLORS[info.status] ?? "#2196F3";
  const row = "padding:10px 14px;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;gap:8px;";

  const card =
    `<div style="border:2px solid ${borderColor};border-top:5px solid ${borderColor};border-radius:10px;overflow:hidden;margin-bottom:16px;font-size:13px;font-family:system-ui;background:#fff;">` +
    `<div style="${row}justify-content:space-between;"><span>📁 <b>Folio:</b> <span style="color:#1976D2;font-weight:700;">${info.uniqueCode}</span></span><span>📅 <b>Fecha:</b> ${info.createdAtFormatted || "N/A"}</span></div>` +
    `<div style="${row}"><span>✉️ <b>Asunto:</b> ${info.subject}</span></div>` +
    `<div style="${row}"><span>👤 <b>Solicitante:</b> ${info.requester || "N/A"}</span></div>` +
    `<div style="${row}"><span>🔍 <b>Analista:</b> ${info.holder}${info.holderEmail ? ` <span style="color:#888;">(${info.holderEmail})</span>` : ""}</span></div>` +
    `<div style="${row}"><span>✅ <b>Estatus:</b> <span style="color:${STATUS_TEXT_COLORS[info.status] ?? "#333"};font-weight:700;">${info.status || "N/A"}</span></span></div>` +
    (info.desc ? `<div style="${row}flex-direction:column;align-items:flex-start;"><b>📝 Descripción:</b><div style="margin-top:4px;max-height:60px;overflow:auto;font-size:12px;color:#555;width:100%;">${info.desc}</div></div>` : "") +
    "</div>";

  const detectionTag = (
    value: string,
    dataAttr: string,
    borderColor2: string,
  ) =>
    `<span class="sp-${dataAttr}-copy" data-${dataAttr}="${value}" ` +
    `style="display:inline-flex;align-items:center;gap:2px;margin:2px 4px;padding:2px 8px;background:#fff;` +
    `border:1px solid ${borderColor2};border-radius:4px;font-weight:600;font-size:12px;` +
    `${dataAttr !== "sl" ? "font-family:monospace;" : ""}">${value}</span>`;

  const slHTML =
    detections.slCodes.length && canShowLabels
      ? `<div style="margin-bottom:8px;padding:8px 10px;background:#E3F2FD;border-radius:6px;border-left:4px solid #1976D2;">` +
        `<b style="font-size:11px;color:#1976D2;">📋 SL/PR detectadas:</b> ` +
        detections.slCodes.map((sl) => detectionTag(sl, "sl", "#1976D2")).join("") +
        `</div>`
      : "";

  const userHTML = detections.users.length
    ? `<div style="margin-bottom:8px;padding:8px 10px;background:#FFF3E0;border-radius:6px;border-left:4px solid #E65100;">` +
      `<b style="font-size:11px;color:#E65100;">🖥️ Usuarios detectados:</b> ` +
      detections.users.map((u) => detectionTag(u, "user", "#E65100")).join("") +
      `</div>`
    : "";

  const dbHTML =
    detections.dbObjects.length && canShowLabels
      ? `<div style="margin-bottom:8px;padding:8px 10px;background:#E8F5E9;border-radius:6px;border-left:4px solid #2E7D32;">` +
        `<b style="font-size:11px;color:#2E7D32;">🗄️ Objetos de BD:</b> ` +
        detections.dbObjects.map((obj) => detectionTag(obj, "db", "#2E7D32")).join("") +
        `</div>`
      : "";

  return card + slHTML + userHTML + dbHTML;
}

// ─── Inject copy buttons into rendered HTML ───────────────────

export function injectSLCopyButtons(
  container: HTMLElement,
  createCopyButton: (text: string) => HTMLButtonElement,
): void {
  for (const [selector, attr] of [
    [".sp-sl-copy", "sl"],
    [".sp-user-copy", "user"],
    [".sp-db-copy", "db"],
  ] as const) {
    container.querySelectorAll<HTMLElement>(selector).forEach((span) => {
      if (!span.querySelector(".sp-copy-btn")) {
        const val = span.dataset[attr];
        if (val) span.appendChild(createCopyButton(val));
      }
    });
  }
}

// ─── Ticket table renderer (used by search / dashboard) ───────

export interface TicketRow {
  id: number | string;
  uniqueCode?: string;
  subject?: string;
  requesterName?: string;
  responsibleName?: string;
  ticketStatusName?: string;
  createdAt?: string;
}

export function renderTicketCards(
  container: HTMLElement,
  tickets: TicketRow[],
  myName: string,
  synced: Record<string, string>,
  createTakeBtn: (id: string | number) => HTMLButtonElement,
  createCloseBtn: (id: string | number) => HTMLButtonElement,
  createStealBtn: (id: string | number, name: string) => HTMLButtonElement,
  createSyncedBadge: (itemId: string) => HTMLAnchorElement,
): void {
  const rows = tickets
    .map((t) => {
      const statusBg = STATUS_COLORS[t.ticketStatusName ?? ""] ?? "transparent";
      const statusColor = STATUS_TEXT_COLORS[t.ticketStatusName ?? ""] ?? "#333";
      const date = (t.createdAt ?? "").replace("T", " ").substring(0, 16);
      const subjectShort =
        (t.subject ?? "").substring(0, 40) +
        ((t.subject ?? "").length > 40 ? "..." : "");
      return (
        `<tr style="background:${statusBg};border-bottom:1px solid #eee;">` +
        `<td style="padding:6px;font-weight:600;white-space:nowrap;">` +
        `<a href="/es/dashboard/tickets/${t.id}" target="_blank" style="color:inherit;text-decoration:none;">${t.uniqueCode ?? t.id}</a>` +
        `<span class="sp-card-copy" data-code="${t.uniqueCode ?? ""}"></span></td>` +
        `<td style="padding:6px;font-size:11px;">${date}</td>` +
        `<td style="padding:6px;" title="${esc(t.subject ?? "")}">${subjectShort}</td>` +
        `<td style="padding:6px;">${t.requesterName ?? ""}</td>` +
        `<td style="padding:6px;font-size:11px;font-weight:700;color:${statusColor};">${t.ticketStatusName ?? ""}</td>` +
        `<td style="padding:6px;">${t.responsibleName ?? "Sin asignar"}</td>` +
        `<td style="padding:8px;white-space:nowrap;display:flex;align-items:center;gap:6px;flex-wrap:wrap;" ` +
        `class="sp-card-actions" data-id="${t.id}" data-status="${t.ticketStatusName ?? ""}" ` +
        `data-responsible="${t.responsibleName ?? ""}" data-code="${t.uniqueCode ?? ""}"></td>` +
        `</tr>`
      );
    })
    .join("");

  container.innerHTML =
    `<table style="width:100%;border-collapse:collapse;font-size:12px;">` +
    `<thead><tr style="background:rgba(0,0,0,0.05);text-align:left;">` +
    `<th style="padding:6px;">Folio</th><th style="padding:6px;">Fecha</th>` +
    `<th style="padding:6px;">Asunto</th><th style="padding:6px;">Solicitante</th>` +
    `<th style="padding:6px;">Estado</th><th style="padding:6px;">Analista</th>` +
    `<th style="padding:6px;min-width:200px;">Acciones</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`;

  // Copy buttons on folio cell
  container.querySelectorAll<HTMLElement>(".sp-card-copy").forEach((span) => {
    const code = span.dataset["code"];
    if (code) {
      const btn = document.createElement("button");
      btn.className = "sp-copy-btn";
      btn.innerHTML = "📋";
      btn.title = "Copiar";
      btn.style.cssText = "background:none;border:none;cursor:pointer;font-size:12px;";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(code).then(() => {
          btn.innerHTML = "✅";
          setTimeout(() => (btn.innerHTML = "📋"), 1500);
        });
      });
      span.appendChild(btn);
    }
  });

  // Action buttons per row
  container.querySelectorAll<HTMLElement>(".sp-card-actions").forEach((cell) => {
    const id = cell.dataset["id"] ?? "";
    const status = cell.dataset["status"] ?? "";
    const responsible = cell.dataset["responsible"] ?? "";
    const code = cell.dataset["code"] ?? "";

    if (status === "En espera") cell.appendChild(createTakeBtn(id));
    if (
      (status === "Asignado" || status === "En atención") &&
      responsible === myName
    )
      cell.appendChild(createCloseBtn(id));
    if (
      (status === "Asignado" || status === "En atención") &&
      responsible &&
      responsible !== myName
    )
      cell.appendChild(createStealBtn(id, responsible));
    if (status === "Cerrado" && code && synced[code])
      cell.appendChild(createSyncedBadge(synced[code]));

    const link = document.createElement("a");
    link.href = `/es/dashboard/tickets/${id}`;
    link.target = "_blank";
    link.textContent = "Ir al ticket";
    link.style.cssText =
      "display:inline-block;padding:4px 12px;background:#2196F3;color:#fff;" +
      "font-size:11px;font-weight:600;text-decoration:none;border-radius:4px;white-space:nowrap;";
    cell.appendChild(link);
  });
}
