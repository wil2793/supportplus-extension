// ============================================================
// SRC/REACT/MOUNT.TS - Utilidad para montar/desmontar React roots
//
// Cada contenedor DOM identificado por su ID tiene exactamente
// un Root de React. Si ya existe se reutiliza (re-render).
// ============================================================

import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ReactElement } from "react";

// Prefijo único para aislar nuestros roots de React de la app host (SupportPlus)
// que también usa React 18. Sin esto, los schedulers de ambas instancias
// se interfieren (error #418 / #423).
const SP_IDENTIFIER_PREFIX = "sp-ext-";

// Registro interno de roots activos por ID de contenedor
const _roots = new Map<string, Root>();

// ─── mountReact ───────────────────────────────────────────────
/**
 * Monta (o re-renderiza) un componente React en un contenedor DOM.
 *
 * Si el contenedor ya tiene un Root asociado, simplemente vuelve a
 * renderizar el elemento recibido. Si no existe, crea el Root primero.
 *
 * @param containerId  ID del elemento DOM donde montar
 * @param element      ReactElement a renderizar
 * @returns            El Root creado/reutilizado, o null si el contenedor no existe
 */
export function mountReact(
  containerId: string,
  element: ReactElement,
): Root | null {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(
      `[SP React] mountReact: #${containerId} NO encontrado en el DOM. ¿El contenedor fue insertado?`,
    );
    return null;
  }

  // Verificar que el contenedor esté realmente conectado al documento
  if (!document.body.contains(container)) {
    console.error(
      `[SP React] mountReact: #${containerId} existe pero NO está conectado al DOM. Se limpia el root.`,
    );
    _roots.delete(containerId);
    return null;
  }

  const existing = _roots.get(containerId);
  if (existing) {
    existing.render(element);
    return existing;
  }

  const root = createRoot(container, {
    identifierPrefix: SP_IDENTIFIER_PREFIX,
  });
  root.render(element);
  _roots.set(containerId, root);
  console.info(`[SP React] mountReact: #${containerId} montado correctamente.`);
  return root;
}

// ─── unmountReact ─────────────────────────────────────────────
/**
 * Desmonta el árbol React de un contenedor y libera el Root.
 * Llamar cuando el contenedor sea eliminado del DOM para evitar
 * memory leaks (ej. al cerrar un modal o panel).
 *
 * @param containerId  ID del elemento DOM a desmontar
 */
export function unmountReact(containerId: string): void {
  const root = _roots.get(containerId);
  if (!root) return;
  root.unmount();
  _roots.delete(containerId);
}

// ─── getRoot ──────────────────────────────────────────────────
/**
 * Devuelve el Root activo para un contenedor, si existe.
 * Útil para verificar si un panel ya fue montado.
 */
export function getRoot(containerId: string): Root | undefined {
  return _roots.get(containerId);
}

// ─── unmountAll ───────────────────────────────────────────────
/**
 * Desmonta todos los roots activos. Llamar al descargar la extensión
 * o en navegación SPA que destruya el DOM completo.
 */
export function unmountAll(): void {
  _roots.forEach((root) => root.unmount());
  _roots.clear();
}
