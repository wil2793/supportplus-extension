// ============================================================
// SRC/REACT/COMPONENTS/MODAL/VARIANTS/SUCCESSMODAL.TSX
//
// Equivalente React de successModal() de modal-builder.ts.
// Muestra un mensaje de éxito con uno o más botones de acción.
// ============================================================

import { Modal } from "../Modal";
import { ModalButton } from "../ModalButton";
import type { SuccessModalProps } from "../Modal.types";

const DEFAULT_BUTTONS: SuccessModalProps["buttons"] = [
  { text: "Aceptar", color: "#2E7D32", variant: "success" },
];

export function SuccessModal({
  id,
  title,
  message,
  buttons = DEFAULT_BUTTONS,
  maxWidth = "360px",
  isOpen,
  onClose,
}: SuccessModalProps) {
  return (
    <Modal
      id={id}
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={maxWidth}
      textAlign="center"
      closeOnBackdrop={false}
    >
      <p style={{ fontSize: 14, color: "#555", margin: "0 0 16px" }}>
        {message}
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        {buttons?.map((btn, idx) => (
          <ModalButton
            key={idx}
            variant={btn.variant ?? (idx === 0 ? "success" : "secondary")}
            color={btn.color}
            onClick={() => {
              if (btn.onClick) btn.onClick();
              else onClose();
            }}
          >
            {btn.text}
          </ModalButton>
        ))}
      </div>
    </Modal>
  );
}
