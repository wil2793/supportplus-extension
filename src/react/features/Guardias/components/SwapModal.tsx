// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/COMPONENTS/SWAPMODAL.TSX
//
// Modal para solicitar cambio de guardia.
// Reemplaza showSwapModal() del vanilla.
// Estado de form y loading en guardiasStore + modalStore.
// ============================================================

import { useRef } from "react";
import { FormModal } from "../../../components/Modal/variants/FormModal";
import { useGuardiasStore } from "../../../store/guardiasStore";
import { useModalStore } from "../../../store/modalStore";
import { useUiStore } from "../../../store/uiStore";
import {
  sendSwapRequest,
} from "../hooks/useGuardias";

const MODAL_ID = "sp-guardia-swap-modal";

export function SwapModal() {
  const activeModal  = useGuardiasStore((s) => s.activeModal);
  const selectedDay  = useGuardiasStore((s) => s.selectedDay);
  const myDays       = useGuardiasStore((s) => s.myDays);
  const currentUser  = useGuardiasStore((s) => s.currentUser);
  const monthOffset  = useGuardiasStore((s) => s.monthOffset);
  const closeModal   = useGuardiasStore((s) => s.closeModal);
  const { setLoading, setFeedback, resetModal } = useModalStore.getState();
  const showSuccess  = useUiStore((s) => s.showSuccessToast);
  const showError    = useUiStore((s) => s.showErrorToast);

  // Refs para los inputs del formulario (evita estado local)
  const selectRef  = useRef<HTMLSelectElement>(null);
  const motivoRef  = useRef<HTMLTextAreaElement>(null);

  const isOpen = activeModal === "swap" && !!selectedDay;

  const handleClose = () => {
    resetModal(MODAL_ID);
    closeModal();
  };

  const handleSubmit = async () => {
    const myDayId = selectRef.current?.value ?? "";
    const motivo  = motivoRef.current?.value.trim() ?? "";

    if (!myDayId) {
      setFeedback(MODAL_ID, "Selecciona uno de tus días", "#C62828");
      return;
    }
    if (!motivo) {
      setFeedback(MODAL_ID, "Escribe un motivo", "#C62828");
      return;
    }

    setLoading(MODAL_ID, true, "Enviando solicitud...");

    const ok = await sendSwapRequest(
      {
        motivoCambio: motivo,
        fkIdControlGuardiaSolicitado: selectedDay!.guardiaId,
        fkIdControlGuardiaOfrecido: parseInt(myDayId),
      },
      currentUser.userId,
    );

    setLoading(MODAL_ID, false);

    if (ok) {
      showSuccess("Solicitud de cambio enviada");
      handleClose();
      // Re-fetch del mes actual
      useGuardiasStore.getState().setMonthOffset(monthOffset);
    } else {
      showError("Error al enviar la solicitud");
    }
  };

  if (!isOpen || !selectedDay) return null;

  return (
    <FormModal
      id={MODAL_ID}
      title="🔄 Solicitar cambio de guardia"
      submitText="Enviar solicitud"
      cancelText="Cancelar"
      maxWidth="420px"
      isOpen={isOpen}
      onClose={handleClose}
      onSubmit={handleSubmit}
    >
      <p style={{ fontSize: 13, color: "#555", margin: "0 0 12px" }}>
        Solicitarás cambiar el día{" "}
        <strong>{selectedDay.date}</strong>{" "}
        ({selectedDay.name}) por uno de tus días.
      </p>

      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
        ¿Por cuál de tus días lo cambias?
      </label>
      <select
        ref={selectRef}
        defaultValue=""
        style={{
          width: "100%",
          padding: "8px",
          border: "1px solid #ddd",
          borderRadius: 6,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <option value="">-- Selecciona tu día --</option>
        {myDays.map((d) => (
          <option key={d.id} value={d.id}>
            {d.date}
          </option>
        ))}
      </select>

      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
        Motivo del cambio
      </label>
      <textarea
        ref={motivoRef}
        placeholder="Escribe el motivo..."
        style={{
          width: "100%",
          padding: 8,
          border: "1px solid #ddd",
          borderRadius: 6,
          fontSize: 13,
          minHeight: 60,
          resize: "vertical",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />
    </FormModal>
  );
}
