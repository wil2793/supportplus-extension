// ============================================================
// SRC/LIB/STORAGE.TS - Centralized chrome.storage access
// ============================================================

/**
 * Get a single value from chrome.storage.local.
 */
export function get<T = unknown>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] !== undefined ? (result[key] as T) : null);
    });
  });
}

/**
 * Get multiple values from chrome.storage.local.
 */
export function getMultiple<T extends Record<string, unknown>>(
  keys: string[]
): Promise<Partial<T>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve((result || {}) as Partial<T>);
    });
  });
}

/**
 * Get a value with a default fallback.
 */
export async function getOrDefault<T>(key: string, defaultValue: T): Promise<T> {
  const val = await get<T>(key);
  return val !== null ? val : defaultValue;
}

/**
 * Set a single key-value pair in chrome.storage.local.
 */
export function set(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

/**
 * Set multiple key-value pairs in chrome.storage.local.
 */
export function setMultiple(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

/**
 * Remove a key from chrome.storage.local.
 */
export function remove(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => resolve());
  });
}

// Namespace export (mirrors old window.SP_Storage shape)
const SP_Storage = { get, getMultiple, getOrDefault, set, setMultiple, remove };
export default SP_Storage;
