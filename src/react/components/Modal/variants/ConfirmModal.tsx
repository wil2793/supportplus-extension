// ============================================================
// SRC/REACT/COMPONENTS/MODAL/VARIANTS/CONFIRMMODAL.TSX
//
// Equivalente React de confirmModal() de modal-builder.ts.
// Estado de loading y feedback viven en modalStore (Zustand).
// ============================================================

import { useEffect } from "react";
import { Modal } from "../Modal";
import { ModalButton } from "../ModalButton";
import { useModalStore, selectModal } from "../../../store/modalStore";
import type { ConfirmModalProps } from "../Modal.types";

export function ConfirmModal({
  id,
  title,
  message,
  description,
  children,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmColor = "#1976D2",
  maxWidth = "420px",
  isOpen,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const { initModal, destroyModal, setLoading, clearFeedback, resetModal } =
    useModalStore.getState();

  const modalState = useModalStore(selectModal(id));

  // Inicializa/limpia la slice del store al montar/desmontar
  useEffect(() => {
    initModal(id);
    return () => destroyModal(id);
  }, [id, initModal, destroyModal]);

  // Resetea el estado cuando el modal se abre de nuevo
  useEffect(() => {
    if (isOpen) resetModal(id);
  }, [isOpen, id, resetModal]);

  const handleConfirm = async () => {
    setLoading(id, true, "Procesando...");
    clearFeedback(id);
    try {
      await onConfirm();
    } finally {
      setLoading(id, false);
    }
  };

  return (
    <Modal
      id={id}
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={maxWidth}
      textAlign="center"
      closeOnBackdrop={!modalState.loading}
    >
      <p style={{ fontSize: 14, color: "#555", margin: "0 0 8px" }}>
        {message}
      </p>

      {description && (
        <p style={{ fontSize: 13, color: "#888", margin: "0 0 20px" }}>
          {description}
        </p>
      )}

      {/* Contenido extra opcional (ej. bloque de motivo) */}
      {children}

      {modalState.feedbackMessage && (
        <p
          style={{
            fontSize: 13,
            color: modalState.feedbackColor,
            margin: "0 0 12px",
            minHeight: 20,
          }}
        >
          {modalState.feedbackMessage}
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <ModalButton
          variant="primary"
          color={confirmColor}
          loading={modalState.loading}
          loadingText={modalState.loadingText}
          onClick={() => {
            void handleConfirm();
          }}
        >
          {confirmText}
        </ModalButton>

        {!modalState.loading && (
          <ModalButton variant="secondary" onClick={onClose}>
            {cancelText}
          </ModalButton>
        )}
      </div>
    </Modal>
  );
}
