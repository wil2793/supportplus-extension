// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/INDEX.TS
//
// Barrel export + función de integración con el código vanilla.
//
// Para activar el panel React desde guardias.ts (vanilla):
//
//   import { mountGuardiasPanel } from "./react/features/Guardias";
//
//   // Dentro de loadGuardiasInto():
//   mountGuardiasPanel("sp-dba-guardias-content", {
//     name: _state.currentUserName,
//     userId: _state.currentUserId,
//   }, offset);
// ============================================================

import React from "react";
import { mountReact } from "../../mount";
import { ExtensionProvider } from "../../providers/ExtensionProvider";
import { GuardiasPanel } from "./GuardiasPanel";
import type { GuardiaCurrentUser } from "../../store/guardiasStore";

export { GuardiasPanel } from "./GuardiasPanel";
export { useGuardias, sendSwapRequest, acceptSwapRequest } from "./hooks/useGuardias";
export type { GuardiaCurrentUser } from "../../store/guardiasStore";

// ─── Función de montaje para integración vanilla ──────────────

/**
 * Monta el GuardiasPanel React en el contenedor especificado.
 * Llamar desde guardias.ts vanilla como reemplazo de
 * _loadGuardiasInto() + renderCalendar().
 *
 * @param containerId  ID del div donde montar (ej. "sp-dba-guardias-content")
 * @param currentUser  Nombre e ID del usuario de sesión actual
 * @param initialOffset  Offset de mes inicial (0 = mes actual)
 */
export function mountGuardiasPanel(
  containerId: string,
  currentUser: GuardiaCurrentUser,
  initialOffset = 0,
): void {
  mountReact(
    containerId,
    React.createElement(
      ExtensionProvider,
      null,
      React.createElement(GuardiasPanel, { currentUser, initialOffset }),
    ),
  );
}
