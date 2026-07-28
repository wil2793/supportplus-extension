// ============================================================
// SRC/FEATURES/GUARDIAS.TS - Control de Guardias (calendar + swaps)
// ============================================================

import { MONTH_NAMES } from "../config";
import { showSuccessToast, showErrorToast } from "../components";
import { infoModal } from "../lib/modal-builder";
import type { GuardiaEntry, GuardiaSolicitud } from "../types";

// ─── State ────────────────────────────────────────────────────

interface GuardiasState {
  monthOffset: number;
  entries: Record<string, string>;
  rawEntries: GuardiaEntry[];
  myDays: GuardiaEntry[];
  currentUserName: string;
  currentUserId: string;
  _contentEl?: HTMLElement;
  _prevBtn?: HTMLElement;
  _nextBtn?: HTMLElement;
}

const _state: GuardiasState = {
  monthOffset: 0,
  entries: {},
  rawEntries: [],
  myDays: [],
  currentUserName: "",
  currentUserId: "",
};

// ─── API Helper ───────────────────────────────────────────────

function apiMessage<T = unknown>(
  type: string,
  endpoint: string,
  body?: unknown
): Promise<T | null> {
  return new Promise((resolve) => {
    const msg: Record<string, unknown> = { type, endpoint };
    if (body) msg["body"] = body;
    chrome.runtime.sendMessage(
      msg,
      (resp: { success: boolean; data?: T } | undefined) => {
        resolve(resp?.success ? (resp.data ?? null) : null);
      }
    );
  });
}

// ─── Public API ───────────────────────────────────────────────

export interface LoadGuardiasOptions {
  currentUserName?: string;
  currentUserId?: string;
}

export function loadGuardias(
  offset: number,
  options: LoadGuardiasOptions = {}
): void {
  _state.monthOffset = offset;
  _state.currentUserName = options.currentUserName ?? _state.currentUserName;
  _state.currentUserId = options.currentUserId ?? _state.currentUserId;

  const gContent = document.getElementById("sp-dba-guardias-content");
  if (!gContent) return;
  void _loadGuardiasInto(gContent, offset);
}

export function loadGuardiasInto(
  contentEl: HTMLElement,
  prevBtn: HTMLElement | null,
  nextBtn: HTMLElement | null,
  _titleEl: HTMLElement | null,
  offset: number,
  options: LoadGuardiasOptions = {}
): void {
  _state.currentUserName = options.currentUserName ?? _state.currentUserName;
  _state.currentUserId = options.currentUserId ?? _state.currentUserId;
  _state.monthOffset = offset;
  _state._contentEl = contentEl;
  _state._prevBtn = prevBtn ?? undefined;
  _state._nextBtn = nextBtn ?? undefined;

  if (prevBtn) {
    prevBtn.onclick = () => {
      _state.monthOffset--;
      void _loadGuardiasInto(contentEl, _state.monthOffset);
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      _state.monthOffset++;
      void _loadGuardiasInto(contentEl, _state.monthOffset);
    };
  }

  void _loadGuardiasInto(contentEl, _state.monthOffset);
}

// ─── Internal loader ─────────────────────────────────────────

