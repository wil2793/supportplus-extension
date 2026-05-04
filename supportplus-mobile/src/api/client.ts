// ============================================
// HTTP Client for SupportPlus API
// ============================================

import * as SecureStore from "expo-secure-store";
import { SP_BASE_URL, MONDAY_API_URL } from "../utils/constants";

const TOKEN_KEY = "sp_auth_token";
const MONDAY_TOKEN_KEY = "monday_token";
const MONDAY_BOARD_KEY = "monday_board_id";

// --- Token management ---
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getMondayToken(): Promise<string | null> {
  return SecureStore.getItemAsync(MONDAY_TOKEN_KEY);
}

export async function setMondayToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(MONDAY_TOKEN_KEY, token);
}

export async function getMondayBoardId(): Promise<string | null> {
  return SecureStore.getItemAsync(MONDAY_BOARD_KEY);
}

export async function setMondayBoardId(id: string): Promise<void> {
  await SecureStore.setItemAsync(MONDAY_BOARD_KEY, id);
}

// --- SupportPlus API ---
export async function spFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${SP_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Monday.com API ---
export async function mondayQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getMondayToken();
  if (!token) throw new Error("No Monday token");

  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Monday HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}
