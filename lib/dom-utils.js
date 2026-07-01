// ============================================================
// LIB/DOM-UTILS.JS - DOM helpers, retry/polling, observers
// ============================================================

(function () {
  "use strict";

  /**
   * Wait for a DOM element to appear (with retry)
   * @param {string} selector - CSS selector
   * @param {Object} [options]
   * @param {number} [options.maxAttempts=30] - Max polling attempts
   * @param {number} [options.interval=200] - Polling interval in ms
   * @param {Element} [options.parent=document] - Parent to search within
   * @returns {Promise<Element|null>}
   */
  function waitForElement(selector, options) {
    const opts = options || {};
    const maxAttempts = opts.maxAttempts || 30;
    const interval = opts.interval || 200;
    const parent = opts.parent || document;

    return new Promise(function (resolve) {
      const found = parent.querySelector(selector);
      if (found) return resolve(found);

      const refs = { attempts: 0 };
      const timer = setInterval(function () {
        refs.attempts++;
        const el = parent.querySelector(selector);
        if (el || refs.attempts >= maxAttempts) {
          clearInterval(timer);
          resolve(el || null);
        }
      }, interval);
    });
  }

  /**
   * Observe DOM changes and call callback when matching elements appear
   * @param {string} selector - CSS selector to watch for
   * @param {Function} callback - Called with the found element
   * @param {Object} [options]
   * @param {Element} [options.parent=document.body] - Parent to observe
   * @param {number} [options.debounce=300] - Debounce time in ms
   * @param {boolean} [options.once=false] - Disconnect after first match
   * @returns {MutationObserver}
   */
  function observeDOM(selector, callback, options) {
    const opts = options || {};
    const parent = opts.parent || document.body;
    const debounceMs = opts.debounce !== undefined ? opts.debounce : 300;
    const once = opts.once || false;
    const refs = { timer: null };

    const observer = new MutationObserver(function () {
      if (refs.timer) clearTimeout(refs.timer);
      refs.timer = setTimeout(function () {
        const el = parent.querySelector(selector);
        if (el) {
          callback(el);
          if (once) observer.disconnect();
        }
      }, debounceMs);
    });

    observer.observe(parent, { childList: true, subtree: true });

    const existing = parent.querySelector(selector);
    if (existing) {
      callback(existing);
      if (once) observer.disconnect();
    }

    return observer;
  }

  /**
   * Create a debounced version of a function
   * @param {Function} fn
   * @param {number} delay - Delay in ms
   * @returns {Function}
   */
  function debounce(fn, delay) {
    const refs = { timer: null };
    return function () {
      const context = this;
      const args = arguments;
      if (refs.timer) clearTimeout(refs.timer);
      refs.timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  /**
   * Create a throttled version of a function
   * @param {Function} fn
   * @param {number} limit - Minimum time between calls in ms
   * @returns {Function}
   */
  function throttle(fn, limit) {
    const refs = { lastCall: 0 };
    return function () {
      const now = Date.now();
      if (now - refs.lastCall >= limit) {
        refs.lastCall = now;
        fn.apply(this, arguments);
      }
    };
  }

  /**
   * Run a function once the target element exists
   * @param {string} selector
   * @param {Function} callback
   * @param {Object} [options]
   * @param {number} [options.maxAttempts=20]
   * @param {number} [options.initialDelay=100]
   */
  function onElementReady(selector, callback, options) {
    const opts = options || {};
    const maxAttempts = opts.maxAttempts || 20;
    const delay = opts.initialDelay || 100;
    const refs = { attempts: 0 };

    (function check() {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
      } else if (refs.attempts < maxAttempts) {
        refs.attempts++;
        setTimeout(check, delay);
      }
    })();
  }

  function isOnPage(path) {
    return window.location.pathname.includes(path);
  }

  function isDetailView() {
    return /\/tickets\/\d+/.test(window.location.pathname);
  }

  function getDetailTicketId() {
    const m = window.location.pathname.match(/\/tickets\/(\d+)/);
    return m ? m[1] : null;
  }

  function getTextContent(selector, parent) {
    const el = (parent || document).querySelector(selector);
    return el ? el.textContent.trim() : "";
  }

  function createElement(tag, opts) {
    const el = document.createElement(tag);
    if (!opts) return el;
    if (opts.className) el.className = opts.className;
    if (opts.id) el.id = opts.id;
    if (opts.text) el.textContent = opts.text;
    else if (opts.html) el.innerHTML = opts.html;
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) { el.setAttribute(k, opts.attrs[k]); });
    }
    if (opts.style) {
      Object.keys(opts.style).forEach(function (k) { el.style[k] = opts.style[k]; });
    }
    if (opts.children) {
      opts.children.forEach(function (child) { el.appendChild(child); });
    }
    return el;
  }

  window.SP_DOM = {
    waitForElement: waitForElement,
    observeDOM: observeDOM,
    debounce: debounce,
    throttle: throttle,
    onElementReady: onElementReady,
    isOnPage: isOnPage,
    isDetailView: isDetailView,
    getDetailTicketId: getDetailTicketId,
    getTextContent: getTextContent,
    createElement: createElement
  };

})();
