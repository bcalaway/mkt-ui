// Two ways to chart all of history and zoom in, side by side, to choose one
// (Bill, 2026-10-06). Both open on monthly bars back to 1962 and get finer
// as you zoom (weekly within ~15 years on screen, daily within ~3).
//   A: asks mkt-api for bars at each zoom level, for the window on screen.
//   B: loads every day once (/api/series/daily) and makes the bars here.
import { useCallback, useMemo, useRef, useState } from "react";
import { apiGet, type Ok } from "../../api/client";
import { toBars, type Interval } from "../../charts/bars";
import { MAX_SERIES } from "../../charts/theme";
import type { TimeLine } from "../../charts/TimeSeriesChart";
import ZoomChart, { type Loader } from "../../charts/ZoomChart";
import { SOURCE_LABEL, shortTenor } from "../../format";
import { useQueryUpdater, type Location } from "../../router";
import type { Screen } from "../types";

const FIRST = "1962-01-01";
const CHOICES = ["UST-3M-CMT", "UST-2Y-CMT", "UST-5Y-CMT", "UST-10Y-CMT", "UST-30Y-CMT"];
const INTERVAL_LABEL: Record<Interval, string> = { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly", year: "yearly" };

interface Stats {
  requests: number;
  bytes: number;
  lastMs: number | null;
}

function useStats() {
  const ref = useRef<Stats>({ requests: 0, bytes: 0, lastMs: null });
  const [stats, setStats] = useState<Stats>(ref.current);
  const record = useCallback((bytes: number, ms: number) => {
    ref.current = { requests: ref.current.requests + 1, bytes: ref.current.bytes + bytes, lastMs: ms };
    setStats(ref.current);
  }, []);
  const reset = useCallback(() => {
    ref.current = { requests: 0, bytes: 0, lastMs: null };
    setStats(ref.current);
  }, []);
  return { stats, record, reset };
}

function bytesOf(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

function note(interval: Interval, open: string, high: string, low: string, last: string, source: string): string {
  const src = SOURCE_LABEL[source] ?? source;
  return interval === "day" ? src : `open ${open}, high ${high}, low ${low}; close on ${last} (${src})`;
}

function StatsLine({ stats, interval, extra }: { stats: Stats; interval: Interval | null; extra?: string }) {
  return (
    <p className="muted chart-note">
      Showing {interval ? `${INTERVAL_LABEL[interval]} bars` : "…"}. {stats.requests} request{stats.requests === 1 ? "" : "s"},{" "}
      {(stats.bytes / 1024).toFixed(0)} KB
      {stats.lastMs !== null ? `, the last in ${stats.lastMs} ms` : ""}
      {extra ? `. ${extra}` : "."}
    </p>
  );
}

function LabPage({ location }: { location: Location }) {
  const setQuery = useQueryUpdater();
  const names = (location.query.get("names") ?? "UST-10Y-CMT").split(",").filter(Boolean).slice(0, MAX_SERIES);
  const ohlc = location.query.get("style") === "ohlc";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const key = names.join(",");

  // A: bars from mkt-api, one request per zoom level and window.
  const a = useStats();
  const [aInterval, setAInterval] = useState<Interval | null>(null);
  const loaderA = useCallback<Loader>(
    async (interval, from, to) => {
      const t0 = performance.now();
      const r = await apiGet("/api/series", { query: { name: key.split(","), start: from, end: to, interval } });
      a.record(bytesOf(r), Math.round(performance.now() - t0));
      const lines: TimeLine[] = r.series.map((s, i) => ({
        key: s.name,
        label: shortTenor(s.name),
        slot: i,
        points: s.points.map((p) => ({
          date: p.date,
          plot: Number(p.percent),
          bar: { open: Number(p.open_percent), high: Number(p.high_percent), low: Number(p.low_percent) },
          text: `${p.percent}%`,
          note: note(interval, p.open_percent, p.high_percent, p.low_percent, p.last_date, p.source),
        })),
      }));
      return { lines, from: r.start, to: r.end };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  // B: every day once, bars made here.
  const b = useStats();
  const [bInterval, setBInterval] = useState<Interval | null>(null);
  const daily = useRef<{ key: string; data: Promise<Ok<"/api/series/daily">> } | null>(null);
  const loaderB = useCallback<Loader>(
    async (interval) => {
      if (!daily.current || daily.current.key !== key) {
        const t0 = performance.now();
        const data = apiGet("/api/series/daily", { query: { name: key.split(","), start: FIRST } }).then((r) => {
          b.record(bytesOf(r), Math.round(performance.now() - t0));
          return r;
        });
        daily.current = { key, data };
      }
      const r = await daily.current.data;
      const lines: TimeLine[] = r.series.map((s, i) => {
        const runs = s.sources;
        const sourceAt = (n: number) => {
          let src = runs[0]?.source ?? "";
          for (const run of runs) if (run.start <= n) src = run.source;
          return src;
        };
        return {
          key: s.name,
          label: shortTenor(s.name),
          slot: i,
          points: toBars(s.dates, s.percents, sourceAt, interval).map((x) => ({
            date: x.date,
            plot: Number(x.close),
            bar: { open: Number(x.open), high: Number(x.high), low: Number(x.low) },
            text: `${x.close}%`,
            note: note(interval, x.open, x.high, x.low, x.last, x.source),
          })),
        };
      });
      return { lines, from: r.start, to: r.end };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const toggle = (name: string) => {
    const next = names.includes(name) ? names.filter((n) => n !== name) : [...names, name];
    if (next.length === 0 || next.length > MAX_SERIES) return;
    a.reset();
    b.reset();
    setQuery({ names: next.join(",") });
  };

  return (
    <section>
      <header className="screen-head">
        <h1>Zoom lab</h1>
        <p className="lede">
          Two ways to show all of history and zoom in fast. Both open on monthly bars back to 1962; scroll or pinch to
          zoom, drag to pan. Pick the one that feels better and the other goes.
        </p>
      </header>
      <div className="controls" role="group" aria-label="Tenors and style">
        <span className="control-label">Tenors</span>
        {CHOICES.map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={names.includes(n)} onClick={() => toggle(n)}>
            {shortTenor(n)}
          </button>
        ))}
        <span className="control-label">Show</span>
        <button type="button" className="chip" aria-pressed={!ohlc} onClick={() => setQuery({ style: null })}>
          Lines
        </button>
        <button type="button" className="chip" aria-pressed={ohlc} onClick={() => setQuery({ style: "ohlc" })}>
          OHLC bars
        </button>
      </div>

      <h2>A: ask the API at each zoom</h2>
      <p className="muted">Small answers, but the first zoom into a new stretch waits for one.</p>
      <ZoomChart loader={loaderA} first={FIRST} today={today} unit="%" bars={ohlc} onInterval={setAInterval} />
      <StatsLine stats={a.stats} interval={aInterval} />

      <h2>B: load every day once</h2>
      <p className="muted">One bigger answer up front; after that every zoom is made here, with no waiting.</p>
      <ZoomChart loader={loaderB} first={FIRST} today={today} unit="%" bars={ohlc} onInterval={setBInterval} />
      <StatsLine stats={b.stats} interval={bInterval} extra="Later zooms ask nothing" />
    </section>
  );
}

export const zoomLabScreen: Screen = {
  id: "zoom-lab",
  title: "Zoom lab",
  path: "/lab/zoom",
  matches: (path) => path.startsWith("/lab/zoom"),
  Component: LabPage,
};
