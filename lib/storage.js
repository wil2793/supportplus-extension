// ============================================================
// LIB/STORAGE.JS - Centralized chrome.storage access
// ============================================================

(function () {
  "use strict";

  /**
   * Get a single value from chrome.storage.local
   * @param {string} key
   * @returns {Promise<any>}
   */
  function getItem(key) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(key, function (result) {
        resolve(result[key] !== undefined ? result[key] : null);
      });
    });
  }

  /**
   * Get multiple values from chrome.storage.local
   * @param {string[]} keys
   * @returns {Promise<Object>}
   */
  function getMultiple(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (result) {
        resolve(result || {});
      });
    });
  }

  /**
   * Set a single key-value pair in chrome.storage.local
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  function setItem(key, value) {
    return new Promise(function (resolve) {
      const obj = {};
      obj[key] = value;
      chrome.storage.local.set(obj, function () {
        resolve();
      });
    });
  }

  /**
   * Set multiple key-value pairs in chrome.storage.local
   * @param {Object} items
   * @returns {Promise<void>}
   */
  function setMultiple(items) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(items, function () {
        resolve();
      });
    });
  }

  /**
   * Remove a key from chrome.storage.local
   * @param {string} key
   * @returns {Promise<void>}
   */
  function removeItem(key) {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(key, function () {
        resolve();
      });
    });
  }

  /**
   * Get a value with a default fallback
   * @param {string} key
   * @param {any} defaultValue
   * @returns {Promise<any>}
   */
  function getOrDefault(key, defaultValue) {
    return getItem(key).then(function (val) {
      return val !== null ? val : defaultValue;
    });
  }

  // Expose as namespace
  window.SP_Storage = {
    get: getItem,
    getMultiple: getMultiple,
    getOrDefault: getOrDefault,
    set: setItem,
    setMultiple: setMultiple,
    remove: removeItem
  };

})();
