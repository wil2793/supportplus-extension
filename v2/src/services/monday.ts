import { mapStatusToMonday } from "../config";

export const mondayQuery = (
  token: string,
  query: string,
  variables: object = {},
): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "monday-query", token, query, variables },
      (resp) => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        if (!resp?.success)
          return reject(new Error(resp?.error || "Monday query failed"));
        resolve(resp.data);
      },
    );
  });

export const getMondayToken = (): Promise<string> =>
  new Promise((resolve) => {
    chrome.storage.local.get("mondayToken", (r) =>
      resolve(r.mondayToken || ""),
    );
  });

export const getMondayUsers = async (
  token: string,
): Promise<Record<string, string>> => {
  const res = await mondayQuery(token, "{ users(limit:500) { id email } }");
  const map: Record<string, string> = {};
  (res.users || []).forEach((u: any) => {
    if (u.email) map[u.email.toLowerCase()] = u.id;
  });
  return map;
};

export { mapStatusToMonday };
