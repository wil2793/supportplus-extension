// ============================================================
// SRC/REACT/COMPONENTS/MODAL/MODAL.TSX
//
// Componente base para todos los modales de la extensión.
// Replica exactamente el comportamiento y estilos de createModal()
// de components.ts: animación cubic-bezier de entrada, overlay
// con fade, cierre por ESC/backdrop, portal al body.
// ============================================================

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ModalProps } from "./Modal.types";

export function Modal({
  id,
  title = "",
  children,
  isOpen,
  onClose,
  maxWidth = "450px",
  width = "90%",
  height,
  maxHeight = "90vh",
  scroll = true,
  zIndex = 99999,
  textAlign = "left",
  padding = "16px 20px 20px",
  closeOnBackdrop = true,
  blur = false,
  showHeader = true,
  headerActions,
  customClass = "",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // ── Animación de entrada ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const overlay = overlayRef.current;
    const box = boxRef.current;
    if (!overlay || !box) return;

    // Primer frame: estado inicial (invisible)
    overlay.style.background = "rgba(0,0,0,0)";
    overlay.style.backdropFilter = "blur(0px)";
    box.style.transform = "scale(0.85) translateY(20px)";
    box.style.opacity = "0";

    // Segundo frame: animar a estado final
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.background = "rgba(0,0,0,0.5)";
        if (blur) overlay.style.backdropFilter = "blur(6px)";
        box.style.transform = "scale(1) translateY(0)";
        box.style.opacity = "1";
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [isOpen, blur]);

  // ── Cierre con animación de salida ──────────────────────────
  const handleClose = () => {
    const overlay = overlayRef.current;
    const box = boxRef.current;
    if (!overlay || !box) {
      onClose();
      return;
    }
    box.style.transform = "scale(0.9) translateY(10px)";
    box.style.opacity = "0";
    overlay.style.background = "rgba(0,0,0,0)";
    overlay.style.backdropFilter = "blur(0px)";
    setTimeout(onClose, 250);
  };

  // ── ESC para cerrar ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const heightStyle = height ? height : undefined;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0)",
    zIndex,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.3s ease, backdrop-filter 0.3s ease",
    backdropFilter: "blur(0px)",
  };

  const boxStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "12px",
    maxWidth,
    width,
    height: heightStyle,
    maxHeight,
    display: "flex",
    flexDirection: "column",
    fontFamily: "Roboto, Helvetica, Arial, sans-serif",
    fontSize: "1rem",
    lineHeight: 1.5,
    color: "rgb(51,51,51)",
    textAlign: textAlign as React.CSSProperties["textAlign"],
    overflow: "hidden",
    transform: "scale(0.85) translateY(20px)",
    opacity: 0,
    transition:
      "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
  };

  const bodyStyle: React.CSSProperties = {
    padding,
    ...(scroll ? { overflowY: "auto", flex: 1 } : {}),
  };

  const modal = (
    <div
      id={id}
      ref={overlayRef}
      style={overlayStyle}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === overlayRef.current) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={showHeader ? `${id}-title` : undefined}
    >
      <div
        ref={boxRef}
        className={`sp-modal-box ${customClass}`.trim()}
        style={boxStyle}
      >
        {showHeader && (
          <div
            className="sp-modal-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px 12px",
              borderBottom: "1px solid #eee",
              flexShrink: 0,
            }}
          >
            <h3
              id={`${id}-title`}
              style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}
            >
              {title}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {headerActions}
              <button
                className="sp-modal-close-btn"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  padding: "0 4px",
                  color: "#666",
                }}
                title="Cerrar"
                onClick={handleClose}
                type="button"
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="sp-modal-body" style={bodyStyle}>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
