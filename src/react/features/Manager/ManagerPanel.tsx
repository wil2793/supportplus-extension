// ============================================================
// SRC/REACT/FEATURES/MANAGER/MANAGERPANEL.TSX
//
// Componente raíz del Kanban.
// El store ya fue inicializado por mountManagerPanel() antes
// de que React se monte — este componente SOLO LEE del store.
// ============================================================

import { useEffect } from "react";
import { useManagerStore } from "../../store/managerStore";
import {
  useManagerSummary,
  useManagerRefresh,
} from "./hooks/useManagerTickets";
import { GroupSection } from "./components/GroupSection";

export interface ManagerPanelProps {
  canAddUserToGroup?: boolean;
}

export function ManagerPanel({ canAddUserToGroup = false }: ManagerPanelProps) {
  // Leer solo valores primitivos estables del store
  const groupCount = useManagerStore((s) => s.groups.length);
  const singleGroup = groupCount === 1;

  // Snapshot de grupos para renderizar — usando IDs como keys estables
  const groups = useManagerStore((s) => s.groups);
  const counts = useManagerStore((s) => s.summaryCounts);

  // Hooks de auto-refresh (intervalos de 60s) — sin dependencias reactivas
  useManagerSummary();
  useManagerRefresh();

  // Expandir la primera sección automáticamente si es single-group
  useEffect(() => {
    if (singleGroup && groups[0]) {
      useManagerStore.getState().expandSection(groups[0].id);
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div id="sp-manager-panel" className="sp-mgr-panel">
      {canAddUserToGroup && (
        <button
          type="button"
          style={{
            marginBottom: 10,
            padding: "6px 14px",
            border: "1px solid #1976D2",
            borderRadius: 6,
            background: "transparent",
            color: "#1976D2",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
          onClick={() =>
            document.dispatchEvent(new CustomEvent("sp-open-add-user-group"))
          }
        >
          👥 Agregar usuario a grupo
        </button>
      )}

      {/* Summary row — solo multi-grupo */}
      {!singleGroup && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          {groups.map((g) => (
            <div
              key={g.id}
              style={{
                border: "1px solid #1976D2",
                borderRadius: 6,
                padding: "4px 10px",
                minWidth: 80,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#555",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 120,
                }}
              >
                {g.name}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1976D2",
                }}
              >
                {counts[g.id] ?? "…"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Secciones de grupo */}
      {groups.map((g) => (
        <GroupSection key={g.id} groupId={g.id} singleGroup={singleGroup} />
      ))}
    </div>
  );
}
