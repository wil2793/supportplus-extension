// ============================================================
// SRC/CONTENT.TS - Content script entry point
// Boots the extension inside the SupportPlus portal page.
// ============================================================

import { injectStyles } from "./styles";
import SP_Log from "./lib/logger";
import SP_Session from "./features/session";
import SP_RowColors from "./features/row-colors";
import SP_Header from "./features/header-buttons";
import SP_ManagerView from "./features/manager-view";
import SP_Reports from "./features/reports";

// All other features/modules are imported to ensure they're bundled.
// Their initialization is triggered by SP_Session.checkSession resolving.
import "./features/detail-view";
import "./features/ticket-actions";
import "./features/guardias";

// ─── Boot sequence ────────────────────────────────────────────

async function boot(): Promise<void> {
  SP_Log.info("Extension loading...");

  // 1. Inject CSS into the page
  injectStyles();

  // 2. Load any persisted permissions/config before session check
  await SP_Session.loadPersistedState();

  // 3. Register header buttons (always-visible buttons inject immediately)
  SP_Header.initHeaderButtons(() => {
    document.dispatchEvent(new CustomEvent("sp-show-dba-info"));
  });

  // 4. Start row coloring observer
  SP_RowColors.init();

  // 5. Check session (authenticates and fetches user permissions)
  await SP_Session.checkSession();

  // 6. After session: inject session-gated header buttons
  SP_Header.injectButtons("session");
  SP_Header.injectButtons("authenticated");

  // 7. Inject report button if enabled
  SP_Reports.injectReportButton();

  // 8. Initialize the kanban manager view
  SP_ManagerView.initManagerView();

  SP_Log.info("Extension ready.");
}

void boot();
