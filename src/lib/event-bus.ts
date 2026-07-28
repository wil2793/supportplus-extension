// ============================================================
// SRC/LIB/EVENT-BUS.TS - Centralized typed event bus
// ============================================================

import { warn } from "./logger";

type EventHandler<T = unknown> = (data: T) => void;

const _listeners = new Map<string, EventHandler[]>();

/** Subscribe to an event. Returns an unsubscribe function. */
export function on<T = unknown>(
  event: string,
  handler: EventHandler<T>
): () => void {
  if (!_listeners.has(event)) _listeners.set(event, []);
  _listeners.get(event)!.push(handler as EventHandler);
  return () => {
    const list = _listeners.get(event);
    if (list) {
      const filtered = list.filter((h) => h !== (handler as EventHandler));
      _listeners.set(event, filtered);
    }
  };
}

/** Subscribe once — auto-unsubscribes after first emission. */
export function once<T = unknown>(
  event: string,
  handler: EventHandler<T>
): () => void {
  const unsubscribe = on<T>(event, (data) => {
    unsubscribe();
    handler(data);
  });
  return unsubscribe;
}

/** Emit an event to all subscribers. Also dispatches a native CustomEvent. */
export function emit<T = unknown>(event: string, data?: T): void {
  const handlers = _listeners.get(event);
  if (handlers) {
    handlers.forEach((h) => {
      try {
        h(data as unknown);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`EventBus handler error [${event}]:`, msg);
      }
    });
  }
  document.dispatchEvent(new CustomEvent(event, { detail: data }));
}

/** Remove all listeners for an event (or all events). */
export function off(event?: string): void {
  if (event) {
    _listeners.delete(event);
  } else {
    _listeners.clear();
  }
}

// ─── Known event names ────────────────────────────────────────
export const EVENTS = {
  OPEN_CONFIG: "sp-open-config",
  OPEN_TICKET: "sp-open-ticket",
  REFRESH_PANEL: "sp-refresh-panel",
  SESSION_READY: "sp-session-ready",
} as const;

export type KnownEvent = (typeof EVENTS)[keyof typeof EVENTS];

const SP_Events = { on, once, emit, off, EVENTS };
export default SP_Events;
