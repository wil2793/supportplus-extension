// ============================================================
// SRC/REACT/COMPONENTS/MODAL/VARIANTS/FORMMODAL.TSX
//
// Equivalente React de formModal() de modal-builder.ts.
// El contenido del formulario se pasa como children (JSX),
// reemplazando la interpolación de HTML strings del original.
// ============================================================

import { useEffect } from "react";
import { Modal } from "../Modal";
import { ModalButton } from "../ModalButton";
import { useModalStore, selectModal } from "../../../store/modalStore";
import type { FormModalProps } from "../Modal.types";

export function FormModal({
  id,
  title,
  children,
  submitText = "Guardar",
  submitColor = "#1976D2",
  cancelText = "Cancelar",
  maxWidth = "480px",
  isOpen,
  onClose,
  onSubmit,
  modalOptions,
}: FormModalProps) {
  const { initModal, destroyModal, setLoading, resetModal } =
    useModalStore.getState();

  const modalState = useModalStore(selectModal(id));

  useEffect(() => {
    initModal(id);
    return () => destroyModal(id);
  }, [id, initModal, destroyModal]);

  useEffect(() => {
    if (isOpen) resetModal(id);
  }, [isOpen, id, resetModal]);

  const handleSubmit = async () => {
    setLoading(id, true, "Procesando...");
    try {
      await onSubmit();
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
      closeOnBackdrop={!modalState.loading}
      {...modalOptions}
    >
      {/* Contenido del formulario (JSX pasado como children) */}
      {children}

      {/* Feedback de error/éxito si existe */}
      {modalState.feedbackMessage && (
        <p
          style={{
            fontSize: 13,
            color: modalState.feedbackColor,
            margin: "12px 0 0",
          }}
        >
          {modalState.feedbackMessage}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <ModalButton
          variant="primary"
          color={submitColor}
          loading={modalState.loading}
          loadingText={modalState.loadingText}
          onClick={() => { void handleSubmit(); }}
        >
          {submitText}
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
