// ============================================================
// SRC/REACT/PROVIDERS/EXTENSIONPROVIDER.TSX
//
// Proveedor raíz. Expone useSession(), useUiActions(), usePermissions().
// IMPORTANTE: no crear objetos intermedios en el render — eso
// hace que el contexto siempre sea "nuevo" y provoca re-renders
// infinitos en toda la app (error #185).
// ============================================================

import React, { createContext, useContext, useMemo } from "react";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";
import type { SessionState, UserConfig, WorkSchedule } from "../../types";

// ─── Tipos ────────────────────────────────────────────────────

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
}

export interface SessionContextValue {
  isHydrated: boolean;
  userRole: SessionState["userRole"];
  userName: string;
  userEmail: string;
  profileId: number | null;
  groups: number[];
  teamArea: string;
  versionBlocked: boolean;
  userConfig: UserConfig;
  workSchedule: WorkSchedule;
  permissions: PermissionsSnapshot;
}

export interface UiContextValue {
  showSuccessToast: (message: string) => void;
  showErrorToast: (message: string) => void;
  showLoadingToast: (message: string) => string;
  showInfoToast: (message: string) => void;
  dismissToast: (id: string) => void;
  dismissLoadingToasts: () => void;
  openModal: (id: string, payload?: unknown) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
  isModalOpen: (id: string) => boolean;
}

// ─── Contextos ────────────────────────────────────────────────

const SessionContext = createContext<SessionContextValue | null>(null);
SessionContext.displayName = "SPSessionContext";

const UiContext = createContext<UiContextValue | null>(null);
UiContext.displayName = "SPUiContext";

// ─── Provider ─────────────────────────────────────────────────

interface ExtensionProviderProps {
  children: React.ReactNode;
}

export function ExtensionProvider({ children }: ExtensionProviderProps) {
  // ── Campos escalares de sesión (primitivos — no causan re-renders extra)
  const isHydrated = useSessionStore((s) => s.isHydrated);
  const userRole = useSessionStore((s) => s.userRole);
  const userName = useSessionStore((s) => s.userName);
  const userEmail = useSessionStore((s) => s.userEmail);
  const profileId = useSessionStore((s) => s.profileId);
  const teamArea = useSessionStore((s) => s.teamArea);
  const versionBlocked = useSessionStore((s) => s.versionBlocked);

  // Objetos del store — se estabilizan con useMemo comparando primitivos
  const groups = useSessionStore((s) => s.groups);
  const userConfig = useSessionStore((s) => s.userConfig);
  const workSchedule = useSessionStore((s) => s.workSchedule);

  // Permisos — todos booleanos primitivos, agrupados con useMemo
  const pd = useSessionStore((s) => s.btnDashboard);
  const pc = useSessionStore((s) => s.btnComments);
  const pr = useSessionStore((s) => s.btnReports);
  const pra = useSessionStore((s) => s.btnReassignApp);
  const pi = useSessionStore((s) => s.btnAddIAM);
  const psl = useSessionStore((s) => s.canShowLabels);
  const prt = useSessionStore((s) => s.canReopenTickets);
  const pcc = useSessionStore((s) => s.canCommentClosed);
  const pjt = useSessionStore((s) => s.canRejectTickets);
  const pap = useSessionStore((s) => s.canAddParticipant);
  const ppd = useSessionStore((s) => s.canAddProduct);
  const pae = useSessionStore((s) => s.canAdelantar);
  const pg = useSessionStore((s) => s.canGuardias);
  const pug = useSessionStore((s) => s.canAddUserToGroup);

  // ── Acciones de UI — leer directamente del store (funciones estables)
  // Las funciones de Zustand son referencias estables — no necesitan memo
  const showSuccessToast = useUiStore((s) => s.showSuccessToast);
  const showErrorToast = useUiStore((s) => s.showErrorToast);
  const showLoadingToast = useUiStore((s) => s.showLoadingToast);
  const showInfoToast = useUiStore((s) => s.showInfoToast);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const dismissLoadingToasts = useUiStore((s) => s.dismissLoadingToasts);
  const openModal = useUiStore((s) => s.openModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const closeAllModals = useUiStore((s) => s.closeAllModals);
  const isModalOpen = useUiStore((s) => s.isModalOpen);

  // useMemo para estabilizar los objetos de contexto —
  // solo se recrean cuando cambian los primitivos que los componen
  const sessionValue = useMemo<SessionContextValue>(
    () => ({
      isHydrated,
      userRole,
      userName,
      userEmail,
      profileId,
      groups,
      teamArea,
      versionBlocked,
      userConfig,
      workSchedule,
      permissions: {
        btnDashboard: pd,
        btnComments: pc,
        btnReports: pr,
        btnReassignApp: pra,
        btnAddIAM: pi,
        canShowLabels: psl,
        canReopenTickets: prt,
        canCommentClosed: pcc,
        canRejectTickets: pjt,
        canAddParticipant: pap,
        canAddProduct: ppd,
        canAdelantar: pae,
        canGuardias: pg,
        canAddUserToGroup: pug,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isHydrated,
      userRole,
      userName,
      userEmail,
      profileId,
      groups,
      teamArea,
      versionBlocked,
      userConfig,
      workSchedule,
      pd,
      pc,
      pr,
      pra,
      pi,
      psl,
      prt,
      pcc,
      pjt,
      pap,
      ppd,
      pae,
      pg,
      pug,
    ],
  );

  const uiValue = useMemo<UiContextValue>(
    () => ({
      showSuccessToast,
      showErrorToast,
      showLoadingToast,
      showInfoToast,
      dismissToast,
      dismissLoadingToasts,
      openModal,
      closeModal,
      closeAllModals,
      isModalOpen,
    }),
    // Las funciones de Zustand son estables — este memo casi nunca se recrea
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      showSuccessToast,
      showErrorToast,
      showLoadingToast,
      showInfoToast,
      dismissToast,
      dismissLoadingToasts,
      openModal,
      closeModal,
      closeAllModals,
      isModalOpen,
    ],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <UiContext.Provider value={uiValue}>{children}</UiContext.Provider>
    </SessionContext.Provider>
  );
}

// ─── Hooks de consumo ─────────────────────────────────────────

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error("useSession debe usarse dentro de <ExtensionProvider>");
  return ctx;
}

export function useUiActions(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx)
    throw new Error("useUiActions debe usarse dentro de <ExtensionProvider>");
  return ctx;
}

export function usePermissions(): PermissionsSnapshot {
  return useSession().permissions;
}
