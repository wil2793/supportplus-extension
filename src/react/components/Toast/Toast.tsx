// ============================================================
// SRC/REACT/COMPONENTS/TOAST/TOAST.TSX
//
// Componente individual de notificación toast.
// Lee su estado de auto-dismiss desde uiStore via el prop `item`.
// El tiempo de vida es responsabilidad del ToastContainer.
// ============================================================

import { useEffect, useRef } from "react";
import { useUiStore } from "../../store/uiStore";
import type { ToastItem, ToastVariant } from "../../store/uiStore";

// ─── Mapeo de variante → clase CSS (definidas en styles.ts) ──

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "sp-toast sp-toast-success",
  error: "sp-toast sp-toast-error",
  loading: "sp-toast sp-toast-loading",
  info: "sp-toast sp-toast-loading", // reutiliza el estilo oscuro para info
};

// ─── Props ────────────────────────────────────────────────────

interface ToastProps {
  item: ToastItem;
}

// ─── Componente ───────────────────────────────────────────────

export function Toast({ item }: ToastProps) {
  const dismissToast = useUiStore((s) => s.dismissToast);
  const divRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss: si duration > 0 programa la animación de salida
  // y luego elimina del store. Duration 0 = permanente (loading).
  useEffect(() => {
    if (item.duration === 0) return;

    const fadeTimer = setTimeout(() => {
      if (divRef.current) {
        divRef.current.style.animation = "sp-toast-out 0.3s ease forwards";
      }
    }, item.duration);

    const removeTimer = setTimeout(() => {
      dismissToast(item.id);
    }, item.duration + 300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [item.id, item.duration, dismissToast]);

  const isLoading = item.variant === "loading";

  return (
    <div
      ref={divRef}
      className={VARIANT_CLASS[item.variant]}
      role={isLoading ? "status" : "alert"}
      aria-live={isLoading ? "polite" : "assertive"}
    >
      {isLoading && <span className="sp-spinner" aria-hidden="true" />}
      {item.message}
    </div>
  );
}
