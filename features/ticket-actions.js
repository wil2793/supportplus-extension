// ============================================================
// FEATURES/TICKET-ACTIONS.JS - Ticket API operations (pure logic, no UI)
// ============================================================

(function () {
  "use strict";

  const SP_CONFIG = window.SP_CONFIG;
  const SP_API_Lib = window.SP_API_Lib;

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
    const spToken = SP_API_Lib.getSpToken();
    const body = {
      resolutionGroupId: options.resolutionGroupId,
      serviceId: null,
      responsibleProfileId: options.profileId,
      resolutionGroup: { label: options.resolutionGroupLabel, value: options.resolutionGroupId }
    };
    if (options.comment) {
      body.ticketCommentRequest = { internal: false, content: options.comment };
    }

    const res = await fetch(SP_CONFIG.SP_API + "/reassign/" + ticketId, {
      method: "PUT",
      headers: { "Content-Type": "application/json", accept: "application/json", authorization: "Bearer " + spToken },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
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
    const spToken = SP_API_Lib.getSpToken();
    const res = await fetch(SP_CONFIG.SP_API + "/update-ticket-status-with-optional-comment/" + ticketId, {
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
    const spToken = SP_API_Lib.getSpToken();
    const res = await fetch(SP_CONFIG.SP_API + "/comment/" + ticketId, {
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
    const spToken = SP_API_Lib.getSpToken();
    const res = await fetch(SP_CONFIG.SP_API + "/" + ticketId, {
      headers: { accept: "application/json", authorization: "Bearer " + spToken }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return json.data || json;
  }

  // ─── Get Profiles for Group ───────────────────────────────

  const _profilesCache = {};

  /**
   * Get active profiles for a resolution group (cached)
   * @param {number} groupId
   * @returns {Promise<Array>}
   */
  async function getProfilesForGroup(groupId) {
    if (_profilesCache[groupId]) return _profilesCache[groupId];
    const spToken = SP_API_Lib.getSpToken();
    if (!spToken) return [];
    try {
      const res = await fetch(SP_CONFIG.SP_API + "/active-profiles-by-resolution-group/" + groupId, {
        headers: { accept: "application/json", authorization: "Bearer " + spToken }
      });
      if (!res.ok) return [];
      const json = await res.json();
      const profiles = json.data || json;
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
    const profiles = await getProfilesForGroup(groupId);
    const me = profiles.find(function (p) { return p.profileFullName === userName; });
    return me ? me.profileId : null;
  }

  // ─── Save/Remove Pending Close (API) ────────────────────────

  /**
   * Save a ticket as pending close via API
   * @param {string} uniqueCode
   * @param {number} ticketId
   * @param {string} userIdStr - IdUsuario as string
   * @param {string} [groupId] - IdSupportPlus of the group
   * @returns {Promise<Object>}
   */
  function saveTicketPendingClose(uniqueCode, ticketId, userIdStr, groupId) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        type: "api-post",
        endpoint: "/tickets-por-cerrar",
        body: {
          ticket: uniqueCode,
          idSupportPlus: ticketId,
          fkIdUsuario: parseInt(userIdStr),
          fkIdcatGrupo: groupId ? parseInt(groupId) : null,
          usuarioAlta: "EXTENSION"
        }
      }, function (resp) {
        if (resp && resp.success) resolve(resp.data);
        else reject(new Error(resp && resp.error ? resp.error : "Error al guardar"));
      });
    });
  }

  /**
   * Mark a ticket as closed in MSP_TicketPorCerrar (historical)
   * @param {number} ticketId - IdSupportPlus
   */
  function removeTicketPendingClose(ticketId) {
    chrome.runtime.sendMessage({
      type: "api-put",
      endpoint: "/tickets-por-cerrar/cerrar-por-sp/" + ticketId,
      body: { usuarioModificacion: "EXTENSION" }
    }, function () { });
  }

  /**
   * Fetch pending close tickets for user's groups
   * @param {number[]} userGroups - Array of IdSupportPlus
   * @returns {Promise<Array>} - [{ticket, ticketId, pageId}]
   */
  async function fetchPendingCloseTickets(userGroups) {
    try {
      const results = await new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: "api-get", endpoint: "/tickets-por-cerrar" }, function (resp) {
          resolve(resp && resp.success ? (resp.data.data || []) : []);
        });
      });

      const pending = [];
      results.forEach(function (t) {
        // Filter by shared groups
        const ticketGroupSP = t.FK_IdcatGrupo; // This is IdcatGrupo, need IdSupportPlus
        // For now include all — the API already filters by Cerrado=0
        pending.push({ ticket: t.Ticket, ticketId: t.IdSupportPlus, pageId: String(t.IdTicketPorCerrar) });
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
    const ticketId = ticket.id;
    const holderEmail = (ticket.ticketHolder && ticket.ticketHolder.ticketHolderLog && ticket.ticketHolder.ticketHolderLog.email) || "";
    const personValue = (function () {
      if (!holderEmail || !mondayUsers) return {};
      const userId = mondayUsers[holderEmail.toLowerCase()];
      return userId ? { personsAndTeams: [{ id: parseInt(userId), kind: "person" }] } : {};
    })();

    const url = "https://macropay.supportplus.mx/es/dashboard/tickets/" + ticketId;
    const desc = (ticket.description || "").replace(/<[^>]*>/g, "");
    const itemName = ticket.subject || "Sin asunto";
    const createdDate = new Date(ticket.createdAt).toISOString().slice(0, 10);
    const spPriority = (ticket.incidentPriorityName || (ticket.incidentPriority && ticket.incidentPriority.name) || "").toLowerCase().trim();
    const priorityIndex = SP_CONFIG.PRIORITY_MAP[spPriority] !== undefined ? SP_CONFIG.PRIORITY_MAP[spPriority] : SP_CONFIG.PRIORITY_MAP["medio"];

    const colValues = {
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

  // ─── Close + Migrate Workflow ─────────────────────────────
  /**
   * Unified workflow: close a ticket and optionally migrate to Monday.
   * Used by showTakeModal and showCloseModal to avoid duplicating this logic.
   *
   * @param {Object} opts
   * @param {string|number} opts.ticketId
   * @param {string} [opts.comment] - Comment to add before closing
   * @param {boolean} [opts.assignFirst] - If true, assign to current user before closing
   * @param {string} [opts.mondayGroupId] - Monday group to migrate to (null = don't migrate)
   * @param {string} [opts.mondayBoardId] - Monday board ID
   * @param {string} [opts.mondayToken] - Monday API token
   * @param {Function} [opts.canMigrateCheck] - Async function that returns boolean (date validation)
   * @returns {Promise<{closed: boolean, migrated: boolean, mondayItemId: string|null}>}
   */
  async function closeAndMigrate(opts) {
    const spToken = SP_API_Lib.getSpToken();
    const result = { closed: false, migrated: false, mondayItemId: null };

    // Step 1: Add comment if provided
    if (opts.comment) {
      await addComment(opts.ticketId, "<p>" + opts.comment + "</p>", false);
    }

    // Step 2: Assign to current user if needed
    if (opts.assignFirst && opts.profileId && opts.resolutionGroupId) {
      await reassignTicket(opts.ticketId, {
        resolutionGroupId: opts.resolutionGroupId,
        resolutionGroupLabel: opts.resolutionGroupLabel || "",
        profileId: opts.profileId
      });
    }

    // Step 3: Close ticket
    await closeTicket(opts.ticketId);
    result.closed = true;

    // Step 4: Migrate to Monday if requested
    if (opts.mondayGroupId && opts.mondayBoardId && opts.mondayToken) {
      // Check if ticket matches board period
      const canMigrate = opts.canMigrateCheck ? await opts.canMigrateCheck() : true;
      if (canMigrate) {
        const ticketData = await fetchTicketDetail(opts.ticketId);
        const itemId = await window.SP_MondayUtils.createMondayItem(opts.mondayToken, {
          boardId: opts.mondayBoardId,
          groupId: opts.mondayGroupId,
          ticket: ticketData
        });
        if (itemId) {
          result.migrated = true;
          result.mondayItemId = itemId;
        }
      }
    }

    return result;
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
    buildMondayColumnValues: buildMondayColumnValues,
    closeAndMigrate: closeAndMigrate
  };

})();
