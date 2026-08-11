// ============================================================
// SRC/REACT/STORE/GUARDIASSTORE.TS
//
// Zustand store para el Panel de Guardias.
// Centraliza todo el estado: navegación de mes, entradas del
// calendario, solicitudes pendientes y usuario actual.
// ============================================================

import { create } from "zustand";
import type { GuardiaEntry, GuardiaSolicitud } from "../../types";

// ─── Tipos ────────────────────────────────────────────────────

export interface GuardiaCurrentUser {
  name: string;
  userId: string;
}

/** Identifica qué celda está seleccionada para abrir un modal */
export interface SelectedGuardiaDay {
  guardiaId: number;
  date: string;
  name: string;
  /** Solicitud pendiente asociada al día seleccionado (si existe) */
  pendingSolicitud: GuardiaSolicitud | null;
}

interface GuardiasStoreState {
  // ── Navegación ──────────────────────────────────────────────
  monthOffset: number;

  // ── Datos del calendario ────────────────────────────────────
  /** Mapa fecha → nombre de guardia */
  entries: Record<string, string>;
  rawEntries: GuardiaEntry[];
  /** Días donde el usuario actual está de guardia */
  myDays: GuardiaEntry[];
  /** Solicitudes de cambio pendientes */
  pending: GuardiaSolicitud[];

  // ── Usuario actual ──────────────────────────────────────────
  currentUser: GuardiaCurrentUser;

  // ── UI ──────────────────────────────────────────────────────
  loading: boolean;
  /** Día seleccionado para abrir swap o accept modal */
  selectedDay: SelectedGuardiaDay | null;
  /** Qué modal está activo */
  activeModal: "swap" | "accept" | null;
}

interface GuardiasStoreActions {
  // Navegación
  setMonthOffset: (offset: number) => void;
  prevMonth: () => void;
  nextMonth: () => void;

  // Hidratación de datos tras fetch
  setCalendarData: (
    entries: Record<string, string>,
    rawEntries: GuardiaEntry[],
    pending: GuardiaSolicitud[]
  ) => void;

  // Usuario
  setCurrentUser: (user: GuardiaCurrentUser) => void;

  // UI
  setLoading: (loading: boolean) => void;
  openSwapModal: (day: Omit<SelectedGuardiaDay, "pendingSolicitud">) => void;
  openAcceptModal: (day: SelectedGuardiaDay) => void;
  closeModal: () => void;
}

type GuardiasStore = GuardiasStoreState & GuardiasStoreActions;

// ─── Store ────────────────────────────────────────────────────

export const useGuardiasStore = create<GuardiasStore>()((set, get) => ({
  // ── Estado inicial ─────────────────────────────────────────
  monthOffset: 0,
  entries: {},
  rawEntries: [],
  myDays: [],
  pending: [],
  currentUser: { name: "", userId: "" },
  loading: false,
  selectedDay: null,
  activeModal: null,

  // ── Navegación ─────────────────────────────────────────────
  setMonthOffset: (offset) => set({ monthOffset: offset }),
  prevMonth: () => set((s) => ({ monthOffset: s.monthOffset - 1 })),
  nextMonth: () => set((s) => ({ monthOffset: s.monthOffset + 1 })),

  // ── Datos ──────────────────────────────────────────────────
  setCalendarData: (entries, rawEntries, pending) => {
    const { currentUser } = get();
    const myDays = rawEntries.filter((e) => e.userId === currentUser.userId);
    set({ entries, rawEntries, myDays, pending });
  },

  // ── Usuario ────────────────────────────────────────────────
  setCurrentUser: (user) => set({ currentUser: user }),

  // ── UI ─────────────────────────────────────────────────────
  setLoading: (loading) => set({ loading }),

  openSwapModal: (day) =>
    set({
      selectedDay: { ...day, pendingSolicitud: null },
      activeModal: "swap",
    }),

  openAcceptModal: (day) =>
    set({
      selectedDay: day,
      activeModal: "accept",
    }),

  closeModal: () => set({ selectedDay: null, activeModal: null }),
}));

// ─── Selectores ───────────────────────────────────────────────

export const selectMonthOffset     = (s: GuardiasStore) => s.monthOffset;
export const selectEntries         = (s: GuardiasStore) => s.entries;
export const selectRawEntries      = (s: GuardiasStore) => s.rawEntries;
export const selectMyDays          = (s: GuardiasStore) => s.myDays;
export const selectPending         = (s: GuardiasStore) => s.pending;
export const selectCurrentUser     = (s: GuardiasStore) => s.currentUser;
export const selectLoading         = (s: GuardiasStore) => s.loading;
export const selectSelectedDay     = (s: GuardiasStore) => s.selectedDay;
export const selectActiveModal     = (s: GuardiasStore) => s.activeModal;
