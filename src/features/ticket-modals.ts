// ============================================================
// SRC/FEATURES/TICKET-MODALS.TS
// showTakeModal, showCloseModal, showReopenModal,
// showReassignAppModal, and the three row action buttons.
// ============================================================

import { SP_CONFIG } from "../config";
import SP_Modal from "../lib/modal-builder";
import SP_MondayUtils from "../lib/monday-utils";
import SP_Session from "./session";
import SP_TicketActions from "./ticket-actions";
import { spHeaders, spGetHeaders, fetchTicketInfo } from "../lib/sp-fetch";
import { ticketSummaryHTML, injectSLCopyButtons } from "./ticket-summary";
import { addToCache } from "../lib/monday-cache";
import {
  showLoadingToast,
  showSuccessToast,
  showErrorToast,
  spinnerHTML,
} from "../components";
import type { SpTicket } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// ─── CSS class constants ──────────────────────────────────────

export const TAKE_BTN_CLASS = "sp-take-btn";
export const STEAL_BTN_CLASS = "sp-steal-btn";
export const CLOSE_BTN_CLASS = "sp-close-btn";
export const BTN_CLASS = "sp-monday-btn";

// ─── Helper: hover text toggle ────────────────────────────────

function hoverText(btn: HTMLButtonElement, normal: string, hover: string): void {
  btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.textContent = hover; });
  btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.textContent = normal; });
}

// ─── Row action buttons ───────────────────────────────────────

export function createMigrateButton(
  ticketId: string | number,
  onMigrate: (id: string | number) => Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = BTN_CLASS;
  btn.textContent = "🙂 Migrar";
  btn.title = "Migrar a Monday";
  btn.style.cssText =
    "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #D94040;" +
    "border-radius:4px;background:#D94040;color:#fff;margin-left:6px;white-space:nowrap;";
  hoverText(btn, "🙂 Migrar", "🫡 Migrar");
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); e.preventDefault();
    btn.textContent = "⏳"; btn.disabled = true;
    void onMigrate(ticketId).finally(() => { btn.textContent = "🙂 Migrar"; btn.disabled = false; });
  });
  return btn;
}

export function createTakeButton(
  ticketId: string | number,
  onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = TAKE_BTN_CLASS;
  btn.textContent = "🤚 Tomar";
  btn.title = "Tomar ticket";
  btn.style.cssText =
    "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #1976D2;" +
    "border-radius:4px;background:#1976D2;color:#fff;margin-left:6px;white-space:nowrap;";
  hoverText(btn, "🤚 Tomar", "✊ Tomar");
  btn.addEventListener("click", async (e) => {
    e.stopPropagation(); e.preventDefault();
    btn.disabled = true;
    const orig = btn.textContent ?? "";
    btn.innerHTML = spinnerHTML(12);
    await onTake(ticketId, btn);
    btn.textContent = orig;
    btn.disabled = false;
  });
  return btn;
}

export function createStealButton(
  ticketId: string | number,
  responsibleName: string,
  onTake: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = STEAL_BTN_CLASS;
  btn.textContent = "🥷 Robar";
  btn.title = responsibleName ? `Asignado a: ${responsibleName}` : "Robar ticket";
  btn.style.cssText =
    "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #E65100;" +
    "border-radius:4px;background:#E65100;color:#fff;margin-left:6px;white-space:nowrap;";
  hoverText(btn, "🥷 Robar", "💀 Robar");
  btn.addEventListener("click", async (e) => {
    e.stopPropagation(); e.preventDefault();
    btn.disabled = true;
    const orig = btn.textContent ?? "";
    btn.innerHTML = spinnerHTML(12);
    await onTake(ticketId, btn);
    btn.textContent = orig;
    btn.disabled = false;
  });
  return btn;
}

export function createCloseButton(
  ticketId: string | number,
  onClose: (id: string | number, btn: HTMLButtonElement) => Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = CLOSE_BTN_CLASS;
  btn.textContent = "🔒 Cerrar";
  btn.title = "Cerrar ticket";
  btn.style.cssText =
    "padding:2px 8px;font-size:11px;cursor:pointer;border:1px solid #616161;" +
    "border-radius:4px;background:#616161;color:#fff;margin-left:6px;white-space:nowrap;";
  hoverText(btn, "🔒 Cerrar", "🔐 Cerrar");
  btn.addEventListener("click", async (e) => {
    e.stopPropagation(); e.preventDefault();
    btn.disabled = true;
    const orig = btn.textContent ?? "";
    btn.innerHTML = spinnerHTML(12);
    await onClose(ticketId, btn);
    btn.textContent = orig;
    btn.disabled = false;
  });
  return btn;
}

