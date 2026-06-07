import React, { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type: "success" | "error" | "loading";
  onDismiss?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onDismiss }) => {
  const [visible, setVisible] = useState(true);

  const bg =
    type === "success" ? "#2E7D32" : type === "error" ? "#D94040" : "#333";

  useEffect(() => {
    if (type !== "loading") {
      const timer = setTimeout(
        () => {
          setVisible(false);
          onDismiss?.();
        },
        type === "error" ? 4000 : 3000,
      );
      return () => clearTimeout(timer);
    }
  }, [type, onDismiss]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100000,
        background: bg,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 8,
        fontFamily: "system-ui",
        fontSize: 14,
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {type === "loading" && (
        <span
          style={{
            display: "inline-block",
            width: 16,
            height: 16,
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "sp-spin 0.6s linear infinite",
          }}
        />
      )}
      {message}
    </div>
  );
};
