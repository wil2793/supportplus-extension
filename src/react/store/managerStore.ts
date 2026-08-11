// ============================================================
// SRC/REACT/STORE/MANAGERSTORE.TS
//
// Zustand store para el Panel Manager/Kanban.
// Centraliza grupos, perfiles, tickets por columna,
// summaries de conteo y estado de drag & drop.
// ============================================================

import { create } from "zustand";
import type { SpTicket, SpProfile, PendingCloseTicket, GroupInfo } from "../../types";

// ─── Tipos ────────────────────────────────────────────────────

/** Identifica una columna: profileId numérico, "unassigned" o "closed" */
export type ColumnId = number | "unassigned" | "closed" | "pending";

export interface ManagerColumn {
  id: ColumnId;
  groupId: number;
  tickets: SpTicket[];
  loading: boolean;
}

export interface GroupSectionState {
  groupId: number;
  groupName: string;
  /** Columnas cargadas para este grupo */
  columns: Record<string, ManagerColumn>;
  /** El panel está expandido */
  expanded: boolean;
  /** El fetch inicial ya ocurrió */
  loaded: boolean;
}

// ─── Estado ───────────────────────────────────────────────────

interface ManagerStoreState {
  /** Grupos del usuario */
  groups: GroupInfo[];
  /** Perfiles (analistas) por groupId */
  profiles: Record<number, SpProfile[]>;
  /** Estado de cada sección de grupo */
  sections: Record<number, GroupSectionState>;
  /** Conteo de tickets asignados por grupo (para summary) */
  summaryCounts: Record<number, number>;
  /** Tickets pendientes de cierre */
  pendingClose: PendingCloseTicket[];
  /** Grupos visibles en summary (vacío = todos) */
  summaryFilter: string[];
  /** Grupos visibles en secciones (vacío = todos) */
  sectionFilter: string[];
  /** Id del ticket que se está arrastrando */
  draggingTicketId: string | null;
  /** Columna sobre la que está el cursor durante drag */
  dragOverColumnKey: string | null;
  /** Token de SP para requests */
  spToken: string;
  /** El usuario puede hacer drag (canDrag) */
  canDrag: boolean;
  /** Timestamp del último drop (para evitar click inmediato post-drop) */
  lastDropTime: number;
  /** Blacklist de profileIds */
  blacklist: number[];
}

interface ManagerStoreActions {
  // ── Bootstrap ─────────────────────────────────────────────
  init: (groups: GroupInfo[], spToken: string, canDrag: boolean, blacklist: number[]) => void;

  // ── Perfiles ───────────────────────────────────────────────
  setProfiles: (groupId: number, profiles: SpProfile[]) => void;

  // ── Secciones ──────────────────────────────────────────────
  expandSection: (groupId: number) => void;
  collapseSection: (groupId: number) => void;
  toggleSection: (groupId: number) => void;
  markSectionLoaded: (groupId: number) => void;

  // ── Tickets en columnas ────────────────────────────────────
  setColumnTickets: (groupId: number, columnId: ColumnId, tickets: SpTicket[]) => void;
  setColumnLoading: (groupId: number, columnId: ColumnId, loading: boolean) => void;
  moveTicket: (ticketId: number, fromKey: string, toKey: string) => void;
  revertMove: (ticketId: number, fromKey: string, toKey: string) => void;

  // ── Summary ────────────────────────────────────────────────
  setSummaryCount: (groupId: number, count: number) => void;

  // ── Pending close ──────────────────────────────────────────
  setPendingClose: (tickets: PendingCloseTicket[]) => void;

  // ── Filtros ────────────────────────────────────────────────
  setSummaryFilter: (filter: string[]) => void;
  setSectionFilter: (filter: string[]) => void;

  // ── Drag & Drop ────────────────────────────────────────────
  setDraggingTicket: (ticketId: string | null) => void;
  setDragOverColumn: (key: string | null) => void;
  setLastDropTime: (time: number) => void;
}

type ManagerStore = ManagerStoreState & ManagerStoreActions;

// ─── Helper: clave de columna ─────────────────────────────────

export function columnKey(groupId: number, columnId: ColumnId): string {
  return `${groupId}:${String(columnId)}`;
}

// ─── Store ────────────────────────────────────────────────────

