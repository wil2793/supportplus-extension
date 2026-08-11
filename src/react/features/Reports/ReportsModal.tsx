// ============================================================
// SRC/REACT/FEATURES/REPORTS/REPORTSMODAL.TSX
//
// Modal de exportación CSV. Reemplaza handleReportClick() y
// generateReport() de reports.ts. Estado en reportsStore.
// Sin useState — todo en Zustand.
// ============================================================

import { useEffect } from "react";
import { InfoModal } from "../../components/Modal/variants/InfoModal";
import { ModalButton } from "../../components/Modal/ModalButton";
import {
  useReportsStore,
  loadReportGroupsFromStorage,
  selectAvailableGroups,
  selectSelectedGroupIds,
  selectMode,
  selectMonthRange,
  selectCustomRange,
  selectReportsLoading,
  selectRangeError,
} from "../../store/reportsStore";
import { useUiStore } from "../../store/uiStore";
import { SP_CONFIG } from "../../../config";

// ─── Props ────────────────────────────────────────────────────

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Fetch helper ─────────────────────────────────────────────

async function fetchTicketsForExport(
  groupId: number,
  from: string,
  to: string,
  spToken: string,
  onProgress: (n: number) => void,
): Promise<Array<Record<string, unknown>>> {
  const tickets: Array<Record<string, unknown>> = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const url =
      `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${groupId}&page=${page}&size=100` +
      `&initDate=${encodeURIComponent(from)}&endDate=${encodeURIComponent(to)}`;

    const res = await fetch(url, {
      headers: { accept: "application/json", authorization: `Bearer ${spToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en grupo ${groupId}`);

    const json = (await res.json()) as {
      data?: { content?: unknown[] };
      content?: unknown[];
    };
    const content = (json.data ?? (json as { content?: unknown[] })).content ?? [];
    tickets.push(...(content as Array<Record<string, unknown>>));
    onProgress(tickets.length);
    hasMore = content.length === 100;
    page++;
  }
  return tickets;
}

// ─── CSV builder ──────────────────────────────────────────────

function buildCsv(
  allTickets: Array<Record<string, unknown>>,
  groupName: string,
): string {
  const safe = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const dateStr = (v: unknown) => {
    const s = String(v ?? "");
    return `"${s ? s.replace("T", " ").substring(0, 16) : ""}"`;
  };
  const headers = [
    "Folio", "Asunto", "Grupo", "Solicitante", "Responsable",
    "Estado", "Prioridad", "Tipo", "Canal",
    "Fecha Creacion", "Fecha Actualizacion",
  ];
  const rows = allTickets.map((t) =>
    [
      safe(t["uniqueCode"]),
      safe(t["subject"]),
      safe(t["_groupName"] ?? groupName),
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
  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}

// ─── Componente ───────────────────────────────────────────────

export function ReportsModal({ isOpen, onClose }: ReportsModalProps) {
  const availableGroups  = useReportsStore(selectAvailableGroups);
  const selectedGroupIds = useReportsStore(selectSelectedGroupIds);
  const mode             = useReportsStore(selectMode);
  const monthRange       = useReportsStore(selectMonthRange);
  const customRange      = useReportsStore(selectCustomRange);
  const loading          = useReportsStore(selectReportsLoading);
  const rangeError       = useReportsStore(selectRangeError);

  const {
    toggleGroup,
    selectAllGroups,
    deselectAllGroups,
    setMode,
    setMonthRange,
    setCustomRange,
    setLoading,
    resolveApiRange,
    setRangeError,
  } = useReportsStore.getState();

  const { showErrorToast, showSuccessToast, showLoadingToast, dismissLoadingToasts } =
    useUiStore.getState();

  // Cargar grupos al montar
  useEffect(() => {
    if (isOpen && availableGroups.length === 0) {
      loadReportGroupsFromStorage();
    }
  }, [isOpen, availableGroups.length]);

  const handleGenerate = async () => {
    if (!selectedGroupIds.length) {
      showErrorToast("Selecciona al menos un grupo");
      return;
    }

    const range = resolveApiRange();
    if (!range) return; // error ya seteado en el store

    setRangeError("");
    setLoading(true);
    onClose();
    showLoadingToast("Generando reporte...");

    const spToken = localStorage.getItem("token") ?? "";
    const allTickets: Array<Record<string, unknown>> = [];

    try {
      for (const gIdStr of selectedGroupIds) {
        const gId = parseInt(gIdStr);
        const group = availableGroups.find((g) => g.id === gId);
        const groupName = group?.name ?? `Grupo ${gId}`;
        const tickets = await fetchTicketsForExport(
          gId, range.from, range.to, spToken,
          (n) => useUiStore.getState().showLoadingToast(`Cargando ${groupName}... ${n}`),
        );
        tickets.forEach((t) => { t["_groupName"] = groupName; });
        allTickets.push(...tickets);
      }

      if (!allTickets.length) {
        showErrorToast("No se encontraron tickets en el rango seleccionado.");
        return;
      }

      const csv = buildCsv(allTickets, "");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_SP_${range.from.substring(0, 10)}_a_${range.to.substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showSuccessToast(
        `📥 CSV listo: ${allTickets.length} tickets de ${selectedGroupIds.length} grupo(s)`,
      );
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
    } finally {
      dismissLoadingToasts();
      setLoading(false);
    }
  };

  const monthNames = SP_CONFIG.MONTH_NAMES;
  const currentYear = new Date().getFullYear();

  return (
    <InfoModal
      id="sp-report-modal"
      title="📥 Exportar Reporte CSV"
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="480px"
    >
      {/* ── Grupos ── */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Grupos:
        </label>

        <div
          style={{
            maxHeight: 150,
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 8,
          }}
        >
          {availableGroups.map((g) => (
            <label
              key={g.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 0",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={selectedGroupIds.includes(String(g.id))}
                onChange={() => toggleGroup(String(g.id))}
              />
              {g.name}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={selectAllGroups}
            style={{ fontSize: 10, border: "none", background: "none", color: "#1976D2", cursor: "pointer", textDecoration: "underline" }}
          >
            Seleccionar todos
          </button>
          <button
            type="button"
            onClick={deselectAllGroups}
            style={{ fontSize: 10, border: "none", background: "none", color: "#1976D2", cursor: "pointer", textDecoration: "underline" }}
          >
            Deseleccionar todos
          </button>
        </div>
      </div>

      {/* ── Modo de fecha ── */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Periodo:
        </label>

        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          {(["month", "range"] as const).map((m) => (
            <label
              key={m}
              style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <input
                type="radio"
                name="sp-rpt-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m === "month" ? "Por mes" : "Por rango"}
            </label>
          ))}
        </div>

        {/* Mes */}
        {mode === "month" && (
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={monthRange.month}
              onChange={(e) => setMonthRange({ ...monthRange, month: parseInt(e.target.value) })}
              style={{ flex: 1, padding: "6px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}
            >
              {monthNames.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
            <select
              value={monthRange.year}
              onChange={(e) => setMonthRange({ ...monthRange, year: parseInt(e.target.value) })}
              style={{ width: 80, padding: "6px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}
            >
              {Array.from({ length: 4 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        {/* Rango */}
        {mode === "range" && (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={customRange.from}
                onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                style={{ flex: 1, padding: "6px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}
              />
              <span style={{ fontSize: 12, color: "#888" }}>a</span>
              <input
                type="date"
                value={customRange.to}
                onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                style={{ flex: 1, padding: "6px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}
              />
            </div>
            {rangeError && (
              <div style={{ color: "#D94040", fontSize: 11, marginTop: 4 }}>{rangeError}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Botones ── */}
      <div style={{ display: "flex", gap: 8 }}>
        <ModalButton
          variant="primary"
          loading={loading}
          loadingText="Generando..."
          onClick={() => { void handleGenerate(); }}
        >
          📥 Generar CSV
        </ModalButton>
        <ModalButton variant="secondary" onClick={onClose} style={{ flex: "none", padding: "10px 16px" }}>
          Cancelar
        </ModalButton>
      </div>
    </InfoModal>
  );
}
