// Where a zooming chart's bars come from. Two approaches, both kept for now
// so we gain experience with each as the charts grow (Bill, 2026-10-06);
// the agreed direction is A (mkt-data's docs/phase-2.md, "Charts that grow").
//   A: bars at the interval that suits the zoom, from mkt-api's /api/bars in
//      fixed blocks, cached and fetched ahead (src/charts/blocks.ts).
//   B: load every day once and make the bars in the browser.
// Each loader reports every request it makes (bytes, and time split into
// mkt-api's, quote-svc's and the network's, from Server-Timing).
import { apiGet, serverTiming, type BarSeries, type Ok } from "../api/client";
import { toBars, type Interval } from "./bars";
import { blockRange, blocksCovering, getBlock, prefetchAround, type BlockStat } from "./blocks";
import type { TimeLine } from "./types";
import type { Loader } from "./ZoomChart";
import { SOURCE_LABEL, shortTenor } from "../format";

export type Approach = "a" | "b";

export const APPROACH_LABEL: Record<Approach, string> = {
  a: "Cached blocks",
  b: "Load every day once",
};

export type RequestStat = BlockStat;

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

/**
 * Series (`UST-10Y-CMT`, `spread(UST-10Y-CMT,UST-2Y-CMT)`) from /api/bars: the blocks covering the
 * window, merged, with the blocks either side fetched ahead. What's loaded is whole blocks, so small
 * pans need nothing new, and a pan or zoom past them usually finds the next block already here.
 */
function blockLoader(
  exprs: string[],
  source: string,
  record: Recorder,
  toLine: (s: BarSeries, k: number, interval: Interval) => TimeLine,
  first: string,
  today: string,
): Loader {
  return async (interval, from, to) => {
    const ids = blocksCovering(interval, from < first ? first : from, to > today ? today : to);
    const got = await Promise.all(ids.map((id) => getBlock(interval, id, source, exprs, record)));
    prefetchAround(interval, ids, today, first, source, exprs, record);
    const lines = exprs.map((_, k) => toLine({ ...got[0][k], bars: got.flatMap((b) => b[k].bars) }, k, interval));
    return { lines, from: blockRange(interval, ids[0]).start, to: blockRange(interval, ids[ids.length - 1]).end };
  };
}

export const FIRST_DAY = "1962-01-01";
const today = () => new Date().toISOString().slice(0, 10);

/** Yields for some tenors. Lines keep their slots from `slots` (a name's position; empty positions keep colors). */
export function seriesLoader(approach: Approach, slots: string[], source: string, record: Recorder): Loader {
  const names = slots.filter(Boolean);
  const slotOf = (name: string) => Math.max(0, slots.indexOf(name));
  if (approach === "a") {
    return blockLoader(names, source, record, (s, k, interval) => ({
      key: names[k],
      label: shortTenor(names[k]),
      slot: slotOf(names[k]),
      points: s.bars.map((b) => ({
        date: b.date,
        plot: Number(b.close),
        bar: { open: Number(b.open), high: Number(b.high), low: Number(b.low) },
        text: `${b.close}%`,
        note: note(interval, b.open, b.high, b.low, b.last_date, SOURCE_LABEL[b.source] ?? b.source),
      })),
    }), FIRST_DAY, today());
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
    return blockLoader([`spread(${long},${short})`], "", record, (s, _k, interval) => ({
      key: s.key,
      label,
      slot: 0,
      points: s.bars.map((b) => ({
        date: b.date,
        plot: Number(b.close),
        bar: { open: Number(b.open), high: Number(b.high), low: Number(b.low) },
        text: `${b.close} bp`,
        note: note(interval, b.open, b.high, b.low, b.last_date, interval === "day" ? `${b.inputs[0]}% − ${b.inputs[1]}%` : ""),
      })),
    }), FIRST_DAY, today());
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
