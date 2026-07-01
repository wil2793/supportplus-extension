// ============================================================
// LIB/API.JS - Unified API wrappers (SP, Monday, Notion)
// ============================================================

(function () {
  "use strict";

  const SP_API = window.SP_CONFIG.SP_API;
  const SP_SEARCH_API = window.SP_CONFIG.SP_SEARCH_API;

  // ─── Cache ────────────────────────────────────────────────
  const _cache = { token: "", users: null, boards: {}, workspace: "" };

  // ─── SupportPlus API ──────────────────────────────────────

  /**
   * Get the current SP auth token from localStorage
   * @returns {string}
   */
  function getSpToken() {
    return localStorage.getItem("token") || "";
  }

  /**
   * Fetch from SupportPlus API with automatic auth header
   * @param {string} endpoint - Relative path (appended to SP_API) or full URL
   * @param {Object} [options] - fetch options override
   * @param {number} [options.timeout=30000] - Request timeout in ms
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async function spFetch(endpoint, options) {
    const url = endpoint.startsWith("http") ? endpoint : SP_API + "/" + endpoint;
    const token = getSpToken();
    const timeout = (options && options.timeout) || 30000;
    const defaults = {
      headers: {
        accept: "application/json",
        authorization: "Bearer " + token
      }
    };

    const config = Object.assign({}, defaults, options || {});
    if (options && options.headers) {
      config.headers = Object.assign({}, defaults.headers, options.headers);
    }
    delete config.timeout;

    // AbortController for timeout
    const controller = new AbortController();
    config.signal = controller.signal;
    const timer = setTimeout(function () { controller.abort(); }, timeout);

    try {
      const res = await fetch(url, config);
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error("SP API error: HTTP " + res.status + " on " + url);
      }
      return res.json();
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        throw new Error("SP API timeout: " + url + " (" + timeout + "ms)");
      }
      throw e;
    }
  }

  /**
   * Search tickets using the search-all-tickets endpoint
   * @param {Object} params - Query parameters as key-value pairs
   * @returns {Promise<Array>} - Array of tickets
   */
  async function spSearchTickets(params) {
    const query = Object.keys(params)
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); })
      .join("&");
    const url = SP_SEARCH_API + "?" + query;
    const json = await spFetch(url);
    return (json.data || json).content || [];
  }

  // ─── Monday.com API ───────────────────────────────────────

  /**
   * Execute a Monday.com GraphQL query via background proxy
   * @param {string} token - Monday API token
   * @param {string} query - GraphQL query string
   * @param {Object} [variables] - GraphQL variables
   * @returns {Promise<Object>} - Response data
   */
  function mondayQuery(token, query, variables) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: "monday-query", token: token, query: query, variables: variables || {} },
        function (resp) {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!resp || !resp.success) {
            return reject(new Error(resp && resp.error ? resp.error : "Monday query failed"));
          }
          resolve(resp.data);
        }
      );
    });
  }

  /**
   * Get the Monday.com API token (cached, auto-refreshes if empty)
   * @returns {Promise<string>}
   */
  function getMondayToken() {
    if (_cache.token) return Promise.resolve(_cache.token);
    return SP_Storage.get("mondayToken").then(function (token) {
      _cache.token = token || "";
      // If still empty, retry once after a short delay (sync may be in progress)
      if (!_cache.token) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            SP_Storage.get("mondayToken").then(function (t) {
              _cache.token = t || "";
              resolve(_cache.token);
            });
          }, 2000);
        });
      }
      return _cache.token;
    });
  }

  /**
   * Clear the Monday token cache (useful after config changes)
   */
  function clearMondayTokenCache() {
    _cache.token = "";
  }

  /**
   * Get Monday.com workspace ID for a group
   * @param {string|number} [groupId] - Resolution group ID
   * @returns {Promise<string>}
   */
  async function getMondayWorkspaceId(groupId) {
    if (_cache.workspace) return _cache.workspace;
    const stored = await SP_Storage.get("groupMondayConfig");
    const config = stored || {};
    const gId = groupId || Object.keys(config)[0] || "";
    if (gId && config[gId]) {
      _cache.workspace = config[gId].workspaceId || "";
    }
    return _cache.workspace;
  }

  /**
   * Get Monday.com config for a specific group
   * @param {string|number} groupId
   * @returns {Promise<Object|null>}
   */
  async function getMondayConfigForGroup(groupId) {
    const stored = await SP_Storage.get("groupMondayConfig");
    const config = stored || {};
    return config[groupId] || null;
  }

  /**
   * Get all ticket boards for a workspace (excludes "Subelementos")
   * @param {string} token - Monday API token
   * @param {string} [workspaceId] - Workspace ID (auto-resolved if not provided)
   * @returns {Promise<Array>} - Array of {id, name}
   */
  async function getMondayTicketBoards(token, workspaceId) {
    const wsId = workspaceId || (await getMondayWorkspaceId());
    if (!wsId) return [];
    const data = await mondayQuery(token, "{ boards(workspace_ids: [" + wsId + "], limit: 50) { id name } }", {});
    return (data.boards || []).filter(function (b) {
      return !b.name.includes("Subelementos");
    });
  }

  /**
   * Get Monday.com users as email->id map (cached)
   * @param {string} token
   * @returns {Promise<Object>}
   */
  function getMondayUsers(token) {
    if (!_cache.users) {
      _cache.users = mondayQuery(token, "{ users(limit:500) { id email } }", {})
        .then(function (data) {
          const map = {};
          (data.users || []).forEach(function (u) {
            if (u.email) map[u.email.toLowerCase()] = u.id;
          });
          return map;
        })
        .catch(function () {
          _cache.users = null;
          return {};
        });
    }
    return _cache.users;
  }

  /**
   * Get the Monday board ID for a specific month/year/group
   * @param {number} year
   * @param {number} month - 0-indexed
   * @param {string|number} groupId
   * @returns {Promise<string|null>}
   */
  async function getMondayBoardForMonth(year, month, groupId) {
    const mondayConfig = await getMondayConfigForGroup(groupId);
    if (!mondayConfig || !mondayConfig.etiqueta) return null;

    const key = groupId + "-" + year + "-" + String(month + 1).padStart(2, "0");
    if (_cache.boards[key]) return _cache.boards[key];

    const token = await getMondayToken();
    if (!token) return null;

    const meses = window.SP_CONFIG.MONTH_NAMES;
    const boardName = mondayConfig.etiqueta + " - " + meses[month] + " - " + year;
    const boards = await getMondayTicketBoards(token);
    const board = boards.find(function (b) {
      return b.name.trim().toLowerCase() === boardName.trim().toLowerCase();
    });

    if (board) {
      _cache.boards[key] = board.id;
      return board.id;
    }
    return null;
  }

  /**
   * Get the Monday board ID for the current month
   * @param {string|number} [groupId]
   * @returns {Promise<string|null>}
   */
  function getMondayBoardId(groupId) {
    const now = new Date();
    return getMondayBoardForMonth(now.getFullYear(), now.getMonth(), groupId);
  }

  /**
   * Check if a ticket exists in Monday by uniqueCode
   * @param {string} token
   * @param {string} uniqueCode
   * @returns {Promise<string|null>} - Monday item ID if found
   */
  async function checkTicketInMonday(token, uniqueCode) {
    if (!uniqueCode) return null;
    const boards = await getMondayTicketBoards(token);
    for (var i = 0; i < boards.length; i++) {
      try {
        const res = await mondayQuery(
          token,
          'query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }',
          { boardId: boards[i].id, columnId: window.SP_CONFIG.MONDAY_TICKET_COL_ID, value: uniqueCode }
        );
        const items = (res.items_page_by_column_values && res.items_page_by_column_values.items) || [];
        if (items.length) return items[0].id;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  // ─── Notion API (via background) ─────────────────────────

  /**
   * Send a message to background for Notion operations
   * @param {string} type - Message type (notion-query, notion-create, etc.)
   * @param {Object} data - Additional data for the message
   * @returns {Promise<Object>}
   */
  function notionMessage(type, data) {
    return new Promise(function (resolve, reject) {
      const message = Object.assign({ type: type }, data || {});
      chrome.runtime.sendMessage(message, function (resp) {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp || !resp.success) {
          return reject(new Error(resp && resp.error ? resp.error : "Notion operation failed"));
        }
        resolve(resp.data);
      });
    });
  }

  /**
   * Query a Notion database
   * @param {string} dbId
   * @param {Object} [body] - Filter/sort options
   * @returns {Promise<Object>}
   */
  function notionQuery(dbId, body) {
    return notionMessage("notion-query", { dbId: dbId, body: body || {} });
  }

  /**
   * Create a page in Notion
   * @param {Object} body - Page creation body (parent, properties)
   * @returns {Promise<Object>}
   */
  function notionCreate(body) {
    return notionMessage("notion-create", { body: body });
  }

  /**
   * Update a Notion page
   * @param {string} pageId
   * @param {Object} body - Properties to update
   * @returns {Promise<Object>}
   */
  function notionUpdate(pageId, body) {
    return notionMessage("notion-update", { pageId: pageId, body: body });
  }

  /**
   * Archive (soft-delete) a Notion page
   * @param {string} pageId
   * @returns {Promise<Object>}
   */
  function notionDelete(pageId) {
    return notionMessage("notion-delete", { pageId: pageId });
  }

  /**
   * Get a single Notion page by ID
   * @param {string} pageId
   * @returns {Promise<Object>}
   */
  function notionGetPage(pageId) {
    return notionMessage("notion-page", { pageId: pageId });
  }

  /**
   * Get multiple Notion pages by IDs (batched)
   * @param {string[]} pageIds
   * @returns {Promise<Object[]>}
   */
  function notionGetPages(pageIds) {
    return notionMessage("notion-pages-batch", { pageIds: pageIds });
  }

  // ─── Background utilities ─────────────────────────────────

  /**
   * Trigger Notion sync in background
   * @returns {Promise<Object>}
   */
  function triggerNotionSync() {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: "sync-notion" }, function (resp) {
        resolve(resp || {});
      });
    });
  }

  /**
   * Fetch a URL via background proxy (avoids CORS)
   * @param {string} url
   * @returns {Promise<Uint8Array>}
   */
  function proxyFetch(url) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ type: "proxy-fetch", url: url }, function (resp) {
        if (resp && resp.success) {
          resolve(new Uint8Array(resp.data));
        } else {
          reject(new Error(resp && resp.error ? resp.error : "Proxy fetch failed"));
        }
      });
    });
  }

  // Expose as namespace
  window.SP_API_Lib = {
    // SP
    getSpToken: getSpToken,
    spFetch: spFetch,
    spSearchTickets: spSearchTickets,

    // Monday
    mondayQuery: mondayQuery,
    getMondayToken: getMondayToken,
    clearMondayTokenCache: clearMondayTokenCache,
    getMondayWorkspaceId: getMondayWorkspaceId,
    getMondayConfigForGroup: getMondayConfigForGroup,
    getMondayTicketBoards: getMondayTicketBoards,
    getMondayUsers: getMondayUsers,
    getMondayBoardForMonth: getMondayBoardForMonth,
    getMondayBoardId: getMondayBoardId,
    checkTicketInMonday: checkTicketInMonday,

    // Notion
    notionQuery: notionQuery,
    notionCreate: notionCreate,
    notionUpdate: notionUpdate,
    notionDelete: notionDelete,
    notionGetPage: notionGetPage,
    notionGetPages: notionGetPages,

    // Background
    triggerNotionSync: triggerNotionSync,
    proxyFetch: proxyFetch
  };

})();
