// ============================================================
// SRC/BACKGROUND/MONDAY-PROXY.TS - Monday.com GraphQL proxy
// Content scripts cannot call api.monday.com directly (CSP).
// The service worker acts as a relay.
// ============================================================

const MONDAY_API_URL = "https://api.monday.com/v2";

export interface MondayProxyPayload {
  token: string;
  query: string;
  variables?: Record<string, unknown>;
}

export interface MondayProxyResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Execute a Monday.com GraphQL query.
 * Called by the message router when a "monday-query" message arrives.
 */
export async function executeMondayQuery(
  payload: MondayProxyPayload
): Promise<MondayProxyResult> {
  const { token, query, variables = {} } = payload;

  if (!token) {
    return { success: false, error: "No Monday token provided" };
  }

  try {
    const res = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Monday API HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as { data?: unknown; errors?: unknown[] };

    if (json.errors?.length) {
      return {
        success: false,
        error: JSON.stringify(json.errors),
      };
    }

    return { success: true, data: json.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}
