// ============================================================
// SRC/FEATURES/TICKET-ACTIONS.TS - Ticket API operations
// ============================================================

import { SP_CONFIG, SP_STATUSES } from "../config";
import { getSpToken } from "../lib/api";
import { createMondayItem } from "../lib/monday-utils";
import * as Cache from "../lib/cache";
import type { SpTicket, SpProfile, PendingCloseTicket } from "../types";

// ─── Reassign Ticket ──────────────────────────────────────────

export interface ReassignOptions {
  resolutionGroupId: number;
  resolutionGroupLabel: string;
  profileId: number;
  comment?: string;
}

export async function reassignTicket(
  ticketId: number | string,
  options: ReassignOptions
): Promise<unknown> {
  const spToken = getSpToken();
  const body: Record<string, unknown> = {
    resolutionGroupId: options.resolutionGroupId,
    serviceId: null,
    responsibleProfileId: options.profileId,
    resolutionGroup: {
      label: options.resolutionGroupLabel,
      value: options.resolutionGroupId,
    },
  };
  if (options.comment) {
    body["ticketCommentRequest"] = { internal: false, content: options.comment };
  }

  const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${spToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { success: boolean };
  if (!json.success) throw new Error("Reassign failed");
  return json;
}

// ─── Close Ticket ─────────────────────────────────────────────

export async function closeTicket(ticketId: number | string): Promise<void> {
  const spToken = getSpToken();
  const res = await fetch(
    `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
      body: JSON.stringify({
        nextTicketStatusId: SP_STATUSES.CERRADO,
        ticketCommentRequest: null,
      }),
    }
  );
  if (!res.ok) throw new Error(`Error al cerrar: HTTP ${res.status}`);
}

// ─── Add Comment ──────────────────────────────────────────────

export async function addComment(
  ticketId: number | string,
  content: string,
  internal = false
): Promise<void> {
  const spToken = getSpToken();
  const res = await fetch(`${SP_CONFIG.SP_API}/comment/${ticketId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${spToken}`,
    },
    body: JSON.stringify({ content, internal }),
  });
  if (!res.ok) throw new Error(`Error al comentar: HTTP ${res.status}`);
}

// ─── Fetch Ticket Detail ──────────────────────────────────────

export async function fetchTicketDetail(
  ticketId: number | string
): Promise<SpTicket> {
  const spToken = getSpToken();
  const res = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${spToken}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: SpTicket } | SpTicket;
  return ("data" in json ? json.data : json) as SpTicket;
}

// ─── Get Profiles for Group (cached) ──────────────────────────

export async function getProfilesForGroup(
  groupId: number
): Promise<SpProfile[]> {
  const cacheKey = `profiles-${groupId}`;
  const cached = Cache.get<SpProfile[]>(cacheKey);
  if (cached) return cached;

  const spToken = getSpToken();
  if (!spToken) return [];

  try {
    const res = await fetch(
      `${SP_CONFIG.SP_API}/active-profiles-by-resolution-group/${groupId}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: SpProfile[] } | SpProfile[];
    const profiles = ("data" in json ? json.data : json) as SpProfile[];
    if (Array.isArray(profiles)) {
      Cache.set(cacheKey, profiles, 5 * 60 * 1000); // 5 min
      return profiles;
    }
    return [];
  } catch {
    return [];
  }
}

export async function resolveMyProfileId(
  groupId: number,
  userName: string
): Promise<number | null> {
  if (!userName) return null;
  const profiles = await getProfilesForGroup(groupId);
  const me = profiles.find((p) => p.profileFullName === userName);
  return me?.profileId ?? null;
}

// ─── Pending Close Tickets (via background API) ───────────────

export function saveTicketPendingClose(
  uniqueCode: string,
  ticketId: number,
  userIdStr: string,
  groupId?: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "api-post",
        endpoint: "/tickets-por-cerrar",
        body: {
          ticket: uniqueCode,
          idSupportPlus: ticketId,
          fkIdUsuario: parseInt(userIdStr),
          fkIdcatGrupo: groupId ? parseInt(groupId) : null,
          usuarioAlta: "EXTENSION",
        },
      },
      (resp: { success: boolean; data?: unknown; error?: string } | undefined) => {
        if (resp?.success) resolve(resp.data);
        else reject(new Error(resp?.error ?? "Error al guardar"));
      }
    );
  });
}

