// ============================================================
// SRC/REACT/COMPONENTS/MODAL/INDEX.TS
// ============================================================

// Componentes base
export { Modal } from "./Modal";
export { ModalButton } from "./ModalButton";

// Variantes
export { ConfirmModal } from "./variants/ConfirmModal";
export { FormModal } from "./variants/FormModal";
export { InfoModal } from "./variants/InfoModal";
export { SuccessModal } from "./variants/SuccessModal";

// Tipos
export type {
  ModalProps,
  ModalButtonProps,
  ButtonVariant,
  ConfirmModalProps,
  FormModalProps,
  InfoModalProps,
  SuccessModalProps,
  SuccessModalButton,
} from "./Modal.types";
