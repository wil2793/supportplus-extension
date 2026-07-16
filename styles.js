// ============================================================
// STYLES.JS - Centralized CSS injection
// ============================================================

(function () {
  "use strict";

  var CSS = `
/* ─── Loading Bar (replaces MUI backdrop) ─── */
.MuiBackdrop-root {
  background: transparent !important;
  top: 0 !important;
  bottom: auto !important;
  height: 3px !important;
  opacity: 1 !important;
}
.MuiBackdrop-root .MuiCircularProgress-root {
  display: none !important;
}
.MuiBackdrop-root::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 30%;
  height: 100%;
  background: #D94040;
  animation: sp-loading-bar 1.2s ease-in-out infinite;
}
@keyframes sp-loading-bar {
  0% { left: -30%; }
  100% { left: 100%; }
}

/* ─── Header Buttons ─── */
.sp-hdr-btn {
  transition: all 0.2s;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
  margin-right: 4px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
@media (max-width: 1600px) {
  .sp-hdr-btn .sp-btn-label { display: none; }
  .sp-hdr-btn { padding: 6px 10px !important; min-width: auto !important; }
}
@media (max-width: 1100px) {
  .sp-hdr-btn { padding: 4px 8px !important; font-size: 11px !important; }
}

/* ─── Ticket Cards (Manager Panel) ─── */
.sp-mgr-ticket {
  display: block;
  padding: 3px 5px;
  margin: 2px 0;
  border-radius: 4px;
  background: #fff;
  font-size: 9px;
  line-height: 1.3;
  transition: box-shadow 0.15s ease, transform 0.1s ease;
}
.sp-mgr-ticket[draggable="true"] {
  cursor: grab;
}
.sp-mgr-ticket:hover {
  box-shadow: 0 2px 6px rgba(0,0,0,0.12);
  transform: translateY(-1px);
}
.sp-mgr-ticket:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* ─── Manager Panel Columns ─── */
.sp-mgr-column {
  min-width: 160px;
  max-width: 200px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.sp-mgr-ptickets {
  padding: 3px;
  max-height: 180px;
  overflow-y: auto;
  background: #fafafa;
  min-height: 25px;
}

/* ─── Drag and Drop Feedback ─── */
.sp-mgr-ptickets {
  transition: background 0.15s ease, outline 0.15s ease;
}
.sp-mgr-ptickets.sp-drag-over {
  background: #e3f2fd !important;
  outline: 2px dashed #1976D2;
  outline-offset: -2px;
}

/* ─── Tag Filter ─── */
.sp-tag-filter {
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  position: relative;
}
.sp-tag-filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: #e3f2fd;
  border: 1px solid #1976D2;
  border-radius: 4px;
  font-size: 10px;
  color: #1976D2;
}
.sp-tag-filter-tag .sp-tag-remove {
  cursor: pointer;
  color: #D94040;
  font-weight: 700;
}
.sp-tag-filter-input {
  border: none;
  outline: none;
  font-size: 11px;
  flex: 1;
  min-width: 120px;
  padding: 2px 4px;
}
.sp-tag-filter-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  max-height: 150px;
  overflow-y: auto;
  z-index: 10;
  display: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.sp-tag-filter-option {
  padding: 6px 8px;
  cursor: pointer;
  font-size: 11px;
  border-bottom: 1px solid #f0f0f0;
}
.sp-tag-filter-option:hover {
  background: #e3f2fd;
}

/* ─── Toast Animations ─── */
@keyframes sp-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes sp-toast-out {
  from { opacity: 1; }
  to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}
@keyframes sp-spin {
  to { transform: rotate(360deg); }
}

/* ─── Toast Base ─── */
.sp-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100000;
  padding: 12px 20px;
  border-radius: 8px;
  font-family: system-ui;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  gap: 8px;
  animation: sp-toast-in 0.3s ease;
}
.sp-toast-loading {
  background: #333;
  color: #fff;
}
.sp-toast-success {
  background: #2E7D32;
  color: #fff;
}
.sp-toast-error {
  background: #D94040;
  color: #fff;
}
.sp-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: sp-spin 0.6s linear infinite;
}

/* ─── Version Blocker ─── */
.sp-version-blocker {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.85);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ─── Detail View Buttons ─── */
.sp-detail-btn {
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
  margin-right: 6px;
  transition: opacity 0.15s ease;
}
.sp-detail-btn:hover {
  opacity: 0.9;
}
.sp-detail-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.sp-detail-btn-take { background: #1976D2; }
.sp-detail-btn-steal { background: #E65100; }
.sp-detail-btn-close { background: #616161; }
.sp-detail-btn-reopen { background: #FF8F00; }
.sp-detail-btn-reassign { background: #C62828; }

/* ─── Copy Button ─── */
.sp-copy-btn {
  padding: 1px 4px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  background: transparent;
  margin-left: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.sp-copy-btn:hover {
  opacity: 1;
}

/* ─── Detection Labels ─── */
.sp-detection-box {
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 8px;
}
.sp-detection-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 2px 4px;
  padding: 2px 8px;
  background: #fff;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
}

/* ─── Summary Count Card ─── */
.sp-summary-card {
  min-width: 160px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  text-align: center;
}
.sp-summary-card-header {
  color: #fff;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 700;
}
.sp-summary-card-count {
  padding: 12px;
  font-size: 24px;
  font-weight: 700;
}

/* ─── Collapsible Section ─── */
.sp-section {
  margin-bottom: 8px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}
.sp-section-header {
  padding: 8px 12px;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sp-section-body {
  padding: 8px;
  overflow-x: auto;
}

/* ─── Access/Inactive Message ─── */
.sp-access-msg {
  padding: 4px 12px;
  font-size: 11px;
  border-radius: 4px;
  background: rgba(217,64,64,0.15);
  color: #D94040;
  border: 1px solid rgba(217,64,64,0.3);
  margin-right: 8px;
  font-weight: 600;
}

/* ─── Role Label ─── */
.sp-role-label {
  display: block;
  font-size: 11px;
  color: inherit;
  opacity: 0.6;
  font-weight: 400;
  margin-top: 2px;
  text-transform: uppercase;
  text-align: right;
}

/* ─── Status Row Colors ─── */
.sp-row-asignado { background-color: rgba(33,150,243,0.18) !important; }
.sp-row-en-validacion { background-color: rgba(156,39,176,0.18) !important; }
.sp-row-en-atencion { background-color: rgba(255,152,0,0.18) !important; }
.sp-row-por-aprobador { background-color: rgba(121,85,72,0.18) !important; }
.sp-row-por-ejecutar { background-color: rgba(0,150,136,0.18) !important; }
.sp-row-por-revisar { background-color: rgba(63,81,181,0.18) !important; }
.sp-row-en-aplicaciones { background-color: rgba(233,30,99,0.18) !important; }
.sp-row-por-confirmar { background-color: rgba(255,193,7,0.20) !important; }
.sp-row-cerrado { background-color: rgba(76,175,80,0.18) !important; }
.sp-row-rechazado { background-color: rgba(244,67,54,0.18) !important; }
.sp-row-cancelado { background-color: rgba(158,158,158,0.20) !important; }
.sp-row-reabierto { background-color: rgba(255,87,34,0.18) !important; }
.sp-row-en-espera { background-color: rgba(255,235,59,0.20) !important; }

/* ─── Manager Column Header Colors ─── */
.sp-col-header {
  color: #fff;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}
.sp-col-header-unassigned { background: #FF8F00; }
.sp-col-header-member { background: #2196F3; }
.sp-col-header-closed { background: #2E7D32; }
.sp-col-header-pending { background: #FF8F00; }

/* ─── Manager Panel Layout ─── */
.sp-mgr-panel {
  margin-bottom: 12px;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #4CAF50;
  font-family: system-ui;
}
.sp-mgr-columns-wrap {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}
.sp-mgr-summary-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
`;

  // Inject styles once
  var style = document.createElement("style");
  style.id = "sp-global-styles";
  style.textContent = CSS;
  document.head.appendChild(style);

  // ─── Status class mapping (for row coloring) ──────────────
  var STATUS_CLASS_MAP = {
    "Asignado": "sp-row-asignado",
    "En validación": "sp-row-en-validacion",
    "En atención": "sp-row-en-atencion",
    "Por aprobador": "sp-row-por-aprobador",
    "Por ejecutar": "sp-row-por-ejecutar",
    "Por revisar": "sp-row-por-revisar",
    "En aplicaciones": "sp-row-en-aplicaciones",
    "Por confirmar": "sp-row-por-confirmar",
    "Cerrado": "sp-row-cerrado",
    "Rechazado": "sp-row-rechazado",
    "Cancelado": "sp-row-cancelado",
    "Reabierto": "sp-row-reabierto",
    "En espera": "sp-row-en-espera"
  };

  window.SP_Styles = {
    STATUS_CLASS_MAP: STATUS_CLASS_MAP
  };

})();
