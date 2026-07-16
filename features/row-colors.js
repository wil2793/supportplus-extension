// ============================================================
// FEATURES/ROW-COLORS.JS - Table row coloring by ticket status
// ============================================================

(function () {
  "use strict";

  const STATUS_BG_COLORS = window.SP_CONFIG.STATUS_COLORS;

  function colorRowsImmediate() {
    document.querySelectorAll('.MuiDataGrid-row').forEach(function (row) {
      if (row.dataset.spColored) return;
      const cell = row.querySelector('[data-field="ticketStatusName"]');
      if (!cell) return;
      const status = cell.textContent.trim();
      const color = STATUS_BG_COLORS[status];
      if (color) { row.style.backgroundColor = color; row.dataset.spColored = "1"; }
    });
  }

  SP_Log.safeRun("RowColors", function () {
    // Observe only the DataGrid container (not entire body) for better performance.
    // Falls back to body if grid not found yet, then re-scopes when grid appears.
    const _refs = { observer: null };

    function startObserver(target) {
      if (_refs.observer) _refs.observer.disconnect();
      _refs.observer = new MutationObserver(colorRowsImmediate);
      _refs.observer.observe(target, { childList: true, subtree: true });
    }

    // Try to scope to grid immediately
    const grid = document.querySelector(".MuiDataGrid-root");
    if (grid) {
      startObserver(grid);
    } else {
      // Temporarily observe body, re-scope once grid appears
      startObserver(document.body);
      SP_DOM.waitForElement(".MuiDataGrid-root", { maxAttempts: 40, interval: 500 })
        .then(function (gridEl) {
          if (gridEl) startObserver(gridEl);
        });
    }

    colorRowsImmediate();
  });

  window.SP_RowColors = {
    colorRows: colorRowsImmediate
  };

})();
