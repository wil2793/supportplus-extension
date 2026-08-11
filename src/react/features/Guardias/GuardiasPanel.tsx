// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/GUARDIASPANEL.TSX
//
// Componente raíz del panel de guardias.
// Orquesta: navegación de mes, calendario y modales.
// Todo el estado vive en guardiasStore.
// ============================================================

import { useEffect } from "react";
import { MONTH_NAMES } from "../../../config";
import { useGuardiasStore } from "../../store/guardiasStore";
import { useGuardias } from "./hooks/useGuardias";
import { GuardiaCalendar } from "./components/GuardiaCalendar";
import { SwapModal } from "./components/SwapModal";
import { AcceptModal } from "./components/AcceptModal";
import type { GuardiaCurrentUser } from "../../store/guardiasStore";

// ─── Props ────────────────────────────────────────────────────

export interface GuardiasPanelProps {
  currentUser: GuardiaCurrentUser;
  /** Offset inicial de mes (0 = mes actual) */
  initialOffset?: number;
}

// ─── Componente ───────────────────────────────────────────────

export function GuardiasPanel({
  currentUser,
  initialOffset = 0,
}: GuardiasPanelProps) {
  const setCurrentUser = useGuardiasStore((s) => s.setCurrentUser);
  const setMonthOffset = useGuardiasStore((s) => s.setMonthOffset);
  const loading        = useGuardiasStore((s) => s.loading);

  // Hidrata el usuario y el offset inicial una sola vez
  useEffect(() => {
    setCurrentUser(currentUser);
    setMonthOffset(initialOffset);
  // Solo al montar — currentUser viene del vanilla y no cambia en runtime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hook que hace el fetch y expone navegación + datos derivados
  const { year, month, prevMonth, nextMonth } = useGuardias();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* ── Barra de navegación de mes ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <button
          onClick={prevMonth}
          disabled={loading}
          type="button"
          style={{
            background: "none",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 16,
          }}
          aria-label="Mes anterior"
        >
          ◀
        </button>

        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {loading
            ? "Cargando..."
            : `${MONTH_NAMES[month]} ${year}`}
        </span>

        <button
          onClick={nextMonth}
          disabled={loading}
          type="button"
          style={{
            background: "none",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 16,
          }}
          aria-label="Mes siguiente"
        >
          ▶
        </button>
      </div>

      {/* ── Calendario ── */}
      {loading ? (
        <div
          style={{ textAlign: "center", color: "#888", padding: 20, fontSize: 13 }}
        >
          <span className="sp-spinner" style={{ marginRight: 8 }} />
          Cargando guardias...
        </div>
      ) : (
        <GuardiaCalendar year={year} month={month} />
      )}

      {/* ── Modales (siempre montados, se muestran según activeModal) ── */}
      <SwapModal />
      <AcceptModal />
    </div>
  );
}
