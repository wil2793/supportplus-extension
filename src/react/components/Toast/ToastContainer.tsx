// ============================================================
// SRC/REACT/COMPONENTS/TOAST/TOASTCONTAINER.TSX
//
// Lee la lista de toasts activos desde uiStore y renderiza
// un <Toast> por cada uno. No tiene estado propio — todo
// viene del store.
// ============================================================

import { useUiStore, selectToasts } from "../../store/uiStore";
import { Toast } from "./Toast";

export function ToastContainer() {
  const toasts = useUiStore(selectToasts);

  // Si no hay toasts, no renderiza nada en el DOM
  if (toasts.length === 0) return null;

  return (
    <>
      {toasts.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </>
  );
}
