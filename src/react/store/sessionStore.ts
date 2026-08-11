// ============================================================
// SRC/REACT/STORE/SESSIONSTORE.TS - Zustand store de sesión
//
// Espeja el SessionState del módulo vanilla (src/features/session.ts)
// para que los componentes React puedan leerlo y reaccionar a cambios.
//
// El store se hidrata desde el exterior llamando a `hydrateSession()`
// una vez que la sesión vanilla ya está inicializada.
// ============================================================

import { create } from "zustand";
import type { SessionState, UserConfig, WorkSchedule } from "../../types";

// ─── Estado inicial ───────────────────────────────────────────
// Refleja los defaults de src/features/session.ts

const DEFAULT_USER_CONFIG: UserConfig = {
  onlyWithTickets: false,
  blacklist: [],
};

const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  horaEntrada: 9,
  horaSalida: 18,
  diaInicio: "Lunes",
  diaFinal: "Viernes",
};

// ─── Tipos del store ──────────────────────────────────────────

interface SessionStoreState extends SessionState {
  // Indica si la sesión ya fue hidratada desde el módulo vanilla
  isHydrated: boolean;
}

interface SessionStoreActions {
  /** Hidrata el store completo desde el estado de sesión vanilla */
  hydrateSession: (session: SessionState) => void;

  /** Actualiza parcialmente la sesión (para cambios post-login) */
  patchSession: (partial: Partial<SessionState>) => void;

  /** Actualiza la configuración de usuario en tiempo real */
  setUserConfig: (config: UserConfig) => void;

  /** Marca/desmarca el bloqueo por versión desactualizada */
  setVersionBlocked: (blocked: boolean) => void;

  /** Actualiza el área de equipo seleccionada */
  setTeamArea: (area: string) => void;

  /** Registra el último tiempo de drop en Kanban */
  setLastDropTime: (time: number) => void;
}

type SessionStore = SessionStoreState & SessionStoreActions;

// ─── Store ────────────────────────────────────────────────────

export const useSessionStore = create<SessionStore>()((set) => ({
  // ── Valores iniciales (sin sesión activa) ──────────────────
  isHydrated: false,

  userRole: "usuario",
  userName: "",
  userEmail: "",
  profileId: null,
  groups: [],
  teamArea: "",

  // Permisos — todos en false hasta que la sesión confirme
  btnDashboard: false,
  btnComments: false,
  btnReports: false,
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
  canAddUserToGroup: false,
  canAddUserToRole: false,

  // Config
  userConfig: DEFAULT_USER_CONFIG,
  workSchedule: DEFAULT_WORK_SCHEDULE,

  // Runtime
  versionBlocked: false,
  lastDropTime: 0,

  // ── Acciones ───────────────────────────────────────────────

  hydrateSession: (session) =>
    set({
      ...session,
      isHydrated: true,
    }),

  patchSession: (partial) => set((prev) => ({ ...prev, ...partial })),

  setUserConfig: (config) => set({ userConfig: config }),

  setVersionBlocked: (blocked) => set({ versionBlocked: blocked }),

  setTeamArea: (area) => set({ teamArea: area }),

  setLastDropTime: (time) => set({ lastDropTime: time }),
}));

// ─── Selectores tipados ───────────────────────────────────────
// Exportar selectores evita que los componentes importen el store
// completo solo para leer un campo — mejora el tree-shaking y
// facilita pruebas unitarias futuras.

export const selectIsHydrated = (s: SessionStore): boolean => s.isHydrated;
export const selectUserRole = (s: SessionStore): SessionState["userRole"] =>
  s.userRole;
export const selectUserName = (s: SessionStore): string => s.userName;
export const selectUserEmail = (s: SessionStore): string => s.userEmail;
export const selectProfileId = (s: SessionStore): number | null => s.profileId;
export const selectGroups = (s: SessionStore): number[] => s.groups;
export const selectTeamArea = (s: SessionStore): string => s.teamArea;
export const selectVersionBlocked = (s: SessionStore): boolean =>
  s.versionBlocked;
export const selectUserConfig = (s: SessionStore): UserConfig => s.userConfig;
export const selectWorkSchedule = (s: SessionStore): WorkSchedule =>
  s.workSchedule;

// Selector de permisos agrupados para evitar re-renders innecesarios
export interface PermissionsSnapshot {
  btnDashboard: boolean;
  btnComments: boolean;
  btnReports: boolean;
  btnReassignApp: boolean;
  btnAddIAM: boolean;
  canShowLabels: boolean;
  canReopenTickets: boolean;
  canCommentClosed: boolean;
  canRejectTickets: boolean;
  canAddParticipant: boolean;
  canAddProduct: boolean;
  canAdelantar: boolean;
  canGuardias: boolean;
  canAddUserToGroup: boolean;
  canAddUserToRole: boolean;
}

export const selectPermissions = (s: SessionStore): PermissionsSnapshot => ({
  btnDashboard: s.btnDashboard,
  btnComments: s.btnComments,
  btnReports: s.btnReports,
  btnReassignApp: s.btnReassignApp,
  btnAddIAM: s.btnAddIAM,
  canShowLabels: s.canShowLabels,
  canReopenTickets: s.canReopenTickets,
  canCommentClosed: s.canCommentClosed,
  canRejectTickets: s.canRejectTickets,
  canAddParticipant: s.canAddParticipant,
  canAddProduct: s.canAddProduct,
  canAdelantar: s.canAdelantar,
  canGuardias: s.canGuardias,
  canAddUserToGroup: s.canAddUserToGroup,
  canAddUserToRole: s.canAddUserToRole,
});
