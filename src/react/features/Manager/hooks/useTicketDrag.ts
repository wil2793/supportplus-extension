// ============================================================
// SRC/REACT/FEATURES/MANAGER/HOOKS/USETICKETDRAG.TS
//
// Hook para drag & drop HTML5 de tickets entre columnas Kanban.
// Optimistic UI: mueve el ticket en el store inmediatamente,
// revierte si la API falla. Sin useState.
// ============================================================

import { useCallback } from "react";
import { SP_CONFIG } from "../../../../config";
import { useManagerStore, columnKey } from "../../../store/managerStore";
import { useUiStore } from "../../../store/uiStore";

// ─── Constantes ───────────────────────────────────────────────

const DRAG_DATA_KEY = "text/plain";

// ─── Formato del dato de drag: "ticketId|fromColumnKey" ───────

function encodeDrag(ticketId: number, fromKey: string): string {
  return `${ticketId}|${fromKey}`;
}

function decodeDrag(
  data: string,
): { ticketId: number; fromKey: string } | null {
  const parts = data.split("|");
  if (parts.length !== 2) return null;
  const ticketId = parseInt(parts[0] ?? "");
  const fromKey = parts[1] ?? "";
  if (isNaN(ticketId) || !fromKey) return null;
  return { ticketId, fromKey };
}

// ─── Reassign API call ────────────────────────────────────────

async function reassignTicketApi(
  ticketId: number,
  targetProfileId: number | string,
  targetGroupId: number,
  targetGroupLabel: string,
  spToken: string,
): Promise<void> {
  const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${spToken}`,
    },
    body: JSON.stringify({
      resolutionGroupId: targetGroupId,
      serviceId: null,
      responsibleProfileId:
        typeof targetProfileId === "string"
          ? parseInt(targetProfileId)
          : targetProfileId,
      resolutionGroup: {
        label: targetGroupLabel,
        value: targetGroupId,
      },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { success: boolean };
  if (!json.success) throw new Error("API returned no success");
}

// ─── Hook ─────────────────────────────────────────────────────

export function useTicketDrag() {
  const spToken = useManagerStore((s) => s.spToken);
  const canDrag = useManagerStore((s) => s.canDrag);
  const groups = useManagerStore((s) => s.groups);
  const {
    setDraggingTicket,
    setDragOverColumn,
    moveTicket,
    revertMove,
    setLastDropTime,
  } = useManagerStore.getState();

  const { showSuccessToast, showErrorToast } = useUiStore.getState();

  // ── dragStart: guarda ticketId + columna origen en dataTransfer ──

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLElement>, ticketId: number, fromKey: string) => {
      if (!canDrag) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DRAG_DATA_KEY, encodeDrag(ticketId, fromKey));
      setDraggingTicket(String(ticketId));
    },
    [canDrag, setDraggingTicket],
  );

  // ── dragEnd: limpia el estado visual ──────────────────────────

  const onDragEnd = useCallback(() => {
    setDraggingTicket(null);
    setDragOverColumn(null);
  }, [setDraggingTicket, setDragOverColumn]);

  // ── dragOver: habilita el drop en la columna ──────────────────

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>, toKey: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(toKey);
    },
    [setDragOverColumn],
  );

  // ── dragLeave ─────────────────────────────────────────────────

  const onDragLeave = useCallback(
    (e: React.DragEvent<HTMLElement>, _toKey: string) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDragOverColumn(null);
      }
    },
    [setDragOverColumn],
  );

  // ── drop: mueve optimistamente y llama a la API ───────────────

  const onDrop = useCallback(
    (
      e: React.DragEvent<HTMLElement>,
      toColumnId: number | "unassigned",
      toGroupId: number,
    ) => {
      e.preventDefault();
      setDragOverColumn(null);
      setLastDropTime(Date.now());

      if (!canDrag) return;

      const raw = e.dataTransfer.getData(DRAG_DATA_KEY);
      const decoded = decodeDrag(raw);
      if (!decoded) return;

      const { ticketId, fromKey } = decoded;
      const toKey = columnKey(toGroupId, toColumnId);

      // No hacer nada si es la misma columna
      if (fromKey === toKey) return;

      // No permitir drop en columna "closed" (cerrar desde Kanban no está en scope aquí)
      if (toColumnId === "unassigned") return;

      // Resolver nombre del grupo destino
      const group = groups.find((g) => g.id === toGroupId);
      const groupLabel = group?.name ?? "";

      // Optimistic move en el store
      moveTicket(ticketId, fromKey, toKey);

      // API call en background
      void reassignTicketApi(
        ticketId,
        toColumnId as number,
        toGroupId,
        groupLabel,
        spToken,
      )
        .then(() => showSuccessToast("Ticket reasignado"))
        .catch((err: Error) => {
          showErrorToast(`Error al reasignar: ${err.message}`);
          // Revertir en el store
          revertMove(ticketId, fromKey, toKey);
        });
    },
    [
      canDrag,
      groups,
      spToken,
      moveTicket,
      revertMove,
      setDragOverColumn,
      setLastDropTime,
      showSuccessToast,
      showErrorToast,
    ],
  );

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}
