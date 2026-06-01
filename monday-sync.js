// Monday Auto-Sync - Runs independently every 60s and on focus
// Syncs status and analyst from SP to Monday for all visible tickets
(function() {
  var SP_API = "https://macropayapi.supportplus.mx/tickets/web";
  var _syncing = false;

  async function getMondayToken() {
    return new Promise(function(r) { chrome.storage.local.get("mondayToken", function(d) { r(d.mondayToken || ""); }); });
  }

  async function mondayQ(token, query, variables) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: "monday-query", token: token, query: query, variables: variables }, function(resp) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp || !resp.success) return reject(new Error(resp?.error || "Monday query failed"));
        resolve(resp.data);
      });
    });
  }

  async function getMondayUsers(token) {
    var res = await mondayQ(token, '{ users { id email } }', {});
    var map = {};
    (res.users || []).forEach(function(u) { if (u.email) map[u.email.toLowerCase()] = u.id; });
    return map;
  }

  async function runSync() {
    if (_syncing) return;
    _syncing = true;
    try {
      var spToken = localStorage.getItem("token");
      var mondayToken = await getMondayToken();
      if (!spToken || !mondayToken) return;

      // Get all tickets from the current page (DataGrid rows)
      var rows = document.querySelectorAll(".MuiDataGrid-row");
      if (!rows.length) return;

      // Get all boards
      var boardsRes = await mondayQ(mondayToken, '{ boards(workspace_ids: [9956268], limit: 50) { id name } }', {});
      var ticketBoards = (boardsRes.boards || []).filter(function(b) { return b.name.includes("Tickets DBA -") && !b.name.includes("Subelementos"); });
      if (!ticketBoards.length) return;

      var mondayUsers = null; // lazy load

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var ticketId = row.getAttribute("data-id");
        if (!ticketId) continue;
        var codeCell = row.querySelector('[data-field="uniqueCode"] p.MuiTypography-body1');
        var uniqueCode = codeCell ? codeCell.textContent.trim() : "";
        if (!uniqueCode) continue;

        // Check if this ticket exists in Monday
        var mondayItemId = null, foundBoardId = null;
        for (var b of ticketBoards) {
          try {
            var itemRes = await mondayQ(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: uniqueCode });
            var items = itemRes.items_page_by_column_values?.items || [];
            if (items.length) { mondayItemId = items[0].id; foundBoardId = b.id; break; }
          } catch(e) { continue; }
        }
        if (!mondayItemId) continue;

        // Fetch ticket from SP to get current status and analyst
        try {
          var spRes = await fetch(SP_API + "/" + ticketId, { headers: { accept: "application/json", authorization: "Bearer " + spToken } });
          if (!spRes.ok) continue;
          var ticket = (await spRes.json()).data;
          if (!ticket) continue;

          var spStatus = (ticket.ticketStatusName || "").toLowerCase();
          var holderEmail = ticket.ticketHolder?.ticketHolderLog?.email || "";

          // Map status
          var mondayStatusIndex = 5;
          if (spStatus === "cerrado") mondayStatusIndex = 1;
          else if (spStatus === "asignado" || spStatus === "en atención") mondayStatusIndex = 0;
          else if (spStatus === "en espera") mondayStatusIndex = 5;
          else if (spStatus === "estancado") mondayStatusIndex = 2;

          var colValues = { status: { index: mondayStatusIndex } };

          // Map person
          if (holderEmail) {
            if (!mondayUsers) mondayUsers = await getMondayUsers(mondayToken);
            var userId = mondayUsers[holderEmail.toLowerCase()];
            if (userId) colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
          }

          // Update Monday
          await mondayQ(mondayToken, 'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: foundBoardId, itemId: mondayItemId, columnValues: JSON.stringify(colValues) });
          console.log("[SP Monday Sync]", uniqueCode, "->", spStatus, holderEmail);
        } catch(e) { continue; }
      }
    } catch(e) {
      console.log("[SP Monday Sync] Error:", e.message);
    } finally {
      _syncing = false;
    }
  }

  // Run on load (after 10s delay)
  setTimeout(runSync, 10000);

  // Run every 60 seconds
  setInterval(runSync, 60000);

  // Run on focus
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") setTimeout(runSync, 2000);
  });
})();
