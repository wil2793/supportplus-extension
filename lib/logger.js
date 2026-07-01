// ============================================================
// LIB/LOGGER.JS - Centralized logging with levels
// ============================================================

(function () {
  "use strict";

  const PREFIX = "[SP]";
  const LOG_LEVEL = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
  const _state = { level: LOG_LEVEL.INFO };

  function setLevel(level) {
    if (LOG_LEVEL[level] !== undefined) {
      _state.level = LOG_LEVEL[level];
    }
  }

  function debug() {
    if (_state.level <= LOG_LEVEL.DEBUG) {
      console.log.apply(console, [PREFIX + " [DEBUG]"].concat(Array.from(arguments)));
    }
  }

  function info() {
    if (_state.level <= LOG_LEVEL.INFO) {
      console.log.apply(console, [PREFIX].concat(Array.from(arguments)));
    }
  }

  function warn() {
    if (_state.level <= LOG_LEVEL.WARN) {
      console.warn.apply(console, [PREFIX].concat(Array.from(arguments)));
    }
  }

  function error() {
    if (_state.level <= LOG_LEVEL.ERROR) {
      console.error.apply(console, [PREFIX].concat(Array.from(arguments)));
    }
  }

  window.SP_Log = {
    debug: debug,
    info: info,
    warn: warn,
    error: error,
    setLevel: setLevel,
    LEVELS: LOG_LEVEL
  };

})();