async function _loadGuardiasInto(
  gContent: HTMLElement,
  offset: number
): Promise<void> {
  gContent.innerHTML =
    '<div style="text-align:center;color:#888;padding:20px;">Cargando...</div>';

  const today = new Date();
  const targetMonth = new Date(
    today.getFullYear(),
    today.getMonth() + offset,
    1
  );
  const year = targetMonth.getFullYear();
  const month = targetMonth.getMonth();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const lastDay = new Date(year, month + 1, 0).getDate();

  const resp = await apiMessage<{ data?: unknown[] | { data?: unknown[] } }>(
    "api-get",
    `/guardias?mes=${month + 1}&anio=${year}`
  );

  const rawGuardias = Array.isArray(resp?.data)
    ? resp!.data
    : (resp?.data as { data?: unknown[] })?.data ?? [];

  const entries: Record<string, string> = {};
  const rawEntries: GuardiaEntry[] = [];

  (rawGuardias as Array<{ Fecha?: string; UsuarioNombre?: string; FK_IdUsuario?: number; IdControlGuardia?: number }>).forEach((g) => {
    const date = g.Fecha ? g.Fecha.split("T")[0] : "";
    const name = g.UsuarioNombre ?? "";
    const userId = String(g.FK_IdUsuario ?? "");
    if (date) {
      entries[date] = name;
      rawEntries.push({
        id: g.IdControlGuardia ?? 0,
        date,
        name,
        userId,
      });
    }
  });

  _state.entries = entries;
  _state.rawEntries = rawEntries;
  _state.myDays = rawEntries.filter(
    (e) => e.userId === _state.currentUserId
  );

  const solResp = await apiMessage<{ data?: unknown[] | { data?: unknown[] } }>(
    "api-get",
    "/guardias/solicitudes?pendientes=true"
  );
  const rawPending = Array.isArray(solResp?.data)
    ? solResp!.data
    : (solResp?.data as { data?: unknown[] })?.data ?? [];

  renderCalendar(
    gContent,
    entries,
    rawEntries,
    year,
    month,
    lastDay,
    todayStr,
    rawPending as GuardiaSolicitud[]
  );
}

// ─── Render Calendar ─────────────────────────────────────────

function renderCalendar(
  gContent: HTMLElement,
  entries: Record<string, string>,
  rawEntries: GuardiaEntry[],
  year: number,
  month: number,
  lastDay: number,
  todayStr: string,
  pending: GuardiaSolicitud[]
): void {
  const currentUserName = _state.currentUserName;
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const headerParts = [
    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:2px;">',
  ];
  dias.forEach((d, i) => {
    headerParts.push(
      `<div style="text-align:center;font-size:10px;font-weight:600;color:${i >= 5 ? "#E65100" : "#888"};padding:4px;">${d}</div>`
    );
  });
  headerParts.push("</div>");

  const calParts = [
    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">',
  ];
  for (let i = 0; i < startOffset; i++) {
    calParts.push('<div style="padding:6px;min-height:50px;"></div>');
  }

  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = entries[dStr] ?? "";
    const rawEntry = rawEntries.find((e) => e.date === dStr);
    const isToday = dStr === todayStr;
    const isWeekend = dow === 0 || dow === 6;
    const isMyDay =
      entry &&
      currentUserName &&
      entry.toLowerCase().includes(currentUserName.split(" ")[0].toLowerCase());
    const isOtherDay = entry && !isMyDay;

    const pendingForDay = rawEntry
      ? pending.find(
          (p) => p.FK_IdControlGuardiaSolicitado === rawEntry.id
        )
      : null;
    const hasPendingIndicator =
      pendingForDay && rawEntry && rawEntry.userId === _state.currentUserId;

    const bgColor = isToday
      ? "#E3F2FD"
      : isMyDay
      ? "#E8F5E9"
      : isWeekend
      ? "#FFF3E0"
      : "#f9f9f9";
    const borderColor = isToday
      ? "#1976D2"
      : isMyDay
      ? "#4CAF50"
      : hasPendingIndicator
      ? "#FF8F00"
      : "#e0e0e0";
    const firstName = entry ? entry.split(" ")[0] : "";
    const clickable = isOtherDay ? "cursor:pointer;" : "";
    const dataAttrs = rawEntry
      ? `data-guardia-id="${rawEntry.id}" data-guardia-date="${dStr}" data-guardia-name="${entry}"`
      : "";
    const pendingDot = hasPendingIndicator
      ? '<div style="width:8px;height:8px;border-radius:50%;background:#FF8F00;margin-top:2px;" title="Solicitud pendiente"></div>'
      : "";

    calParts.push(
      `<div class="sp-guardia-day" ${dataAttrs} style="padding:4px 6px;min-height:50px;background:${bgColor};border:1px solid ${borderColor};border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;${clickable}">` +
      `<div style="font-size:13px;font-weight:${isToday ? "700" : "600"};color:${isToday ? "#1976D2" : isWeekend ? "#E65100" : "#333"};">${day}</div>` +
      `<div style="font-size:9px;color:#555;text-align:center;margin-top:2px;${isMyDay ? "font-weight:700;color:#2E7D32;" : ""}">${firstName}</div>` +
      pendingDot +
      "</div>"
    );
  }
  calParts.push("</div>");

  gContent.innerHTML =
    `<div style="text-align:center;font-weight:600;margin-bottom:10px;font-size:14px;">${MONTH_NAMES[month]} ${year}</div>` +
    headerParts.join("") +
    calParts.join("");

  // Rebind nav buttons
  const targetEl = _state._contentEl ?? gContent;
  const prevBtn = _state._prevBtn ?? document.getElementById("sp-dba-guardias-prev");
  const nextBtn = _state._nextBtn ?? document.getElementById("sp-dba-guardias-next");
  if (prevBtn) {
    prevBtn.onclick = () => {
      _state.monthOffset--;
      void _loadGuardiasInto(targetEl, _state.monthOffset);
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      _state.monthOffset++;
      void _loadGuardiasInto(targetEl, _state.monthOffset);
    };
  }

  // Click handlers on day cells
  gContent.querySelectorAll<HTMLElement>(".sp-guardia-day[data-guardia-id]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const guardiaId = parseInt(cell.dataset["guardiaId"] ?? "0");
      const guardiaDate = cell.dataset["guardiaDate"] ?? "";
      const guardiaName = cell.dataset["guardiaName"] ?? "";
      const rawEntry = _state.rawEntries.find((e) => e.id === guardiaId);
      if (!rawEntry) return;

      const pendingForMe = pending.find(
        (p) => p.FK_IdControlGuardiaSolicitado === guardiaId
      );
      if (rawEntry.userId === _state.currentUserId && pendingForMe) {
        showAcceptModal(pendingForMe, guardiaDate, guardiaName);
        return;
      }

      if (rawEntry.userId !== _state.currentUserId && _state.myDays.length > 0) {
        showSwapModal(guardiaId, guardiaDate, guardiaName);
      }
    });
  });
}

