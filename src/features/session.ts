// ============================================================
// SRC/FEATURES/SESSION.TS - Authentication, permissions, user state
// ============================================================

import { SP_CONFIG } from "../config";
import * as Storage from "../lib/storage";
import { getSpToken } from "../lib/api";
import type { SessionState, WorkSchedule, UserConfig } from "../types";

// ─── Session State ────────────────────────────────────────────

export const state: SessionState = {
  userRole: "usuario",
  userName: "",
  userEmail: "",
  profileId: null,
  groups: [],
  teamArea: "",

  btnDashboard: true,
  btnComments: true,
  btnReports: true,
  btnReassignApp: false,
  btnAddIAM: false,
  canShowLabels: false,
  canReopenTickets: false,
  canCommentClosed: false,
  canRejectTickets: false,
  canAddParticipant: false,
  canAddProduct: false,
  canAdelantar: false,
  canGuardias: false,

  userConfig: {} as UserConfig,
  workSchedule: {
    horaEntrada: 9,
    horaSalida: 19,
    diaInicio: "Lunes",
    diaFinal: "Viernes",
  },

  versionBlocked: false,
  lastDropTime: 0,
};

// ─── Work Schedule Helper ─────────────────────────────────────

const DAY_MAP: Record<string, number> = {
  Domingo: 0, Lunes: 1, Martes: 2,
  Miercoles: 3, "Miércoles": 3, Jueves: 4,
  Viernes: 5, Sabado: 6, "Sábado": 6,
};

export function isWithinWorkHours(): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  const { horaEntrada, horaSalida, diaInicio, diaFinal } = state.workSchedule;
  const startDay = DAY_MAP[diaInicio] ?? 1;
  const endDay = DAY_MAP[diaFinal] ?? 5;
  const inDayRange = currentDay >= startDay && currentDay <= endDay;
  const inHourRange = currentHour >= horaEntrada && currentHour < horaSalida;
  return inDayRange && inHourRange;
}

// ─── Load persisted state ────────────────────────────────────

export async function loadPersistedState(): Promise<void> {
  try {
    const r = await Storage.getMultiple<{
      subgroupPerms: Record<string, boolean>;
      userConfig: UserConfig;
      usersMap: Record<string, Record<string, unknown>>;
      userEmail: string;
      workSchedule: WorkSchedule;
    }>(["subgroupPerms", "userConfig", "usersMap", "userEmail", "workSchedule"]);

    if (r.subgroupPerms) {
      state.btnReassignApp = r.subgroupPerms["canReassignApp"] ?? false;
      state.btnAddIAM = r.subgroupPerms["canAddIAM"] ?? false;
      state.canShowLabels = r.subgroupPerms["canShowLabels"] ?? false;
      state.canReopenTickets = r.subgroupPerms["canReopenTickets"] ?? false;
      state.canCommentClosed = r.subgroupPerms["canCommentClosed"] ?? false;
      state.canRejectTickets = r.subgroupPerms["canRejectTickets"] ?? false;
    } else if (r.usersMap && r.userEmail) {
      const u = r.usersMap[(r.userEmail ?? "").toLowerCase()];
      if (u) {
        state.btnReassignApp = !!u["canReassignApp"];
        state.btnAddIAM = !!u["canAddIAM"];
        state.canShowLabels = !!u["canShowLabels"];
        state.canReopenTickets = !!u["canReopenTickets"];
        state.canCommentClosed = !!u["canCommentClosed"];
        state.canRejectTickets = !!u["canRejectTickets"];
      }
    }

    if (r.userConfig) state.userConfig = r.userConfig;
    if (r.workSchedule) state.workSchedule = r.workSchedule;
  } catch {
    // Ignore — use defaults
  }
}

// ─── Check Session ────────────────────────────────────────────

