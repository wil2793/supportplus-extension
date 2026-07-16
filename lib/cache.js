// ============================================================
// LIB/CACHE.JS - Unified in-memory cache with TTL support
// Replaces ~6 scattered caches (Monday, profiles, groups, etc.)
// ============================================================

(function () {
  "use strict";

  const _store = {};

  /**
   * Get a value from cache. Returns null if expired or not found.
   * @param {string} key
   * @returns {any|null}
   */
  function get(key) {
    const entry = _store[key];
    if (!entry) return null;
    if (entry.ttl && Date.now() > entry.expires) {
      delete _store[key];
      return null;
    }
    return entry.value;
  }

  /**
   * Set a value in cache with optional TTL.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs] - Time to live in milliseconds. 0 or omitted = no expiry.
   */
  function set(key, value, ttlMs) {
    _store[key] = {
      value: value,
      ttl: ttlMs || 0,
      expires: ttlMs ? Date.now() + ttlMs : 0
    };
  }

  /**
   * Get a value from cache, or compute it if missing/expired.
   * The compute function is only called on cache miss.
   *
   * @param {string} key
   * @param {Function} computeFn - Async function that returns the value
   * @param {number} [ttlMs] - TTL for the computed value
   * @returns {Promise<any>}
   */
  async function getOrCompute(key, computeFn, ttlMs) {
    const cached = get(key);
    if (cached !== null) return cached;
    const value = await computeFn();
    set(key, value, ttlMs);
    return value;
  }

  /**
   * Check if a key exists and is not expired.
   * @param {string} key
   * @returns {boolean}
   */
  function has(key) {
    return get(key) !== null;
  }

  /**
   * Remove a specific key from cache.
   * @param {string} key
   */
  function remove(key) {
    delete _store[key];
  }

  /**
   * Clear all cached values, or only those matching a prefix.
   * @param {string} [prefix] - If provided, only clears keys starting with this prefix
   */
  function clear(prefix) {
    if (!prefix) {
      Object.keys(_store).forEach(function (k) { delete _store[k]; });
    } else {
      Object.keys(_store).forEach(function (k) {
        if (k.indexOf(prefix) === 0) delete _store[k];
      });
    }
  }

  /**
   * Get all current cache keys (for debugging).
   * @returns {string[]}
   */
  function keys() {
    return Object.keys(_store);
  }

  window.SP_Cache = {
    get: get,
    set: set,
    getOrCompute: getOrCompute,
    has: has,
    remove: remove,
    clear: clear,
    keys: keys
  };

})();
