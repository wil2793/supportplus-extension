// ============================================================
// SRC/FEATURES/PENDING-CLOSE.TS - Pending-close alert banner
// Shows an orange banner when there are tickets to close
// ============================================================

import { SP_CONFIG } from "../config";
import SP_Modal from "../lib/modal-builder";
import SP_Session from "./session";
import { spHeaders, spGetHeaders } from "../lib/sp-fetch";
import { showSuccessToast, showErrorToast, spinnerHTML } from "../components";
import type { WorkSchedule } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

let _shown = false;

export function resetPendingAlert(): void {
  _shown = false;
}

export async function checkPendingCloseAlert(
  workSchedule: WorkSchedule,
  onOpenTicket: (ticketId: number) => void,
): Promise<void> {
  if (_shown) return;
  const grid = document.querySelector(".MuiDataGrid-root");
  if (!grid) return;

  try {
    const resp = await new Promise<AnyObj>((resolve) => {
      chrome.runtime.sendMessage({ type: "api-get", endpoint: "/tickets-por-cerrar" }, (r: AnyObj) => resolve(r));
    });

    const raw: AnyObj[] = resp?.success && resp.data?.data ? (resp.data.data as AnyObj[]) : [];
    if (!raw.length) return;

    _shown = true;
    document.getElementById("sp-pending-close-alert")?.remove();

    const alertDiv = document.createElement("div");
    alertDiv.id = "sp-pending-close-alert";
    alertDiv.style.cssText =
      "margin-bottom:8px;padding:10px 16px;background:#FFF3E0;border:1px solid #FF8F00;border-radius:8px;" +
      "display:flex;align-items:center;gap:10px;cursor:pointer;font-family:system-ui;";
    alertDiv.innerHTML =
      `<span style="font-size:20px;">🕐</span>` +
      `<span style="flex:1;font-size:13px;color:#E65100;font-weight:600;">Hay ${raw.length} ticket(s) pendientes por cerrar</span>` +
      `<span style="padding:4px 12px;background:#FF8F00;color:#fff;border-radius:6px;font-size:12px;font-weight:600;">Cerrar ahora</span>`;

    const panelEl = document.getElementById("sp-manager-panel") ?? document.getElementById("sp-team-panel");
    const insertRef = panelEl ?? grid;
    insertRef.parentElement?.insertBefore(alertDiv, insertRef);

    alertDiv.addEventListener("click", () => {
      if (!SP_Session.isWithinWorkHours()) {
        SP_Modal.info({
          id: "sp-pending-close-modal",
          title: "⏰ Fuera de horario laboral",
          content:
            `<p style="font-size:14px;color:#555;margin:0 0 12px;">No se pueden cerrar tickets fuera del horario laboral.</p>` +
            `<p style="font-size:13px;color:#888;margin:0;">Horario: ${workSchedule.horaEntrada}:00 - ${workSchedule.horaSalida}:00, ${workSchedule.diaInicio} a ${workSchedule.diaFinal}</p>`,
          maxWidth: "380px",
          modalOptions: { textAlign: "center" },
        });
        return;
      }
      showCloseAllModal(raw, workSchedule, alertDiv, onOpenTicket);
    });
  } catch { /* ignore */ }
}

// ─── Close-all modal ──────────────────────────────────────────

function showCloseAllModal(
  raw: AnyObj[],
  workSchedule: WorkSchedule,
  alertDiv: HTMLElement,
  _onOpenTicket: (id: number) => void,
): void {
  const ticketList = raw
    .map((p) => ({
      ticket: (p["Ticket"] as string) ?? "",
      ticketId: (p["IdSupportPlus"] as number) ?? 0,
      pageId: p["IdTicketPorCerrar"] as number,
    }))
    .filter((t) => t.ticketId);

  const listHTML = ticketList
    .map((t) => `<div style="padding:4px 8px;font-size:12px;border-bottom:1px solid #eee;">${t.ticket}</div>`)
    .join("");

  const m = SP_Modal.info({
    id: "sp-pending-close-modal",
    title: `🔒 Cerrar ${ticketList.length} tickets pendientes`,
    content:
      `<p style="font-size:13px;color:#555;margin:0 0 12px;">Se cerrarán los siguientes tickets:</p>` +
      `<div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:16px;">${listHTML}</div>` +
      `<div id="sp-pending-close-progress" style="display:none;margin-bottom:12px;padding:8px;background:#f5f5f5;border-radius:6px;font-size:12px;text-align:center;"></div>` +
      `<div style="display:flex;gap:8px;">` +
      `<button id="sp-pending-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">✅ Cerrar todos</button>` +
      `<button id="sp-pending-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>` +
      `</div>`,
    maxWidth: "450px",
  });

  (document.getElementById("sp-pending-close-cancel") as HTMLButtonElement).addEventListener("click", m.close);

  (document.getElementById("sp-pending-close-confirm") as HTMLButtonElement).addEventListener("click", async () => {
    const confirmBtn = document.getElementById("sp-pending-close-confirm") as HTMLButtonElement;
    const progress = document.getElementById("sp-pending-close-progress") as HTMLElement;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = spinnerHTML(14, "Cerrando...");
    progress.style.display = "block";

    let closed = 0, errors = 0, skipped = 0;

    for (let i = 0; i < ticketList.length; i++) {
      progress.textContent = `Procesando ${i + 1} de ${ticketList.length}...`;
      const t = ticketList[i];
      try {
        // Check if already closed
        const ticketRes = await fetch(`${SP_CONFIG.SP_API}/${t.ticketId}`, { headers: spGetHeaders() });
        const ticketJson = (await ticketRes.json()) as AnyObj;
        const ticketData: AnyObj = ticketJson["data"] ?? ticketJson;
        const alreadyClosed = ticketData.ticketStatus?.name === "Cerrado";

        if (alreadyClosed) {
          void chrome.runtime.sendMessage({
            type: "api-put",
            endpoint: `/tickets-por-cerrar/cerrar-por-sp/${t.ticketId}`,
            body: { usuarioModificacion: "EXTENSION" },
          });
          skipped++;
        } else {
          const closeRes = await fetch(
            `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${t.ticketId}`,
            {
              method: "PATCH",
              headers: spHeaders(),
              body: JSON.stringify({ nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"], ticketCommentRequest: null }),
            },
          );
          if (!closeRes.ok) throw new Error(`HTTP ${closeRes.status}`);
          void chrome.runtime.sendMessage({
            type: "api-put",
            endpoint: `/tickets-por-cerrar/cerrar-por-sp/${t.ticketId}`,
            body: { usuarioModificacion: "EXTENSION" },
          });
          closed++;
        }
      } catch {
        errors++;
      }
    }

    m.close();
    alertDiv.remove();
    _shown = false;

    if (errors === 0) {
      showSuccessToast(`✅ ${closed} cerrados${skipped ? `, ${skipped} ya estaban cerrados` : ""}`);
    } else {
      showErrorToast(`${closed} cerrados, ${errors} errores`);
    }
  });
}
