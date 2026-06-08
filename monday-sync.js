// Monday Auto-Sync - Syncs ALL tickets from SP API to Monday
(function() {
  const SP_SEARCH_API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
  let _syncing = false;

  const mondayQ = (token, query, variables) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "monday-query", token, query, variables }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.success) return reject(new Error(resp?.error || "Monday query failed"));
      resolve(resp.data);
    });
  });

  const getMondayToken = () => new Promise((r) => {
    chrome.storage.local.get("mondayToken", (d) => r(d.mondayToken || ""));
  });

  const getMondayUsers = async (token) => {
    const res = await mondayQ(token, '{ users { id email } }', {});
    const map = {};
    (res.users || []).forEach((u) => { if (u.email) map[u.email.toLowerCase()] = u.id; });
    return map;
  };

  const runSync = async () => {
    if (_syncing) return;
    _syncing = true;
    try {
      const spToken = localStorage.getItem("token");
      const mondayToken = await getMondayToken();
      if (!spToken || !mondayToken) { _syncing = false; return; }

      // Get logged user email - only sync tickets assigned to me
      const userEmail = await new Promise((r) => {
        chrome.storage.local.get("userEmail", (d) => r((d.userEmail || "").toLowerCase()));
      });
      if (!userEmail) { _syncing = false; return; }

      const { workspaceId, etiqueta } = await new Promise((r) => {
        chrome.storage.local.get(["groupMondayConfig"], (d) => {
          const config = d.groupMondayConfig || {};
          const gId = Object.keys(config)[0];
          r(gId ? { workspaceId: config[gId].workspaceId, etiqueta: config[gId].etiqueta } : { workspaceId: "", etiqueta: "" });
        });
      });
      if (!workspaceId || !etiqueta) { _syncing = false; return; }

      const res = await fetch(`${SP_SEARCH_API}?page=0&size=50`, {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) { _syncing = false; return; }
      const json = await res.json();
      const allTickets = (json.data || json).content || [];
      // Filter: only tickets assigned to me
      const tickets = allTickets.filter((t) => {
        const responsible = (t.responsibleEmail || "").toLowerCase();
        return responsible === userEmail;
      });
      if (!tickets.length) { _syncing = false; return; }

      const boardsRes = await mondayQ(mondayToken, `{ boards(workspace_ids: [${workspaceId}], limit: 50) { id name } }`, {});
      const ticketBoards = (boardsRes.boards || []).filter((b) => b.name.includes(etiqueta) && !b.name.includes("Subelementos"));
      if (!ticketBoards.length) { _syncing = false; return; }

      let mondayUsers = null;
      let synced = 0;

      for (const t of tickets) {
        const uniqueCode = t.uniqueCode || "";
        if (!uniqueCode) continue;

        let mondayItemId = null, foundBoardId = null;
        for (const b of ticketBoards) {
          try {
            const itemRes = await mondayQ(mondayToken, 'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }', { boardId: b.id, columnId: "text_mm2c9nhc", value: uniqueCode });
            const items = itemRes.items_page_by_column_values?.items || [];
            if (items.length) { mondayItemId = items[0].id; foundBoardId = b.id; break; }
          } catch(e) { continue; }
        }
        if (!mondayItemId) continue;

        const spStatus = (t.ticketStatusName || "").toLowerCase();
        const mondayStatusIndex = window.mapStatusToMonday ? window.mapStatusToMonday(spStatus) : 5;
        const colValues = { status: { index: mondayStatusIndex } };

        const holderEmail = t.responsibleEmail || "";
        if (holderEmail) {
          if (!mondayUsers) mondayUsers = await getMondayUsers(mondayToken);
          const userId = mondayUsers[holderEmail.toLowerCase()];
          if (userId) colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
        }

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
  };

  window._spMondaySyncForce = runSync;
  setTimeout(runSync, 15000);
  setInterval(runSync, 300000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(runSync, 3000);
  });
})();
