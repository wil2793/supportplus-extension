// ============================================================
// LIB/OBSERVABLE.JS - Mini reactive observable for DOM events
// ============================================================

(function () {
  "use strict";

  /**
   * Creates a simple observable that emits values to subscribers.
   * @returns {{ subscribe, emit, getValue }}
   */
  function createSubject(initialValue) {
    const _state = { value: initialValue, subscribers: [] };

    return {
      subscribe: function (fn) {
        _state.subscribers.push(fn);
        // Emit current value immediately to new subscriber
        if (_state.value !== undefined) fn(_state.value);
        // Return unsubscribe function
        return function () {
          _state.subscribers = _state.subscribers.filter(function (s) { return s !== fn; });
        };
      },
      emit: function (value) {
        _state.value = value;
        _state.subscribers.forEach(function (fn) { fn(value); });
      },
      getValue: function () {
        return _state.value;
      }
    };
  }

  /**
   * Creates an observable from a MutationObserver.
   * Emits the list of MuiDataGrid rows every time the DOM changes.
   * @param {string} selector - CSS selector to observe for
   * @param {Object} [options]
   * @param {number} [options.debounce=0] - Debounce time in ms (0 = immediate)
   * @returns {{ subscribe, disconnect }}
   */
  function fromDOMMutations(selector, options) {
    const opts = options || {};
    const debounceMs = opts.debounce || 0;
    const subject = createSubject(null);
    const _refs = { timer: null };

    function emitElements() {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        subject.emit(elements);
      }
    }

    const observer = new MutationObserver(function () {
      if (debounceMs > 0) {
        if (_refs.timer) clearTimeout(_refs.timer);
        _refs.timer = setTimeout(emitElements, debounceMs);
      } else {
        emitElements();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Emit immediately if elements already exist
    emitElements();

    return {
      subscribe: subject.subscribe,
      disconnect: function () { observer.disconnect(); }
    };
  }

  /**
   * Creates an observable that intercepts XHR/fetch responses.
   * Emits whenever the page makes a network request that matches a pattern.
   * @param {string|RegExp} urlPattern - URL pattern to match
   * @returns {{ subscribe }}
   */
  function fromNetworkRequests(urlPattern) {
    const subject = createSubject(null);
    const pattern = typeof urlPattern === "string" ? new RegExp(urlPattern) : urlPattern;

    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._spUrl = url;
      return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      const xhr = this;
      if (xhr._spUrl && pattern.test(xhr._spUrl)) {
        xhr.addEventListener("load", function () {
          subject.emit({ url: xhr._spUrl, status: xhr.status, type: "xhr" });
        });
      }
      return originalXHRSend.apply(this, arguments);
    };

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url ? input.url : "");
      const promise = originalFetch.apply(this, arguments);
      if (url && pattern.test(url)) {
        promise.then(function (response) {
          subject.emit({ url: url, status: response.status, type: "fetch" });
        }).catch(function () {});
      }
      return promise;
    };

    return {
      subscribe: subject.subscribe
    };
  }

  window.SP_Observable = {
    createSubject: createSubject,
    fromDOMMutations: fromDOMMutations,
    fromNetworkRequests: fromNetworkRequests
  };

})();
