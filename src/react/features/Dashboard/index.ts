// ============================================================
// SRC/REACT/FEATURES/DASHBOARD/INDEX.TS
//
// Barrel export + función de integración con código vanilla.
//
// Uso desde dashboard.ts:
//
//   import { openDashboardModal } from "./react/features/Dashboard";
//
//   // En handleDashboardClick(), en lugar de showDashboardModal():
//   openDashboardModal(currentUserGroups);
// ============================================================

import React from "react";
import { createRoot } from "react-dom/client";
import { ExtensionProvider } from "../../providers/ExtensionProvider";
import { DashboardModal } from "./DashboardModal";
import { useDashboardStore } from "../../store/dashboardStore";
import type { GroupInfo } from "../../../types";

export { DashboardModal } from "./DashboardModal";
export { DashboardChart } from "./DashboardChart";

// ─── Constantes ───────────────────────────────────────────────

const CONTAINER_ID = "sp-dashboard-react-root";

// ─── Abrir/cerrar modal ───────────────────────────────────────

let _root: ReturnType<typeof createRoot> | null = null;

function renderModal(groups: GroupInfo[], isOpen: boolean): void {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
  }

  if (!_root) _root = createRoot(container, { identifierPrefix: "sp-ext-" });

  _root.render(
    React.createElement(
      ExtensionProvider,
      null,
      React.createElement(DashboardModal, {
        isOpen,
        onClose: () => renderModal(groups, false),
        userGroups: groups,
      }),
    ),
  );
}

/**
 * Abre el modal de Dashboard React.
 * Reemplaza showDashboardModal() + handleDashboardClick() de dashboard.ts.
 *
 * @param userGroupIds  IDs de grupos del usuario
 * @param groupInfoList Catálogo de grupos (de SP_CONFIG.GROUP_INFO)
 */
export function openDashboardModal(
  userGroupIds: number[],
  groupInfoList: GroupInfo[],
): void {
  const groups = userGroupIds.map(
    (id) =>
      groupInfoList.find((g) => g.id === id) ?? { id, name: `Grupo ${id}` },
  );

  // Si no hay datos cargados y es un solo grupo, iniciamos el fetch
  const store = useDashboardStore.getState();
  if (!store.hasData && groups.length === 1 && groups[0]) {
    store.setGroupId(groups[0].id);
  }

  renderModal(groups, true);
}
