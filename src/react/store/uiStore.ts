// ============================================================
// SRC/REACT/STORE/UISTORE.TS - Zustand store de estado UI global
//
// Maneja toasts, modales activos y cualquier estado visual
// que necesite coordinarse entre componentes no relacionados
// en el árbol de React.
// ============================================================

import { create } from "zustand";

// ─── Tipos ────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "loading" | "info";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Duración en ms antes de auto-dismiss. 0 = permanente (para 'loading') */
  duration: number;
}

export interface ActiveModal {
  id: string;
  /** Permite pasarle datos arbitrarios al modal desde quien lo abre */
  payload?: unknown;
}

// ─── Estado ───────────────────────────────────────────────────

interface UiStoreState {
  toasts: ToastItem[];
  activeModals: ActiveModal[];
}

// ─── Acciones ─────────────────────────────────────────────────

interface UiStoreActions {
  // ── Toasts ─────────────────────────────────────────────────

  /** Muestra un toast de éxito. Se auto-descarta a los 3s */
  showSuccessToast: (message: string) => void;

  /** Muestra un toast de error. Se auto-descarta a los 4s */
  showErrorToast: (message: string) => void;

  /** Muestra un toast de carga (spinner). No se auto-descarta */
  showLoadingToast: (message: string) => string;

  /** Muestra un toast informativo. Se auto-descarta a los 3s */
  showInfoToast: (message: string) => void;

  /** Descarta un toast por su ID */
  dismissToast: (id: string) => void;

  /** Descarta todos los toasts de tipo 'loading' */
  dismissLoadingToasts: () => void;

  // ── Modales ────────────────────────────────────────────────

  /** Registra un modal como activo */
  openModal: (id: string, payload?: unknown) => void;

  /** Elimina un modal de la lista de activos */
  closeModal: (id: string) => void;

  /** Cierra todos los modales activos */
  closeAllModals: () => void;

  /** Verifica si un modal específico está abierto */
  isModalOpen: (id: string) => boolean;
}

type UiStore = UiStoreState & UiStoreActions;

// ─── Generador de IDs únicos ──────────────────────────────────

let _toastCounter = 0;
function nextToastId(): string {
  _toastCounter += 1;
  return `sp-toast-${Date.now()}-${_toastCounter}`;
}

// ─── Store ────────────────────────────────────────────────────

export const useUiStore = create<UiStore>()((set, get) => ({
  toasts: [],
  activeModals: [],

  // ── Toasts ───────────────────────────────────────────────

  showSuccessToast: (message) => {
    // Elimina toasts de loading previos (consistente con comportamiento vanilla)
    const id = nextToastId();
    set((prev) => ({
      toasts: [
        ...prev.toasts.filter((t) => t.variant !== "loading"),
        { id, message, variant: "success", duration: 3000 },
      ],
    }));
  },

  showErrorToast: (message) => {
    const id = nextToastId();
    set((prev) => ({
      toasts: [
        ...prev.toasts.filter((t) => t.variant !== "loading"),
        { id, message, variant: "error", duration: 4000 },
      ],
    }));
  },

  showLoadingToast: (message) => {
    const id = nextToastId();
    // Solo puede haber un loading toast a la vez
    set((prev) => ({
      toasts: [
        ...prev.toasts.filter((t) => t.variant !== "loading"),
        { id, message, variant: "loading", duration: 0 },
      ],
    }));
    return id;
  },

  showInfoToast: (message) => {
    const id = nextToastId();
    set((prev) => ({
      toasts: [
        ...prev.toasts,
        { id, message, variant: "info", duration: 3000 },
      ],
    }));
  },

  dismissToast: (id) =>
    set((prev) => ({
      toasts: prev.toasts.filter((t) => t.id !== id),
    })),

  dismissLoadingToasts: () =>
    set((prev) => ({
      toasts: prev.toasts.filter((t) => t.variant !== "loading"),
    })),

  // ── Modales ──────────────────────────────────────────────

  openModal: (id, payload) => {
    // No duplicar si ya está abierto
    const already = get().activeModals.some((m) => m.id === id);
    if (already) return;
    set((prev) => ({
      activeModals: [...prev.activeModals, { id, payload }],
    }));
  },

  closeModal: (id) =>
    set((prev) => ({
      activeModals: prev.activeModals.filter((m) => m.id !== id),
    })),

  closeAllModals: () => set({ activeModals: [] }),

  isModalOpen: (id) => get().activeModals.some((m) => m.id === id),
}));

// ─── Selectores tipados ───────────────────────────────────────

export const selectToasts = (s: UiStore): ToastItem[] => s.toasts;
export const selectActiveModals = (s: UiStore): ActiveModal[] => s.activeModals;

/** Selector de acciones de toast — estable, no causa re-renders */
export const selectToastActions = (s: UiStore) => ({
  showSuccessToast: s.showSuccessToast,
  showErrorToast: s.showErrorToast,
  showLoadingToast: s.showLoadingToast,
  showInfoToast: s.showInfoToast,
  dismissToast: s.dismissToast,
  dismissLoadingToasts: s.dismissLoadingToasts,
});

/** Selector de acciones de modal — estable, no causa re-renders */
export const selectModalActions = (s: UiStore) => ({
  openModal: s.openModal,
  closeModal: s.closeModal,
  closeAllModals: s.closeAllModals,
  isModalOpen: s.isModalOpen,
});
