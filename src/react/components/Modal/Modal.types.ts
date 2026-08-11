// ============================================================
// SRC/REACT/COMPONENTS/MODAL/MODAL.TYPES.TS
// Tipos compartidos por todos los componentes del sistema modal
// ============================================================

import type { ReactNode } from "react";

// ─── Variantes de botón ───────────────────────────────────────

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "warning";

// ─── Props del Modal base ─────────────────────────────────────

export interface ModalProps {
  /** ID único del modal en el DOM */
  id: string;
  /** Título del header */
  title?: string;
  /** Contenido del body */
  children: ReactNode;
  /** Controla visibilidad desde el store */
  isOpen: boolean;
  /** Callback al cerrar (X, backdrop, ESC) */
  onClose: () => void;

  // ── Layout ──────────────────────────────────────────────────
  maxWidth?: string;
  width?: string;
  height?: string;
  maxHeight?: string;
  /** Si el body tiene overflow-y: auto */
  scroll?: boolean;
  zIndex?: number;
  textAlign?: string;
  padding?: string;

  // ── Comportamiento ──────────────────────────────────────────
  /** Cerrar al hacer click en el overlay */
  closeOnBackdrop?: boolean;
  /** Blur en el backdrop */
  blur?: boolean;
  /** Mostrar header con título y botón X */
  showHeader?: boolean;
  /** Elementos adicionales en el header (JSX) */
  headerActions?: ReactNode;
  /** Clase CSS extra en el box del modal */
  customClass?: string;
}

// ─── Props del ModalButton ────────────────────────────────────

export interface ModalButtonProps {
  variant?: ButtonVariant;
  /** Muestra spinner y deshabilita el botón */
  loading?: boolean;
  /** Texto mientras loading=true */
  loadingText?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  /** Color de fondo override (solo para primary) */
  color?: string;
  style?: React.CSSProperties;
}

// ─── Props de variantes ───────────────────────────────────────

export interface ConfirmModalProps {
  id: string;
  title: string;
  message: string;
  description?: string;
  /** Contenido extra debajo del mensaje (JSX) */
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  maxWidth?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export interface FormModalProps {
  id: string;
  title: string;
  /** Contenido del formulario (JSX) */
  children: ReactNode;
  submitText?: string;
  submitColor?: string;
  cancelText?: string;
  maxWidth?: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  modalOptions?: Partial<ModalProps>;
}

export interface InfoModalProps {
  id: string;
  title: string;
  /** Contenido informativo (JSX) */
  children: ReactNode;
  closeText?: string;
  maxWidth?: string;
  isOpen: boolean;
  onClose: () => void;
  modalOptions?: Partial<ModalProps>;
}

export interface SuccessModalButton {
  text: string;
  color?: string;
  variant?: ButtonVariant;
  onClick?: () => void;
}

export interface SuccessModalProps {
  id: string;
  title: string;
  message: string;
  buttons?: SuccessModalButton[];
  maxWidth?: string;
  isOpen: boolean;
  onClose: () => void;
}
