// ============================================
// Pattern detection for SL codes and DB users
// ============================================

const SL_REGEX = /SL\d{10,}/g;
const USER_REGEX = /(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g;
const USER_SUFFIX_REGEX = /(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i;

export function detectSLCodes(text: string): string[] {
  const matches = text.match(SL_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}

export function detectDBUsers(text: string): string[] {
  const raw = text.match(USER_REGEX);
  if (!raw) return [];

  const seen = new Set<string>();
  return raw
    .map((v) => {
      const m = v.match(USER_SUFFIX_REGEX);
      return m ? m[1] : v;
    })
    .filter((v) => {
      const low = v.toLowerCase();
      if (seen.has(low)) return false;
      seen.add(low);
      return true;
    });
}

export function detectAll(text: string) {
  return {
    slCodes: detectSLCodes(text),
    dbUsers: detectDBUsers(text),
  };
}
