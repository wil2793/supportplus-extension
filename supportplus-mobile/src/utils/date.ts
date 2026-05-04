// ============================================
// Date helpers
// ============================================

import { MONTH_NAMES } from "./constants";

export function formatDate(isoDate: string): string {
  if (!isoDate) return "N/A";
  return isoDate.replace("T", " ").substring(0, 16);
}

export function getFirstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00`;
}

export function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T23:59`;
}

export function getMonthName(monthIndex: number): string {
  return MONTH_NAMES[monthIndex] || "";
}

export function isSameDay(ts: number): boolean {
  return new Date(ts).toDateString() === new Date().toDateString();
}
