// ============================================================
// SRC/LIB/API.TS - Unified API wrappers (SP, Monday)
// ============================================================

import { SP_CONFIG } from "../config";
import * as Storage from "./storage";
import * as Cache from "./cache";
import type {
  MondayQueryResponse,
  MondayBoard,
  MondayUsersMap,
} from "../types";

// ─── SupportPlus API ──────────────────────────────────────────

/** Get the current SP auth token from localStorage. */
export function getSpToken(): string {
  return localStorage.getItem("token") ?? "";
}

export interface SpFetchOptions extends RequestInit {
  timeout?: number;
}

/**
 * Fetch from SupportPlus API with automatic auth header.
 * @param endpoint - Relative path (appended to SP_API) or full URL.
 */
export async function spFetch<T = unknown>(
  endpoint: string,
  options: SpFetchOptions = {},
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${SP_CONFIG.SP_API}/${endpoint}`;
  const token = getSpToken();
  const timeout = options.timeout ?? 30000;

  const config: RequestInit = {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  };
  delete (config as SpFetchOptions).timeout;

  const controller = new AbortController();
  config.signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, config);
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`SP API error: HTTP ${res.status} on ${url}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`SP API timeout: ${url} (${timeout}ms)`);
    }
    throw e;
  }
}

/**
 * Search tickets via the search-all-tickets endpoint.
 */
