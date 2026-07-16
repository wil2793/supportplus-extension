// ============================================================
// LIB/MONDAY-UTILS.JS - Shared Monday.com operations
// Consolidates the "find item in Monday" pattern.
// ============================================================

(function () {
  "use strict";

  const SP_API_Lib = window.SP_API_Lib;
  const SP_CONFIG = window.SP_CONFIG;

  // ─── Find Monday Item by Unique Code ──────────────────────
  /**
   * Search all ticket boards for a Monday item matching a unique code.
   * @param {string} token - Monday API token
   * @param {string} uniqueCode - The ticket's unique code
   * @param {Object} [options]
   * @param {Array} [options.boards] - Pre-fetched boards array
   * @returns {Promise<{itemId: string, boardId: string}|null>}
   */
  async function findMondayItem(token, uniqueCode, options) {
    if (!uniqueCode || !token) return null;
    const opts = options || {};
    const boards = opts.boards || (await SP_API_Lib.getMondayTicketBoards(token));

    for (const board of boards) {
      try {
        const res = await SP_API_Lib.mondayQuery(
          token,
          'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }',
          { boardId: board.id, columnId: SP_CONFIG.MONDAY_TICKET_COL_ID, value: uniqueCode }
        );
        const items = (res.items_page_by_column_values && res.items_page_by_column_values.items) || [];
        if (items.length) {
          return { itemId: items[0].id, boardId: board.id };
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  // ─── Update Monday Item Status ────────────────────────────
  /**
   * @param {string} token
   * @param {string} uniqueCode
   * @param {string} statusName - SP status name
   * @param {Object} [options]
   * @returns {Promise<boolean>}
   */
  async function updateMondayStatus(token, uniqueCode, statusName, options) {
    const found = await findMondayItem(token, uniqueCode, options);
    if (!found) return false;

    const mondayStatusIndex = window.mapStatusToMonday(statusName);
    const colValues = JSON.stringify({ status: { index: mondayStatusIndex } });

    await SP_API_Lib.mondayQuery(
      token,
      'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }',
      { boardId: found.boardId, itemId: found.itemId, columnValues: colValues }
    );
    return true;
  }

  // ─── Update Monday Item Person ────────────────────────────
  /**
   * @param {string} token
   * @param {string} uniqueCode
   * @param {string} email
   * @param {Object} [options]
   * @returns {Promise<boolean>}
   */
  async function updateMondayPerson(token, uniqueCode, email, options) {
    if (!email) return false;
    const opts = options || {};
    const found = await findMondayItem(token, uniqueCode, opts);
    if (!found) return false;

    const usersMap = opts.usersMap || (await SP_API_Lib.getMondayUsers(token));
    const userId = usersMap[email.toLowerCase()];
    if (!userId) return false;

    const colValues = JSON.stringify({
      multiple_person_mm25nvfq: { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] }
    });

    await SP_API_Lib.mondayQuery(
      token,
      'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }',
      { boardId: found.boardId, itemId: found.itemId, columnValues: colValues }
    );
    return true;
  }

  // ─── Update Monday Item (Status + Person combined) ────────
  /**
   * @param {string} token
   * @param {string} uniqueCode
   * @param {Object} updates - { statusName, email }
   * @param {Object} [options]
   * @returns {Promise<boolean>}
   */
  async function updateMondayItem(token, uniqueCode, updates, options) {
    if (!uniqueCode || !token) return false;
    const opts = options || {};
    const found = await findMondayItem(token, uniqueCode, opts);
    if (!found) return false;

    const colValues = {};

    if (updates.statusName) {
      colValues.status = { index: window.mapStatusToMonday(updates.statusName) };
    }

    if (updates.email) {
      const usersMap = opts.usersMap || (await SP_API_Lib.getMondayUsers(token));
      const userId = usersMap[updates.email.toLowerCase()];
      if (userId) {
        colValues.multiple_person_mm25nvfq = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
      }
    }

    if (Object.keys(colValues).length === 0) return false;

    await SP_API_Lib.mondayQuery(
      token,
      'mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }',
      { boardId: found.boardId, itemId: found.itemId, columnValues: JSON.stringify(colValues) }
    );
    return true;
  }

  // ─── Fetch All Synced Tickets (code -> itemId map) ────────
  /**
   * @param {string} token
   * @param {Object} [options]
   * @returns {Promise<Object>} - { uniqueCode: mondayItemId }
   */
  async function fetchAllSyncedTickets(token, options) {
    const opts = options || {};
    const boards = opts.boards || (await SP_API_Lib.getMondayTicketBoards(token));
    if (!boards.length) return {};

    const synced = {};
    for (const board of boards) {
      const firstPage = await SP_API_Lib.mondayQuery(
        token,
        'query ($boardId: [ID!]!) { boards(ids: $boardId) { items_page(limit: 500) { cursor items { id column_values(ids: ["text_mm2c9nhc"]) { text } } } } }',
        { boardId: board.id }
      );
      const page = firstPage.boards[0].items_page;
      page.items.forEach(function (item) {
        const code = (item.column_values[0] && item.column_values[0].text || "").trim();
        if (code) synced[code] = item.id;
      });

      const _pagination = { cursor: page.cursor };
      while (_pagination.cursor) {
        const next = await SP_API_Lib.mondayQuery(
          token,
          'query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id column_values(ids: ["text_mm2c9nhc"]) { text } } } }',
          { cursor: _pagination.cursor }
        );
        next.next_items_page.items.forEach(function (item) {
          const code = (item.column_values[0] && item.column_values[0].text || "").trim();
          if (code) synced[code] = item.id;
        });
        _pagination.cursor = next.next_items_page.cursor;
      }
    }
    return synced;
  }

  // ─── Create Monday Item (migrate ticket) ───────────────────
  /**
   * Create a new Monday item for a ticket. Checks if it already exists first.
   * Returns the item ID (new or existing).
   *
   * @param {string} token - Monday API token
   * @param {Object} opts
   * @param {string} opts.boardId - Target board ID
   * @param {string} opts.groupId - Target group ID within the board
   * @param {Object} opts.ticket - Full ticket object from SP API
   * @param {Object} [opts.usersMap] - Pre-fetched email->userId map
   * @returns {Promise<string|null>} - Monday item ID or null on failure
   */
  async function createMondayItem(token, opts) {
    const ticket = opts.ticket;
    const uniqueCode = ticket.uniqueCode || String(ticket.id);

    // Check if already exists
    const existingId = await findMondayItem(token, uniqueCode, { boards: [{ id: opts.boardId }] });
    if (existingId) return existingId.itemId;

    // Build column values
    const holderEmail = (ticket.ticketHolder && ticket.ticketHolder.ticketHolderLog && ticket.ticketHolder.ticketHolderLog.email) || "";
    const usersMap = opts.usersMap || (holderEmail ? await SP_API_Lib.getMondayUsers(token) : {});
    const personValue = (function () {
      if (!holderEmail) return {};
      const userId = usersMap[holderEmail.toLowerCase()];
      return userId ? { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] } : {};
    })();

    const url = "https://macropay.supportplus.mx/es/dashboard/tickets/" + ticket.id;
    const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
    const itemName = ticket.subject || "Sin asunto";
    const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
    const spPriority = (ticket.incidentPriorityName || (ticket.incidentPriority && ticket.incidentPriority.name) || "").toLowerCase().trim();
    const priorityMap = window.SP_CONFIG.PRIORITY_MAP;
    const priorityIndex = priorityMap[spPriority] !== undefined ? priorityMap[spPriority] : priorityMap["medio"];

    const colValues = {
      descripci_n_mkn9e5f4: { text: desc },
      status: { index: 1 },
      priority_mkn9kbe9: { index: priorityIndex },
      cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
      link_mknkdctz: { url: url, text: uniqueCode },
      text_mm2c9nhc: uniqueCode
    };
    if (personValue.personsAndTeams) {
      colValues.multiple_person_mm25nvfq = personValue;
    }

    const result = await SP_API_Lib.mondayQuery(
      token,
      'mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }',
      { boardId: opts.boardId, groupId: opts.groupId, itemName: itemName, columnValues: JSON.stringify(colValues) }
    );
    return result.create_item.id;
  }

  // Expose
  window.SP_MondayUtils = {
    findMondayItem: findMondayItem,
    updateMondayStatus: updateMondayStatus,
    updateMondayPerson: updateMondayPerson,
    updateMondayItem: updateMondayItem,
    fetchAllSyncedTickets: fetchAllSyncedTickets,
    createMondayItem: createMondayItem
  };

})();
