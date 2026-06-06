// Monday Auto-Sync - Syncs ALL tickets from SP API to Monday
(function() {
  var SP_SEARCH_API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
  var _syncing = false;

  async function mondayQ(token, query, variables) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: "monday-query", token: token, query: query, variables: variables }, function(resp) {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp || !resp.success) return reject(new Error(resp?.error || "Monday query failed"));
        resolve(resp.data);
      });
    });
  }

  async function getMondayToken() {
    return new Promise(function(r) { chrome.storage.local.get("mondayToken", function(d) { r(d.mondayToken || ""); }); });
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
      if (!spToken || !mondayToken) { _syncing = false; return; }

      // Get workspace ID from user's role config
      var _workspaceId = await new Promise(function(r) {
        chrome.storage.local.get(["notionUsers", "userEmail"], function(d) {
          var email = (d.userEmail || "").toLowerCase();
          var users = d.notionUsers || {};
          var user = users[email];
          r(user?.mondayWorkspaceId || "9956268");
        });
      });

      // Fetch tickets from SP
      var res = await fetch(SP_SEARCH_API + "?page=0&size=50", {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) { _syncing = false; return; }
      var json = await res.json();
      var tickets = (json.data || json).content || [];
      if (!tickets.length) { _syncing = false; return; }

      // Get all Monday boards
      var boardsRes = await mondayQ(mondayToken, '{ boards(workspace_ids: [' + _workspaceId + '], limit: 50) { id name } }', {});
      var ticketBoards = (boardsRes.boards || []).filter(function(b) { return b.name.includes("Tickets DBA -") && !b.name.includes("Subelementos"); });
      if (!ticketBoards.length) { _syncing = false; return; }

      var mondayUsers = null;
      var synced = 0;

      for (var t of tickets) {
        var uniqueCode = t.uniqueCode || "";
        if (!uniqueCode) continue;

        // Find in Monday
        var mondayItemId = null, foundBoardId = null;
        for (var b of ticketBoards) {
          try {
            var itemRes = await mondayQ(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: uniqueCode });
            var items = itemRes.items_page_by_column_values?.items || [];
            if (items.length) { mondayItemId = items[0].id; foundBoardId = b.id; break; }
          } catch(e) { continue; }
        }
        if (!mondayItemId) continue;

        // Map status
        var spStatus = (t.ticketStatusName || "").toLowerCase();
        var mondayStatusIndex = 5;
        if (spStatus === "cerrado") mondayStatusIndex = 1;
        else if (spStatus === "asignado" || spStatus === "en atención") mondayStatusIndex = 0;
        else if (spStatus === "en espera") mondayStatusIndex = 5;
        else if (spStatus === "estancado") mondayStatusIndex = 2;

        var colValues = { status: { index: mondayStatusIndex } };

        // Map person
        var holderEmail = t.responsibleEmail || "";
        if (holderEmail) {
          if (!mondayUsers) mondayUsers = await getMondayUsers(mondayToken);
          var userId = mondayUsers[holderEmail.toLowerCase()];
          if (userId) colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
        }

        // Update Monday
        try {
          await mondayQ(mondayToken, 'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }', { boardId: foundBoardId, itemId: mondayItemId, columnValues: JSON.stringify(colValues) });
          synced++;
        } catch(e) {}
      }
      if (synced > 0) console.log("[SP Monday Sync] Updated", synced, "tickets");
    } catch(e) {
      console.log("[SP Monday Sync] Error:", e.message);
    } finally {
      _syncing = false;
    }
  }

  // Expose for manual trigger from content.js
  window._spMondaySyncForce = runSync;

  // Run on load (15s delay)
  setTimeout(runSync, 15000);

  // Run every 5 minutes
  setInterval(runSync, 300000);

  // Run on focus
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") setTimeout(runSync, 3000);
  });
})();
