// ============================================================
// SRC/LIB/CACHE.TS - Unified in-memory cache with TTL support
// ============================================================

interface CacheEntry<T> {
  value: T;
  ttl: number;
  expires: number;
}

const _store = new Map<string, CacheEntry<unknown>>();

/**
 * Get a value from cache. Returns null if expired or not found.
 */
export function get<T = unknown>(key: string): T | null {
  const entry = _store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.ttl && Date.now() > entry.expires) {
    _store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set a value in cache with optional TTL (ms). 0 = no expiry.
 */
export function set<T>(key: string, value: T, ttlMs = 0): void {
  _store.set(key, {
    value,
    ttl: ttlMs,
    expires: ttlMs ? Date.now() + ttlMs : 0,
  });
}

/**
 * Get a value from cache, or compute it if missing/expired.
 */
export async function getOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== null) return cached;
  const value = await computeFn();
  set(key, value, ttlMs);
  return value;
}

/** Check if a key exists and is not expired. */
export function has(key: string): boolean {
  return get(key) !== null;
}

/** Remove a specific key from cache. */
export function remove(key: string): void {
  _store.delete(key);
}

/**
 * Clear all cached values, or only those matching a prefix.
 */
export function clear(prefix?: string): void {
  if (!prefix) {
    _store.clear();
  } else {
    for (const k of _store.keys()) {
      if (k.startsWith(prefix)) _store.delete(k);
    }
  }
}

/** Get all current cache keys (for debugging). */
export function keys(): string[] {
  return [..._store.keys()];
}

const SP_Cache = { get, set, getOrCompute, has, remove, clear, keys };
export default SP_Cache;
