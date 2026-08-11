// ============================================================
// SRC/REACT/STORE/MODALSTORE.TS
//
// Zustand store para el estado interno de cada modal:
// loading, mensaje de feedback y visibilidad.
//
// Cada modal tiene su propia "slice" identificada por su ID,
// evitando que el estado de un modal contamine a otro.
// ============================================================

import { create } from "zustand";

// ─── Tipos ────────────────────────────────────────────────────

export interface ModalState {
  /** El modal está realizando una operación async */
  loading: boolean;
  /** Texto del spinner mientras loading=true */
  loadingText: string;
  /** Mensaje de feedback (éxito/error) bajo el contenido */
  feedbackMessage: string;
  /** Color del mensaje de feedback */
  feedbackColor: string;
}

interface ModalStoreState {
  /** Mapa de estados por ID de modal */
  modals: Record<string, ModalState>;
}

interface ModalStoreActions {
  /** Inicializa el estado de un modal (al montarlo) */
  initModal: (id: string) => void;

  /** Limpia el estado de un modal (al desmontarlo) */
  destroyModal: (id: string) => void;

  /** Activa el estado de carga en un modal */
  setLoading: (id: string, loading: boolean, text?: string) => void;

  /** Escribe un mensaje de feedback en el modal */
  setFeedback: (id: string, message: string, color?: string) => void;

  /** Limpia el mensaje de feedback */
  clearFeedback: (id: string) => void;

  /** Resetea todo el estado de un modal a sus defaults */
  resetModal: (id: string) => void;
}

type ModalStore = ModalStoreState & ModalStoreActions;

// ─── Estado inicial de un modal ───────────────────────────────

const DEFAULT_MODAL_STATE: ModalState = {
  loading: false,
  loadingText: "Procesando...",
  feedbackMessage: "",
  feedbackColor: "#555",
};

// ─── Store ────────────────────────────────────────────────────

export const useModalStore = create<ModalStore>()((set) => ({
  modals: {},

  initModal: (id) =>
    set((prev) => ({
      modals: {
        ...prev.modals,
        [id]: prev.modals[id] ?? { ...DEFAULT_MODAL_STATE },
      },
    })),

  destroyModal: (id) =>
    set((prev) => {
      const next = { ...prev.modals };
      delete next[id];
      return { modals: next };
    }),

  setLoading: (id, loading, text) =>
    set((prev) => ({
      modals: {
        ...prev.modals,
        [id]: {
          ...(prev.modals[id] ?? DEFAULT_MODAL_STATE),
          loading,
          loadingText: text ?? prev.modals[id]?.loadingText ?? "Procesando...",
        },
      },
    })),

  setFeedback: (id, message, color = "#555") =>
    set((prev) => ({
      modals: {
        ...prev.modals,
        [id]: {
          ...(prev.modals[id] ?? DEFAULT_MODAL_STATE),
          feedbackMessage: message,
          feedbackColor: color,
        },
      },
    })),

  clearFeedback: (id) =>
    set((prev) => ({
      modals: {
        ...prev.modals,
        [id]: {
          ...(prev.modals[id] ?? DEFAULT_MODAL_STATE),
          feedbackMessage: "",
          feedbackColor: "#555",
        },
      },
    })),

  resetModal: (id) =>
    set((prev) => ({
      modals: {
        ...prev.modals,
        [id]: { ...DEFAULT_MODAL_STATE },
      },
    })),
}));

// ─── Selector helper ──────────────────────────────────────────

/** Obtiene el estado de un modal por ID, con defaults si no existe */
export const selectModal =
  (id: string) =>
  (s: ModalStore): ModalState =>
    s.modals[id] ?? DEFAULT_MODAL_STATE;

/** Acceso directo al store fuera de componentes React */
export const getModalStore = () => useModalStore.getState();
