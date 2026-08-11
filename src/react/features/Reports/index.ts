// ============================================================
// SRC/REACT/FEATURES/REPORTS/INDEX.TS
//
// Barrel export + función de integración con código vanilla.
//
// Uso desde reports.ts:
//
//   import { openReportsModal } from "./react/features/Reports";
//
//   // En injectReportButton() onClick:
//   openReportsModal();
// ============================================================

import React from "react";
import { createRoot } from "react-dom/client";
import { ExtensionProvider } from "../../providers/ExtensionProvider";
import { ReportsModal } from "./ReportsModal";

export { ReportsModal } from "./ReportsModal";

// ─── Constantes ───────────────────────────────────────────────

const CONTAINER_ID = "sp-reports-react-root";

// ─── Root persistente ─────────────────────────────────────────

let _root: ReturnType<typeof createRoot> | null = null;

function renderModal(isOpen: boolean): void {
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
      React.createElement(ReportsModal, {
        isOpen,
        onClose: () => renderModal(false),
      }),
    ),
  );
}

/**
 * Abre el modal de exportación CSV.
 * Reemplaza handleReportClick() de reports.ts.
 */
export function openReportsModal(): void {
  renderModal(true);
}
