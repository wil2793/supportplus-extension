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
    var opts = options || {};
    var maxAttempts = opts.maxAttempts || 30;
    var interval = opts.interval || 200;
    var parent = opts.parent || document;

    return new Promise(function (resolve) {
      var el = parent.querySelector(selector);
      if (el) return resolve(el);

      var attempts = 0;
      var timer = setInterval(function () {
        attempts++;
        el = parent.querySelector(selector);
        if (el || attempts >= maxAttempts) {
          clearInterval(timer);
          resolve(el || null);
        }
      }, interval);
    });
  }

  /**
   * Observe DOM changes and call callback when matching elements appear
   * Automatically debounced to avoid excessive calls.
   * @param {string} selector - CSS selector to watch for
   * @param {Function} callback - Called with the found element
   * @param {Object} [options]
   * @param {Element} [options.parent=document.body] - Parent to observe
   * @param {number} [options.debounce=300] - Debounce time in ms
   * @param {boolean} [options.once=false] - Disconnect after first match
   * @returns {MutationObserver} - The observer (call .disconnect() to stop)
   */
  function observeDOM(selector, callback, options) {
    var opts = options || {};
    var parent = opts.parent || document.body;
    var debounceMs = opts.debounce !== undefined ? opts.debounce : 300;
    var once = opts.once || false;
    var timer = null;

    var observer = new MutationObserver(function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var el = parent.querySelector(selector);
        if (el) {
          callback(el);
          if (once) observer.disconnect();
        }
      }, debounceMs);
    });

    observer.observe(parent, { childList: true, subtree: true });

    // Check immediately
    var existing = parent.querySelector(selector);
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
    var timer = null;
    return function () {
      var context = this;
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
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
    var lastCall = 0;
    return function () {
      var now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        fn.apply(this, arguments);
      }
    };
  }

  /**
   * Run a function once the target element exists, retry with exponential backoff
   * @param {string} selector
   * @param {Function} callback
   * @param {Object} [options]
   * @param {number} [options.maxAttempts=20]
   * @param {number} [options.initialDelay=100]
   */
  function onElementReady(selector, callback, options) {
    var opts = options || {};
    var maxAttempts = opts.maxAttempts || 20;
    var delay = opts.initialDelay || 100;
    var attempts = 0;

    (function check() {
      var el = document.querySelector(selector);
      if (el) {
        callback(el);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(check, delay);
      }
    })();
  }

  /**
   * Check if the current page path includes a substring
   * @param {string} path
   * @returns {boolean}
   */
  function isOnPage(path) {
    return window.location.pathname.includes(path);
  }

  /**
   * Check if current URL matches a detail ticket view
   * @returns {boolean}
   */
  function isDetailView() {
    return /\/tickets\/\d+/.test(window.location.pathname);
  }

  /**
   * Extract ticket ID from a detail view URL
   * @returns {string|null}
   */
  function getDetailTicketId() {
    var m = window.location.pathname.match(/\/tickets\/(\d+)/);
    return m ? m[1] : null;
  }

  /**
   * Safely get text content from a DOM element
   * @param {string} selector
   * @param {Element} [parent=document]
   * @returns {string}
   */
  function getTextContent(selector, parent) {
    var el = (parent || document).querySelector(selector);
    return el ? el.textContent.trim() : "";
  }

  /**
   * Create a DOM element with optional class, attributes, and children
   * @param {string} tag - Tag name
   * @param {Object} [opts]
   * @param {string} [opts.className] - CSS class(es)
   * @param {string} [opts.id] - Element ID
   * @param {string} [opts.text] - Text content
   * @param {string} [opts.html] - Inner HTML (use text OR html, not both)
   * @param {Object} [opts.attrs] - Attributes as key-value
   * @param {Object} [opts.style] - Inline styles as key-value
   * @param {Element[]} [opts.children] - Child elements to append
   * @returns {HTMLElement}
   */
  function createElement(tag, opts) {
    var el = document.createElement(tag);
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

  // Expose as namespace
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
