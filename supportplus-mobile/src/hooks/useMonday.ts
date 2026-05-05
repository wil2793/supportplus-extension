// ============================================
// Monday.com hook
// ============================================

import { useCallback, useEffect, useState } from "react";
import { getMondayBoardId } from "../api/client";
import {
  getDBABoards,
  getSyncedTickets,
  createMondayItem,
  ticketMatchesBoard,
} from "../api/monday";
import { MondayBoard } from "../api/types";
import { TicketListItem } from "../api/types";
import { SP_WEB_URL } from "../utils/constants";

export function useMonday() {
  const [boards, setBoards] = useState<MondayBoard[]>([]);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [synced, setSynced] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMondayBoardId().then(setBoardId);
  }, []);

  const loadBoards = useCallback(async () => {
    setLoading(true);
    try {
      const b = await getDBABoards();
      setBoards(b);
    } catch (err) {
      console.error("Error loading boards:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSynced = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSyncedTickets();
      setSynced(s);
    } catch (err) {
      console.error("Error loading synced tickets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const migrateTicket = useCallback(
    async (ticket: TicketListItem, board: MondayBoard) => {
      if (!board.groups?.length) throw new Error("Board has no groups");

      const group = board.groups[0];
      const ticketUrl = `${SP_WEB_URL}/es/tickets/${ticket.id}`;

      const itemId = await createMondayItem({
        boardId: board.id,
        groupId: group.id,
        itemName: ticket.subject,
        description: ticket.description || "",
        priorityName: ticket.incidentPriorityName,
        createdAt: ticket.createdAt,
        ticketUrl,
        uniqueCode: ticket.uniqueCode,
      });

      setSynced((prev) => ({ ...prev, [ticket.uniqueCode]: itemId }));
      return itemId;
    },
    [],
  );

  return {
    boards,
    boardId,
    synced,
    loading,
    loadBoards,
    loadSynced,
    migrateTicket,
    isSynced: (code: string) => !!synced[code],
  };
}
