// ============================================================
// SRC/STYLES.TS - Centralized CSS injection
// ============================================================

const CSS = `
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
  border: 1px solid #e0e0e0;
  font-size: 9px;
  line-height: 1.3;
  transition: box-shadow 0.15s ease, transform 0.1s ease;
}
.sp-mgr-ticket[draggable="true"] { cursor: grab; }
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
.sp-mgr-ptickets.sp-drag-over {
  background: #E3F2FD;
  outline: 2px dashed #1976D2;
}

/* ─── Toast Notifications ─── */
.sp-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 999999;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: sp-toast-in 0.3s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.sp-toast-loading { background: #333; color: #fff; }
.sp-toast-success { background: #2E7D32; color: #fff; }
.sp-toast-error   { background: #C62828; color: #fff; }

@keyframes sp-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes sp-toast-out {
  from { opacity: 1; transform: translateX(-50%) translateY(0); }
  to   { opacity: 0; transform: translateX(-50%) translateY(10px); }
}

/* ─── Spinner ─── */
.sp-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: sp-spin 0.7s linear infinite;
  vertical-align: middle;
}
@keyframes sp-spin {
  to { transform: rotate(360deg); }
}

/* ─── Detection boxes (detail view) ─── */
.sp-detection-box {
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 6px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.sp-detection-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: #fff;
}
.sp-copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
}

/* ─── Role label ─── */
.sp-role-label {
  font-size: 9px;
  color: #888;
  font-weight: 400;
  font-style: italic;
}

/* ─── Access message ─── */
.sp-access-msg {
  padding: 6px 14px;
  font-size: 11px;
  border-radius: 6px;
  background: rgba(217,64,64,0.1);
  color: #D94040;
  border: 1px solid rgba(217,64,64,0.25);
  margin-right: 8px;
  font-weight: 600;
}

/* ─── Tag filter ─── */
.sp-tag-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 4px 8px;
  min-height: 34px;
  cursor: text;
  position: relative;
}
.sp-tag-filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #E3F2FD;
  border: 1px solid #90CAF9;
  border-radius: 20px;
  font-size: 11px;
  color: #1565C0;
}
.sp-tag-remove { cursor: pointer; color: #1976D2; font-size: 10px; }
.sp-tag-filter-input {
  border: none;
  outline: none;
  font-size: 12px;
  min-width: 120px;
  flex: 1;
  padding: 2px 0;
}
.sp-tag-filter-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 99999;
  display: none;
  max-height: 200px;
  overflow-y: auto;
}
.sp-tag-filter-option {
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
}
.sp-tag-filter-option:hover { background: #f5f5f5; }

/* ─── Col headers ─── */
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
  flex-wrap: nowrap;
  overflow-x: auto;
  justify-content: center;
}
.sp-mgr-summary-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
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
  border: none;
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
`;

/** Inject all extension CSS into the page. Called once at startup. */
export function injectStyles(): void {
  if (document.getElementById("sp-styles")) return;
  const style = document.createElement("style");
  style.id = "sp-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default injectStyles;
