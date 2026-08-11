// ============================================================
// SRC/FEATURES/REPORTS.TS - CSV export & Monday stats
// ============================================================

import { SP_CONFIG } from "../config";
import {
  escHtml,
  createHeaderButton,
  showErrorToast,
  showLoadingToast,
  showSuccessToast,
} from "../components";
import { infoModal } from "../lib/modal-builder";
import {
  getSpToken,
  getMondayToken,
  getMondayBoardId,
  mondayQuery,
} from "../lib/api";
import { state as sessionState } from "./session";
import { openReportsModal } from "../react/features/Reports";

const REPORT_BTN_ID = "sp-report-btn";
const MONDAY_STATS_BTN_ID = "sp-monday-stats-btn";

let _generating = false;

// ─── Report Button ────────────────────────────────────────────

export function injectReportButton(): void {
  if (!sessionState.btnReports) return;
  if (document.getElementById(REPORT_BTN_ID)) return;

  const refBtn =
    document.getElementById("sp-dashboard-btn") ??
    document.getElementById("sp-search-btn");
  if (!refBtn) return;

  const btn = createHeaderButton({
    id: REPORT_BTN_ID,
    icon: "📥",
    label: "Reporte Excel",
    color: "#1565C0",
    onClick: () => openReportsModal(),
  });
  refBtn.parentElement?.insertBefore(btn, refBtn.nextSibling);
}

// ─── Report Modal ─────────────────────────────────────────────

// Función vanilla conservada como fallback. La ruta activa es openReportsModal().
export async function _handleReportClick(): Promise<void> {
  if (_generating) return;

  const stored = await new Promise<{
    usersMap?: Record<string, { groups?: number[] }>;
    userEmail?: string;
    groupNames?: Record<string, string>;
  }>((resolve) => {
    chrome.storage.local.get(["usersMap", "userEmail", "groupNames"], (r) =>
      resolve(r as typeof stored),
    );
  });

  const email = (stored.userEmail ?? "").toLowerCase();
  const users = stored.usersMap ?? {};
  const userData = users[email];
  const userGroups: number[] = userData?.groups ?? [];
  const groupNamesMap = stored.groupNames ?? {};

  if (!userGroups.length) {
    showErrorToast("No tienes grupos asignados");
    return;
  }

  const groupOptions = userGroups.map((gId) => ({
    id: gId,
    name:
      groupNamesMap[String(gId)] ??
      SP_CONFIG.GROUP_INFO.find((g) => g.id === gId)?.name ??
      `Grupo ${gId}`,
  }));

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthOpts = SP_CONFIG.MONTH_NAMES.map(
    (m, i) =>
      `<option value="${i}"${i === currentMonth ? " selected" : ""}>${m}</option>`,
  ).join("");

  const yearOpts = Array.from({ length: 4 }, (_, i) => {
    const y = currentYear - i;
    return `<option value="${y}"${y === currentYear ? " selected" : ""}>${y}</option>`;
  }).join("");

  const groupCheckboxes = groupOptions
    .map(
      (g) =>
        `<label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:12px;"><input type="checkbox" value="${g.id}" checked> ${escHtml(g.name)}</label>`,
    )
    .join("");

  const m = infoModal({
    id: "sp-report-modal",
    title: "📥 Exportar Reporte CSV",
    content:
      '<div style="margin-bottom:12px;">' +
      '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Grupos:</label>' +
      `<div id="sp-rpt-groups" style="max-height:150px;overflow-y:auto;border:1px solid #ddd;border-radius:6px;padding:8px;">${groupCheckboxes}</div>` +
      '<div style="margin-top:4px;display:flex;gap:8px;"><button id="sp-rpt-select-all" style="font-size:10px;border:none;background:none;color:#1976D2;cursor:pointer;text-decoration:underline;">Seleccionar todos</button><button id="sp-rpt-select-none" style="font-size:10px;border:none;background:none;color:#1976D2;cursor:pointer;text-decoration:underline;">Deseleccionar todos</button></div>' +
      "</div>" +
      '<div style="margin-bottom:12px;">' +
      '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Periodo:</label>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
      '<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="sp-rpt-mode" value="month" checked> Por mes</label>' +
      '<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="radio" name="sp-rpt-mode" value="range"> Por rango</label>' +
      "</div>" +
      `<div id="sp-rpt-month-section" style="display:flex;gap:8px;"><select id="sp-rpt-month" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;">${monthOpts}</select><select id="sp-rpt-year" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;">${yearOpts}</select></div>` +
      '<div id="sp-rpt-range-section" style="display:none;"><div style="display:flex;gap:8px;align-items:center;"><input id="sp-rpt-from" type="date" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;"><span style="font-size:12px;color:#888;">a</span><input id="sp-rpt-to" type="date" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;"></div><div id="sp-rpt-range-error" style="color:#D94040;font-size:11px;margin-top:4px;display:none;"></div></div>' +
      "</div>" +
      '<div style="display:flex;gap:8px;">' +
      `<button id="sp-rpt-generate" style="flex:1;padding:10px;border:none;border-radius:6px;background:#1565C0;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">📥 Generar CSV</button>` +
      '<button id="sp-rpt-cancel" style="padding:10px 16px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cancelar</button>' +
      "</div>",
    maxWidth: "480px",
  });

  const overlay = m.overlay;

  // Toggle month/range view
  overlay
    .querySelectorAll<HTMLInputElement>('[name="sp-rpt-mode"]')
    .forEach((radio) => {
      radio.addEventListener("change", () => {
        const monthSection = document.getElementById("sp-rpt-month-section");
        const rangeSection = document.getElementById("sp-rpt-range-section");
        if (monthSection)
          monthSection.style.display =
            radio.value === "month" ? "flex" : "none";
        if (rangeSection)
          rangeSection.style.display =
            radio.value === "range" ? "block" : "none";
      });
    });

  document
    .getElementById("sp-rpt-select-all")
    ?.addEventListener("click", () => {
      overlay
        .querySelectorAll<HTMLInputElement>(
          '#sp-rpt-groups input[type="checkbox"]',
        )
        .forEach((cb) => (cb.checked = true));
    });
  document
    .getElementById("sp-rpt-select-none")
    ?.addEventListener("click", () => {
      overlay
        .querySelectorAll<HTMLInputElement>(
          '#sp-rpt-groups input[type="checkbox"]',
        )
        .forEach((cb) => (cb.checked = false));
    });
  document.getElementById("sp-rpt-cancel")?.addEventListener("click", m.close);

  document.getElementById("sp-rpt-generate")?.addEventListener("click", () => {
    void generateReport(overlay, groupOptions, m.close);
  });
}

