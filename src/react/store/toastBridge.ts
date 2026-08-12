// ============================================================
// SRC/REACT/STORE/TOASTBRIDGE.TS
//
// Puente de toasts — usa las funciones DOM vanilla de components.ts
// directamente, sin depender del store React que no re-renderiza
// correctamente en el contexto de extensión de Chrome.
// ============================================================

import {
  showLoadingToast as _showLoadingToast,
  showSuccessToast as _showSuccessToast,
  showErrorToast as _showErrorToast,
} from "../../components";

/**
 * Muestra un toast de éxito verde. Se auto-descarta a los 3s.
 */
export function showSuccessToast(text: string): void {
  _showSuccessToast(text);
}

/**
 * Muestra un toast de error rojo. Se auto-descarta a los 4s.
 */
export function showErrorToast(text: string): void {
  _showErrorToast(text);
}

/**
 * Muestra un toast de carga con spinner. No se auto-descarta.
 * Devuelve el elemento para poder quitarlo manualmente.
 */
export function showLoadingToast(text: string): string {
  _showLoadingToast(text);
  return "sp-loading-toast";
}

/**
 * Descarta el toast de loading activo.
 */
export function dismissLoadingToasts(): void {
  document.getElementById("sp-loading-toast")?.remove();
}

/**
 * Muestra un toast informativo.
 */
export function showInfoToast(text: string): void {
  _showSuccessToast(text);
}

/**
 * Descarta un toast por ID (compatibilidad con el bridge anterior).
 */
export function dismissToast(_id: string): void {
  document.getElementById("sp-loading-toast")?.remove();
}
