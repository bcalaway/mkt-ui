// Fixed blocks of bars and a cache of them (mkt-data's docs/phase-2.md,
// "Charts that grow"). mkt-api's /api/bars answers one interval for one
// block at a time; the blocks are the same as its app/blocks.py:
//   day                    a calendar year      "2026"
//   week, month, quarter,  a decade             "2020"   (a week belongs to
//   year                                                  its Monday's decade)
// The same block is always the same request, so a block is fetched once per
// page (and a finished one is kept by the browser for a day besides), and
// the blocks either side of what's on screen are fetched before they're needed.
import { apiGet, serverTiming, type BarSeries } from "../api/client";
import { addDays, periodStart, type Interval } from "./bars";

export interface BlockRange {
  start: string; // the first day of the block's first period
  end: string; // the last day of its last period
}

const pad = (y: number) => String(y).padStart(4, "0");

function firstMonday(year: number): string {
  const jan1 = `${pad(year)}-01-01`;
  const dow = new Date(`${jan1}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(jan1, (8 - dow) % 7);
}

/** The block a day's bar is in. */
export function blockOf(interval: Interval, day: string): string {
  const y = Number((interval === "week" ? periodStart(day, "week") : day).slice(0, 4));
  return interval === "day" ? pad(y) : pad(y - (y % 10));
}

export function blockRange(interval: Interval, id: string): BlockRange {
  const y = Number(id);
  if (interval === "day") return { start: `${id}-01-01`, end: `${id}-12-31` };
  if (interval === "week") return { start: firstMonday(y), end: addDays(firstMonday(y + 10), -1) };
  return { start: `${id}-01-01`, end: `${pad(y + 9)}-12-31` };
}

/** The block after (1) or before (-1) another. */
export function stepBlock(interval: Interval, id: string, by: 1 | -1): string {
  return pad(Number(id) + by * (interval === "day" ? 1 : 10));
}

/** The blocks that cover from..to, in order. */
export function blocksCovering(interval: Interval, from: string, to: string): string[] {
  const out = [blockOf(interval, from)];
  while (blockRange(interval, out[out.length - 1]).end < to) out.push(stepBlock(interval, out[out.length - 1], 1));
  return out;
}

// --- The cache: one entry per series per block, shared by every chart on the page ---

export interface BlockStat {
  interval: Interval;
  bytes: number;
  totalMs: number; // in the browser: request to parsed answer
  apiMs?: number; // mkt-api's own time
  upstreamMs?: number; // of which waiting on quote-svc and secmaster-svc
  cached?: boolean; // answered from the cache: no request
  prefetch?: boolean; // fetched ahead, not waited for
}

interface Entry {
  at: number;
  final: boolean;
  series: Promise<BarSeries>;
}

// The open block (this year's or decade's) can still change; it's asked again after this long.
const OPEN_BLOCK_MS = 5 * 60_000;
const cache = new Map<string, Entry>();

const cacheKey = (interval: Interval, block: string, source: string, expr: string) => `${interval}|${block}|${source}|${expr}`;

export function clearBlockCache() {
  cache.clear();
}

/**
 * One block's series: from the cache, or one request for the ones it doesn't have.
 * `record` hears of every request (and of a block answered wholly from the cache).
 */
export function getBlock(
  interval: Interval,
  block: string,
  source: string,
  exprs: string[],
  record: (s: BlockStat) => void,
  prefetch = false,
): Promise<BarSeries[]> {
  const now = Date.now();
  const fresh = (e: Entry | undefined) => e && (e.final || now - e.at < OPEN_BLOCK_MS);
  const missing = exprs.filter((x) => !fresh(cache.get(cacheKey(interval, block, source, x))));
  if (missing.length) {
    const t0 = performance.now();
    let timing: Record<string, number> = {};
    const answer = apiGet("/api/bars", {
      query: { series: missing, interval, block, source: source || undefined },
      onResponse: (res) => {
        timing = serverTiming(res);
      },
    }).then((r) => {
      record({
        interval,
        bytes: new TextEncoder().encode(JSON.stringify(r)).length,
        totalMs: Math.round(performance.now() - t0),
        apiMs: timing.api,
        upstreamMs: timing.upstream,
        prefetch,
      });
      return r;
    });
    missing.forEach((x, i) => {
      const k = cacheKey(interval, block, source, x);
      const entry: Entry = { at: now, final: false, series: answer.then((r) => r.series[i]) };
      cache.set(k, entry);
      answer.then(
        (r) => (entry.final = r.final),
        () => cache.get(k) === entry && cache.delete(k), // a failure isn't kept: the next ask tries again
      );
    });
  } else if (!prefetch) {
    record({ interval, bytes: 0, totalMs: 0, cached: true });
  }
  return Promise.all(exprs.map((x) => cache.get(cacheKey(interval, block, source, x))!.series));
}

/** The blocks either side of a stretch, fetched ahead (errors ignored: they're asked again when needed). */
export function prefetchAround(
  interval: Interval,
  blocks: string[],
  today: string,
  first: string,
  source: string,
  exprs: string[],
  record: (s: BlockStat) => void,
) {
  const before = stepBlock(interval, blocks[0], -1);
  const after = stepBlock(interval, blocks[blocks.length - 1], 1);
  for (const id of [before, after]) {
    const r = blockRange(interval, id);
    if (r.start > today || r.end < first) continue;
    getBlock(interval, id, source, exprs, record, true).catch(() => undefined);
  }
}
