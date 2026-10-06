// Bars for a zooming chart: which interval suits how much time is on screen,
// and (for the load-everything-once approach) daily values summed up into
// bars in the browser. Summing up only picks values (first, last, highest,
// lowest), compared exactly as decimal strings: no arithmetic.
import { compareDecimal } from "../decimal";

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

export interface Bar {
  date: string; // period start
  last: string; // the close's day
  open: string;
  high: string;
  low: string;
  close: string;
  source: string; // the close's
}

/** Daily (date, percent, source) in date order, summed up into bars. */
export function toBars(dates: string[], percents: string[], sourceAt: (i: number) => string, interval: Interval): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < dates.length; i++) {
    const start = periodStart(dates[i], interval);
    const v = percents[i];
    const b = out[out.length - 1];
    if (b && b.date === start) {
      if (compareDecimal(v, b.high) > 0) b.high = v;
      if (compareDecimal(v, b.low) < 0) b.low = v;
      b.close = v;
      b.last = dates[i];
      b.source = sourceAt(i);
    } else {
      out.push({ date: start, last: dates[i], open: v, high: v, low: v, close: v, source: sourceAt(i) });
    }
  }
  return out;
}
