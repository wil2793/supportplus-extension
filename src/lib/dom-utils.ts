// ============================================================
// SRC/LIB/DOM-UTILS.TS - DOM helpers, retry/polling, observers
// ============================================================

interface WaitForElementOptions {
  maxAttempts?: number;
  interval?: number;
  parent?: ParentNode;
}

/**
 * Wait for a DOM element to appear (polling with retry).
 */
export function waitForElement<T extends Element = Element>(
  selector: string,
  options: WaitForElementOptions = {},
): Promise<T | null> {
  const maxAttempts = options.maxAttempts ?? 30;
  const interval = options.interval ?? 200;
  const parent = options.parent ?? document;

  return new Promise((resolve) => {
    const found = parent.querySelector<T>(selector);
    if (found) return resolve(found);

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const el = parent.querySelector<T>(selector);
      if (el || attempts >= maxAttempts) {
        clearInterval(timer);
        resolve(el ?? null);
      }
    }, interval);
  });
}

interface ObserveDOMOptions {
  parent?: Element;
  debounce?: number;
  once?: boolean;
}

/**
 * Observe DOM changes and call callback when matching elements appear.
 */
export function observeDOM<T extends Element = Element>(
  selector: string,
  callback: (el: T) => void,
  options: ObserveDOMOptions = {},
): MutationObserver {
  const parent = options.parent ?? document.body;
  const debounceMs = options.debounce ?? 300;
  const once = options.once ?? false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const el = parent.querySelector<T>(selector);
      if (el) {
        callback(el);
        if (once) observer.disconnect();
      }
    }, debounceMs);
  });

  observer.observe(parent, { childList: true, subtree: true });

  const existing = parent.querySelector<T>(selector);
  if (existing) {
    callback(existing);
    if (once) observer.disconnect();
  }

  return observer;
}

/** Create a debounced version of a function. */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Create a throttled version of a function. */
export function throttle<T extends unknown[]>(
  fn: (...args: T) => void,
  limit: number,
): (...args: T) => void {
  let lastCall = 0;
  return (...args: T) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  };
}

interface OnElementReadyOptions {
  maxAttempts?: number;
  initialDelay?: number;
}

/** Run a callback once the target element exists. */
export function onElementReady(
  selector: string,
  callback: (el: Element) => void,
  options: OnElementReadyOptions = {},
): void {
  const maxAttempts = options.maxAttempts ?? 20;
  const delay = options.initialDelay ?? 100;
  let attempts = 0;

  const check = () => {
    const el = document.querySelector(selector);
    if (el) {
      callback(el);
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(check, delay);
    }
  };
  check();
}

export function isOnPage(path: string): boolean {
  return window.location.pathname.includes(path);
}

export function isDetailView(): boolean {
  return /\/tickets\/\d+/.test(window.location.pathname);
}

export function getDetailTicketId(): string | null {
  const m = window.location.pathname.match(/\/tickets\/(\d+)/);
  return m ? m[1] : null;
}

export function getTextContent(
  selector: string,
  parent: ParentNode = document,
): string {
  const el = parent.querySelector(selector);
  return el ? (el.textContent?.trim() ?? "") : "";
}

interface CreateElementOptions {
  className?: string;
  id?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  children?: HTMLElement[];
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: CreateElementOptions = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.id) el.id = opts.id;
  if (opts.text) el.textContent = opts.text;
  else if (opts.html) el.innerHTML = opts.html;
  if (opts.attrs) {
    Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, v));
  }
  if (opts.style) {
    Object.entries(opts.style).forEach(([k, v]) => {
      if (v !== undefined)
        (el.style as unknown as Record<string, unknown>)[k] = v;
    });
  }
  if (opts.children) {
    opts.children.forEach((child) => el.appendChild(child));
  }
  return el;
}

const SP_DOM = {
  waitForElement,
  observeDOM,
  debounce,
  throttle,
  onElementReady,
  isOnPage,
  isDetailView,
  getDetailTicketId,
  getTextContent,
  createElement,
};
export default SP_DOM;
