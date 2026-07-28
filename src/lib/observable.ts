// ============================================================
// SRC/LIB/OBSERVABLE.TS - Mini reactive observable for DOM events
// ============================================================

import { warn } from "./logger";

type Subscriber<T> = (value: T) => void;
type Unsubscribe = () => void;

export interface Subject<T> {
  subscribe: (fn: Subscriber<T>) => Unsubscribe;
  emit: (value: T) => void;
  getValue: () => T | undefined;
}

/** Creates a simple observable Subject that emits values to subscribers. */
export function createSubject<T>(initialValue?: T): Subject<T> {
  let value: T | undefined = initialValue;
  let subscribers: Subscriber<T>[] = [];

  return {
    subscribe(fn: Subscriber<T>): Unsubscribe {
      subscribers.push(fn);
      if (value !== undefined) fn(value);
      return () => {
        subscribers = subscribers.filter((s) => s !== fn);
      };
    },
    emit(newValue: T): void {
      value = newValue;
      subscribers.forEach((fn) => fn(newValue));
    },
    getValue(): T | undefined {
      return value;
    },
  };
}

export interface DOMObservable {
  subscribe: (fn: Subscriber<NodeListOf<Element>>) => Unsubscribe;
  disconnect: () => void;
}

/**
 * Creates an observable from a MutationObserver.
 * Emits the list of matching elements every time the DOM changes.
 */
export function fromDOMMutations(
  selector: string,
  options: { debounce?: number } = {},
): DOMObservable {
  const debounceMs = options.debounce ?? 0;
  const subject = createSubject<NodeListOf<Element>>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emitElements = () => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) subject.emit(elements);
  };

  const observer = new MutationObserver(() => {
    if (debounceMs > 0) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(emitElements, debounceMs);
    } else {
      emitElements();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  emitElements();

  return {
    subscribe: subject.subscribe,
    disconnect: () => observer.disconnect(),
  };
}

export interface NetworkObservable {
  subscribe: (
    fn: Subscriber<{ url: string; status: number; type: "xhr" | "fetch" }>,
  ) => Unsubscribe;
}

/**
 * Creates an observable that intercepts XHR/fetch responses.
 *
 * ⚠️ Modifies XMLHttpRequest.prototype and window.fetch globally.
 * Call only once per pattern — multiple calls stack interceptors.
 */
export function fromNetworkRequests(
  urlPattern: string | RegExp,
): NetworkObservable {
  warn(
    "SP_Observable.fromNetworkRequests: Patching global fetch/XHR for pattern:",
    String(urlPattern),
  );

  const subject = createSubject<{
    url: string;
    status: number;
    type: "xhr" | "fetch";
  }>();
  const pattern =
    typeof urlPattern === "string" ? new RegExp(urlPattern) : urlPattern;

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { _spUrl?: string },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this._spUrl = String(url);
    return originalXHROpen.call(
      this,
      method,
      url,
      ...(rest as [boolean, string?, string?]),
    );
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { _spUrl?: string },
    ...args: unknown[]
  ) {
    if (this._spUrl && pattern.test(this._spUrl)) {
      const url = this._spUrl;
      this.addEventListener("load", () => {
        subject.emit({ url, status: this.status, type: "xhr" });
      });
    }
    return originalXHRSend.call(
      this,
      ...(args as [Document | XMLHttpRequestBodyInit | null | undefined]),
    );
  };

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const promise = originalFetch.call(window, input, init);
    if (url && pattern.test(url)) {
      promise
        .then((response) =>
          subject.emit({ url, status: response.status, type: "fetch" }),
        )
        .catch(() => undefined);
    }
    return promise;
  };

  return { subscribe: subject.subscribe };
}

const SP_Observable = { createSubject, fromDOMMutations, fromNetworkRequests };
export default SP_Observable;