async function generateReport(
  overlay: HTMLElement,
  groupOptions: Array<{ id: number; name: string }>,
  closeModal: () => void,
): Promise<void> {
  const selectedGroups: Array<{ id: number; name: string }> = [];
  overlay
    .querySelectorAll<HTMLInputElement>(
      '#sp-rpt-groups input[type="checkbox"]:checked',
    )
    .forEach((cb) => {
      const gId = parseInt(cb.value);
      const g = groupOptions.find((x) => x.id === gId);
      selectedGroups.push({ id: gId, name: g?.name ?? `Grupo ${gId}` });
    });

  if (!selectedGroups.length) {
    showErrorToast("Selecciona al menos un grupo");
    return;
  }

  const range = { from: "", to: "" };
  const modeEl = overlay.querySelector<HTMLInputElement>(
    '[name="sp-rpt-mode"]:checked',
  );
  const mode = modeEl?.value ?? "month";

  if (mode === "month") {
    const month = parseInt(
      (document.getElementById("sp-rpt-month") as HTMLSelectElement)?.value ??
        "0",
    );
    const year = parseInt(
      (document.getElementById("sp-rpt-year") as HTMLSelectElement)?.value ??
        String(new Date().getFullYear()),
    );
    const lastDay = new Date(year, month + 1, 0).getDate();
    range.from = `${year}-${String(month + 1).padStart(2, "0")}-01T00:00`;
    range.to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59`;
  } else {
    const fromVal = (document.getElementById("sp-rpt-from") as HTMLInputElement)
      ?.value;
    const toVal = (document.getElementById("sp-rpt-to") as HTMLInputElement)
      ?.value;
    const rangeError = document.getElementById("sp-rpt-range-error");
    if (!fromVal || !toVal) {
      if (rangeError) {
        rangeError.textContent = "Selecciona ambas fechas";
        rangeError.style.display = "block";
      }
      return;
    }
    if (fromVal > toVal) {
      if (rangeError) {
        rangeError.textContent =
          "La fecha inicio no puede ser mayor a la fecha fin";
        rangeError.style.display = "block";
      }
      return;
    }
    if (rangeError) rangeError.style.display = "none";
    range.from = `${fromVal}T00:00`;
    range.to = `${toVal}T23:59`;
  }

  closeModal();
  _generating = true;

  const reportBtn = document.getElementById(
    REPORT_BTN_ID,
  ) as HTMLButtonElement | null;
  if (reportBtn) {
    reportBtn.disabled = true;
    reportBtn.style.opacity = "0.5";
  }

  showLoadingToast("Generando reporte...");

  const spToken = getSpToken();

  try {
    const allTickets: Array<Record<string, unknown>> = [];

    for (const group of selectedGroups) {
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const url =
          `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${group.id}&page=${page}&size=100` +
          `&initDate=${encodeURIComponent(range.from)}&endDate=${encodeURIComponent(range.to)}`;
        const res = await fetch(url, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${spToken}`,
          },
        });
        if (!res.ok)
          throw new Error(`HTTP ${res.status} en grupo ${group.name}`);
        const json = (await res.json()) as {
          data?: { content?: unknown[] };
          content?: unknown[];
        };
        const tickets =
          (json.data ?? (json as { content?: unknown[] })).content ?? [];
        (tickets as Record<string, unknown>[]).forEach(
          (t) => (t["_groupName"] = group.name),
        );
        allTickets.push(...(tickets as Record<string, unknown>[]));
        hasMore = tickets.length === 100;
        page++;
      }
    }

    if (!allTickets.length) {
      showErrorToast("No se encontraron tickets en el rango seleccionado.");
      return;
    }

    // Build CSV
    const headers = [
      "Folio",
      "Asunto",
      "Grupo",
      "Solicitante",
      "Responsable",
      "Estado",
      "Prioridad",
      "Tipo",
      "Canal",
      "Fecha Creacion",
      "Fecha Actualizacion",
    ];
    const csvRows = [headers.join(",")];
    allTickets.forEach((t) => {
      const safe = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const dateStr = (v: unknown) => {
        const s = String(v ?? "");
        return `"${s ? s.replace("T", " ").substring(0, 16) : ""}"`;
      };
      csvRows.push(
        [
          safe(t["uniqueCode"]),
          safe(t["subject"]),
          safe(t["_groupName"]),
          safe(t["requesterName"]),
          safe(t["responsibleName"]),
          safe(t["ticketStatusName"]),
          safe(t["incidentPriorityName"]),
          safe(t["reportTypeName"]),
          safe(t["attentionChannelName"]),
          dateStr(t["createdAt"]),
          dateStr(t["updatedAt"]),
        ].join(","),
      );
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `Reporte_SP_${range.from.substring(0, 10)}_a_${range.to.substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(downloadUrl);

    showSuccessToast(
      `📥 CSV listo: ${allTickets.length} tickets de ${selectedGroups.length} grupo(s)`,
    );
  } catch (err) {
    showErrorToast(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    _generating = false;
    if (reportBtn) {
      reportBtn.disabled = false;
      reportBtn.style.opacity = "1";
    }
  }
}

// ─── Monday Stats ─────────────────────────────────────────────

export function injectMondayStatsButton(): void {
  if (document.getElementById(MONDAY_STATS_BTN_ID)) return;

  void getMondayToken().then((token) => {
    if (!token) return;
    void getMondayBoardId(token).then((boardId) => {
      if (!boardId) return;
      if (document.getElementById(MONDAY_STATS_BTN_ID)) return;

      const refBtn =
        document.getElementById(REPORT_BTN_ID) ??
        document.getElementById("sp-dashboard-btn") ??
        document.getElementById("sp-search-btn");
      if (!refBtn) return;

      const btn = createHeaderButton({
        id: MONDAY_STATS_BTN_ID,
        icon: "📈",
        label: "Monday Stats",
        color: "#1565C0",
        onClick: () => void handleMondayStats(),
      });
      refBtn.parentElement?.insertBefore(btn, refBtn.nextSibling);
    });
  });
}

async function handleMondayStats(): Promise<void> {
  const btn = document.getElementById(
    MONDAY_STATS_BTN_ID,
  ) as HTMLButtonElement | null;
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "⏳ Cargando...";
  btn.style.background = "#999";

  try {
    const mondayToken = await getMondayToken();
    const boardId = await getMondayBoardId(mondayToken);
    if (!mondayToken || !boardId) throw new Error("Configura Monday");

    type MondayItem = {
      id: string;
      name: string;
      column_values: Array<{ id: string; text: string; value: string }>;
    };
    const allItems: MondayItem[] = [];

    const firstPage = await mondayQuery(
      mondayToken,
      "query ($boardId: [ID!]!) { boards(ids: $boardId) { name items_page(limit: 500) { cursor items { id name column_values { id text value } } } } }",
      { boardId: boardId },
    );

    const board = firstPage.boards?.[0];
    if (!board) throw new Error("Board not found");

    const boardName = board.name;
    const page = board.items_page;
    if (!page) throw new Error("No items page");

    allItems.push(...(page.items as unknown as MondayItem[]));
    let cursor = page.cursor;

    while (cursor) {
      if (btn) btn.textContent = `⏳ ${allItems.length} items...`;
      const next = await mondayQuery(
        mondayToken,
        "query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values { id text value } } } }",
        { cursor },
      );
      allItems.push(
        ...((next.next_items_page?.items as unknown as MondayItem[]) ?? []),
      );
      cursor = next.next_items_page?.cursor;
    }

    // Parse stats by person
    const statsByPerson: Record<string, number> = {};
    allItems.forEach((item) => {
      const personCol = item.column_values.find(
        (col) => col.id === "multiple_person_mm25nvfq" && col.text,
      );
      const person = personCol?.text ?? "Sin asignar";
      statsByPerson[person] = (statsByPerson[person] ?? 0) + 1;
    });

    const personSorted = Object.entries(statsByPerson).sort(
      (a, b) => b[1] - a[1],
    );
    const maxTotal = personSorted[0]?.[1] ?? 1;
    const colors = [
      "#1976D2",
      "#2E7D32",
      "#D94040",
      "#7B1FA2",
      "#E65100",
      "#00796B",
    ];

    const barsHTML = personSorted
      .map(([name, total], idx) => {
        const barWidth = Math.round((total / maxTotal) * 100);
        const color = colors[idx % colors.length];
        return (
          `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">` +
          `<div style="width:140px;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(name)}">${escHtml(name)}</div>` +
          `<div style="flex:1;background:#f0f0f0;border-radius:4px;height:30px;overflow:hidden;"><div style="width:${barWidth}%;background:${color};height:100%;border-radius:4px;"></div></div>` +
          `<div style="width:35px;font-size:13px;font-weight:700;text-align:center;">${total}</div></div>`
        );
      })
      .join("");

    infoModal({
      id: "sp-monday-stats-modal",
      title: `📈 ${escHtml(boardName)} (${allItems.length} tickets)`,
      content:
        '<h4 style="margin:0 0 12px;font-size:14px;color:#555;">Tickets por persona</h4>' +
        `<div style="flex:1;overflow:auto;">${barsHTML}</div>`,
      maxWidth: "700px",
      modalOptions: { width: "95%", maxHeight: "90vh" },
    });
  } catch (err) {
    showErrorToast(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (btn) {
    btn.textContent = "📈 Monday Stats";
    btn.style.background = "#1565C0";
    btn.disabled = false;
  }
}

const SP_Reports = { injectReportButton, injectMondayStatsButton };
export default SP_Reports;