// ─── Monday board groups helper ───────────────────────────────

async function fetchMondayGroups(
  mondayToken: string | null,
  boardId: string | null,
): Promise<AnyObj[]> {
  if (!mondayToken || !boardId) return [];
  try {
    const data = await SP_MondayUtils.findMondayItem(mondayToken, "", { boards: [{ id: boardId, name: "" }] });
    void data; // only used for side-effect; get groups separately
    const { mondayQuery } = await import("../lib/api");
    const gData = await mondayQuery(
      mondayToken,
      "query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }",
      { boardId },
    );
    return gData.boards?.[0]?.groups ?? [];
  } catch { return []; }
}

async function getMondayGroupOptions(canShowMigrate: boolean): Promise<{ token: string | null; boardId: string | null; groups: AnyObj[] }> {
  if (!canShowMigrate) return { token: null, boardId: null, groups: [] };
  const { default: SP_API_Lib } = await import("../lib/api");
  const token = await SP_API_Lib.getMondayToken();
  const boardId = await SP_API_Lib.getMondayBoardId(SP_API_Lib.getSpToken());
  const groups = await fetchMondayGroups(token, boardId);
  return { token, boardId, groups };
}

function buildGroupSelect(id: string, groups: AnyObj[], placeholder: string): string {
  return (
    `<select id="${id}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:12px;">` +
    `<option value="">${placeholder}</option>` +
    groups.map((g: AnyObj) => `<option value="${g.id}">${g.title}</option>`).join("") +
    `</select>`
  );
}

// ─── Take Modal ───────────────────────────────────────────────

export interface TakeModalContext {
  getMyProfileId: () => Promise<number | null>;
  getTeamResolutionGroupId: () => number;
  getTeamResolutionGroupLabel: () => string;
  canShowLabels: boolean;
  createCloseBtn: (id: string | number, onClose: (id: string | number, btn: HTMLButtonElement) => Promise<void>) => HTMLButtonElement;
}

