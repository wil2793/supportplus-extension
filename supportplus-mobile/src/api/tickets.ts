// ============================================
// Ticket API endpoints
// ============================================

import { spFetch } from "./client";
import {
  TicketListItem,
  TicketDetail,
  PaginatedResponse,
  Profile,
  ReassignBody,
  CloseTicketBody,
  CommentBody,
} from "./types";
import { RESOLUTION_GROUP_DBA } from "../utils/constants";

// --- List tickets ---
export async function searchTickets(params: {
  page?: number;
  size?: number;
  ticketStatusName?: string;
  uniqueCode?: string;
  requesterName?: string;
  reportTypeId?: number;
  priorityId?: number;
  initDate?: string;
  endDate?: string;
}): Promise<PaginatedResponse<TicketListItem>> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 0));
  query.set("size", String(params.size ?? 25));
  query.set("resolutionGroupId", String(RESOLUTION_GROUP_DBA));
  if (params.ticketStatusName)
    query.set("ticketStatusName", params.ticketStatusName);
  if (params.uniqueCode) query.set("uniqueCode", params.uniqueCode);
  if (params.requesterName) query.set("requesterName", params.requesterName);
  if (params.reportTypeId)
    query.set("reportTypeId", String(params.reportTypeId));
  if (params.priorityId) query.set("priorityId", String(params.priorityId));
  if (params.initDate) query.set("initDate", params.initDate);
  if (params.endDate) query.set("endDate", params.endDate);

  return spFetch(`/tickets/search-by-level-and-resolution-groups?${query}`);
}

export async function searchAllTickets(params: {
  page?: number;
  size?: number;
  initDate?: string;
  endDate?: string;
}): Promise<PaginatedResponse<TicketListItem>> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 0));
  query.set("size", String(params.size ?? 100));
  query.set("resolutionGroupId", String(RESOLUTION_GROUP_DBA));
  if (params.initDate) query.set("initDate", params.initDate);
  if (params.endDate) query.set("endDate", params.endDate);

  return spFetch(`/tickets/search-all-tickets?${query}`);
}

export async function getMyAssignedTickets(
  page = 0,
  size = 25,
): Promise<PaginatedResponse<TicketListItem>> {
  return spFetch(
    `/tickets/search-by-user-current-responsible?page=${page}&size=${size}`,
  );
}

export async function getMyCreatedTickets(
  page = 0,
  size = 25,
): Promise<PaginatedResponse<TicketListItem>> {
  return spFetch(`/tickets/search-by-user-requester?page=${page}&size=${size}`);
}

// --- Single ticket ---
export async function getTicketDetail(
  ticketId: number,
): Promise<{ data: TicketDetail }> {
  return spFetch(`/tickets/web/${ticketId}`);
}

// --- Actions ---
export async function reassignTicket(
  ticketId: number,
  body: ReassignBody,
): Promise<{ success: boolean }> {
  return spFetch(`/tickets/web/reassign/${ticketId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function closeTicket(
  ticketId: number,
  body?: CloseTicketBody,
): Promise<unknown> {
  return spFetch(
    `/tickets/web/update-ticket-status-with-optional-comment/${ticketId}`,
    {
      method: "PATCH",
      body: JSON.stringify(
        body ?? { nextTicketStatusId: 9, ticketCommentRequest: null },
      ),
    },
  );
}

export async function addComment(
  ticketId: number,
  body: CommentBody,
): Promise<unknown> {
  return spFetch(`/tickets/web/comment/${ticketId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addParticipant(
  ticketId: number,
  profileId: number,
): Promise<unknown> {
  return spFetch("/ticket-participants/assign-visitor-participant", {
    method: "POST",
    body: JSON.stringify({ profileId, ticketId, isParticipant: false }),
  });
}

// --- Profiles ---
export async function getDBAProfiles(): Promise<{ data: Profile[] }> {
  return spFetch(
    `/tickets/web/active-profiles-by-resolution-group/${RESOLUTION_GROUP_DBA}`,
  );
}
