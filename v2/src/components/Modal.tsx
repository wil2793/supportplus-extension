import React, { useEffect, useRef } from "react";

interface ModalProps {
  id?: string;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  fullscreen?: boolean;
  maxWidth?: string;
  headerActions?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  id,
  title,
  children,
  onClose,
  fullscreen,
  maxWidth = "450px",
  headerActions,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => {
      if (overlayRef.current)
        overlayRef.current.style.background = fullscreen
          ? "rgba(0,0,0,0)"
          : "rgba(0,0,0,0.6)";
      if (modalRef.current) {
        modalRef.current.style.transform = "scale(1)";
        modalRef.current.style.opacity = "1";
      }
    });

    // ESC to close
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, fullscreen]);

  const modalStyle: React.CSSProperties = fullscreen
    ? {
        background: "#fff",
        padding: "clamp(12px,2vw,24px)",
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        transform: "scale(0.95)",
        opacity: 0,
        transition: "transform 0.2s ease, opacity 0.2s ease",
      }
    : {
        background: "#fff",
        borderRadius: 12,
        maxWidth,
        width: "90%",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transform: "scale(0.85) translateY(20px)",
        opacity: 0,
        transition:
          "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
      };

  return (
    <div
      id={id}
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current && !fullscreen) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.3s ease",
      }}
    >
      <div
        ref={modalRef}
        style={{
          ...modalStyle,
          fontFamily: "Roboto,Helvetica,Arial,sans-serif",
          fontSize: "1rem",
          lineHeight: 1.5,
          color: "#333",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px 12px",
            borderBottom: "1px solid #eee",
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
            {title}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {headerActions}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.2rem",
                cursor: "pointer",
                padding: "0 4px",
                color: "#666",
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div style={{ padding: "16px 20px 20px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
};
