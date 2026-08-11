// ============================================================
// SRC/REACT/FEATURES/MANAGER/COMPONENTS/GROUPSECTION.TSX
//
// Sección colapsable de un grupo con todas sus columnas:
// Sin asignar | Analistas | Cerrados hoy | Pendientes de cierre
// ============================================================

import { useManagerStore } from "../../../store/managerStore";
import { useLoadGroupSection } from "../hooks/useManagerTickets";
import { KanbanColumn } from "./KanbanColumn";

// ─── Props ────────────────────────────────────────────────────

interface GroupSectionProps {
  groupId: number;
  singleGroup: boolean;
}

// ─── Componente ───────────────────────────────────────────────

export function GroupSection({ groupId, singleGroup }: GroupSectionProps) {
  const section      = useManagerStore((s) => s.sections[groupId]);
  const profiles     = useManagerStore((s) => s.profiles[groupId] ?? []);
  const pendingClose = useManagerStore((s) => s.pendingClose);
  const canDrag      = useManagerStore((s) => s.canDrag);
  const toggleSection = useManagerStore((s) => s.toggleSection);

  // Activa el fetch al expandir por primera vez
  useLoadGroupSection(groupId);

  if (!section) return null;

  const isExpanded = section.expanded;

  return (
    <div
      id={`sp-mgr-section-${groupId}`}
      className="sp-section"
    >
      {/* Header colapsable (oculto en single-group) */}
      {!singleGroup && (
        <div
          className="sp-section-header"
          onClick={() => toggleSection(groupId)}
          role="button"
          aria-expanded={isExpanded}
          style={{ cursor: "pointer" }}
        >
          <span>📂 {section.groupName}</span>
          <span style={{ fontSize: 14 }}>{isExpanded ? "▼" : "▶"}</span>
        </div>
      )}

      {/* Cuerpo: columnas del Kanban */}
      {isExpanded && (
        <div className="sp-section-body">
          <div className="sp-mgr-columns sp-mgr-columns-wrap">

            {/* Sin asignar */}
            <KanbanColumn
              groupId={groupId}
              columnId="unassigned"
              type="unassigned"
              title="⏳ Sin asignar"
              headerColor="#FF8F00"
              borderColor="#FF8F00"
              showStatus={canDrag}
            />

            {/* Columna por analista */}
            {profiles.map((p) => (
              <KanbanColumn
                key={p.profileId}
                groupId={groupId}
                columnId={p.profileId}
                type="member"
                title={p.profileFullName.split(" ")[0] ?? p.profileFullName}
                headerColor="#2196F3"
                showStatus={false}
              />
            ))}

            {/* Pendientes de cierre */}
            <KanbanColumn
              groupId={groupId}
              columnId="pending"
              type="pending"
              title="🕐 Pendientes"
              headerColor="#FF8F00"
              borderColor="#FF8F00"
              pendingTickets={pendingClose}
            />

            {/* Cerrados hoy */}
            <KanbanColumn
              groupId={groupId}
              columnId="closed"
              type="closed"
              title="✅ Cerrados hoy"
              headerColor="#2E7D32"
              borderColor="#2E7D32"
              showResponsible
            />

          </div>
        </div>
      )}
    </div>
  );
}