export async function checkSession(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(SP_CONFIG.SP_SESSION_API, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${getSpToken()}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return;

    const data = (await res.json()) as { user?: { email: string; name: string } };
    const email = data?.user?.email?.toLowerCase() ?? "";
    state.userName = data?.user?.name ?? "";
    state.userEmail = email;

    if (!email) return;

    await Storage.set("userEmail", email);
    await Storage.set("portalToken", getSpToken());

    // Trigger background sync
    await Promise.race([
      new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: "sync" }, () => resolve());
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 15000)),
    ]);

    const stored = await Storage.getMultiple<{
      usersMap: Record<string, Record<string, unknown>>;
      userConfig: UserConfig;
      workSchedule: WorkSchedule;
    }>(["usersMap", "userConfig", "workSchedule"]);

    if (stored.workSchedule) state.workSchedule = stored.workSchedule;

    const usersMap = stored.usersMap ?? {};
    let userData: Record<string, unknown> | null = usersMap[email] ?? null;

    if (!userData) {
      const cachedSession = await Storage.get<Record<string, unknown>>("sp_last_session");
      if (
        cachedSession &&
        cachedSession["email"] === email &&
        cachedSession["active"]
      ) {
        userData = cachedSession;
      } else {
        // Retry with increasing delays while sync completes
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise<void>((r) => setTimeout(r, 1500 * (attempt + 1)));
          const retryMap =
            (await Storage.get<Record<string, Record<string, unknown>>>("usersMap")) ?? {};
          if (retryMap[email]) {
            userData = retryMap[email];
            break;
          }
        }
      }
    }

    if (!userData) {
      userData = {
        name: state.userName,
        active: true,
        groups: [],
        profileId: null,
        canMigrate: false,
        btnDashboard: false,
        btnComments: false,
        btnReports: false,
      };
    }

    if (!userData["active"]) {
      state.userRole = "usuario";
      return;
    }

    if (userData["profileId"]) state.profileId = userData["profileId"] as number;

    const groups = userData["groups"] as number[] | undefined;
    if (groups?.length) {
      state.groups = groups;
      if (!state.teamArea) state.teamArea = String(groups[0]);
    }

    state.btnDashboard = userData["btnDashboard"] !== false;
    state.btnComments = userData["btnComments"] !== false;
    state.btnReports = userData["btnReports"] !== false;
    state.btnReassignApp = !!userData["canReassignApp"];
    state.btnAddIAM = !!userData["canAddIAM"];
    state.canShowLabels = !!userData["canShowLabels"];
    state.canReopenTickets = !!userData["canReopenTickets"];
    state.canCommentClosed = !!userData["canCommentClosed"];
    state.canRejectTickets = !!userData["canRejectTickets"];
    state.canAddParticipant = !!userData["canAddParticipant"];
    state.canAddProduct = !!userData["canAddProduct"];
    state.canAdelantar = !!userData["canAdelantar"];
    state.canGuardias = !!userData["canGuardias"];

    if (stored.userConfig) state.userConfig = stored.userConfig;

    await Storage.setMultiple({
      userEmail: email,
      myProfileId: state.profileId,
      subgroupPerms: {
        canReassignApp: state.btnReassignApp,
        canAddIAM: state.btnAddIAM,
        canShowLabels: state.canShowLabels,
        canReopenTickets: state.canReopenTickets,
        canCommentClosed: state.canCommentClosed,
        canRejectTickets: state.canRejectTickets,
      },
      sp_last_session: {
        email,
        name: userData["name"],
        roleName: userData["roleName"],
        groups: userData["groups"],
        profileId: userData["profileId"],
        active: userData["active"],
        ...userData,
        cachedAt: Date.now(),
      },
    });

    const roleName = ((userData["roleName"] as string) ?? "").toLowerCase();
    state.userRole = roleName.includes("admin") ? "admin" : "usuario";
  } catch {
    // Ignore — stay as "usuario"
  }
}

// ─── Resolve Profile ID ───────────────────────────────────────

export async function resolveProfileId(): Promise<number | null> {
  if (state.profileId) return state.profileId;

  const name = state.userName || getLoggedUserNameFromDOM();
  if (!name) return null;

  const spToken = getSpToken();
  if (!spToken) return null;

  const groupId = state.teamArea || "19";

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
    if (!res.ok) return null;

    const json = (await res.json()) as { data?: Array<{ profileId: number; profileFullName: string }> };
    const profiles = json.data ?? (json as unknown as Array<{ profileId: number; profileFullName: string }>);
    if (!Array.isArray(profiles)) return null;

    const me = profiles.find((p) => p.profileFullName === name);
    if (me) {
      state.profileId = me.profileId;
      void Storage.set("sessionProfileId", me.profileId);
    }
    return state.profileId;
  } catch {
    return null;
  }
}

// ─── DOM Helpers ──────────────────────────────────────────────

export function getLoggedUserNameFromDOM(): string {
  const el = document.querySelector('[class*="warapperNameUserAndLogout"] p');
  return el?.textContent?.trim() ?? "";
}

const SP_Session = {
  state,
  isWithinWorkHours,
  loadPersistedState,
  checkSession,
  resolveProfileId,
  getLoggedUserNameFromDOM,
};
export default SP_Session;
