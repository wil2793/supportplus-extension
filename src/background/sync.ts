// ============================================================
// SRC/BACKGROUND/SYNC.TS - Data sync from our backend API
// Fetches usersMap, config, version info and persists to storage.
// ============================================================

import { apiGet } from "./api-client";
import type {
  BackendSyncData,
  BackendUserConfigResponse,
  WorkSchedule,
  UserConfig,
} from "../types";

interface SyncResponse {
  success: boolean;
  data: BackendSyncData;
}

/** Pull all data from the /sync endpoint and write to chrome.storage. */
export async function syncFromAPI(): Promise<void> {
  const resp = await apiGet<SyncResponse>("/sync");
  if (!resp.success) throw new Error("Sync failed");

  const d = resp.data;
  const stored = await chrome.storage.local.get([
    "userEmail",
    "userConfig",
    "groupMondayConfig",
  ]);

  const currentEmail = ((stored["userEmail"] as string) ?? "").toLowerCase();

  // ── Monday token (base64-encoded in the API response) ──────
  let mondayToken = "";
  const userData = currentEmail ? d.usersMap[currentEmail] : null;
  if (userData?.tokenMonday) {
    try {
      mondayToken = atob(userData.tokenMonday);
    } catch {
      mondayToken = userData.tokenMonday;
    }
  }

  // ── User config (fetch per-user or keep existing) ──────────
  let userConfig: UserConfig = (stored["userConfig"] as UserConfig) ?? {};
  if (currentEmail && userData?.idUsuario) {
    try {
      const cfgResp = await apiGet<BackendUserConfigResponse>(
        `/configuracion/usuario/${userData.idUsuario}`,
      );
      if (cfgResp.data) {
        // La blacklist viene como array de objetos { idUsuario, nombre, correo }
        // o como array de números (formato legacy). Normalizamos a number[].
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawBlacklist: any[] = cfgResp.data.blacklist ?? [];
        const blacklistIds: number[] = rawBlacklist.map((item) =>
          typeof item === "number"
            ? item
            : (item as { idUsuario: number }).idUsuario,
        );
        userConfig = {
          onlyWithTickets: !!cfgResp.data.MostrarSoloConTickets,
          blacklist: blacklistIds as unknown as string[],
        };
      }
    } catch {
      // Keep existing config on error
    }
  }

  // ── Work schedule ──────────────────────────────────────────
  const workSchedule: WorkSchedule = {
    horaEntrada: parseInt(d.config.HorarioEntrada) || 9,
    horaSalida: parseInt(d.config.HorarioSalida) || 19,
    diaInicio: d.config.DiaInicio || "Lunes",
    diaFinal: d.config.DiaFinal || "Viernes",
  };

  // ── Persist everything ────────────────────────────────────
  await chrome.storage.local.set({
    usersMap: d.usersMap,
    rolesList: d.rolesList,
    groupNames: d.groupNames,
    groupMondayConfig: stored["groupMondayConfig"] ?? {},
    suggestedComments: d.suggestedComments,
    mondayToken,
    latestVersion: d.latestVersion,
    latestZipUrl: d.latestZipUrl,
    allVersions: d.allVersions,
    userConfig,
    workSchedule,
    syncTime: Date.now(),
  });

  console.log(
    `[SP] Synced: ${Object.keys(d.usersMap).length} users, v: ${d.latestVersion}`,
  );
}

// ── Retry logic ───────────────────────────────────────────────

let _retries = 0;

export async function syncWithRetry(): Promise<void> {
  try {
    await syncFromAPI();
    _retries = 0;
  } catch (e) {
    _retries++;
    const msg = e instanceof Error ? e.message : String(e);
    if (_retries <= 3) {
      setTimeout(() => void syncWithRetry(), _retries * 5000);
    } else {
      console.error("[SP] Sync failed after retries:", msg);
      _retries = 0;
    }
  }
}
