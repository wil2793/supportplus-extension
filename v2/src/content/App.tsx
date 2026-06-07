import React from "react";
import { useAppState } from "../hooks";

export const App: React.FC = () => {
  const { state, loading, status } = useAppState();

  if (loading) return null;

  if (status === "not_found") {
    return (
      <StatusMessage text="⚠️ Usuario no registrado en SupportPlus Tools. Solicite su alta con el administrador." />
    );
  }

  if (status === "inactive") {
    return (
      <StatusMessage text="⚠️ Usuario inactivo en SupportPlus Tools. Solicite su reactivación con el administrador." />
    );
  }

  // TODO: Render header buttons, manager panel, etc. based on state
  return (
    <>
      {/* Header buttons will be portaled here */}
      {/* Manager panel will be portaled here */}
      {/* Modals render here */}
    </>
  );
};

const StatusMessage: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "fixed",
      top: 10,
      right: 10,
      zIndex: 99999,
      padding: "6px 14px",
      fontSize: 12,
      borderRadius: 6,
      background: "rgba(217,64,64,0.15)",
      color: "#D94040",
      border: "1px solid rgba(217,64,64,0.3)",
      fontWeight: 600,
      fontFamily: "system-ui",
    }}
  >
    {text}
  </div>
);
