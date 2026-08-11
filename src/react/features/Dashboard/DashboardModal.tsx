// ============================================================
// SRC/REACT/FEATURES/DASHBOARD/DASHBOARDMODAL.TSX
//
// Modal completo de dashboard con filtros de grupo/fecha y chart.
// Reemplaza showDashboardModal() + generateDashboard() de dashboard.ts.
// Estado en dashboardStore (Zustand). Sin useState.
// ============================================================

import { useEffect, useRef } from "react";
import { InfoModal } from "../../components/Modal/variants/InfoModal";
import { ModalButton } from "../../components/Modal/ModalButton";
import { DashboardChart } from "./DashboardChart";
import {
  useDashboardStore,
  selectDateRange,
  selectGroupId,
  selectLoading,
  selectHasData,
} from "../../store/dashboardStore";
import { useUiStore } from "../../store/uiStore";
import { spGetHeaders } from "../../../lib/sp-fetch";
import type { GroupInfo } from "../../../types";

// ─── Props ────────────────────────────────────────────────────

interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userGroups: GroupInfo[];
}

// ─── Fetch helper ─────────────────────────────────────────────

async function fetchClosedTickets(
  groupId: number | string,
  from: string,
  to: string,
  onProgress: (count: number) => void,
): Promise<Array<Record<string, unknown>>> {
  const spToken = localStorage.getItem("token") ?? "";
  const allTickets: Array<Record<string, unknown>> = [];
  let page = 0;

  while (true) {
    const url =
      `https://macropayapi.supportplus.mx/tickets/search-all-tickets` +
      `?page=${page}&size=100&resolutionGroupId=${groupId}` +
      `&initDate=${encodeURIComponent(from)}&endDate=${encodeURIComponent(to)}`;

    const res = await fetch(url, { headers: spGetHeaders(spToken) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as {
      data?: { content?: unknown[]; totalPages?: number };
      content?: unknown[];
    };
    const data =
      json.data ?? (json as { content?: unknown[]; totalPages?: number });
    const tickets = (data.content ?? []) as Array<Record<string, unknown>>;

    tickets.forEach((t) => {
      if (t["ticketStatusName"] === "Cerrado") allTickets.push(t);
    });
    onProgress(allTickets.length);

    const totalPages = (data as { totalPages?: number }).totalPages ?? 1;
    if (page >= totalPages - 1) break;
    page++;
  }

  return allTickets;
}

// ─── Componente ───────────────────────────────────────────────

export function DashboardModal({
  isOpen,
  onClose,
  userGroups,
}: DashboardModalProps) {
  const dateRange = useDashboardStore(selectDateRange);
  const groupId = useDashboardStore(selectGroupId);
  const loading = useDashboardStore(selectLoading);
  const hasData = useDashboardStore(selectHasData);

  const {
    setTickets,
    setDateRange,
    setGroupId,
    setLoading,
    clearCache,
    loadGroupCache,
  } = useDashboardStore.getState();

  const {
    showErrorToast,
    showSuccessToast,
    showLoadingToast,
    dismissLoadingToasts,
  } = useUiStore.getState();

  // Refs para los inputs de fecha (evita estado local)
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLSelectElement>(null);

  // Sincronizar refs con el store cuando el modal abre
  useEffect(() => {
    if (!isOpen) return;
    if (fromRef.current) fromRef.current.value = dateRange.from;
    if (toRef.current) toRef.current.value = dateRange.to;
  }, [isOpen, dateRange.from, dateRange.to]);

  const handleGroupChange = () => {
    const newGroupId = parseInt(groupRef.current?.value ?? "0");
    if (!newGroupId) return;
    setGroupId(newGroupId);
    // Intentar cargar desde cache del grupo seleccionado
    const loaded = loadGroupCache(newGroupId);
    if (!loaded) clearCache();
  };

  const handleRegenerate = async () => {
    const from = fromRef.current?.value ?? dateRange.from;
    const to = toRef.current?.value ?? dateRange.to;
    const gId = groupRef.current
      ? parseInt(groupRef.current.value)
      : (groupId as number);

    if (!gId) {
      showErrorToast("Selecciona un grupo");
      return;
    }

    setDateRange({ from, to });
    setGroupId(gId);
    clearCache();
    setLoading(true);

    const loadingId = showLoadingToast("Generando dashboard...");

    try {
      const tickets = await fetchClosedTickets(gId, from, to, (count) => {
        useUiStore.getState().showLoadingToast(`Cargando... ${count} tickets`);
      });
      setTickets(tickets, from, to, gId);
      showSuccessToast(`Dashboard listo: ${tickets.length} tickets cerrados`);
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
    } finally {
      dismissLoadingToasts();
      void loadingId;
      setLoading(false);
    }
  };

  const multiGroup = userGroups.length > 1;

  return (
    <InfoModal
      id="sp-dashboard-modal"
      title="📊 Tickets cerrados por analista"
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="700px"
      modalOptions={{ width: "95%", maxHeight: "90vh" }}
    >
      {/* Selector de grupo (solo multi-grupo) */}
      {multiGroup && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <label style={{ fontSize: 12, whiteSpace: "nowrap" }}>Grupo:</label>
          <select
            ref={groupRef}
            defaultValue={String(groupId || userGroups[0]?.id)}
            onChange={handleGroupChange}
            style={{
              flex: 1,
              padding: "5px 8px",
              fontSize: 12,
              border: "1px solid #ddd",
              borderRadius: 4,
            }}
          >
            {userGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Filtros de fecha */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 12 }}>Desde:</label>
        <input
          ref={fromRef}
          type="datetime-local"
          defaultValue={dateRange.from}
          style={{
            padding: "5px 8px",
            fontSize: 12,
            border: "1px solid #ddd",
            borderRadius: 4,
          }}
        />
        <label style={{ fontSize: 12 }}>Hasta:</label>
        <input
          ref={toRef}
          type="datetime-local"
          defaultValue={dateRange.to}
          style={{
            padding: "5px 8px",
            fontSize: 12,
            border: "1px solid #ddd",
            borderRadius: 4,
          }}
        />
        <ModalButton
          variant="success"
          loading={loading}
          loadingText="Generando..."
          onClick={() => {
            void handleRegenerate();
          }}
          style={{ padding: "5px 14px", fontSize: 12, flex: "none" }}
        >
          Regenerar
        </ModalButton>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 200 }}>
        {hasData || loading ? (
          <DashboardChart />
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#888",
              fontSize: 13,
            }}
          >
            Presiona <strong>Regenerar</strong> para cargar los datos.
          </div>
        )}
      </div>
    </InfoModal>
  );
}
