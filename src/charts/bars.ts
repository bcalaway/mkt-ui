// Bars for a zooming chart: which interval suits how much time is on screen,
// and the date arithmetic the chart and its blocks need. The bars themselves
// come from mkt-api.

export type Interval = "day" | "week" | "month" | "quarter" | "year";

/** Days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Roughly 800 bars or fewer on screen: days up to ~3 years, weeks up to ~15, months beyond. */
export function pickInterval(spanDays: number): Interval {
  if (spanDays <= 1100) return "day";
  if (spanDays <= 5500) return "week";
  return "month";
}

/** A day's period start, as the API computes it: Monday, the 1st of the month, quarter or year. */
export function periodStart(day: string, interval: Interval): string {
  if (interval === "day") return day;
  const d = new Date(`${day}T00:00:00Z`);
  if (interval === "week") return addDays(day, -((d.getUTCDay() + 6) % 7));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const month = interval === "month" ? m : interval === "quarter" ? m - (m % 3) : 0;
  return `${y}-${String(month + 1).padStart(2, "0")}-01`;
}
