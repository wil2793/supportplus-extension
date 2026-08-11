// ============================================================
// SRC/REACT/STORE/REPORTSSTORE.TS
//
// Zustand store para el modal de exportación CSV de reportes.
// Maneja grupos seleccionados, modo de fecha y estado de generación.
// ============================================================

import { create } from "zustand";
import { SP_CONFIG } from "../../config";

// ─── Tipos ────────────────────────────────────────────────────

export type ReportMode = "month" | "range";

export interface ReportGroup {
  id: number;
  name: string;
}

export interface ReportMonthRange {
  month: number; // 0-indexed
  year: number;
}

export interface ReportCustomRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

// ─── Helpers de fecha ─────────────────────────────────────────

function currentMonthRange(): ReportMonthRange {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

function currentCustomRange(): ReportCustomRange {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const firstDay = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  return { from: firstDay, to: today };
}

// ─── Store ────────────────────────────────────────────────────

interface ReportsStoreState {
  /** Grupos del usuario disponibles */
  availableGroups: ReportGroup[];
  /** IDs de grupos seleccionados como string para compatibilidad con checkbox */
  selectedGroupIds: string[];
  mode: ReportMode;
  monthRange: ReportMonthRange;
  customRange: ReportCustomRange;
  loading: boolean;
  rangeError: string;
}

interface ReportsStoreActions {
  /** Inicializa los grupos disponibles desde chrome.storage */
  initGroups: (groups: ReportGroup[]) => void;
  toggleGroup: (id: string) => void;
  selectAllGroups: () => void;
  deselectAllGroups: () => void;
  setMode: (mode: ReportMode) => void;
  setMonthRange: (range: ReportMonthRange) => void;
  setCustomRange: (range: ReportCustomRange) => void;
  setLoading: (loading: boolean) => void;
  setRangeError: (err: string) => void;
  /** Resuelve el rango de fechas a strings ISO para la API */
  resolveApiRange: () => { from: string; to: string } | null;
}

type ReportsStore = ReportsStoreState & ReportsStoreActions;

export const useReportsStore = create<ReportsStore>()((set, get) => ({
  availableGroups:  [],
  selectedGroupIds: [],
  mode:             "month",
  monthRange:       currentMonthRange(),
  customRange:      currentCustomRange(),
  loading:          false,
  rangeError:       "",

  initGroups: (groups) =>
    set({
      availableGroups:  groups,
      selectedGroupIds: groups.map((g) => String(g.id)),
    }),

  toggleGroup: (id) =>
    set((prev) => ({
      selectedGroupIds: prev.selectedGroupIds.includes(id)
        ? prev.selectedGroupIds.filter((g) => g !== id)
        : [...prev.selectedGroupIds, id],
    })),

  selectAllGroups: () =>
    set((prev) => ({
      selectedGroupIds: prev.availableGroups.map((g) => String(g.id)),
    })),

  deselectAllGroups: () => set({ selectedGroupIds: [] }),

  setMode: (mode) => set({ mode, rangeError: "" }),

  setMonthRange: (range) => set({ monthRange: range }),

  setCustomRange: (range) => set({ customRange: range }),

  setLoading: (loading) => set({ loading }),

  setRangeError: (err) => set({ rangeError: err }),

  resolveApiRange: () => {
    const { mode, monthRange, customRange } = get();
    const pad = (n: number) => String(n).padStart(2, "0");

    if (mode === "month") {
      const { month, year } = monthRange;
      const lastDay = new Date(year, month + 1, 0).getDate();
      return {
        from: `${year}-${pad(month + 1)}-01T00:00`,
        to:   `${year}-${pad(month + 1)}-${pad(lastDay)}T23:59`,
      };
    }

    // range mode
    if (!customRange.from || !customRange.to) {
      get().setRangeError("Selecciona ambas fechas");
      return null;
    }
    if (customRange.from > customRange.to) {
      get().setRangeError("La fecha inicio no puede ser mayor a la fecha fin");
      return null;
    }
    return {
      from: `${customRange.from}T00:00`,
      to:   `${customRange.to}T23:59`,
    };
  },
}));

// ─── Función para cargar grupos desde storage ─────────────────

export function loadReportGroupsFromStorage(): void {
  chrome.storage.local.get(
    ["usersMap", "userEmail", "groupNames"],
    (stored) => {
      const s = stored as {
        usersMap?: Record<string, { groups?: number[] }>;
        userEmail?: string;
        groupNames?: Record<string, string>;
      };
      const email = (s.userEmail ?? "").toLowerCase();
      const userData = s.usersMap?.[email];
      const userGroups: number[] = userData?.groups ?? [];
      const groupNamesMap = s.groupNames ?? {};

      const groups: ReportGroup[] = userGroups.map((gId) => ({
        id: gId,
        name:
          groupNamesMap[String(gId)] ??
          SP_CONFIG.GROUP_INFO.find((g) => g.id === gId)?.name ??
          `Grupo ${gId}`,
      }));

      useReportsStore.getState().initGroups(groups);
    },
  );
}

// ─── Selectores ───────────────────────────────────────────────

export const selectAvailableGroups  = (s: ReportsStore) => s.availableGroups;
export const selectSelectedGroupIds = (s: ReportsStore) => s.selectedGroupIds;
export const selectMode             = (s: ReportsStore) => s.mode;
export const selectMonthRange       = (s: ReportsStore) => s.monthRange;
export const selectCustomRange      = (s: ReportsStore) => s.customRange;
export const selectReportsLoading   = (s: ReportsStore) => s.loading;
export const selectRangeError       = (s: ReportsStore) => s.rangeError;
