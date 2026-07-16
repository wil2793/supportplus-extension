// ============================================================
// LIB/EVENT-BUS.JS - Centralized typed event bus
// Replaces scattered CustomEvent dispatches with a single hub.
// ============================================================

(function () {
  "use strict";

  const _listeners = {};

  /**
   * Subscribe to an event.
   * @param {string} event - Event name
   * @param {Function} handler - Callback function
   * @returns {Function} - Unsubscribe function
   */
  function on(event, handler) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(handler);
    return function () {
      _listeners[event] = _listeners[event].filter(function (h) { return h !== handler; });
    };
  }

  /**
   * Subscribe to an event — fires only once, then auto-unsubscribes.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} - Unsubscribe function (in case you want to cancel early)
   */
  function once(event, handler) {
    const unsubscribe = on(event, function (data) {
      unsubscribe();
      handler(data);
    });
    return unsubscribe;
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event - Event name
   * @param {any} [data] - Optional payload
   */
  function emit(event, data) {
    // Notify internal listeners
    const handlers = _listeners[event];
    if (handlers) {
      handlers.forEach(function (h) {
        try { h(data); } catch (e) { SP_Log.warn("EventBus handler error [" + event + "]:", e.message); }
      });
    }
    // Also dispatch as CustomEvent for backward compatibility
    document.dispatchEvent(new CustomEvent(event, { detail: data }));
  }

  /**
   * Remove all listeners for an event (or all events if no name given).
   * @param {string} [event]
   */
  function off(event) {
    if (event) {
      delete _listeners[event];
    } else {
      Object.keys(_listeners).forEach(function (k) { delete _listeners[k]; });
    }
  }

  // ─── Known Event Names (documentation + autocomplete) ─────
  // These are the events used throughout the extension:
  const EVENTS = {
    OPEN_CONFIG: "sp-open-config",
    OPEN_TICKET: "sp-open-ticket",
    REFRESH_PANEL: "sp-refresh-panel",
    SESSION_READY: "sp-session-ready"
  };

  window.SP_Events = {
    on: on,
    once: once,
    emit: emit,
    off: off,
    EVENTS: EVENTS
  };

})();
