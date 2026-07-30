// ============================================================
// SRC/LIB/SP-FETCH.TS - SupportPlus HTTP helpers
// Centralises auth headers, date formatting and SP API calls
// that were duplicated across content.ts modules.
// ============================================================

import { SP_CONFIG } from "../config";
import SP_API_Lib from "./api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;


// ─── Auth headers ─────────────────────────────────────────────



export function spHeaders(token?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${token ?? SP_API_Lib.getSpToken()}`,
  };
}

export function spGetHeaders(token?: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${token ?? SP_API_Lib.getSpToken()}`,
  };
}

// ─── Date helpers ─────────────────────────────────────────────

/** Convert UTC datetime string to UTC-6 display format */
export function utcToLocal(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  if (isNaN(d.getTime())) return dateStr.replace("T", " ").substring(0, 16);
  d.setHours(d.getHours() - 6);
  return (
    d.getUTCFullYear() +
    "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0") +
    " " +
    String(d.getUTCHours()).padStart(2, "0") +
    ":" +
    String(d.getUTCMinutes()).padStart(2, "0")
  );
}

/** ISO date string → "DD/MM/YYYY - HH:MM" */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return (
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` +
    ` - ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}

/** Today date range strings (T00:00 / T23:59) */
export function getTodayRange(): { start: string; end: string } {
  const d = new Date();
  const prefix =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: `${prefix}T00:00`, end: `${prefix}T23:59` };
}

// ─── Ticket info ──────────────────────────────────────────────

export interface TicketInfo {
  uniqueCode: string;
  subject: string;
  desc: string;
  holder: string;
  holderEmail: string;
  priority: string;
  status: string;
  requester: string;
  createdAt: string;
  createdAtFormatted: string;
}

export async function fetchTicketInfo(
  ticketId: number | string,
): Promise<TicketInfo | null> {
  const spToken = SP_API_Lib.getSpToken();
  if (!spToken) return null;
  try {
    const res = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, {
      headers: spGetHeaders(spToken),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as JsonObject;
    const t = json["data"] ?? json;
    return {
      uniqueCode: t.uniqueCode ?? "N/A",
      subject: t.subject ?? "Sin asunto",
      desc: ((t.description ?? "") as string).replace(/<[^>]*>/g, "").substring(0, 200),
      holder: t.ticketHolder?.ticketHolderLog?.fullName ?? "Sin asignar",
      holderEmail: t.ticketHolder?.ticketHolderLog?.email ?? "",
      priority: t.incidentPriority?.name ?? "",
      status: t.ticketStatus?.name ?? "",
      requester: t.ticketInfo?.fullName ?? "",
      createdAt: t.createdAt ?? "",
      createdAtFormatted: t.createdAt
        ? (t.createdAt as string).replace("T", " ").substring(0, 16)
        : "",
    };
  } catch {
    return null;
  }
}

// ─── Common SP mutations ──────────────────────────────────────

export interface ReassignOptions {
  resolutionGroupId: number;
  resolutionGroupLabel: string;
  profileId: number | null;
  comment?: string;
}

export async function reassignTicket(
  ticketId: number | string,
  opts: ReassignOptions,
): Promise<void> {
  const body: JsonObject = {
    resolutionGroupId: opts.resolutionGroupId,
    serviceId: null,
    responsibleProfileId: opts.profileId,
    resolutionGroup: {
      label: opts.resolutionGroupLabel,
      value: opts.resolutionGroupId,
    },
  };
  if (opts.comment) {
    body["ticketCommentRequest"] = { internal: false, content: opts.comment };
  }
  const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
    method: "PUT",
    headers: spHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as JsonObject;
  if (!json["success"]) throw new Error("Reassign failed");
}

export async function closeTicket(ticketId: number | string): Promise<void> {
  const res = await fetch(
    `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
    {
      method: "PATCH",
      headers: spHeaders(),
      body: JSON.stringify({
        nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
        ticketCommentRequest: null,
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function addComment(
  ticketId: number | string,
  content: string,
  internal = false,
): Promise<string | null> {
  const res = await fetch(`${SP_CONFIG.SP_API}/comment/${ticketId}`, {
    method: "POST",
    headers: spHeaders(),
    body: JSON.stringify({ content: `<p>${content}</p>`, internal }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as JsonObject;
  return ((json["data"] as JsonObject)?.id ?? json["id"] ?? null) as string | null;
}

export async function uploadFiles(
  files: File[],
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const res = await fetch("https://macropayapi.supportplus.mx/files", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Error subiendo archivos: HTTP ${res.status}`);
  const json = (await res.json()) as JsonObject;
  return (json["data"] ?? json) as Array<{ id: string; name: string }>;
}

export async function attachFilesToComment(
  fileIds: string[],
  commentId: string,
  isInternal = false,
): Promise<void> {
  await fetch("https://macropayapi.supportplus.mx/tickets/web/comment/attachments", {
    method: "POST",
    headers: spHeaders(),
    body: JSON.stringify({
      attachments: fileIds.map((id) => ({ fileId: id })),
      commentId,
      isInternal,
    }),
  });
}
