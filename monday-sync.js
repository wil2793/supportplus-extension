// ============================================================
// MONDAY-SYNC.JS - Auto-syncs ticket statuses from SP to Monday
// Uses shared lib/api.js (no more duplicated wrappers)
// ============================================================

(function () {
  "use strict";

  var SP_SEARCH_API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
  var _syncing = false;

  // Use shared API library
  var mondayQuery = window.SP_API_Lib.mondayQuery;
  var getMondayToken = window.SP_API_Lib.getMondayToken;
  var getMondayUsers = window.SP_API_Lib.getMondayUsers;
  var getSpToken = window.SP_API_Lib.getSpToken;

  var runSync = async function () {
    if (_syncing) return;
    _syncing = true;

    try {
      var spToken = getSpToken();
      var mondayToken = await getMondayToken();
      if (!spToken || !mondayToken) { _syncing = false; return; }

      // Get logged user email - only sync tickets assigned to me
      var userEmail = await SP_Storage.get("userEmail");
      userEmail = (userEmail || "").toLowerCase();
      if (!userEmail) { _syncing = false; return; }

      var stored = await SP_Storage.get("groupMondayConfig");
      var config = stored || {};
      var gId = Object.keys(config)[0];
      if (!gId || !config[gId]) { _syncing = false; return; }
      var workspaceId = config[gId].workspaceId;
      var etiqueta = config[gId].etiqueta;
      if (!workspaceId || !etiqueta) { _syncing = false; return; }

      // Fetch tickets from SP
      var res = await fetch(SP_SEARCH_API + "?page=0&size=50", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) { _syncing = false; return; }
      var json = await res.json();
      var allTickets = (json.data || json).content || [];

      // Filter: only tickets assigned to me
      var tickets = allTickets.filter(function (t) {
        return (t.responsibleEmail || "").toLowerCase() === userEmail;
      });
      if (!tickets.length) { _syncing = false; return; }

      // Get boards in workspace matching etiqueta
      var boardsRes = await mondayQuery(mondayToken, "{ boards(workspace_ids: [" + workspaceId + "], limit: 50) { id name } }", {});
      var ticketBoards = (boardsRes.boards || []).filter(function (b) {
        return b.name.includes(etiqueta) && !b.name.includes("Subelementos");
      });
      if (!ticketBoards.length) { _syncing = false; return; }

      var mondayUsers = null;
      var synced = 0;
      var TICKET_COL_ID = window.SP_CONFIG.MONDAY_TICKET_COL_ID;

      for (var i = 0; i < tickets.length; i++) {
        var t = tickets[i];
        var uniqueCode = t.uniqueCode || "";
        if (!uniqueCode) continue;

        // Find the ticket in Monday boards
        var mondayItemId = null;
        var foundBoardId = null;
        for (var j = 0; j < ticketBoards.length; j++) {
          try {
            var itemRes = await mondayQuery(
              mondayToken,
              'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }',
              { boardId: ticketBoards[j].id, columnId: TICKET_COL_ID, value: uniqueCode }
            );
            var items = (itemRes.items_page_by_column_values && itemRes.items_page_by_column_values.items) || [];
            if (items.length) {
              mondayItemId = items[0].id;
              foundBoardId = ticketBoards[j].id;
              break;
            }
          } catch (e) { continue; }
        }
        if (!mondayItemId) continue;

        // Build column values to update
        var spStatus = (t.ticketStatusName || "").toLowerCase();
        var mondayStatusIndex = window.mapStatusToMonday ? window.mapStatusToMonday(spStatus) : 5;
        var colValues = { status: { index: mondayStatusIndex } };

        // Update person
        var holderEmail = t.responsibleEmail || "";
        if (holderEmail) {
          if (!mondayUsers) mondayUsers = await getMondayUsers(mondayToken);
          var userId = mondayUsers[holderEmail.toLowerCase()];
          if (userId) {
            colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
          }
        }

        // Update Monday item
        try {
          await mondayQuery(
            mondayToken,
            'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }',
            { boardId: foundBoardId, itemId: mondayItemId, columnValues: JSON.stringify(colValues) }
          );
          synced++;
        } catch (e) {
          // If rate limited, stop processing remaining tickets
          if (e.message && e.message.includes("rate")) {
            SP_Log.warn("Monday Sync: Rate limited, stopping batch");
            break;
          }
        }
      }

      if (synced > 0) {
        SP_Log.info("Monday Sync: Updated", synced, "tickets");
      }
    } catch (e) {
      SP_Log.warn("Monday Sync Error:", e.message);
    } finally {
      _syncing = false;
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
