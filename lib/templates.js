// ============================================================
// LIB/TEMPLATES.JS - Reusable HTML templates
// ============================================================

(function () {
  "use strict";

  // Note: esc is accessed lazily since components.js may load after this file
  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ─── Ticket Card ──────────────────────────────────────────

  /**
   * Generate HTML for a ticket card (used in manager panel columns)
   * @param {Object} ticket - Ticket data {id, uniqueCode, subject, requesterName, ticketStatusName, responsibleName}
   * @param {Object} [options]
   * @param {boolean} [options.draggable=false] - Whether the card is draggable
   * @param {string} [options.borderColor="#eee"] - Border color
   * @param {string} [options.codeColor="#1976D2"] - Unique code text color
   * @param {boolean} [options.showStatus=false] - Show status label
   * @param {boolean} [options.showResponsible=false] - Show responsible name instead of requester
   * @returns {string} HTML string
   */
  function ticketCard(ticket, options) {
    var opts = options || {};
    var draggable = opts.draggable ? 'draggable="true" ' : "";
    var cursor = opts.draggable ? "cursor:grab;" : "";
    var borderColor = opts.borderColor || "#eee";
    var codeColor = opts.codeColor || "#1976D2";
    var t = ticket;

    var html = '<div ' + draggable + 'data-ticket-id="' + t.id + '" class="sp-mgr-ticket" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid ' + borderColor + ';font-size:9px;line-height:1.3;' + cursor + '">';
    html += '<div style="font-weight:600;color:' + codeColor + ';">' + esc(t.uniqueCode || "") + '</div>';
    html += '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;">' + esc((t.subject || "").substring(0, 25)) + '</div>';

    if (opts.showStatus) {
      var statusColor = getStatusColor(t.ticketStatusName);
      var nameToShow = opts.showResponsible ? (t.responsibleName || "") : (t.requesterName || "");
      html += '<div style="display:flex;justify-content:space-between;">';
      html += '<span style="color:' + statusColor + ';font-weight:600;font-size:8px;">' + esc(t.ticketStatusName || "") + '</span>';
      html += '<span style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;" title="' + esc(nameToShow) + '">' + esc(nameToShow.split(" ")[0]) + '</span>';
      html += '</div>';
    } else {
      var person = opts.showResponsible ? (t.responsibleName || "") : (t.requesterName || "");
      html += '<div style="color:#888;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(person) + '">' + esc(person.split(" ")[0]) + '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Get color associated with a ticket status
   * @param {string} statusName
   * @returns {string} CSS color
   */
  function getStatusColor(statusName) {
    var map = {
      "En espera": "#FF8F00",
      "Asignado": "#1976D2",
      "En atención": "#FF9800",
      "Cerrado": "#2E7D32",
      "Rechazado": "#D32F2F",
      "Reabierto": "#FF5722"
    };
    return map[statusName] || "#888";
  }

  // ─── Column Header ────────────────────────────────────────

  /**
   * Generate HTML for a column header in the manager panel
   * @param {string} title - Column title
   * @param {string} bgColor - Header background color
   * @param {string} [countClass="sp-mgr-pcount"] - Class for the count span
   * @returns {string} HTML string
   */
  function columnHeader(title, bgColor, countClass) {
    var cls = countClass || "sp-mgr-pcount";
    return '<div style="background:' + bgColor + ';color:#fff;padding:4px 8px;font-size:10px;font-weight:700;text-align:center;">' + title + ' <span class="' + cls + '">(...)</span></div>';
  }

  // ─── Empty State ──────────────────────────────────────────

  /**
   * Generate HTML for an empty state message
   * @param {string} [text="Sin tickets"]
   * @returns {string} HTML string
   */
  function emptyState(text) {
    return '<div style="text-align:center;padding:6px;color:#aaa;font-size:10px;">' + esc(text || "Sin tickets") + '</div>';
  }

  // ─── Column Container ─────────────────────────────────────

  /**
   * Generate a column container div with consistent styling
   * @param {Object} options
   * @param {string} options.borderColor - Border color
   * @param {string} options.headerHtml - Inner header HTML
   * @param {string} options.profileId - Profile ID for the tickets zone
   * @param {string} options.groupId - Group ID
   * @returns {HTMLElement}
   */
  function createColumn(options) {
    var col = document.createElement("div");
    col.style.cssText = "min-width:160px;max-width:200px;border:1px solid " + options.borderColor + ";border-radius:6px;overflow:hidden;flex-shrink:0;";
    col.innerHTML = options.headerHtml +
      '<div class="sp-mgr-ptickets" data-profile-id="' + options.profileId + '" data-group-id="' + options.groupId + '" style="padding:3px;max-height:180px;overflow-y:auto;background:#fafafa;min-height:25px;"></div>';
    return col;
  }

  /**
   * Generate ticket list HTML from an array of tickets
   * @param {Array} tickets
   * @param {Object} [options] - Options passed to ticketCard
   * @returns {string} HTML string (empty state if no tickets)
   */
  function ticketList(tickets, options) {
    if (!tickets || !tickets.length) {
      return emptyState("Sin tickets");
    }
    return tickets.map(function (t) {
      return ticketCard(t, options);
    }).join("");
  }

  // ─── Pending Ticket Card ──────────────────────────────────

  /**
   * Generate HTML for a pending-close ticket card
   * @param {Object} pt - {ticketId, ticket}
   * @param {boolean} withinHours - Whether currently within work hours
   * @returns {string} HTML string
   */
  function pendingTicketCard(pt, withinHours) {
    var cursor = withinHours ? "cursor:pointer;" : "cursor:not-allowed;opacity:0.6;";
    var html = '<div class="sp-mgr-ticket sp-pending-ticket" data-ticket-id="' + pt.ticketId + '" style="display:block;padding:3px 5px;margin:2px 0;border-radius:4px;background:#fff;border:1px solid #FF8F00;font-size:9px;line-height:1.3;' + cursor + '">';
    html += '<div style="font-weight:600;color:#E65100;">' + esc(pt.ticket) + '</div>';
    if (!withinHours) {
      html += '<div style="color:#888;font-size:8px;">🔒 Fuera de horario</div>';
    }
    html += '</div>';
    return html;
  }

  // Expose as namespace
  window.SP_Templates = {
    ticketCard: ticketCard,
    ticketList: ticketList,
    columnHeader: columnHeader,
    emptyState: emptyState,
    createColumn: createColumn,
    getStatusColor: getStatusColor,
    pendingTicketCard: pendingTicketCard
  };

})();
