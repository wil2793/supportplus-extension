// ============================================================
// SRC/LIB/LOGGER.TS - Centralized logging with levels
// ============================================================

const PREFIX = "[SP]";

export const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
} as const;

export type LogLevelName = keyof typeof LOG_LEVEL;

let _level: number = LOG_LEVEL.INFO;

export function setLevel(level: LogLevelName): void {
  _level = LOG_LEVEL[level];
}

export function debug(...args: unknown[]): void {
  if (_level <= LOG_LEVEL.DEBUG) {
    console.log(PREFIX, "[DEBUG]", ...args);
  }
}

export function info(...args: unknown[]): void {
  if (_level <= LOG_LEVEL.INFO) {
    console.log(PREFIX, ...args);
  }
}

export function warn(...args: unknown[]): void {
  if (_level <= LOG_LEVEL.WARN) {
    console.warn(PREFIX, ...args);
  }
}

export function error(...args: unknown[]): void {
  if (_level <= LOG_LEVEL.ERROR) {
    console.error(PREFIX, ...args);
  }
}

/**
 * Safely execute a synchronous function with an error boundary.
 * Logs any error but does not crash the extension.
 */
export function safeRun(moduleName: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Module [${moduleName}] failed to initialize:`, msg);
  }
}

/**
 * Safely execute an async function with an error boundary.
 */
export async function safeRunAsync(
  moduleName: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`Module [${moduleName}] async error:`, msg);
  }
}

// Default export as namespace (mirrors the old window.SP_Log shape)
const SP_Log = { debug, info, warn, error, setLevel, safeRun, safeRunAsync, LEVELS: LOG_LEVEL };
export default SP_Log;
