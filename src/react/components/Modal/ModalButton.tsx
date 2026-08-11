// ============================================================
// SRC/REACT/COMPONENTS/MODAL/MODALBUTTON.TSX
//
// Botón reutilizable para todos los modales.
// Replica los BTN_STYLES de modal-builder.ts con variantes
// tipadas y soporte de estado loading (spinner integrado).
// ============================================================

import type { ModalButtonProps } from "./Modal.types";

// ─── Estilos base por variante (replica BTN_STYLES de modal-builder.ts)

const BASE: React.CSSProperties = {
  flex: 1,
  padding: "10px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 600,
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  transition: "opacity 0.15s ease",
};

const VARIANT_STYLES: Record<
  NonNullable<ModalButtonProps["variant"]>,
  React.CSSProperties
> = {
  primary:   { ...BASE, background: "#1976D2", color: "#fff" },
  secondary: { ...BASE, background: "#fff", color: "#333", border: "1px solid #ccc", fontWeight: 400 },
  danger:    { ...BASE, background: "#C62828", color: "#fff" },
  success:   { ...BASE, background: "#2E7D32", color: "#fff" },
  warning:   { ...BASE, background: "#FF8F00", color: "#fff" },
};

export function ModalButton({
  variant = "primary",
  loading = false,
  loadingText = "Procesando...",
  onClick,
  disabled = false,
  children,
  type = "button",
  color,
  style,
}: ModalButtonProps) {
  const variantStyle = VARIANT_STYLES[variant];

  // Override de color de fondo para el botón primario con color custom
  const colorOverride: React.CSSProperties =
    variant === "primary" && color ? { background: color } : {};

  const disabledStyle: React.CSSProperties =
    disabled || loading ? { opacity: 0.65, cursor: "not-allowed" } : {};

  const finalStyle: React.CSSProperties = {
    ...variantStyle,
    ...colorOverride,
    ...disabledStyle,
    ...style,
  };

  return (
    <button
      type={type}
      style={finalStyle}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading ? (
        <>
          <span className="sp-spinner" aria-hidden="true" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
