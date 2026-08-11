// ============================================================
// SRC/REACT/STORE/DASHBOARDSTORE.TS
//
// Zustand store para el Dashboard de tickets cerrados.
// Maneja datos, rango de fechas, grupo seleccionado y cache.
// ============================================================

import { create } from "zustand";

// ─── Tipos ────────────────────────────────────────────────────

export interface DashboardTicket {
  responsibleName?: string;
  ticketStatusName?: string;
  [key: string]: unknown;
}

export interface DashboardDateRange {
  from: string;
  to: string;
}

interface DashboardCache {
  data: DashboardTicket[];
  from: string;
  to: string;
  groupId: number | string;
  ts: number;
}

const CACHE_KEY = "sp_dashboard_cache";

// ─── Helpers de cache local (localStorage) ────────────────────

function loadFromLocalStorage(): DashboardCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCache;
    // Invalidar si no es del día de hoy
    if (new Date(parsed.ts).toDateString() !== new Date().toDateString()) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveToLocalStorage(cache: DashboardCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignorar errores de cuota
  }
}

function clearLocalStorage(): void {
  localStorage.removeItem(CACHE_KEY);
}

// ─── Estado inicial ───────────────────────────────────────────

function defaultDateRange(): DashboardDateRange {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01T00:00`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:59`,
  };
}

// ─── Store ────────────────────────────────────────────────────

interface DashboardStoreState {
  tickets: DashboardTicket[];
  dateRange: DashboardDateRange;
  groupId: number | string;
  loading: boolean;
  hasData: boolean;
}

interface DashboardStoreActions {
  setTickets: (tickets: DashboardTicket[], from: string, to: string, groupId: number | string) => void;
  setDateRange: (range: DashboardDateRange) => void;
  setGroupId: (groupId: number | string) => void;
  setLoading: (loading: boolean) => void;
  clearCache: () => void;
  loadCachedData: () => boolean;
  loadGroupCache: (groupId: number | string) => boolean;
}

type DashboardStore = DashboardStoreState & DashboardStoreActions;

// Hidratar desde localStorage al crear el store
const cached = loadFromLocalStorage();

export const useDashboardStore = create<DashboardStore>()((set) => ({
  tickets:   cached?.data ?? [],
  dateRange: cached ? { from: cached.from, to: cached.to } : defaultDateRange(),
  groupId:   cached?.groupId ?? "",
  loading:   false,
  hasData:   (cached?.data?.length ?? 0) > 0,

  setTickets: (tickets, from, to, groupId) => {
    saveToLocalStorage({ data: tickets, from, to, groupId, ts: Date.now() });
    set({ tickets, dateRange: { from, to }, groupId, hasData: tickets.length > 0 });
  },

  setDateRange: (range) => set({ dateRange: range }),
  setGroupId:   (groupId) => set({ groupId }),
  setLoading:   (loading) => set({ loading }),

  clearCache: () => {
    clearLocalStorage();
    set({ tickets: [], hasData: false });
  },

  loadCachedData: () => {
    const c = loadFromLocalStorage();
    if (!c?.data?.length) return false;
    set({ tickets: c.data, dateRange: { from: c.from, to: c.to }, groupId: c.groupId, hasData: true });
    return true;
  },

  loadGroupCache: (groupId) => {
    const c = loadFromLocalStorage();
    if (!c?.data?.length || String(c.groupId) !== String(groupId)) return false;
    set({ tickets: c.data, dateRange: { from: c.from, to: c.to }, groupId: c.groupId, hasData: true });
    return true;
  },
}));

// ─── Selectores ───────────────────────────────────────────────

export const selectTickets    = (s: DashboardStore) => s.tickets;
export const selectDateRange  = (s: DashboardStore) => s.dateRange;
export const selectGroupId    = (s: DashboardStore) => s.groupId;
export const selectLoading    = (s: DashboardStore) => s.loading;
export const selectHasData    = (s: DashboardStore) => s.hasData;
