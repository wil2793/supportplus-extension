// ============================================================
// SRC/REACT/FEATURES/MANAGER/COMPONENTS/TICKETCARD.TSX
//
// Tarjeta individual de ticket para el Kanban.
// Reemplaza ticketCard() y pendingTicketCard() de templates.ts.
// Soporta drag & drop y click para abrir detalle.
// ============================================================

import { useManagerStore } from "../../../store/managerStore";
import { useTicketDrag } from "../hooks/useTicketDrag";
import type { SpTicket, PendingCloseTicket } from "../../../../types";

// ─── Mapa de colores por estado ───────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  "En espera": "#FF8F00",
  Asignado: "#1976D2",
  "En atención": "#FF9800",
  Cerrado: "#2E7D32",
  Rechazado: "#D32F2F",
  Reabierto: "#FF5722",
};

function statusColor(name: string): string {
  return STATUS_COLOR[name] ?? "#888";
}

// ─── Props ────────────────────────────────────────────────────

interface TicketCardProps {
  ticket: SpTicket;
  fromKey: string;
  /** Si la columna es arrastrable */
  draggable?: boolean;
  /** Color del borde */
  borderColor?: string;
  /** Color del código único */
  codeColor?: string;
  /** Mostrar estado + responsable */
  showStatus?: boolean;
  /** Mostrar nombre del responsable en vez del solicitante */
  showResponsible?: boolean;
}

export function TicketCard({
  ticket,
  fromKey,
  draggable = false,
  borderColor = "#eee",
  codeColor = "#1976D2",
  showStatus = false,
  showResponsible = false,
}: TicketCardProps) {
  const lastDropTime = useManagerStore((s) => s.lastDropTime);
  const draggingId = useManagerStore((s) => s.draggingTicketId);
  const { onDragStart, onDragEnd } = useTicketDrag();

  const isDragging = draggingId === String(ticket.id);

  const handleClick = (e: React.MouseEvent) => {
    // No abrir detalle si acabamos de hacer drop (1.5s de gracia)
    if (Date.now() - lastDropTime < 1500) return;
    e.stopPropagation();
    document.dispatchEvent(
      new CustomEvent("sp-open-ticket", { detail: { ticketId: ticket.id } }),
    );
  };

  const personName = showResponsible
    ? (ticket.responsibleName ?? "")
    : (ticket.requesterName ?? "");
  const firstName = personName.split(" ")[0] ?? "";
  const subject = (ticket.subject ?? "").substring(0, 25);

  return (
    <div
      className="sp-mgr-ticket"
      data-ticket-id={ticket.id}
      draggable={draggable}
      onClick={handleClick}
      onDragStart={
        draggable ? (e) => onDragStart(e, ticket.id, fromKey) : undefined
      }
      onDragEnd={draggable ? onDragEnd : undefined}
      style={{
        display: "block",
        padding: "3px 5px",
        margin: "2px 0",
        borderRadius: 4,
        background: "#fff",
        border: `1px solid ${borderColor}`,
        fontSize: 9,
        lineHeight: 1.3,
        cursor: draggable ? "grab" : "pointer",
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      {/* Código único */}
      <div style={{ fontWeight: 600, color: codeColor }}>
        {ticket.uniqueCode ?? ""}
      </div>

      {/* Asunto truncado */}
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "#555",
        }}
      >
        {subject}
      </div>

      {/* Estado + persona */}
      {showStatus ? (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              color: statusColor(ticket.ticketStatusName ?? ""),
              fontWeight: 600,
              fontSize: 8,
            }}
          >
            {ticket.ticketStatusName ?? ""}
          </span>
          <span
            style={{
              color: "#888",
              fontSize: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 60,
            }}
            title={personName}
          >
            {firstName}
          </span>
        </div>
      ) : (
        <div
          style={{
            color: "#888",
            fontSize: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={personName}
        >
          {firstName}
        </div>
      )}
    </div>
  );
}

// ─── Variante para ticket pendiente de cierre ─────────────────

interface PendingTicketCardProps {
  pt: PendingCloseTicket;
  withinHours: boolean;
}

export function PendingTicketCard({ pt, withinHours }: PendingTicketCardProps) {
  const lastDropTime = useManagerStore((s) => s.lastDropTime);

  const handleClick = (e: React.MouseEvent) => {
    if (!withinHours) return;
    if (Date.now() - lastDropTime < 1500) return;
    e.stopPropagation();
    document.dispatchEvent(
      new CustomEvent("sp-open-ticket", { detail: { ticketId: pt.ticketId } }),
    );
  };

  return (
    <div
      className="sp-mgr-ticket sp-pending-ticket"
      data-ticket-id={pt.ticketId}
      onClick={handleClick}
      style={{
        display: "block",
        padding: "3px 5px",
        margin: "2px 0",
        borderRadius: 4,
        background: "#fff",
        border: "1px solid #FF8F00",
        fontSize: 9,
        lineHeight: 1.3,
        cursor: withinHours ? "pointer" : "not-allowed",
        opacity: withinHours ? 1 : 0.6,
      }}
    >
      <div style={{ fontWeight: 600, color: "#E65100" }}>{pt.ticket}</div>
      {!withinHours && (
        <div style={{ color: "#888", fontSize: 8 }}>🔒 Fuera de horario</div>
      )}
    </div>
  );
}
