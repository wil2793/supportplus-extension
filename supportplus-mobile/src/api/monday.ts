// ============================================
// Monday.com API endpoints
// ============================================

import { mondayQuery, getMondayBoardId } from "./client";
import { MondayBoard, MondayUser } from "./types";
import { MONDAY_COLUMNS, PRIORITY_MAP, MONTH_NAMES } from "../utils/constants";

// --- Boards ---
export async function getBoards(): Promise<MondayBoard[]> {
  const data = await mondayQuery<{ boards: MondayBoard[] }>(
    `{ boards(limit:500) { id name groups { id title } } }`,
  );
  return data.boards;
}

export async function getDBABoards(year?: number): Promise<MondayBoard[]> {
  const boards = await getBoards();
  const y = year ?? new Date().getFullYear();
  return boards.filter(
    (b) => b.name.startsWith("Tickets DBA") && b.name.includes(String(y)),
  );
}

// --- Users ---
export async function getMondayUsers(): Promise<Record<string, string>> {
  const data = await mondayQuery<{ users: MondayUser[] }>(
    `{ users(limit:500) { id email } }`,
  );
  const map: Record<string, string> = {};
  data.users.forEach((u) => {
    map[u.email.toLowerCase()] = u.id;
  });
  return map;
}

export async function getMyMondayId(): Promise<string> {
  const data = await mondayQuery<{ me: { id: string } }>(`{ me { id } }`);
  return data.me.id;
}

// --- Sync (check which tickets are already migrated) ---
export async function getSyncedTickets(): Promise<Record<string, string>> {
  const boardId = await getMondayBoardId();
  if (!boardId) return {};

  const synced: Record<string, string> = {};
  const colId = MONDAY_COLUMNS.TICKET_CODE;

  const firstPage = await mondayQuery<{
    boards: [
      {
        items_page: {
          cursor: string | null;
          items: { id: string; column_values: { text: string }[] }[];
        };
      },
    ];
  }>(
    `query ($boardId: [ID!]!) { boards(ids: $boardId) { items_page(limit: 500) { cursor items { id column_values(ids: ["${colId}"]) { text } } } } }`,
    { boardId },
  );

  let page = firstPage.boards[0].items_page;
  for (const item of page.items) {
    const code = (item.column_values[0]?.text || "").trim();
    if (code) synced[code] = item.id;
  }

  let cursor = page.cursor;
  while (cursor) {
    const next = await mondayQuery<{
      next_items_page: {
        cursor: string | null;
        items: { id: string; column_values: { text: string }[] }[];
      };
    }>(
      `query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id column_values(ids: ["${colId}"]) { text } } } }`,
      { cursor },
    );
    for (const item of next.next_items_page.items) {
      const code = (item.column_values[0]?.text || "").trim();
      if (code) synced[code] = item.id;
    }
    cursor = next.next_items_page.cursor;
  }

  return synced;
}

// --- Create item ---
export async function createMondayItem(params: {
  boardId: string;
  groupId: string;
  itemName: string;
  description: string;
  personEmail?: string;
  priorityName?: string;
  createdAt: string;
  ticketUrl: string;
  uniqueCode: string;
}): Promise<string> {
  const users = await getMondayUsers();
  let personValue: Record<string, unknown> = {};
  if (params.personEmail) {
    const userId = users[params.personEmail.toLowerCase()];
    if (userId) {
      personValue = {
        personsAndTeams: [{ id: parseInt(userId), kind: "person" }],
      };
    }
  }

  const spPriority = (params.priorityName || "").toLowerCase().trim();
  const priorityIndex = PRIORITY_MAP[spPriority] ?? PRIORITY_MAP["medio"];
  const createdDate = new Date(params.createdAt).toISOString().slice(0, 10);

  const columnValues = JSON.stringify({
    [MONDAY_COLUMNS.DESCRIPTION]: { text: params.description },
    ...(personValue.personsAndTeams
      ? { [MONDAY_COLUMNS.PERSON]: personValue }
      : {}),
    [MONDAY_COLUMNS.STATUS]: { index: 1 },
    [MONDAY_COLUMNS.PRIORITY]: { index: priorityIndex },
    [MONDAY_COLUMNS.TIMELINE]: { from: createdDate, to: createdDate },
    [MONDAY_COLUMNS.LINK]: {
      url: params.ticketUrl,
      text: params.uniqueCode || params.ticketUrl,
    },
    [MONDAY_COLUMNS.TICKET_CODE]: params.uniqueCode,
  });

  const result = await mondayQuery<{
    create_item: { id: string };
  }>(
    `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
    }`,
    {
      boardId: params.boardId,
      groupId: params.groupId,
      itemName: params.itemName,
      columnValues,
    },
  );

  return result.create_item.id;
}

// --- Board date validation ---
export function parseBoardDate(
  boardName: string,
): { month: number; year: number } | null {
  const m = boardName.match(/- (\w+) - (\d{4})/);
  if (!m) return null;
  const monthIdx = MONTH_NAMES.indexOf(m[1]);
  if (monthIdx === -1) return null;
  return { month: monthIdx, year: parseInt(m[2]) };
}

export function ticketMatchesBoard(
  ticketCreatedAt: string,
  boardName: string,
): boolean {
  const boardDate = parseBoardDate(boardName);
  if (!boardDate) return true;
  const ticketDate = new Date(ticketCreatedAt);
  return (
    ticketDate.getMonth() === boardDate.month &&
    ticketDate.getFullYear() === boardDate.year
  );
}
