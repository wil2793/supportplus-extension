// ============================================================
// SRC/REACT/FEATURES/DASHBOARD/DASHBOARDCHART.TSX
//
// Gráfica de barras horizontales por analista.
// Reemplaza buildDashboardChart() de dashboard.ts.
// Lee datos del dashboardStore.
// ============================================================

import { useDashboardStore, selectTickets, selectLoading } from "../../store/dashboardStore";

// ─── Constantes ───────────────────────────────────────────────

const COLORS = [
  "#1976D2", "#2E7D32", "#D94040", "#7B1FA2",
  "#E65100", "#00796B", "#C2185B", "#F57F17",
  "#283593", "#5D4037",
];

// ─── Componente ───────────────────────────────────────────────

export function DashboardChart() {
  const tickets = useDashboardStore(selectTickets);
  const loading  = useDashboardStore(selectLoading);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
        <span className="sp-spinner" style={{ marginRight: 8 }} />
        Cargando tickets...
      </div>
    );
  }

  if (!tickets.length) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
        Sin tickets cerrados en este periodo
      </div>
    );
  }

  // Contar por responsable
  const counts: Record<string, number> = {};
  tickets.forEach((t) => {
    const name = t.responsibleName || "Sin asignar";
    counts[name] = (counts[name] ?? 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: "#888" }}>
        Total: <strong>{tickets.length}</strong> tickets cerrados
      </div>

      {sorted.map(([name, count], i) => {
        const pct = Math.round((count / max) * 100);
        const color = COLORS[i % COLORS.length] ?? "#1976D2";
        return (
          <div
            key={name}
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
          >
            {/* Nombre */}
            <div
              style={{
                width: 180,
                fontSize: 12,
                textAlign: "right",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              title={name}
            >
              {name}
            </div>

            {/* Barra */}
            <div
              style={{
                flex: 1,
                background: "#eee",
                borderRadius: 4,
                height: 24,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  background: color,
                  height: "100%",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: 6,
                  transition: "width 0.4s ease",
                }}
              >
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>
                  {count}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