// ─── Swap Request Modal ───────────────────────────────────────

function showSwapModal(
  targetGuardiaId: number,
  targetDate: string,
  targetName: string
): void {
  const myDayOpts = _state.myDays
    .map((d) => `<option value="${d.id}">${d.date}</option>`)
    .join("");

  const m = infoModal({
    id: "sp-guardia-swap-modal",
    title: "🔄 Solicitar cambio de guardia",
    content:
      `<p style="font-size:13px;color:#555;margin:0 0 12px;">Solicitarás cambiar el día <b>${targetDate}</b> (${targetName}) por uno de tus días.</p>` +
      '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">¿Por cuál de tus días lo cambias?</label>' +
      `<select id="sp-guardia-my-day" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:12px;"><option value="">-- Selecciona tu día --</option>${myDayOpts}</select>` +
      '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Motivo del cambio</label>' +
      '<textarea id="sp-guardia-motivo" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;min-height:60px;resize:vertical;box-sizing:border-box;margin-bottom:12px;" placeholder="Escribe el motivo..."></textarea>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="sp-guardia-send" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Enviar solicitud</button>' +
      '<button id="sp-guardia-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>' +
      "</div>",
    maxWidth: "420px",
  });

  document.getElementById("sp-guardia-cancel")?.addEventListener("click", m.close);

  document.getElementById("sp-guardia-send")?.addEventListener("click", () => {
    const myDayId = (document.getElementById("sp-guardia-my-day") as HTMLSelectElement)?.value;
    const motivo = (document.getElementById("sp-guardia-motivo") as HTMLTextAreaElement)?.value.trim();

    if (!myDayId) { showErrorToast("Selecciona uno de tus días"); return; }
    if (!motivo) { showErrorToast("Escribe un motivo"); return; }

    const sendBtn = document.getElementById("sp-guardia-send") as HTMLButtonElement | null;
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "⏳ Enviando..."; }

    chrome.runtime.sendMessage(
      {
        type: "api-post",
        endpoint: "/guardias/solicitud",
        body: {
          motivoCambio: motivo,
          fkIdControlGuardiaSolicitado: targetGuardiaId,
          fkIdControlGuardiaOfrecido: parseInt(myDayId),
          fkIdUsuarioSolicitante: parseInt(_state.currentUserId),
          usuarioAlta: "EXTENSION",
        },
      },
      (resp: { success: boolean; error?: string } | undefined) => {
        m.close();
        if (resp?.success) {
          showSuccessToast("Solicitud de cambio enviada");
          loadGuardias(_state.monthOffset, {
            currentUserName: _state.currentUserName,
            currentUserId: _state.currentUserId,
          });
        } else {
          showErrorToast(`Error al enviar: ${resp?.error ?? "revisa consola"}`);
        }
      }
    );
  });
}