export async function showTakeModal(
  ticketId: number | string,
  originalBtn: HTMLButtonElement,
  ctx: TakeModalContext,
): Promise<void> {
  document.getElementById("sp-take-modal")?.remove();
  const [info, { token: mondayToken, boardId, groups }] = await Promise.all([
    fetchTicketInfo(ticketId),
    getMondayGroupOptions(true),
  ]);
  const summaryHTML = ticketSummaryHTML(info, ctx.canShowLabels);
  const groupOpts = buildGroupSelect("sp-take-group", groups, "-- No migrar --");

  const m = SP_Modal.info({
    id: "sp-take-modal",
    title: `🤚 Tomar ticket #${ticketId}`,
    content:
      summaryHTML +
      `<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario al tomar</label>` +
      `<textarea id="sp-take-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="se revisa"></textarea>` +
      `<div style="margin-bottom:12px;"><label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="sp-take-done"> <b>Ticket realizado</b></label></div>` +
      `<div id="sp-take-migrate-section" style="display:none;margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Migrar a Monday (opcional)</label>${groupOpts}</div>` +
      `<div id="sp-take-close-comment-section" style="display:none;margin-bottom:12px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario antes de cerrar (opcional)</label><textarea id="sp-take-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;" placeholder="Comentario de cierre..."></textarea></div>` +
      `<div style="display:flex;gap:8px;"><button id="sp-take-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:14px;">✊ Tomar ticket</button><button id="sp-take-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>`,
    maxWidth: "420px",
  });

  injectSLCopyButtons(m.overlay, SP_TicketActions.getProfilesForGroup as unknown as (text: string) => HTMLButtonElement);
  const confirmBtn = document.getElementById("sp-take-confirm") as HTMLButtonElement;
  const doneCheck = document.getElementById("sp-take-done") as HTMLInputElement;
  const migrateSection = document.getElementById("sp-take-migrate-section") as HTMLElement;
  const closeSection = document.getElementById("sp-take-close-comment-section") as HTMLElement;
  const groupSel = document.getElementById("sp-take-group") as HTMLSelectElement;

  const updateConfirmText = () => {
    confirmBtn.textContent = doneCheck.checked && groupSel.value
      ? "Tomar, cerrar y migrar"
      : doneCheck.checked ? "Tomar y cerrar" : "✊ Tomar ticket";
  };
  doneCheck.addEventListener("change", () => {
    migrateSection.style.display = doneCheck.checked ? "block" : "none";
    closeSection.style.display = doneCheck.checked ? "block" : "none";
    updateConfirmText();
  });
  groupSel.addEventListener("change", updateConfirmText);
  (document.getElementById("sp-take-cancel") as HTMLButtonElement).addEventListener("click", m.close);

  confirmBtn.addEventListener("click", async () => {
    const comment = (document.getElementById("sp-take-comment") as HTMLTextAreaElement).value.trim() || "se revisa";
    const closeComment = doneCheck.checked
      ? (document.getElementById("sp-take-close-comment") as HTMLTextAreaElement).value.trim()
      : "";
    m.overlay.remove();
    originalBtn.disabled = true;
    originalBtn.innerHTML = spinnerHTML(12);
    showLoadingToast("Tomando ticket...");

    const profileId = await ctx.getMyProfileId();
    if (!profileId) {
      showErrorToast("No se pudo obtener tu perfil");
      originalBtn.textContent = "🤚 Tomar";
      originalBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
        method: "PUT",
        headers: spHeaders(),
        body: JSON.stringify({
          resolutionGroupId: ctx.getTeamResolutionGroupId(),
          serviceId: null,
          responsibleProfileId: profileId,
          resolutionGroup: { label: ctx.getTeamResolutionGroupLabel(), value: ctx.getTeamResolutionGroupId() },
          ticketCommentRequest: { internal: false, content: comment },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AnyObj;
      if (!json["success"]) throw new Error("No success");

      if (doneCheck.checked) {
        if (!SP_Session.isWithinWorkHours()) {
          const stored = await new Promise<AnyObj>((r) =>
            chrome.storage.local.get(["usersMap", "userEmail"], (d) => r(d as AnyObj)),
          );
          const pEmail = ((stored["userEmail"] as string) ?? "").toLowerCase();
          const pUser = ((stored["usersMap"] as AnyObj) ?? {})[pEmail];
          if (pUser?.idUsuario)
            await SP_TicketActions.saveTicketPendingClose(
              info?.uniqueCode ?? `T${ticketId}`,
              ticketId as number,
              String(pUser.idUsuario),
              "",
            );
          showSuccessToast("Ticket tomado. Cierre pendiente (fuera de horario).");
          originalBtn.textContent = "✅ Tomado";
          originalBtn.disabled = false;
          return;
        }
        if (closeComment)
          await fetch(`${SP_CONFIG.SP_API}/comment/${ticketId}`, {
            method: "POST", headers: spHeaders(),
            body: JSON.stringify({ content: `<p>${closeComment}</p>`, internal: false }),
          });
        const closeRes = await fetch(
          `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
          { method: "PATCH", headers: spHeaders(), body: JSON.stringify({ nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"], ticketCommentRequest: null }) },
        );
        if (!closeRes.ok) throw new Error(`HTTP ${closeRes.status}`);

        const selGroup = groupSel.value;
        if (selGroup && mondayToken && boardId) {
          const tRes = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, { headers: spGetHeaders() });
          const tJson = (await tRes.json()) as AnyObj;
          await SP_MondayUtils.createMondayItem(mondayToken, {
            boardId, groupId: selGroup,
            ticket: (tJson["data"] ?? tJson) as unknown as SpTicket,
          });
        }
        showSuccessToast(selGroup ? "Ticket tomado, cerrado y migrado" : "Ticket tomado y cerrado");
      } else {
        showSuccessToast("Ticket tomado");
      }
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
      originalBtn.textContent = "🤚 Tomar";
      originalBtn.disabled = false;
    }
  });
}

// ─── Close Modal ──────────────────────────────────────────────

export interface CloseModalContext {
  getMyProfileId: () => Promise<number | null>;
  getTeamResolutionGroupId: () => number;
  getTeamResolutionGroupLabel: () => string;
  canShowLabels: boolean;
  createMigrateBtn: (id: string | number) => HTMLButtonElement;
}

export async function showCloseModal(
  ticketId: number | string,
  originalBtn: HTMLButtonElement,
  ctx: CloseModalContext,
): Promise<void> {
  document.getElementById("sp-close-modal-single")?.remove();
  const [info, { token: mondayToken, boardId, groups }] = await Promise.all([
    fetchTicketInfo(ticketId),
    getMondayGroupOptions(true),
  ]);
  const summaryHTML = ticketSummaryHTML(info, ctx.canShowLabels);
  const groupSelect = buildGroupSelect("sp-close-group", groups, "-- Selecciona destino (opcional) --");

  const m = SP_Modal.info({
    id: "sp-close-modal-single",
    title: `🔒 Cerrar ticket #${ticketId}`,
    content:
      summaryHTML +
      `<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Destino en Monday (opcional)</label>` +
      groupSelect +
      `<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Comentario (opcional)</label>` +
      `<textarea id="sp-close-comment" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:system-ui;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe un comentario..."></textarea>` +
      `<div style="display:flex;gap:8px;"><button id="sp-close-confirm" style="flex:1;padding:10px;border:none;border-radius:6px;background:#616161;color:#fff;cursor:pointer;font-size:14px;">🔐 Cerrar ticket</button><button id="sp-close-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button></div>`,
    maxWidth: "420px",
  });

  injectSLCopyButtons(m.overlay, SP_TicketActions.getProfilesForGroup as unknown as (text: string) => HTMLButtonElement);
  const confirmBtn = document.getElementById("sp-close-confirm") as HTMLButtonElement;
  const groupSel = document.getElementById("sp-close-group") as HTMLSelectElement;
  groupSel.addEventListener("change", () => {
    confirmBtn.innerHTML = groupSel.value ? "🔐 Cerrar y migrar" : "🔐 Cerrar ticket";
  });
  (document.getElementById("sp-close-cancel") as HTMLButtonElement).addEventListener("click", m.close);

  confirmBtn.addEventListener("click", async () => {
    const selectedGroup = groupSel.value;
    const commentText = (document.getElementById("sp-close-comment") as HTMLTextAreaElement).value.trim();
    m.overlay.remove();
    originalBtn.disabled = true;
    originalBtn.innerHTML = spinnerHTML(12);
    showLoadingToast(selectedGroup ? "Cerrando y migrando..." : "Cerrando ticket...");

    try {
      if (commentText)
        await fetch(`${SP_CONFIG.SP_API}/comment/${ticketId}`, {
          method: "POST", headers: spHeaders(),
          body: JSON.stringify({ content: `<p>${commentText}</p>`, internal: false }),
        });
      if (!info?.holder || info.holder === "Sin asignar") {
        const pid = await ctx.getMyProfileId();
        if (pid)
          await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
            method: "PUT", headers: spHeaders(),
            body: JSON.stringify({ resolutionGroupId: ctx.getTeamResolutionGroupId(), serviceId: null, responsibleProfileId: pid, resolutionGroup: { label: ctx.getTeamResolutionGroupLabel(), value: ctx.getTeamResolutionGroupId() } }),
          });
      }
      const res = await fetch(
        `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
        { method: "PATCH", headers: spHeaders(), body: JSON.stringify({ nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"], ticketCommentRequest: null }) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (selectedGroup && mondayToken && boardId && info) {
        const tRes = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, { headers: spGetHeaders() });
        const tJson = (await tRes.json()) as AnyObj;
        const newItemId = await SP_MondayUtils.createMondayItem(mondayToken, {
          boardId, groupId: selectedGroup,
          ticket: (tJson["data"] ?? tJson) as unknown as SpTicket,
        });
        if (newItemId) addToCache(info.uniqueCode, newItemId);
      }

      const row = originalBtn.closest<HTMLElement>(".MuiDataGrid-row");
      originalBtn.replaceWith(ctx.createMigrateBtn(ticketId));
      if (row) {
        row.querySelector("." + STEAL_BTN_CLASS)?.remove();
        row.querySelector("." + CLOSE_BTN_CLASS)?.remove();
        const sc = row.querySelector('[data-field="ticketStatusName"]');
        if (sc) sc.textContent = "Cerrado";
      }
      showSuccessToast(selectedGroup ? "Ticket cerrado y migrado" : "Ticket cerrado");
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
      originalBtn.textContent = "🔒 Cerrar";
      originalBtn.disabled = false;
    }
  });
}

// ─── Reopen Modal ─────────────────────────────────────────────

export async function showReopenModal(
  ticketId: number | string,
  currentHolder: string | undefined,
  getTeamResolutionGroupId: () => number,
  getTeamResolutionGroupLabel: () => string,
  teamProfiles: AnyObj[],
): Promise<void> {
  document.getElementById("sp-reopen-modal")?.remove();
  const opts = teamProfiles
    .map((p: AnyObj) => `<option value="${p.profileId}">${p.profileFullName}</option>`)
    .join("");
  const holderInfo =
    currentHolder && currentHolder !== "Sin asignar"
      ? `<p style="font-size:12px;color:#888;margin:0 0 12px;">Asignado actualmente a: <b>${currentHolder}</b></p>`
      : "";

  SP_Modal.form({
    id: "sp-reopen-modal",
    title: `🔓 Reabrir ticket #${ticketId}`,
    content:
      `<p style="font-size:13px;color:#555;margin:0 0 12px;">Al reasignar un ticket cerrado se reabrirá automáticamente.</p>` +
      holderInfo +
      `<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Reasignar a:</label>` +
      `<select id="sp-reopen-person" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;font-size:13px;"><option value="">-- Selecciona --</option>${opts}</select>`,
    submitText: "🔄 Reabrir",
    submitColor: "#FF8F00",
    maxWidth: "400px",
    onSubmit: async (api) => {
      const personId = (api.getElement?.("#sp-reopen-person") as HTMLSelectElement)?.value;
      if (!personId) { showErrorToast("Selecciona a quién reasignar."); return; }
      api.close();
      showLoadingToast("Reabriendo ticket...");
      try {
        const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
          method: "PUT", headers: spHeaders(),
          body: JSON.stringify({ resolutionGroupId: getTeamResolutionGroupId(), serviceId: null, responsibleProfileId: parseInt(personId), resolutionGroup: { label: getTeamResolutionGroupLabel(), value: getTeamResolutionGroupId() } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AnyObj;
        if (json["success"]) { showSuccessToast("Ticket reabierto"); setTimeout(() => window.location.reload(), 1500); }
        else throw new Error("No se pudo reabrir");
      } catch (err) { showErrorToast(`Error: ${(err as Error).message}`); }
    },
  });
}

// ─── Reassign to Aplicaciones ─────────────────────────────────

export function showReassignAppModal(
  ticketId: number | string,
  getTeamResolutionGroupId: () => number,
  getTeamResolutionGroupLabel: () => string,
  getMyProfileId: () => Promise<number | null>,
): void {
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
        const takeRes = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
          method: "PUT", headers: spHeaders(),
          body: JSON.stringify({ resolutionGroupId: getTeamResolutionGroupId(), serviceId: null, responsibleProfileId: profileId, resolutionGroup: { label: getTeamResolutionGroupLabel(), value: getTeamResolutionGroupId() } }),
        });
        if (!takeRes.ok || !(await takeRes.json() as AnyObj)["success"])
          throw new Error("No se pudo tomar el ticket");
        showLoadingToast("Reasignando a Aplicaciones...");
        const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
          method: "PUT", headers: spHeaders(),
          body: JSON.stringify({ ticketCommentRequest: { internal: false, content: "Se reasigna ticket" }, resolutionGroupId: SP_CONFIG.APPS_GROUP.id, serviceId: null, responsibleProfileId: null, resolutionGroup: { label: SP_CONFIG.APPS_GROUP.label, value: SP_CONFIG.APPS_GROUP.id } }),
        });
        if (!res.ok || !(await res.json() as AnyObj)["success"]) throw new Error("No success");
        SP_Modal.success({ id: "sp-reassign-success", title: "✅ Ticket reasignado", message: "El ticket fue reasignado a Aplicaciones.", buttons: [{ text: "Aceptar", color: "#2E7D32", onClick: () => { window.location.href = "/es/dashboard/tickets-mesa"; } }] });
      } catch (err) { showErrorToast(`Error: ${(err as Error).message}`); }
    },
  });
}
