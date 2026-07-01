// ============================================================
// MONDAY-SYNC.JS - Auto-syncs ticket statuses from SP to Monday
// Uses shared lib/api.js (no more duplicated wrappers)
// ============================================================

(function () {
  "use strict";

  const SP_SEARCH_API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
  const _state = { syncing: false };

  // Use shared API library
  const mondayQuery = window.SP_API_Lib.mondayQuery;
  const getMondayToken = window.SP_API_Lib.getMondayToken;
  const getMondayUsers = window.SP_API_Lib.getMondayUsers;
  const getSpToken = window.SP_API_Lib.getSpToken;

  const runSync = async function () {
    if (_state.syncing) return;
    _state.syncing = true;

    try {
      const spToken = getSpToken();
      const mondayToken = await getMondayToken();
      if (!spToken || !mondayToken) { _state.syncing = false; return; }

      // Get logged user email - only sync tickets assigned to me
      const userEmail = ((await SP_Storage.get("userEmail")) || "").toLowerCase();
      if (!userEmail) { _state.syncing = false; return; }

      const stored = await SP_Storage.get("groupMondayConfig");
      const config = stored || {};
      const gId = Object.keys(config)[0];
      if (!gId || !config[gId]) { _state.syncing = false; return; }
      const workspaceId = config[gId].workspaceId;
      const etiqueta = config[gId].etiqueta;
      if (!workspaceId || !etiqueta) { _state.syncing = false; return; }

      // Fetch tickets from SP
      const res = await fetch(SP_SEARCH_API + "?page=0&size=50", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) { _state.syncing = false; return; }
      const json = await res.json();
      const allTickets = (json.data || json).content || [];

      // Filter: only tickets assigned to me
      const tickets = allTickets.filter(function (t) {
        return (t.responsibleEmail || "").toLowerCase() === userEmail;
      });
      if (!tickets.length) { _state.syncing = false; return; }

      // Get boards in workspace matching etiqueta
      const boardsRes = await mondayQuery(mondayToken, "{ boards(workspace_ids: [" + workspaceId + "], limit: 50) { id name } }", {});
      const ticketBoards = (boardsRes.boards || []).filter(function (b) {
        return b.name.includes(etiqueta) && !b.name.includes("Subelementos");
      });
      if (!ticketBoards.length) { _state.syncing = false; return; }

      const syncCtx = { mondayUsers: null, synced: 0 };
      const TICKET_COL_ID = window.SP_CONFIG.MONDAY_TICKET_COL_ID;

      for (var i = 0; i < tickets.length; i++) {
        const t = tickets[i];
        const uniqueCode = t.uniqueCode || "";
        if (!uniqueCode) continue;

        // Find the ticket in Monday boards
        const find = { itemId: null, boardId: null };
        for (var j = 0; j < ticketBoards.length; j++) {
          try {
            const itemRes = await mondayQuery(
              mondayToken,
              'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }',
              { boardId: ticketBoards[j].id, columnId: TICKET_COL_ID, value: uniqueCode }
            );
            const items = (itemRes.items_page_by_column_values && itemRes.items_page_by_column_values.items) || [];
            if (items.length) {
              find.itemId = items[0].id;
              find.boardId = ticketBoards[j].id;
              break;
            }
          } catch (e) { continue; }
        }
        if (!find.itemId) continue;

        // Build column values to update
        const spStatus = (t.ticketStatusName || "").toLowerCase();
        const mondayStatusIndex = window.mapStatusToMonday ? window.mapStatusToMonday(spStatus) : 5;
        const colValues = { status: { index: mondayStatusIndex } };

        // Update person
        const holderEmail = t.responsibleEmail || "";
        if (holderEmail) {
          if (!syncCtx.mondayUsers) syncCtx.mondayUsers = await getMondayUsers(mondayToken);
          const userId = syncCtx.mondayUsers[holderEmail.toLowerCase()];
          if (userId) {
            colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
          }
        }

        // Update Monday item
        try {
          await mondayQuery(
            mondayToken,
            'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }',
            { boardId: find.boardId, itemId: find.itemId, columnValues: JSON.stringify(colValues) }
          );
          syncCtx.synced++;
        } catch (e) {
          // If rate limited, stop processing remaining tickets
          if (e.message && e.message.includes("rate")) {
            SP_Log.warn("Monday Sync: Rate limited, stopping batch");
            break;
          }
        }
      }

      if (syncCtx.synced > 0) {
        SP_Log.info("Monday Sync: Updated", synced, "tickets");
      }
    } catch (e) {
      SP_Log.warn("Monday Sync Error:", e.message);
    } finally {
      _state.syncing = false;
    }
  };

  // Expose for manual trigger
  window._spMondaySyncForce = runSync;

  // Auto-run: 15s after load, then every 5 min
  setTimeout(runSync, 15000);
  setInterval(runSync, 300000);

  // Re-run on tab focus
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      setTimeout(runSync, 3000);
    }
  });

})();
