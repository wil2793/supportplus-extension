// ============================================================
// SRC/REACT/FEATURES/MANAGER/INDEX.TS
// ============================================================

import React from "react";
import { mountReact, unmountReact } from "../../mount";
import { ExtensionProvider } from "../../providers/ExtensionProvider";
import { ManagerPanel } from "./ManagerPanel";
import { useManagerStore } from "../../store/managerStore";
import type { GroupInfo } from "../../../types";

export { ManagerPanel } from "./ManagerPanel";
export {
  useLoadGroupSection,
  useManagerSummary,
  useManagerRefresh,
} from "./hooks/useManagerTickets";
export { useTicketDrag } from "./hooks/useTicketDrag";

const MANAGER_CONTAINER_ID = "sp-manager-react-root";

export interface MountManagerOptions {
  groups: GroupInfo[];
  spToken: string;
  canDrag: boolean;
  blacklist?: number[];
  canAddUserToGroup?: boolean;
}

export function mountManagerPanel(
  referenceEl: Element,
  options: MountManagerOptions,
): void {
  // 1. Inicializar el store ANTES de montar React.
  //    Hacerlo dentro del componente durante el render provoca el error #185
  //    (setState durante render → loop infinito).
  useManagerStore
    .getState()
    .init(
      options.groups,
      options.spToken,
      options.canDrag,
      options.blacklist ?? [],
    );

  // 2. Crear contenedor hijo directo de body.
  //    NUNCA dentro del árbol de SupportPlus (causaría error #418).
  let container = document.getElementById(MANAGER_CONTAINER_ID);

  if (container && !document.body.contains(container)) {
    unmountReact(MANAGER_CONTAINER_ID);
    container.remove();
    container = null;
  }

  if (!container) {
    container = document.createElement("div");
    container.id = MANAGER_CONTAINER_ID;
    document.body.appendChild(container);
  }

  // 3. Posicionar encima del grid con CSS absoluto
  const gridRect = referenceEl.getBoundingClientRect();
  const scrollY = window.scrollY;
  container.style.cssText = [
    "position:absolute",
    `top:${gridRect.top + scrollY}px`,
    `left:${gridRect.left}px`,
    `width:${gridRect.width}px`,
    "z-index:100",
    "background:#fff",
    "transform:translateY(-100%)",
    "padding-bottom:8px",
  ].join(";");

  // 4. Montar React — el store ya está inicializado, ManagerPanel solo lee
  mountReact(
    MANAGER_CONTAINER_ID,
    React.createElement(
      ExtensionProvider,
      null,
      React.createElement(ManagerPanel, {
        canAddUserToGroup: options.canAddUserToGroup ?? false,
      }),
    ),
  );
}
