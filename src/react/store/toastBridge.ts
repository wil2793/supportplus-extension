// ============================================================
// SRC/REACT/STORE/TOASTBRIDGE.TS
//
// Puente entre el código vanilla existente y el uiStore de React.
//
// Estas funciones tienen la misma firma que las originales de
// components.ts, por lo que pueden reemplazarlas como drop-in
// sin modificar ningún call-site en features/ o content.ts.
//
// Flujo de migración:
//   Antes: import { showSuccessToast } from "../components";
//   Después: import { showSuccessToast } from "../react/store/toastBridge";
// ============================================================

import { useUiStore } from "./uiStore";

// Acceso directo al store sin hook (válido fuera de componentes React)
const getStore = () => useUiStore.getState();

// ─── Drop-in replacements de components.ts ───────────────────

/**
 * Muestra un toast de éxito verde. Se auto-descarta a los 3s.
 * Reemplaza: showSuccessToast() de components.ts
 */
export function showSuccessToast(text: string): void {
  getStore().showSuccessToast(text);
}

/**
 * Muestra un toast de error rojo. Se auto-descarta a los 4s.
 * Reemplaza: showErrorToast() de components.ts
 */
export function showErrorToast(text: string): void {
  getStore().showErrorToast(text);
}

/**
 * Muestra un toast de carga con spinner. No se auto-descarta.
 * Devuelve el ID para poder descartarlo manualmente con dismissToast().
 * Reemplaza: showLoadingToast() de components.ts
 *
 * Diferencia con la versión vanilla: devuelve un string ID en lugar
 * del HTMLElement, ya que el DOM lo gestiona React.
 */
export function showLoadingToast(text: string): string {
  return getStore().showLoadingToast(text);
}

/**
 * Descarta un toast por su ID.
 * Útil para cerrar manualmente el loading toast tras completar
 * una operación async.
 */
export function dismissToast(id: string): void {
  getStore().dismissToast(id);
}

/**
 * Descarta todos los toasts de tipo loading activos.
 * Equivalente a eliminar el #sp-loading-toast del DOM vanilla.
 */
export function dismissLoadingToasts(): void {
  getStore().dismissLoadingToasts();
}

/**
 * Muestra un toast informativo (fondo oscuro). Se auto-descarta a los 3s.
 */
export function showInfoToast(text: string): void {
  getStore().showInfoToast(text);
}
