// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/COMPONENTS/GUARDIACALENDAR.TSX
//
// Grid de 7 columnas con header de días y celdas del mes.
// Lee datos del guardiasStore. Sin props de datos — todo
// viene del store para evitar prop drilling.
// ============================================================

import { useGuardiasStore } from "../../../store/guardiasStore";
import { GuardiaDay } from "./GuardiaDay";
import type { GuardiaSolicitud } from "../../../../types";

// ─── Constantes ───────────────────────────────────────────────

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

// ─── Props ────────────────────────────────────────────────────

interface GuardiaCalendarProps {
  year: number;
  month: number; // 0-indexed
}

// ─── Componente ───────────────────────────────────────────────

export function GuardiaCalendar({ year, month }: GuardiaCalendarProps) {
  const entries     = useGuardiasStore((s) => s.entries);
  const rawEntries  = useGuardiasStore((s) => s.rawEntries);
  const myDays      = useGuardiasStore((s) => s.myDays);
  const pending     = useGuardiasStore((s) => s.pending);
  const currentUser = useGuardiasStore((s) => s.currentUser);
  const openSwap    = useGuardiasStore((s) => s.openSwapModal);
  const openAccept  = useGuardiasStore((s) => s.openAcceptModal);

  const today    = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const lastDay  = new Date(year, month + 1, 0).getDate();

  // Desplazamiento inicial: lunes=0, domingo=6
  const firstDow   = new Date(year, month, 1).getDay();
  const startPad   = firstDow === 0 ? 6 : firstDow - 1;

  const handleSwap = (guardiaId: number, date: string, name: string) => {
    openSwap({ guardiaId, date, name });
  };

  const handleAccept = (
    solicitud: GuardiaSolicitud,
    date: string,
    name: string,
  ) => {
    const rawEntry = rawEntries.find(
      (e) => e.id === solicitud.FK_IdControlGuardiaSolicitado,
    );
    openAccept({
      guardiaId: rawEntry?.id ?? 0,
      date,
      name,
      pendingSolicitud: solicitud,
    });
  };

  return (
    <div>
      {/* Header días de la semana */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 1,
          marginBottom: 2,
        }}
      >
        {DIAS.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 10,
              fontWeight: 600,
              color: i >= 5 ? "#E65100" : "#888",
              padding: 4,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid de celdas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 2,
        }}
      >
        {/* Celdas vacías de relleno inicial */}
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} style={{ minHeight: 50 }} />
        ))}

        {/* Días del mes */}
        {Array.from({ length: lastDay }).map((_, idx) => {
          const day    = idx + 1;
          const dStr   = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow    = new Date(year, month, day).getDay();
          const name   = entries[dStr] ?? "";
          const entry  = rawEntries.find((e) => e.date === dStr);

          return (
            <GuardiaDay
              key={dStr}
              day={day}
              dateStr={dStr}
              dayOfWeek={dow}
              isToday={dStr === todayStr}
              entry={entry}
              entryName={name}
              currentUserName={currentUser.name}
              currentUserId={currentUser.userId}
              myDays={myDays}
              pending={pending}
              onSwap={handleSwap}
              onAccept={handleAccept}
            />
          );
        })}
      </div>
    </div>
  );
}