export function removeTicketPendingClose(ticketId: number): void {
  chrome.runtime.sendMessage({
    type: "api-put",
    endpoint: `/tickets-por-cerrar/cerrar-por-sp/${ticketId}`,
    body: { usuarioModificacion: "EXTENSION" },
  });
}

export async function fetchPendingCloseTickets(): Promise<PendingCloseTicket[]> {
  try {
    const results = await new Promise<
      Array<{ Ticket: string; IdSupportPlus: number; IdTicketPorCerrar: number }>
    >((resolve) => {
      chrome.runtime.sendMessage(
        { type: "api-get", endpoint: "/tickets-por-cerrar" },
        (resp: { success: boolean; data?: { data?: unknown[] } } | undefined) => {
          resolve(
            resp?.success
              ? ((resp.data?.data ?? []) as Array<{
                  Ticket: string;
                  IdSupportPlus: number;
                  IdTicketPorCerrar: number;
                }>)
              : []
          );
        }
      );
    });

    return results.map((t) => ({
      ticket: t.Ticket,
      ticketId: t.IdSupportPlus,
      pageId: String(t.IdTicketPorCerrar),
    }));
  } catch {
    return [];
  }
}

// ─── Close + Migrate workflow ─────────────────────────────────

export interface CloseAndMigrateOptions {
  ticketId: number | string;
  comment?: string;
  assignFirst?: boolean;
  profileId?: number;
  resolutionGroupId?: number;
  resolutionGroupLabel?: string;
  mondayGroupId?: string;
  mondayBoardId?: string;
  mondayToken?: string;
  canMigrateCheck?: () => Promise<boolean>;
}

export interface CloseAndMigrateResult {
  closed: boolean;
  migrated: boolean;
  mondayItemId: string | null;
}

export async function closeAndMigrate(
  opts: CloseAndMigrateOptions
): Promise<CloseAndMigrateResult> {
  const result: CloseAndMigrateResult = {
    closed: false,
    migrated: false,
    mondayItemId: null,
  };

  if (opts.comment) {
    await addComment(opts.ticketId, `<p>${opts.comment}</p>`, false);
  }

  if (
    opts.assignFirst &&
    opts.profileId &&
    opts.resolutionGroupId
  ) {
    await reassignTicket(opts.ticketId, {
      resolutionGroupId: opts.resolutionGroupId,
      resolutionGroupLabel: opts.resolutionGroupLabel ?? "",
      profileId: opts.profileId,
    });
  }

  await closeTicket(opts.ticketId);
  result.closed = true;

  if (opts.mondayGroupId && opts.mondayBoardId && opts.mondayToken) {
    const canMigrate = opts.canMigrateCheck ? await opts.canMigrateCheck() : true;
    if (canMigrate) {
      const ticketData = await fetchTicketDetail(opts.ticketId);
      const itemId = await createMondayItem(opts.mondayToken, {
        boardId: opts.mondayBoardId,
        groupId: opts.mondayGroupId,
        ticket: ticketData,
      });
      if (itemId) {
        result.migrated = true;
        result.mondayItemId = itemId;
      }
    }
  }

  return result;
}

const SP_TicketActions = {
  reassignTicket,
  closeTicket,
  addComment,
  fetchTicketDetail,
  getProfilesForGroup,
  resolveMyProfileId,
  saveTicketPendingClose,
  removeTicketPendingClose,
  fetchPendingCloseTickets,
  closeAndMigrate,
};
export default SP_TicketActions;
