// ============================================================
// SRC/REACT/COMPONENTS/HEADERBUTTON/HEADERBUTTON.TSX
//
// Equivalente React de createHeaderButton() de components.ts.
// Usa las mismas clases CSS (sp-hdr-btn, sp-btn-icon, sp-btn-label)
// definidas en styles.ts para mantener consistencia visual exacta.
// ============================================================

import React from "react";

// ─── Props ────────────────────────────────────────────────────

export interface HeaderButtonProps {
  /** ID único del botón en el DOM */
  id?: string;
  /** Emoji o carácter de icono */
  icon?: string;
  /** Texto visible junto al icono */
  label?: string;
  /** Color de fondo en formato CSS */
  color?: string;
  /** Handler del click */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Oculto visualmente pero presente en el DOM */
  hidden?: boolean;
  /** Estilos CSS inline adicionales */
  extraStyle?: React.CSSProperties;
  /** Deshabilita el botón */
  disabled?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

// ─── Componente ───────────────────────────────────────────────

export function HeaderButton({
  id,
  icon,
  label,
  color = "#1565C0",
  onClick,
  hidden = false,
  extraStyle,
  disabled = false,
  className = "",
}: HeaderButtonProps) {
  const style: React.CSSProperties = {
    background: color,
    display: hidden ? "none" : undefined,
    ...extraStyle,
  };

  return (
    <button
      id={id}
      className={`sp-hdr-btn ${className}`.trim()}
      style={style}
      title={label}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {icon && (
        <span className="sp-btn-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {label && (
        <span className="sp-btn-label">
          {" "}{label}
        </span>
      )}
    </button>
  );
}