// ─── Accept Swap Modal ────────────────────────────────────────

function showAcceptModal(
  solicitud: GuardiaSolicitud,
  targetDate: string,
  _targetName: string
): void {
  const solicitanteName = (solicitud["SolicitanteNombre"] as string | undefined) ?? "Alguien";
  const ofrecidoEntry = _state.rawEntries.find(
    (e) => e.id === (solicitud["FK_IdControlGuardiaOfrecido"] as number | undefined)
  );
  const ofrecidoDate =
    ofrecidoEntry?.date ??
    ((solicitud["FechaOfrecida"] as string | undefined)?.split("T")[0] ?? "?");

  const m = infoModal({
    id: "sp-guardia-accept-modal",
    title: "📬 Solicitud de cambio",
    content:
      `<p style="font-size:13px;color:#555;margin:0 0 8px;"><b>${solicitanteName}</b> quiere cambiarte tu día <b>${targetDate}</b></p>` +
      `<p style="font-size:13px;color:#555;margin:0 0 12px;">Te ofrece su día: <b>${ofrecidoDate}</b></p>` +
      '<div style="padding:10px;background:#f5f5f5;border-radius:6px;margin-bottom:16px;">' +
      '<label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">Motivo:</label>' +
      `<p style="margin:0;font-size:13px;color:#333;">${(solicitud["MotivoCambio"] as string | undefined) ?? "Sin motivo"}</p>` +
      "</div>" +
      '<div style="display:flex;gap:8px;">' +
      '<button id="sp-guardia-accept" style="flex:1;padding:10px;border:none;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">✅ Aceptar cambio</button>' +
      '<button id="sp-guardia-reject" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Rechazar</button>' +
      "</div>",
    maxWidth: "420px",
  });

  document.getElementById("sp-guardia-reject")?.addEventListener("click", m.close);

  document.getElementById("sp-guardia-accept")?.addEventListener("click", () => {
    const acceptBtn = document.getElementById("sp-guardia-accept") as HTMLButtonElement | null;
    if (acceptBtn) { acceptBtn.disabled = true; acceptBtn.textContent = "⏳ Procesando..."; }

    const solicitudId = solicitud["IdSolicitudCambio"] as number | undefined;
    chrome.runtime.sendMessage(
      {
        type: "api-put",
        endpoint: `/guardias/solicitud/${solicitudId ?? 0}/aceptar`,
        body: { usuarioModificacion: "EXTENSION" },
      },
      (resp: { success: boolean; error?: string } | undefined) => {
        m.close();
        if (resp?.success) {
          showSuccessToast("Cambio de guardia aceptado");
          loadGuardias(_state.monthOffset, {
            currentUserName: _state.currentUserName,
            currentUserId: _state.currentUserId,
          });
        } else {
          showErrorToast(`Error al aceptar: ${resp?.error ?? "unknown"}`);
        }
      }
    );
  });
}

const SP_Guardias = { load: loadGuardias, loadInto: loadGuardiasInto };
export default SP_Guardias;
