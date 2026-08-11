// ============================================================
// SRC/REACT/COMPONENTS/MODAL/VARIANTS/INFOMODAL.TSX
//
// Equivalente React de infoModal() de modal-builder.ts.
// Solo muestra contenido con un botón de cierre opcional.
// ============================================================

import { Modal } from "../Modal";
import type { InfoModalProps } from "../Modal.types";

export function InfoModal({
  id,
  title,
  children,
  maxWidth = "500px",
  isOpen,
  onClose,
  modalOptions,
}: InfoModalProps) {
  return (
    <Modal
      id={id}
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={maxWidth}
      {...modalOptions}
    >
      {children}
    </Modal>
  );
}
