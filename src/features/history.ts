// ============================================================
// SRC/FEATURES/HISTORY.TS - Ticket change log modal
// ============================================================

import SP_Modal from "../lib/modal-builder";
import { spGetHeaders, formatDisplayDate } from "../lib/sp-fetch";
import { showErrorToast, showLoadingToast } from "../react/store/toastBridge";
import { SP_CONFIG } from "../config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

// ─── Field label map ──────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
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

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field ?? "";
}

// ─── Action label/color map ───────────────────────────────────

const ACTION_MAP: Record<string, { label: string; color: string }> = {
  create: { label: "Creado", color: "#1976D2" },
  add: { label: "Añadido", color: "#2E7D32" },
  delete: { label: "Eliminado", color: "#C62828" },
  update: { label: "Actualizado", color: "#F57C00" },
  reassign: { label: "Reasignado", color: "#7B1FA2" },
  close: { label: "Cerrado", color: "#616161" },
  reopen: { label: "Reabierto", color: "#FF8F00" },
};

// ─── Log detail builder ───────────────────────────────────────

export function buildLogDetail(log: JsonObject): string {
  const { field, before, after } = log;

  if (field === "responsible_info" && after?.content) {
    const a: JsonObject = after.content;
    const b: JsonObject | null = before?.content?.fullName
      ? before.content
      : null;
    const fmt = (x: JsonObject) =>
      `${x.fullName} (${x.email ?? ""}) - ${x.roleName ?? ""}`;
    return b ? `${fmt(b)} &nbsp;→&nbsp; ${fmt(a)}` : fmt(a);
  }
  if (field === "status" && after?.content) {
    const bs: string = before?.content?.name ?? "";
    const as_: string = after.content.name ?? "";
    return bs ? `${bs} &nbsp;→&nbsp; ${as_}` : as_;
  }
  if (field === "attachments" && Array.isArray(after?.content)) {
    const files = (after.content as JsonObject[]).map(
      (f) => f.name ?? "archivo",
    );
    const vis = after.content[0]?.isInternal ? "Interno" : "Público";
    return `Archivo: ${files.join(", ")} | ${vis}`;
  }
  if (field === "attachment_delete" && before?.content) {
    const f: JsonObject = before.content;
    return `Archivo: ${f.name ?? "archivo"} | ${f.isInternal ? "Interno" : "Público"}`;
  }
  if (field === "ticket_visitor_participant" && after?.content) {
    const p: JsonObject = after.content;
    return `${p.fullName ?? ""} (${p.email ?? ""}) - ${p.isParticipant ? "Participante" : "Visitante"}`;
  }
  if (field === "ticket" && after?.content) return String(after.content);
  return "";
}

// ─── Modal ────────────────────────────────────────────────────

export async function showHistoryModal(
  ticketId: number | string,
): Promise<void> {
  document.getElementById("sp-history-modal")?.remove();
  showLoadingToast("Cargando historial...");

  try {
    const res = await fetch(`${SP_CONFIG.SP_API}/logs/${ticketId}`, {
      headers: spGetHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const logs = ((await res.json()) as JsonObject[]).sort(
      (a, b) =>
        new Date(b.createdAt as string).getTime() -
        new Date(a.createdAt as string).getTime(),
    );

    const cardsHtml = logs.length
      ? logs
          .map((log) => {
            const ai = ACTION_MAP[log.action?.name as string] ?? {
              label: log.action?.name ?? "Acción",
              color: "#757575",
            };
            const initial = ((log.fullName as string) || "?")[0].toUpperCase();
            const detail = buildLogDetail(log);
            return (
              `<div style="background:#1E1E1E;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:3px solid ${ai.color};">` +
              `<div style="display:flex;align-items:center;justify-content:space-between;">` +
              `<div style="display:flex;align-items:center;gap:10px;">` +
              `<div style="width:36px;height:36px;border-radius:50%;background:${ai.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;">${initial}</div>` +
              `<div><div style="font-weight:600;font-size:13px;color:#E0E0E0;">${log.fullName ?? "Desconocido"}</div>` +
              `<div style="font-size:11px;color:#9E9E9E;">${getFieldLabel(log.field as string)}</div></div>` +
              `</div><span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:${ai.color};">${ai.label}</span></div>` +
              (detail
                ? `<div style="margin-top:8px;font-size:12px;color:#BDBDBD;">${detail}</div>`
                : "") +
              `<div style="margin-top:6px;font-size:11px;color:#757575;">Fecha y hora: ${formatDisplayDate(log.createdAt as string)}</div>` +
              `</div>`
            );
          })
          .join("")
      : '<div style="text-align:center;color:#9E9E9E;padding:20px;">Sin historial</div>';

    document.getElementById("sp-loading-toast")?.remove();
    SP_Modal.info({
      id: "sp-history-modal",
      title: `📋 Historial del ticket #${ticketId}`,
      maxWidth: "600px",
      content: `<div style="max-height:500px;overflow-y:auto;padding:4px;">${cardsHtml}</div>`,
    });
  } catch (err) {
    showErrorToast(`Error al cargar historial: ${(err as Error).message}`);
  }
}
