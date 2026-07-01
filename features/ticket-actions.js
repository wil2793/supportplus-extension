// ============================================================
// FEATURES/TICKET-ACTIONS.JS - Ticket API operations (pure logic, no UI)
// ============================================================

(function () {
  "use strict";

  var SP_CONFIG = window.SP_CONFIG;
  var SP_API_Lib = window.SP_API_Lib;

  // ─── Take / Reassign Ticket ───────────────────────────────

  /**
   * Reassign a ticket to a profile within a resolution group
   * @param {string|number} ticketId
   * @param {Object} options
   * @param {number} options.resolutionGroupId
   * @param {string} options.resolutionGroupLabel
   * @param {number} options.profileId - Target profile ID
   * @param {string} [options.comment] - Optional comment
   * @returns {Promise<Object>} - API response
   */
  async function reassignTicket(ticketId, options) {
    var spToken = SP_API_Lib.getSpToken();
    var body = {
      resolutionGroupId: options.resolutionGroupId,
      serviceId: null,
      responsibleProfileId: options.profileId,
      resolutionGroup: { label: options.resolutionGroupLabel, value: options.resolutionGroupId }
    };
    if (options.comment) {
      body.ticketCommentRequest = { internal: false, content: options.comment };
    }

    var res = await fetch(SP_CONFIG.SP_API + "/reassign/" + ticketId, {
      method: "PUT",
      headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    if (!json.success) throw new Error("Reassign failed");
    return json;
  }

  // ─── Close Ticket ─────────────────────────────────────────

  /**
   * Close a ticket (change status to Cerrado)
   * @param {string|number} ticketId
   * @returns {Promise<void>}
   */
  async function closeTicket(ticketId) {
    var spToken = SP_API_Lib.getSpToken();
    var res = await fetch(SP_CONFIG.SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
      body: JSON.stringify({ nextTicketStatusId: SP_CONFIG.SP_STATUSES.CERRADO, ticketCommentRequest: null })
    });
    if (!res.ok) throw new Error("Error al cerrar: HTTP " + res.status);
  }

  // ─── Add Comment ──────────────────────────────────────────

  /**
   * Add a comment to a ticket
   * @param {string|number} ticketId
   * @param {string} content - HTML content
   * @param {boolean} [internal=false]
   * @returns {Promise<void>}
   */
  async function addComment(ticketId, content, internal) {
    var spToken = SP_API_Lib.getSpToken();
    var res = await fetch(SP_CONFIG.SP_API + "/comment/" + ticketId, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
      body: JSON.stringify({ content: content, internal: !!internal })
    });
    if (!res.ok) throw new Error("Error al comentar: HTTP " + res.status);
  }

  // ─── Fetch Ticket Info ────────────────────────────────────

  /**
   * Fetch full ticket details from SP API
   * @param {string|number} ticketId
   * @returns {Promise<Object>}
   */
  async function fetchTicketDetail(ticketId) {
    var spToken = SP_API_Lib.getSpToken();
    var res = await fetch(SP_CONFIG.SP_API + "/" + ticketId, {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    return json.data || json;
  }

  // ─── Get Profiles for Group ───────────────────────────────

  var _profilesCache = {};

  /**
   * Get active profiles for a resolution group (cached)
   * @param {number} groupId
   * @returns {Promise<Array>}
   */
  async function getProfilesForGroup(groupId) {
    if (_profilesCache[groupId]) return _profilesCache[groupId];
    var spToken = SP_API_Lib.getSpToken();
    if (!spToken) return [];
    try {
      var res = await fetch(SP_CONFIG.SP_API + "/active-profiles-by-resolution-group/" + groupId, {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) return [];
      var json = await res.json();
      var profiles = json.data || json;
      if (Array.isArray(profiles)) {
        _profilesCache[groupId] = profiles;
        return profiles;
      }
      return [];
    } catch (e) { return []; }
  }

  // ─── Resolve My Profile ID ────────────────────────────────

  /**
   * Resolve the current user's profile ID for a given group
   * @param {number} groupId
   * @param {string} userName - Full name to match
   * @returns {Promise<number|null>}
   */
  async function resolveMyProfileId(groupId, userName) {
    if (!userName) return null;
    var profiles = await getProfilesForGroup(groupId);
    var me = profiles.find(function (p) { return p.profileFullName === userName; });
    return me ? me.profileId : null;
  }

  // ─── Save/Remove Pending Close (Notion) ───────────────────

  var TICKETS_POR_CERRAR_DB = "38420e0684b980d682ccfac983fc1780";

  /**
   * Save a ticket as pending close in Notion
   * @param {string} uniqueCode
   * @param {number} ticketId
   * @param {string} userNotionPageId
   * @returns {Promise<Object>}
   */
  function saveTicketPendingClose(uniqueCode, ticketId, userNotionPageId) {
    return SP_API_Lib.notionCreate({
      parent: { database_id: TICKETS_POR_CERRAR_DB },
      properties: {
        "Ticket": { title: [{ text: { content: uniqueCode } }] },
        "IdSupporPlus": { number: ticketId },
        "MSP_Usuarios": { relation: [{ id: userNotionPageId }] }
      }
    });
  }

  /**
   * Remove a ticket from pending close in Notion
   * @param {number} ticketId
   */
  function removeTicketPendingClose(ticketId) {
    SP_API_Lib.notionQuery(TICKETS_POR_CERRAR_DB, {
      filter: { property: "IdSupporPlus", number: { equals: ticketId } }
    }).then(function (data) {
      if (data && data.results) {
        data.results.forEach(function (page) {
          SP_API_Lib.notionDelete(page.id);
        });
      }
    }).catch(function () { });
  }

  /**
   * Fetch pending close tickets for user's groups
   * @param {number[]} userGroups
   * @returns {Promise<Array>} - [{ticket, ticketId, pageId}]
   */
  async function fetchPendingCloseTickets(userGroups) {
    try {
      var data = await SP_API_Lib.notionQuery(TICKETS_POR_CERRAR_DB, {});
      if (!data || !data.results) return [];

      var stored = await SP_Storage.get("notionUsers");
      var users = stored || {};
      var pending = [];

      data.results.forEach(function (page) {
        var ticket = "";
        try { ticket = page.properties.Ticket.title[0].plain_text; } catch (e) { }
        var spId = 0;
        try { spId = page.properties.IdSupporPlus.number; } catch (e) { }
        var userRel = [];
        try { userRel = page.properties.MSP_Usuarios.relation; } catch (e) { }
        if (!spId || !userRel.length) return;

        var creatorPageId = userRel[0].id;
        var creatorEmail = "";
        for (var email in users) {
          if (users[email].notionPageId === creatorPageId) { creatorEmail = email; break; }
        }
        if (!creatorEmail || !users[creatorEmail]) return;
        var creatorGroups = users[creatorEmail].groups || [];
        var sharedGroup = creatorGroups.some(function (g) { return userGroups.includes(g); });
        if (sharedGroup) {
          pending.push({ ticket: ticket, ticketId: spId, pageId: page.id });
        }
      });

      return pending;
    } catch (e) { return []; }
  }

  // ─── Migrate Ticket to Monday ─────────────────────────────

  /**
   * Build Monday column values for a ticket
   * @param {Object} ticket - Full ticket object from SP API
   * @param {Object} mondayUsers - email->userId map
   * @returns {Object} - Column values object
   */
  function buildMondayColumnValues(ticket, mondayUsers) {
    var ticketId = ticket.id;
    var holderEmail = (ticket.ticketHolder && ticket.ticketHolder.ticketHolderLog && ticket.ticketHolder.ticketHolderLog.email) || "";
    var personValue = {};
    if (holderEmail && mondayUsers) {
      var userId = mondayUsers[holderEmail.toLowerCase()];
      if (userId) personValue = { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] };
    }

    var url = "https://macropay.supportplus.mx/es/dashboard/tickets/" + ticketId;
    var desc = (ticket.description || "").replace(/<[^>]*>/g, "");
    var itemName = ticket.subject || "Sin asunto";
    var createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
    var spPriority = (ticket.incidentPriorityName || (ticket.incidentPriority && ticket.incidentPriority.name) || "").toLowerCase().trim();
    var priorityIndex = SP_CONFIG.PRIORITY_MAP[spPriority] !== undefined ? SP_CONFIG.PRIORITY_MAP[spPriority] : SP_CONFIG.PRIORITY_MAP["medio"];

    var colValues = {
      descripci_n_mkn9e5f4: { text: desc },
      status: { index: 1 },
      priority_mkn9kbe9: { index: priorityIndex },
      cronograma_mkn9hwe3: { from: createdDate, to: createdDate },
      link_mknkdctz: { url: url, text: ticket.uniqueCode || url },
      text_mm2c9nhc: ticket.uniqueCode || String(ticketId)
    };

    if (personValue.personsAndTeams) {
      colValues.multiple_person_mm25nvfq = personValue;
    }

    return { itemName: itemName, columnValues: colValues };
  }

  // Expose
  window.SP_TicketActions = {
    reassignTicket: reassignTicket,
    closeTicket: closeTicket,
    addComment: addComment,
    fetchTicketDetail: fetchTicketDetail,
    getProfilesForGroup: getProfilesForGroup,
    resolveMyProfileId: resolveMyProfileId,
    saveTicketPendingClose: saveTicketPendingClose,
    removeTicketPendingClose: removeTicketPendingClose,
    fetchPendingCloseTickets: fetchPendingCloseTickets,
    buildMondayColumnValues: buildMondayColumnValues
  };

})();
