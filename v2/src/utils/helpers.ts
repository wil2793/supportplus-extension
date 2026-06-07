// HTML escape
export const esc = (str: string): string => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Deterministic color from string (for tags, comments)
export const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue},35%,90%)`,
    border: `hsl(${hue},45%,65%)`,
    text: `hsl(${hue},50%,30%)`,
  };
};

// Format date
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return "";
  return dateStr.replace("T", " ").substring(0, 16);
};