export const useManagerStore = create<ManagerStore>()((set, get) => ({
  groups: [],
  profiles: {},
  sections: {},
  summaryCounts: {},
  pendingClose: [],
  summaryFilter: [],
  sectionFilter: [],
  draggingTicketId: null,
  dragOverColumnKey: null,
  spToken: "",
  canDrag: true,
  lastDropTime: 0,
  blacklist: [],

  // ── Bootstrap ───────────────────────────────────────────────

  init: (groups, spToken, canDrag, blacklist) => {
    const sections: Record<number, GroupSectionState> = {};
    const singleGroup = groups.length === 1;

    groups.forEach((g) => {
      sections[g.id] = {
        groupId: g.id,
        groupName: g.name,
        columns: {},
        expanded: singleGroup,
        loaded: false,
      };
    });
    set({ groups, spToken, canDrag, blacklist, sections });
  },

  // ── Perfiles ────────────────────────────────────────────────

  setProfiles: (groupId, profiles) =>
    set((prev) => ({ profiles: { ...prev.profiles, [groupId]: profiles } })),

  // ── Secciones ───────────────────────────────────────────────

  expandSection: (groupId) =>
    set((prev) => ({
      sections: {
        ...prev.sections,
        [groupId]: { ...prev.sections[groupId]!, expanded: true },
      },
    })),

  collapseSection: (groupId) =>
    set((prev) => ({
      sections: {
        ...prev.sections,
        [groupId]: { ...prev.sections[groupId]!, expanded: false },
      },
    })),

  toggleSection: (groupId) => {
    const current = get().sections[groupId];
    if (!current) return;
    set((prev) => ({
      sections: {
        ...prev.sections,
        [groupId]: { ...current, expanded: !current.expanded },
      },
    }));
  },

  markSectionLoaded: (groupId) =>
    set((prev) => ({
      sections: {
        ...prev.sections,
        [groupId]: { ...prev.sections[groupId]!, loaded: true },
      },
    })),

  // ── Tickets en columnas ─────────────────────────────────────

  setColumnTickets: (groupId, columnId, tickets) => {
    const key = columnKey(groupId, columnId);
    set((prev) => ({
      sections: {
        ...prev.sections,
        [groupId]: {
          ...prev.sections[groupId]!,
          columns: {
            ...prev.sections[groupId]!.columns,
            [key]: {
              id: columnId,
              groupId,
              tickets,
              loading: false,
            },
          },
        },
      },
    }));
  },

  setColumnLoading: (groupId, columnId, loading) => {
    const key = columnKey(groupId, columnId);
    set((prev) => {
      const section = prev.sections[groupId];
      if (!section) return prev;
      return {
        sections: {
          ...prev.sections,
          [groupId]: {
            ...section,
            columns: {
              ...section.columns,
              [key]: {
                ...(section.columns[key] ?? { id: columnId, groupId, tickets: [] }),
                loading,
              },
            },
          },
        },
      };
    });
  },

  moveTicket: (ticketId, fromKey, toKey) =>
    set((prev) => {
      // Parsear groupId de las claves
      const [fromGid] = fromKey.split(":");
      const [toGid] = toKey.split(":");
      if (!fromGid || !toGid) return prev;

      const fromGroupId = parseInt(fromGid);
      const toGroupId   = parseInt(toGid);

      const fromSection = prev.sections[fromGroupId];
      const toSection   = prev.sections[toGroupId];
      if (!fromSection || !toSection) return prev;

      const fromCol = fromSection.columns[fromKey];
      const toCol   = toSection.columns[toKey];
      if (!fromCol || !toCol) return prev;

      const ticket = fromCol.tickets.find((t) => t.id === ticketId);
      if (!ticket) return prev;

      const newFrom = fromCol.tickets.filter((t) => t.id !== ticketId);
      const newTo   = [...toCol.tickets, ticket];

      return {
        sections: {
          ...prev.sections,
          [fromGroupId]: {
            ...fromSection,
            columns: {
              ...fromSection.columns,
              [fromKey]: { ...fromCol, tickets: newFrom },
            },
          },
          [toGroupId]: {
            ...toSection,
            columns: {
              ...toSection.columns,
              [toKey]: { ...toCol, tickets: newTo },
            },
          },
        },
      };
    }),

  revertMove: (ticketId, fromKey, toKey) => {
    // Misma operación pero intercambiando origen y destino
    get().moveTicket(ticketId, toKey, fromKey);
  },

  // ── Summary ─────────────────────────────────────────────────

  setSummaryCount: (groupId, count) =>
    set((prev) => ({ summaryCounts: { ...prev.summaryCounts, [groupId]: count } })),

  // ── Pending close ────────────────────────────────────────────

  setPendingClose: (tickets) => set({ pendingClose: tickets }),

  // ── Filtros ──────────────────────────────────────────────────

  setSummaryFilter: (filter) => set({ summaryFilter: filter }),
  setSectionFilter: (filter) => set({ sectionFilter: filter }),

  // ── Drag & Drop ──────────────────────────────────────────────

  setDraggingTicket: (ticketId) => set({ draggingTicketId: ticketId }),
  setDragOverColumn: (key) => set({ dragOverColumnKey: key }),
  setLastDropTime: (time) => set({ lastDropTime: time }),
}));

// ─── Selectores ───────────────────────────────────────────────

export const selectGroups        = (s: ManagerStore) => s.groups;
export const selectSpToken       = (s: ManagerStore) => s.spToken;
export const selectCanDrag       = (s: ManagerStore) => s.canDrag;
export const selectSections      = (s: ManagerStore) => s.sections;
export const selectSummaryCounts = (s: ManagerStore) => s.summaryCounts;
export const selectPendingClose  = (s: ManagerStore) => s.pendingClose;
export const selectSummaryFilter = (s: ManagerStore) => s.summaryFilter;
export const selectSectionFilter = (s: ManagerStore) => s.sectionFilter;
export const selectDragging      = (s: ManagerStore) => s.draggingTicketId;
export const selectDragOver      = (s: ManagerStore) => s.dragOverColumnKey;
export const selectLastDropTime  = (s: ManagerStore) => s.lastDropTime;
export const selectBlacklist     = (s: ManagerStore) => s.blacklist;