export async function spSearchTickets(
  params: Record<string, string | number>,
): Promise<unknown[]> {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${SP_CONFIG.SP_SEARCH_API}?${query}`;
  const json = await spFetch<{
    data?: { content?: unknown[] };
    content?: unknown[];
  }>(url);
  return (json.data ?? (json as { content?: unknown[] })).content ?? [];
}

// ─── Monday.com API ───────────────────────────────────────────

/**
 * Execute a Monday.com GraphQL query via background service-worker proxy.
 */
export function mondayQuery(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<MondayQueryResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "monday-query", token, query, variables },
      (
        resp:
          | { success: boolean; data?: MondayQueryResponse; error?: string }
          | undefined,
      ) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp?.success) {
          return reject(new Error(resp?.error ?? "Monday query failed"));
        }
        resolve(resp.data!);
      },
    );
  });
}

/**
 * Get the Monday.com API token (reads from storage, with retry).
 */
export async function getMondayToken(): Promise<string> {
  const cached = Cache.get<string>("monday-token");
  if (cached) return cached;

  const token = (await Storage.get<string>("mondayToken")) ?? "";
  if (token) {
    Cache.set("monday-token", token, 60 * 60 * 1000); // 1h
    return token;
  }

  // Retry once after 2s (background sync may still be in progress)
  return new Promise((resolve) => {
    setTimeout(async () => {
      const t = (await Storage.get<string>("mondayToken")) ?? "";
      Cache.set("monday-token", t, 60 * 60 * 1000);
      resolve(t);
    }, 2000);
  });
}

/** Clear the Monday token cache (e.g. after config changes). */
export function clearMondayTokenCache(): void {
  Cache.remove("monday-token");
}

/**
 * Get all ticket boards for a workspace (excludes "Subelementos").
 */
export async function getMondayTicketBoards(
  token: string,
  workspaceId?: string,
): Promise<MondayBoard[]> {
  const wsId =
    workspaceId ??
    (await (async () => {
      const stored =
        await Storage.get<Record<string, { workspaceId?: string }>>(
          "groupMondayConfig",
        );
      const config = stored ?? {};
      const firstKey = Object.keys(config)[0];
      return firstKey ? (config[firstKey].workspaceId ?? "") : "";
    })());

  if (!wsId) return [];

  const cacheKey = `monday-boards-${wsId}`;
  const cached = Cache.get<MondayBoard[]>(cacheKey);
  if (cached) return cached;

  const data = await mondayQuery(
    token,
    `{ boards(workspace_ids: [${wsId}], limit: 50) { id name } }`,
    {},
  );
  const boards = (data.boards ?? [])
    .filter((b) => !b.name.includes(SP_CONFIG.MONDAY_SUBITEMS_EXCLUDE))
    .map((b) => ({ id: b.id, name: b.name }));

  Cache.set(cacheKey, boards, 5 * 60 * 1000); // 5 min
  return boards;
}

/**
 * Get Monday.com users as email→id map (cached for the session).
 */
export function getMondayUsers(token: string): Promise<MondayUsersMap> {
  const cacheKey = "monday-users";
  const cached = Cache.get<Promise<MondayUsersMap>>(cacheKey);
  if (cached) return cached;

  const promise = mondayQuery(token, "{ users(limit:500) { id email } }", {})
    .then((data) => {
      const map: MondayUsersMap = {};
      (data.users ?? []).forEach((u) => {
        if (u.email) map[u.email.toLowerCase()] = u.id;
      });
      return map;
    })
    .catch(() => {
      Cache.remove(cacheKey);
      return {} as MondayUsersMap;
    });

  Cache.set(cacheKey, promise);
  return promise;
}

/**
 * Get the Monday board ID for a specific month/year.
 * Auto-creates by duplicating the previous month's board if missing.
 */
export async function getMondayBoardForMonth(
  token: string,
  year: number,
  month: number, // 0-indexed
): Promise<string | null> {
  const {
    MONTH_NAMES,
    MONDAY_BOARD_ETIQUETA,
    MONDAY_WORKSPACE_ID,
    MONDAY_FOLDER_ID,
  } = SP_CONFIG;
  if (!MONDAY_BOARD_ETIQUETA || !MONDAY_WORKSPACE_ID) return null;

  const cacheKey = `monday-board-${year}-${String(month + 1).padStart(2, "0")}`;
  const cached = Cache.get<string>(cacheKey);
  if (cached) return cached;

  const boardName = `${MONDAY_BOARD_ETIQUETA} - ${MONTH_NAMES[month]} - ${year}`;
  const boards = await getMondayTicketBoards(token, MONDAY_WORKSPACE_ID);
  const board = boards.find(
    (b) => b.name.trim().toLowerCase() === boardName.trim().toLowerCase(),
  );

  if (board) {
    Cache.set(cacheKey, board.id, 10 * 60 * 1000);
    return board.id;
  }

  // Board doesn't exist — auto-create by duplicating previous month's board
  try {
    // Invalidar cache y buscar de nuevo en Monday antes de crear.
    // Otro usuario pudo haberlo creado entre la primera búsqueda y ahora.
    Cache.remove(`monday-boards-${MONDAY_WORKSPACE_ID}`);
    const freshBoards = await getMondayTicketBoards(token, MONDAY_WORKSPACE_ID);
    const alreadyExists = freshBoards.find(
      (b) => b.name.trim().toLowerCase() === boardName.trim().toLowerCase(),
    );
    if (alreadyExists) {
      Cache.set(cacheKey, alreadyExists.id, 10 * 60 * 1000);
      return alreadyExists.id;
    }

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevBoardName = `${MONDAY_BOARD_ETIQUETA} - ${MONTH_NAMES[prevMonth]} - ${prevYear}`;
    const prevBoard = freshBoards.find(
      (b) => b.name.trim().toLowerCase() === prevBoardName.trim().toLowerCase(),
    );
    if (!prevBoard) return null;

    const dupArgs = {
      boardId: String(prevBoard.id),
      boardName,
      workspaceId: String(MONDAY_WORKSPACE_ID),
      folderId: String(MONDAY_FOLDER_ID),
    };
    const dupQuery =
      "mutation ($boardId: ID!, $boardName: String!, $workspaceId: ID!, $folderId: ID!) { duplicate_board(board_id: $boardId, duplicate_type: duplicate_board_with_structure, board_name: $boardName, workspace_id: $workspaceId, folder_id: $folderId) { board { id } } }";

    const dupRes = await mondayQuery(token, dupQuery, dupArgs);
    const newBoardId = dupRes.duplicate_board?.board.id;
    if (!newBoardId) return null;

    // Delete all groups from the duplicate (they come pre-filled with items)
    const newBoardData = await mondayQuery(
      token,
      `{ boards(ids: [${newBoardId}]) { groups { id } } }`,
      {},
    );
    const groups = newBoardData.boards?.[0]?.groups ?? [];
    for (const g of groups) {
      await mondayQuery(
        token,
        `mutation { delete_group(board_id: ${newBoardId}, group_id: "${g.id}") { id } }`,
        {},
      );
    }

    Cache.set(cacheKey, newBoardId, 10 * 60 * 1000);
    return newBoardId;
  } catch {
    return null;
  }
}

/** Get the Monday board ID for the current month. */
export function getMondayBoardId(token: string): Promise<string | null> {
  const now = new Date();
  return getMondayBoardForMonth(token, now.getFullYear(), now.getMonth());
}

// ─── Background utilities ─────────────────────────────────────

/** Trigger a data sync in the background service worker. */
export function triggerSync(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "sync" }, (resp: unknown) => {
      resolve((resp as Record<string, unknown>) ?? {});
    });
  });
}

/**
 * Fetch a URL via the background proxy (avoids CORS restrictions).
 * Returns raw bytes as Uint8Array.
 */
export function proxyFetch(url: string, spToken?: string): Promise<Uint8Array> {
  const token = spToken ?? getSpToken() ?? undefined;
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "proxy-fetch", url, token, accept: "application/json" },
      (
        resp: { success: boolean; data?: number[]; error?: string } | undefined,
      ) => {
        if (resp?.success && resp.data) {
          resolve(new Uint8Array(resp.data));
        } else {
          reject(new Error(resp?.error ?? "Proxy fetch failed"));
        }
      },
    );
  });
}

// Namespace export
const SP_API_Lib = {
  getSpToken,
  spFetch,
  spSearchTickets,
  mondayQuery,
  getMondayToken,
  clearMondayTokenCache,
  getMondayTicketBoards,
  getMondayUsers,
  getMondayBoardForMonth,
  getMondayBoardId,
  triggerSync,
  proxyFetch,
};
export default SP_API_Lib;
