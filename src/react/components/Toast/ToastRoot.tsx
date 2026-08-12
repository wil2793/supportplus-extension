// ============================================================
// SRC/REACT/COMPONENTS/TOAST/TOASTROOT.TSX
//
// Monta el ToastContainer en un div dedicado al final del body.
// Se llama UNA SOLA VEZ desde content.ts al inicializar la extensión.
//
// Uso desde código vanilla:
//   import { initToastRoot } from "./react/components/Toast/ToastRoot";
//   initToastRoot();
//
// A partir de ese momento showSuccessToast/showErrorToast/showLoadingToast
// del toastBridge renderizarán notificaciones React en lugar de DOM vanilla.
// ============================================================

import React from "react";
import { createRoot } from "react-dom/client";
import { ToastContainer } from "./ToastContainer";

const TOAST_ROOT_ID = "sp-toast-root";

/**
 * Inicializa el sistema de toasts React.
 * Crea un div#sp-toast-root al final del body y monta el ToastContainer.
 * Si ya fue inicializado, no hace nada (idempotente).
 */
export function initToastRoot(): void {
  if (document.getElementById(TOAST_ROOT_ID)) return;

  const container = document.createElement("div");
  container.id = TOAST_ROOT_ID;
  container.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;width:0;height:0;";
  document.body.appendChild(container);

  const root = createRoot(container, { identifierPrefix: "sp-ext-" });
  root.render(
    <React.StrictMode>
      <ToastContainer />
    </React.StrictMode>,
  );
  console.info("[SP Toast] initToastRoot OK — root montado");
}

// Re-export de ToastContainer para barrel
export { ToastContainer };
