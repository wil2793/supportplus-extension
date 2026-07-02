// ============================================================
// FEATURES/ROW-COLORS.JS - Table row coloring by ticket status
// ============================================================

(function () {
  "use strict";

  const STATUS_COLORS = window.SP_CONFIG.STATUS_COLORS;

  /**
   * Color all visible MuiDataGrid rows based on their ticket status.
   * Uses inline backgroundColor (guaranteed to win over MUI styles).
   */
  function colorRows() {
    document.querySelectorAll(".MuiDataGrid-row").forEach(function (row) {
      const cell = row.querySelector('[data-field="ticketStatusName"]');
      if (!cell) return;
      const status = cell.textContent.trim();
      if (!status) return;
      if (row.dataset.spStatus === status) return;
      const color = STATUS_COLORS[status] || "";
      row.style.backgroundColor = color;
      row.dataset.spStatus = status;
    });
  }

  /**
   * Start observing. Runs colorRows on every DOM mutation (fast skip for painted rows).
   * Also has a 2s interval fallback.
   */
  function start() {
    colorRows();
    const observer = new MutationObserver(colorRows);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(colorRows, 2000);
  }

  start();

  window.SP_RowColors = {
    colorRows: colorRows
  };

})();
