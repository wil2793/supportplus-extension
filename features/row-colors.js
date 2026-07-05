// ============================================================
// FEATURES/ROW-COLORS.JS - Table row coloring by ticket status
// Replicates the original v5.8.0 logic that worked correctly.
// ============================================================

(function () {
  "use strict";

  const STATUS_BG_COLORS = window.SP_CONFIG.STATUS_COLORS;

  function colorRowsImmediate() {
    document.querySelectorAll('.MuiDataGrid-row').forEach(function (row) {
      if (row.dataset.spColored) return;
      var cell = row.querySelector('[data-field="ticketStatusName"]');
      if (!cell) return;
      var status = cell.textContent.trim();
      var color = STATUS_BG_COLORS[status];
      if (color) { row.style.backgroundColor = color; row.dataset.spColored = "1"; }
    });
  }

  var _colorObserver = new MutationObserver(colorRowsImmediate);
  _colorObserver.observe(document.body, { childList: true, subtree: true });
  colorRowsImmediate();

  window.SP_RowColors = {
    colorRows: colorRowsImmediate
  };

})();
