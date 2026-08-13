// ============================================================
// SRC/FEATURES/ROW-COLORS.TS - Table row coloring by ticket status
// ============================================================

import { STATUS_COLORS } from "../config";
import { safeRun } from "../lib/logger";
import { waitForElement } from "../lib/dom-utils";

function colorRowsImmediate(): void {
  document.querySelectorAll<HTMLElement>(".MuiDataGrid-row").forEach((row) => {
    const cell = row.querySelector<HTMLElement>(
      '[data-field="ticketStatusName"]',
    );
    if (!cell) return;
    const status = cell.textContent?.trim() ?? "";
    const color = STATUS_COLORS[status] ?? "";

    // Siempre actualizar — MUI reutiliza nodos DOM en scroll virtual,
    // así que el status puede cambiar sin que se cree un nuevo elemento
    if (row.dataset["spStatus"] === status) return; // mismo status, nada que hacer
    row.style.backgroundColor = color;
    row.dataset["spStatus"] = status; // guardar status en vez de solo "coloreado"
  });
}

let _observer: MutationObserver | null = null;

function startObserver(target: Element): void {
  if (_observer) _observer.disconnect();
  _observer = new MutationObserver(colorRowsImmediate);
  _observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeOldValue: false,
  });
}

export function initRowColors(): void {
  safeRun("RowColors", () => {
    const grid = document.querySelector<Element>(".MuiDataGrid-root");
    if (grid) {
      startObserver(grid);
    } else {
      startObserver(document.body);
      void waitForElement<Element>(".MuiDataGrid-root", {
        maxAttempts: 40,
        interval: 500,
      }).then((gridEl) => {
        if (gridEl) startObserver(gridEl);
      });
    }
    colorRowsImmediate();
  });
}

const SP_RowColors = { colorRows: colorRowsImmediate, init: initRowColors };
export default SP_RowColors;
