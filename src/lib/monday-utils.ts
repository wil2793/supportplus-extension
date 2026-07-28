// ============================================================
// SRC/LIB/MONDAY-UTILS.TS - Shared Monday.com operations
// ============================================================

import {
  mondayQuery,
  getMondayTicketBoards,
  getMondayUsers,
} from "./api";
import { SP_CONFIG, mapStatusToMonday } from "../config";
import type {
  SpTicket,
  MondayBoard,
  MondayColumnValues,
  MondayUsersMap,
} from "../types";

export interface MondayItemRef {
  itemId: string;
  boardId: string;
}

export interface FindMondayItemOptions {
  boards?: MondayBoard[];
}

// ─── Find Monday item by unique code ─────────────────────────

export async function findMondayItem(
  token: string,
  uniqueCode: string,
  options: FindMondayItemOptions = {}
): Promise<MondayItemRef | null> {
  if (!uniqueCode || !token) return null;

  const boards =
    options.boards ?? (await getMondayTicketBoards(token));

  for (const board of boards) {
    try {
      const res = await mondayQuery(
        token,
        "query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }",
        {
          boardId: board.id,
          columnId: SP_CONFIG.MONDAY_TICKET_COL_ID,
          value: uniqueCode,
        }
      );
      const items = res.items_page_by_column_values?.items ?? [];
      if (items.length) {
        return { itemId: items[0].id, boardId: board.id };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Update Monday item status ────────────────────────────────

export async function updateMondayStatus(
  token: string,
  uniqueCode: string,
  statusName: string,
  options: FindMondayItemOptions = {}
): Promise<boolean> {
  const found = await findMondayItem(token, uniqueCode, options);
  if (!found) return false;

  const mondayStatusIndex = mapStatusToMonday(statusName);
  const colValues = JSON.stringify({ status: { index: mondayStatusIndex } });

  await mondayQuery(
    token,
    "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
    { boardId: found.boardId, itemId: found.itemId, columnValues: colValues }
  );
  return true;
}

// ─── Update Monday item person ────────────────────────────────

export interface UpdateMondayPersonOptions extends FindMondayItemOptions {
  usersMap?: MondayUsersMap;
}

export async function updateMondayPerson(
  token: string,
  uniqueCode: string,
  email: string,
  options: UpdateMondayPersonOptions = {}
): Promise<boolean> {
  if (!email) return false;
  const found = await findMondayItem(token, uniqueCode, options);
  if (!found) return false;

  const usersMap = options.usersMap ?? (await getMondayUsers(token));
  const userId = usersMap[email.toLowerCase()];
  if (!userId) return false;

  const colValues = JSON.stringify({
    multiple_person_mm25nvfq: {
      personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
    },
  });

  await mondayQuery(
    token,
    "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
    { boardId: found.boardId, itemId: found.itemId, columnValues: colValues }
  );
  return true;
}

// ─── Update Monday item (status + person combined) ────────────

export interface MondayItemUpdates {
  statusName?: string;
  email?: string;
}

export async function updateMondayItem(
  token: string,
  uniqueCode: string,
  updates: MondayItemUpdates,
  options: UpdateMondayPersonOptions = {}
): Promise<boolean> {
  if (!uniqueCode || !token) return false;
  const found = await findMondayItem(token, uniqueCode, options);
  if (!found) return false;

  const colValues: MondayColumnValues = {};

  if (updates.statusName) {
    colValues.status = { index: mapStatusToMonday(updates.statusName) };
  }

  if (updates.email) {
    const usersMap = options.usersMap ?? (await getMondayUsers(token));
    const userId = usersMap[updates.email.toLowerCase()];
    if (userId) {
      colValues.multiple_person_mm25nvfq = {
        personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
      };
    }
  }

  if (Object.keys(colValues).length === 0) return false;

  await mondayQuery(
    token,
    "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
    {
      boardId: found.boardId,
      itemId: found.itemId,
      columnValues: JSON.stringify(colValues),
    }
  );
  return true;
}

// ─── Fetch all synced tickets (code → itemId map) ─────────────

export async function fetchAllSyncedTickets(
  token: string,
  options: FindMondayItemOptions = {}
): Promise<Record<string, string>> {
  const boards =
    options.boards ?? (await getMondayTicketBoards(token));
  if (!boards.length) return {};

  const synced: Record<string, string> = {};

  for (const board of boards) {
    const firstPage = await mondayQuery(
      token,
      "query ($boardId: [ID!]!) { boards(ids: $boardId) { items_page(limit: 500) { cursor items { id column_values(ids: [\"text_mm2c9nhc\"]) { text } } } } }",
      { boardId: board.id }
    );

    const page = firstPage.boards?.[0]?.items_page;
    if (!page) continue;

    page.items.forEach((item) => {
      const code = (item.column_values?.[0]?.text ?? "").trim();
      if (code) synced[code] = item.id;
    });

    let cursor = page.cursor;
    while (cursor) {
      const next = await mondayQuery(
        token,
        "query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id column_values(ids: [\"text_mm2c9nhc\"]) { text } } } }",
        { cursor }
      );
      const nextPage = next.next_items_page;
      if (!nextPage) break;

      nextPage.items.forEach((item) => {
        const code = (item.column_values?.[0]?.text ?? "").trim();
        if (code) synced[code] = item.id;
      });
      cursor = nextPage.cursor;
    }
  }

  return synced;
}

// ─── Create Monday item (migrate ticket) ─────────────────────

export interface CreateMondayItemOptions {
  boardId: string;
  groupId: string;
  ticket: Partial<SpTicket> & { id: number; createdAt: string };
  usersMap?: MondayUsersMap;
}

export async function createMondayItem(
  token: string,
  opts: CreateMondayItemOptions
): Promise<string | null> {
  const ticket = opts.ticket;
  const uniqueCode = ticket.uniqueCode ?? String(ticket.id);

  // Check if already exists on this board
  const existingRef = await findMondayItem(token, uniqueCode, {
    boards: [{ id: opts.boardId, name: "" }],
  });
  if (existingRef) return existingRef.itemId;

  // Resolve person
  const holderEmail =
    ticket.ticketHolder?.ticketHolderLog?.email ?? "";
  const usersMap =
    opts.usersMap ??
    (holderEmail ? await getMondayUsers(token) : {});

  const personValue =
    holderEmail && usersMap[holderEmail.toLowerCase()]
      ? {
          personsAndTeams: [
            {
              id: parseInt(usersMap[holderEmail.toLowerCase()]),
              kind: "person" as const,
            },
          ],
        }
      : null;

  const url = `https://macropay.supportplus.mx/es/dashboard/tickets/${ticket.id}`;
  const desc = (ticket.description ?? "").replace(/<[^>]*>/g, "");
  const itemName = ticket.subject ?? "Sin asunto";
  const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);

  const spPriority = (
    ticket.incidentPriorityName ??
    ticket.incidentPriority?.name ??
    ""
  )
    .toLowerCase()
    .trim();
  const priorityIndex =
    SP_CONFIG.PRIORITY_MAP[spPriority] ?? SP_CONFIG.PRIORITY_MAP["medio"] ?? 109;

  const colValues: MondayColumnValues = {
    descripci_n_mkn9e5f4: { text: desc },
    status: { index: 1 },
    priority_mkn9kbe9: { index: priorityIndex },
    cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
    link_mknkdctz: { url, text: uniqueCode },
    text_mm2c9nhc: uniqueCode,
  };

  if (personValue) {
    colValues.multiple_person_mm25nvfq = personValue;
  }

  const result = await mondayQuery(
    token,
    "mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }",
    {
      boardId: opts.boardId,
      groupId: opts.groupId,
      itemName,
      columnValues: JSON.stringify(colValues),
    }
  );

  return result.create_item?.id ?? null;
}

const SP_MondayUtils = {
  findMondayItem,
  updateMondayStatus,
  updateMondayPerson,
  updateMondayItem,
  fetchAllSyncedTickets,
  createMondayItem,
};
export default SP_MondayUtils;
