// ============================================================
// SRC/REACT/FEATURES/MANAGER/COMPONENTS/KANBANCOLUMN.TSX
//
// Columna individual del Kanban.
// Recibe la lista de tickets del managerStore y delega
// el drag & drop a useTicketDrag.
// ============================================================

import { useManagerStore, columnKey } from "../../../store/managerStore";
import { useTicketDrag } from "../hooks/useTicketDrag";
import { TicketCard, PendingTicketCard } from "./TicketCard";
import { isWithinWorkHours } from "../../../../features/session";
import type { SpTicket, PendingCloseTicket } from "../../../../types";

// ─── Tipos ────────────────────────────────────────────────────

export type KanbanColumnType =
  | "unassigned"
  | "member"
  | "closed"
  | "pending";

interface KanbanColumnProps {
  groupId: number;
  columnId: number | "unassigned" | "closed" | "pending";
  type: KanbanColumnType;
  /** Nombre que aparece en el header */
  title: string;
  /** Color de fondo del header */
  headerColor: string;
  /** Color del borde de la columna */
  borderColor?: string;
  /** Tickets a mostrar (para closed y pending se pasan directamente) */
  tickets?: SpTicket[];
  pendingTickets?: PendingCloseTicket[];
  /** Mostrar estado en las tarjetas */
  showStatus?: boolean;
  /** Mostrar responsable en vez de solicitante */
  showResponsible?: boolean;
  /** Color del código de ticket */
  codeColor?: string;
}

// ─── Componente ───────────────────────────────────────────────

export function KanbanColumn({
  groupId,
  columnId,
  type,
  title,
  headerColor,
  borderColor,
  tickets: ticketsProp,
  pendingTickets,
  showStatus = false,
  showResponsible = false,
  codeColor,
}: KanbanColumnProps) {
  const key        = columnKey(groupId, columnId);
  const canDrag    = useManagerStore((s) => s.canDrag);
  const dragOver   = useManagerStore((s) => s.dragOverColumnKey);
  const section    = useManagerStore((s) => s.sections[groupId]);
  const colData    = section?.columns[key];

  const { onDragOver, onDragLeave, onDrop } = useTicketDrag();

  // Usar tickets del store si no se pasaron por prop
  const tickets = ticketsProp ?? colData?.tickets ?? [];
  const isLoading = colData?.loading ?? false;
  const isDragOver = dragOver === key;

  // Columnas que aceptan drop (no closed, no pending, no unassigned)
  const acceptsDrop = type === "member" && canDrag;

  const resolvedBorderColor = borderColor ?? (
    type === "unassigned" ? "#FF8F00" :
    type === "closed"     ? "#2E7D32" :
    type === "pending"    ? "#FF8F00" : "#ddd"
  );

  const withinHours = isWithinWorkHours();

  return (
    <div
      className="sp-mgr-column"
      style={{
        minWidth: 160,
        maxWidth: 200,
        border: `1px solid ${resolvedBorderColor}`,
        borderRadius: 6,
        overflow: "hidden",
        flexShrink: 0,
        display: type === "pending" && !pendingTickets?.length ? "none" : undefined,
      }}
    >
      {/* Header */}
      <div
        className="sp-col-header"
        style={{
          background: headerColor,
          color: "#fff",
          padding: "4px 8px",
          fontSize: 10,
          fontWeight: 700,
          textAlign: "center",
        }}
      >
        {title}{" "}
        <span className="sp-mgr-pcount">
          ({isLoading ? "…" : (pendingTickets ?? tickets).length})
        </span>
      </div>

      {/* Zona de tickets / drop */}
      <div
        className="sp-mgr-ptickets"
        data-profile-id={String(columnId)}
        data-group-id={String(groupId)}
        onDragOver={acceptsDrop ? (e) => onDragOver(e, key) : undefined}
        onDragLeave={acceptsDrop ? (e) => onDragLeave(e, key) : undefined}
        onDrop={
          acceptsDrop
            ? (e) => onDrop(e, columnId as number, groupId)
            : undefined
        }
        style={{
          padding: 3,
          maxHeight: 180,
          overflowY: "auto",
          background: isDragOver ? "#E3F2FD" : "#fafafa",
          outline: isDragOver ? "2px dashed #1976D2" : undefined,
          minHeight: 25,
          transition: "background 0.15s ease",
        }}
      >
        {isLoading ? (
          <div
            style={{
              textAlign: "center",
              padding: 6,
              color: "#aaa",
              fontSize: 10,
            }}
          >
            <span className="sp-spinner" />
          </div>
        ) : type === "pending" && pendingTickets ? (
          pendingTickets.length ? (
            pendingTickets.map((pt) => (
              <PendingTicketCard key={pt.ticketId} pt={pt} withinHours={withinHours} />
            ))
          ) : (
            <EmptyState />
          )
        ) : tickets.length ? (
          tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              fromKey={key}
              draggable={canDrag && type === "member"}
              borderColor={type === "unassigned" ? "#FF8F00" : undefined}
              codeColor={
                codeColor ??
                (type === "unassigned" ? "#E65100" :
                 type === "closed"     ? "#2E7D32" : undefined)
              }
              showStatus={showStatus}
              showResponsible={showResponsible}
            />
          ))
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 6,
        color: "#aaa",
        fontSize: 10,
      }}
    >
      Sin tickets
    </div>
  );
}
