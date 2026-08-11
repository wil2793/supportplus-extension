// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/COMPONENTS/GUARDIADAY.TSX
//
// Celda individual del calendario de guardias.
// Replica exactamente los colores y lógica visual del vanilla.
// ============================================================

import type { GuardiaEntry, GuardiaSolicitud } from "../../../../types";

// ─── Props ────────────────────────────────────────────────────

interface GuardiaDayProps {
  day: number;
  dateStr: string;
  dayOfWeek: number; // 0=Dom … 6=Sáb
  isToday: boolean;
  entry: GuardiaEntry | undefined;
  entryName: string;
  currentUserName: string;
  currentUserId: string;
  myDays: GuardiaEntry[];
  pending: GuardiaSolicitud[];
  onSwap: (guardiaId: number, date: string, name: string) => void;
  onAccept: (solicitud: GuardiaSolicitud, date: string, name: string) => void;
}

// ─── Helpers de color (misma lógica que el vanilla) ───────────

function resolveBg(
  isToday: boolean,
  isMyDay: boolean,
  isWeekend: boolean,
): string {
  if (isToday)    return "#E3F2FD";
  if (isMyDay)    return "#E8F5E9";
  if (isWeekend)  return "#FFF3E0";
  return "#f9f9f9";
}

function resolveBorder(
  isToday: boolean,
  isMyDay: boolean,
  hasPending: boolean,
): string {
  if (isToday)    return "#1976D2";
  if (isMyDay)    return "#4CAF50";
  if (hasPending) return "#FF8F00";
  return "#e0e0e0";
}

// ─── Componente ───────────────────────────────────────────────

export function GuardiaDay({
  day,
  dateStr,
  dayOfWeek,
  isToday,
  entry,
  entryName,
  currentUserName,
  currentUserId,
  myDays,
  pending,
  onSwap,
  onAccept,
}: GuardiaDayProps) {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // ¿Es mi día de guardia?
  const firstName0 = currentUserName.split(" ")[0]?.toLowerCase() ?? "";
  const isMyDay =
    !!entryName &&
    !!firstName0 &&
    entryName.toLowerCase().includes(firstName0);

  const isOtherDay = !!entryName && !isMyDay;

  // ¿Hay solicitud pendiente para este día que YO debo aceptar?
  const pendingForDay = entry
    ? pending.find((p) => p.FK_IdControlGuardiaSolicitado === entry.id)
    : undefined;
  const hasPendingIndicator =
    !!pendingForDay && entry?.userId === currentUserId;

  const bgColor     = resolveBg(isToday, isMyDay, isWeekend);
  const borderColor = resolveBorder(isToday, isMyDay, hasPendingIndicator);
  const firstName   = entryName ? entryName.split(" ")[0] : "";

  const isClickable =
    // Otro analista está de guardia y tengo días para ofrecer
    (isOtherDay && myDays.length > 0) ||
    // Es mi guardia y hay una solicitud que debo aceptar
    (isMyDay && !!pendingForDay);

  const handleClick = () => {
    if (!entry) return;

    if (isMyDay && pendingForDay) {
      onAccept(pendingForDay, dateStr, entryName);
      return;
    }
    if (isOtherDay && myDays.length > 0) {
      onSwap(entry.id, dateStr, entryName);
    }
  };

  return (
    <div
      onClick={isClickable ? handleClick : undefined}
      style={{
        padding: "4px 6px",
        minHeight: 50,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: isClickable ? "pointer" : "default",
      }}
      title={entryName || undefined}
    >
      {/* Número del día */}
      <div
        style={{
          fontSize: 13,
          fontWeight: isToday ? 700 : 600,
          color: isToday ? "#1976D2" : isWeekend ? "#E65100" : "#333",
        }}
      >
        {day}
      </div>

      {/* Nombre del analista */}
      {firstName && (
        <div
          style={{
            fontSize: 9,
            color: isMyDay ? "#2E7D32" : "#555",
            fontWeight: isMyDay ? 700 : 400,
            textAlign: "center",
            marginTop: 2,
          }}
        >
          {firstName}
        </div>
      )}

      {/* Indicador de solicitud pendiente */}
      {hasPendingIndicator && (
        <div
          title="Solicitud pendiente"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#FF8F00",
            marginTop: 2,
          }}
        />
      )}
    </div>
  );
}
