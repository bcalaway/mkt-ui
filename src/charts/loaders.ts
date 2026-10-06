// Where a zooming chart's bars come from. Two approaches, both kept for now
// so we gain experience with each as the charts grow (Bill, 2026-10-06);
// the agreed direction is A, made instant with cached blocks
// (mkt-data's docs/phase-2.md, "Charts that grow").
//   A: ask mkt-api for bars at each zoom level, for the window on screen.
//   B: load every day once and make the bars in the browser.
// Each loader reports every request it makes (bytes, and time split into
// mkt-api's, quote-svc's and the network's, from Server-Timing).
import { apiGet, serverTiming, type Ok } from "../api/client";
import { toBars, type Interval } from "./bars";
import type { TimeLine } from "./types";
import type { Loader } from "./ZoomChart";
import { SOURCE_LABEL, shortTenor } from "../format";

export type Approach = "a" | "b";

export const APPROACH_LABEL: Record<Approach, string> = {
  a: "Ask at each zoom",
  b: "Load every day once",
};

export interface RequestStat {
  interval: Interval;
  bytes: number;
  totalMs: number; // in the browser: request to parsed answer
  apiMs?: number; // mkt-api's own time
  upstreamMs?: number; // of which waiting on quote-svc and secmaster-svc
}

export type Recorder = (stat: RequestStat) => void;

async function timed<T>(
  interval: Interval,
  record: Recorder,
  run: (onResponse: (res: Response) => void) => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  let st: Record<string, number> = {};
  const body = await run((res) => {
    st = serverTiming(res);
  });
  record({
    interval,
    bytes: new TextEncoder().encode(JSON.stringify(body)).length,
    totalMs: Math.round(performance.now() - t0),
    apiMs: st.api,
    upstreamMs: st.upstream,
  });
  return body;
}

function note(interval: Interval, open: string, high: string, low: string, last: string, extra: string): string {
  return interval === "day" ? extra : `open ${open}, high ${high}, low ${low}; close on ${last}${extra ? ` (${extra})` : ""}`;
}

/** Yields for some tenors. Lines keep their slots from `slots` (a name's position; empty positions keep colors). */
export function seriesLoader(approach: Approach, slots: string[], source: string, record: Recorder): Loader {
  const names = slots.filter(Boolean);
  const slotOf = (name: string) => Math.max(0, slots.indexOf(name));
  if (approach === "a") {
    return async (interval, from, to) => {
      const r = await timed(interval, record, (onResponse) =>
        apiGet("/api/series", { query: { name: names, start: from, end: to, interval, source: source || undefined }, onResponse }),
      );
      const lines: TimeLine[] = r.series.map((s) => ({
        key: s.name,
        label: shortTenor(s.name),
        slot: slotOf(s.name),
        points: s.points.map((p) => ({
          date: p.date,
          plot: Number(p.percent),
          bar: { open: Number(p.open_percent), high: Number(p.high_percent), low: Number(p.low_percent) },
          text: `${p.percent}%`,
          note: note(interval, p.open_percent, p.high_percent, p.low_percent, p.last_date, SOURCE_LABEL[p.source] ?? p.source),
        })),
      }));
      return { lines, from: r.start, to: r.end };
    };
  }
  let daily: Promise<Ok<"/api/series/daily">> | null = null;
  // Every day is loaded once, so the bars cover whatever window is asked for.
  return async (interval) => {
    daily ??= timed("day", record, (onResponse) =>
      apiGet("/api/series/daily", { query: { name: names, source: source || undefined }, onResponse }),
    );
    const r = await daily;
    const lines: TimeLine[] = r.series.map((s) => {
      const runs = s.sources;
      const sourceAt = (n: number) => {
        let src = runs[0]?.source ?? "";
        for (const run of runs) if (run.start <= n) src = run.source;
        return src;
      };
      return {
        key: s.name,
        label: shortTenor(s.name),
        slot: slotOf(s.name),
        points: toBars(s.dates, s.percents, sourceAt, interval).map((x) => ({
          date: x.date,
          plot: Number(x.close),
          bar: { open: Number(x.open), high: Number(x.high), low: Number(x.low) },
          text: `${x.close}%`,
          note: note(interval, x.open, x.high, x.low, x.last, SOURCE_LABEL[x.source] ?? x.source),
        })),
      };
    });
    return { lines, from: r.start, to: r.end };
  };
}

/** A spread in basis points, long minus short. */
export function spreadLoader(approach: Approach, long: string, short: string, label: string, record: Recorder): Loader {
  if (approach === "a") {
    return async (interval, from, to) => {
      const r = await timed(interval, record, (onResponse) =>
        apiGet("/api/spread", { query: { long, short, start: from, end: to, interval }, onResponse }),
      );
      const lines: TimeLine[] = [
        {
          key: r.name,
          label,
          slot: 0,
          points: r.points.map((p) => ({
            date: p.date,
            plot: Number(p.bp),
            bar: { open: Number(p.open_bp), high: Number(p.high_bp), low: Number(p.low_bp) },
            text: `${p.bp} bp`,
            note: note(interval, p.open_bp, p.high_bp, p.low_bp, p.last_date, interval === "day" ? `${p.long}% − ${p.short}%` : ""),
          })),
        },
      ];
      return { lines, from: r.start, to: r.end };
    };
  }
  let daily: Promise<Ok<"/api/spread/daily">> | null = null;
  return async (interval) => {
    daily ??= timed("day", record, (onResponse) => apiGet("/api/spread/daily", { query: { long, short }, onResponse }));
    const r = await daily;
    const lines: TimeLine[] = [
      {
        key: r.name,
        label,
        slot: 0,
        points: toBars(r.dates, r.bps, () => "", interval).map((x) => ({
          date: x.date,
          plot: Number(x.close),
          bar: { open: Number(x.open), high: Number(x.high), low: Number(x.low) },
          text: `${x.close} bp`,
          note: interval === "day" ? undefined : note(interval, x.open, x.high, x.low, x.last, ""),
        })),
      },
    ];
    return { lines, from: r.start, to: r.end };
  };
}
