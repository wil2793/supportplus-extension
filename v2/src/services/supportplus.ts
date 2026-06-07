import { SP_API, SP_SESSION_API } from "../config";
import type { SPTicket, SPProfile } from "../types";

const getToken = () => localStorage.getItem("token") || "";

export const getSession = async () => {
  const res = await fetch(SP_SESSION_API, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${getToken()}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
};

export const getTicketDetail = async (
  ticketId: number,
): Promise<SPTicket | null> => {
  const res = await fetch(`${SP_API}/${ticketId}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${getToken()}`,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || json;
};

export const getProfilesByGroup = async (
  groupId: number,
): Promise<SPProfile[]> => {
  const res = await fetch(
    `${SP_API}/active-profiles-by-resolution-group/${groupId}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${getToken()}`,
      },
    },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || json;
};

export const reassignTicket = async (ticketId: number, body: object) => {
  const res = await fetch(`${SP_API}/reassign/${ticketId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const changeTicketStatus = async (
  ticketId: number,
  nextStatusId: number,
  comment?: string,
) => {
  const res = await fetch(
    `${SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        nextTicketStatusId: nextStatusId,
        ticketCommentRequest: comment
          ? { internal: false, content: comment }
          : null,
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const postComment = async (ticketId: number, content: string) => {
  const res = await fetch(`${SP_API}/comment/${ticketId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ content: `<p>${content}</p>`, internal: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const searchTickets = async (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(
    `https://macropayapi.supportplus.mx/tickets/search-all-tickets?${query}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${getToken()}`,
      },
    },
  );
  if (!res.ok) return { content: [] };
  const json = await res.json();
  return json.data || json;
};
