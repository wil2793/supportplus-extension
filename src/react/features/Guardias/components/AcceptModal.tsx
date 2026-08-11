// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/COMPONENTS/ACCEPTMODAL.TSX
//
// Modal para aceptar o rechazar una solicitud de cambio de guardia.
// Reemplaza showAcceptModal() del vanilla.
// ============================================================

import { ConfirmModal } from "../../../components/Modal/variants/ConfirmModal";
import { useGuardiasStore } from "../../../store/guardiasStore";
import { useUiStore } from "../../../store/uiStore";
import { acceptSwapRequest } from "../hooks/useGuardias";

const MODAL_ID = "sp-guardia-accept-modal";

export function AcceptModal() {
  const activeModal = useGuardiasStore((s) => s.activeModal);
  const selectedDay = useGuardiasStore((s) => s.selectedDay);
  const rawEntries = useGuardiasStore((s) => s.rawEntries);
  const monthOffset = useGuardiasStore((s) => s.monthOffset);
  const closeModal = useGuardiasStore((s) => s.closeModal);
  const showSuccess = useUiStore((s) => s.showSuccessToast);
  const showError = useUiStore((s) => s.showErrorToast);

  const isOpen = activeModal === "accept" && !!selectedDay?.pendingSolicitud;
  const solicitud = selectedDay?.pendingSolicitud;

  if (!isOpen || !solicitud) return null;

  // Resolver datos del intercambio para mostrar en el modal
  const solicitanteName =
    (solicitud["SolicitanteNombre"] as string | undefined) ?? "Alguien";

  const ofrecidoEntry = rawEntries.find(
    (e) =>
      e.id === (solicitud["FK_IdControlGuardiaOfrecido"] as number | undefined),
  );
  const ofrecidoDate =
    ofrecidoEntry?.date ??
    (solicitud["FechaOfrecida"] as string | undefined)?.split("T")[0] ??
    "?";

  const motivo =
    (solicitud["MotivoCambio"] as string | undefined) ?? "Sin motivo";

  const solicitudId = solicitud["IdSolicitudCambio"] as number | undefined;

  const handleAccept = async () => {
    const ok = await acceptSwapRequest(solicitudId ?? 0);
    if (ok) {
      showSuccess("Cambio de guardia aceptado");
      closeModal();
      // Trigger re-fetch tocando el offset (el hook reacciona al cambio)
      useGuardiasStore.getState().setMonthOffset(monthOffset);
    } else {
      showError("Error al aceptar el cambio");
    }
  };

  return (
    <ConfirmModal
      id={MODAL_ID}
      title="📬 Solicitud de cambio"
      message={`${solicitanteName} quiere cambiarte tu día ${selectedDay?.date ?? ""}`}
      description={`Te ofrece su día: ${ofrecidoDate}`}
      confirmText="✅ Aceptar cambio"
      cancelText="Rechazar"
      confirmColor="#2E7D32"
      maxWidth="420px"
      isOpen={isOpen}
      onClose={closeModal}
      onConfirm={handleAccept}
    >
      {/* Bloque de motivo */}
      <div
        style={{
          padding: 10,
          background: "#f5f5f5",
          borderRadius: 6,
          marginBottom: 16,
          textAlign: "left",
        }}
      >
        <label
          style={{
            fontSize: 11,
            color: "#888",
            display: "block",
            marginBottom: 4,
          }}
        >
          Motivo:
        </label>
        <p style={{ margin: 0, fontSize: 13, color: "#333" }}>{motivo}</p>
      </div>
    </ConfirmModal>
  );
}
