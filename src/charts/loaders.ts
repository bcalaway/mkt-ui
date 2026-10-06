// Where a zooming chart's bars come from: mkt-api's /api/bars, at the interval
// that suits the zoom, in fixed blocks, cached and fetched ahead
// (src/charts/blocks.ts; mkt-data's docs/phase-2.md, "Charts that grow").
// Loading every day once and making bars in the browser was tried alongside
// and retired (Bill, 2026-10-06). Each loader reports every request it makes
// (bytes, and time split into mkt-api's, quote-svc's and the network's, from
// Server-Timing).
import type { BarSeries } from "../api/client";
import type { Interval } from "./bars";
import { blockRange, blocksCovering, getBlock, prefetchAround, type BlockStat } from "./blocks";
import type { TimeLine } from "./types";
import type { Loader } from "./ZoomChart";
import { SOURCE_LABEL, shortTenor } from "../format";

export type RequestStat = BlockStat;

export type Recorder = (stat: RequestStat) => void;

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
export function seriesLoader(slots: string[], source: string, record: Recorder): Loader {
  const names = slots.filter(Boolean);
  const slotOf = (name: string) => Math.max(0, slots.indexOf(name));
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

/** A spread in basis points, long minus short (computed in mkt-api). */
export function spreadLoader(long: string, short: string, label: string, record: Recorder): Loader {
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
