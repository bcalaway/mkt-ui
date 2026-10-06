// Two ways to chart all of history and zoom in, one at a time so they don't
// compete, to choose one (Bill, 2026-10-06). Both open on monthly bars back
// to 1962 and get finer as you zoom (weekly within ~15 years on screen, daily
// within ~3). Each request's time is split into mkt-api's own, the part
// spent waiting on quote-svc and secmaster-svc, and the network.
//   A: asks mkt-api for bars at each zoom level, for the window on screen.
//   B: loads every day once (/api/series/daily) and makes the bars here.
import { useCallback, useMemo, useRef, useState } from "react";
import { apiGet, serverTiming, type Ok } from "../../api/client";
import type { Preset } from "../../charts/ChartToolbar";
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

const PRESETS: Preset[] = [
  { label: "10Y", days: 3653 },
  { label: "2Y", days: 731 },
  { label: "3M", days: 92 },
];

interface Timing {
  totalMs: number; // in the browser: request to parsed answer
  apiMs?: number; // mkt-api's own time
  upstreamMs?: number; // of which waiting on quote-svc and secmaster-svc
  interval: Interval;
}

interface Stats {
  requests: number;
  bytes: number;
  last: Timing | null;
}

const EMPTY: Stats = { requests: 0, bytes: 0, last: null };

function useStats() {
  const ref = useRef<Stats>(EMPTY);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const record = useCallback((bytes: number, last: Timing) => {
    ref.current = { requests: ref.current.requests + 1, bytes: ref.current.bytes + bytes, last };
    setStats(ref.current);
  }, []);
  const reset = useCallback(() => {
    ref.current = EMPTY;
    setStats(EMPTY);
  }, []);
  return { stats, record, reset };
}

/** Time a request and read its Server-Timing. */
async function timed<T>(interval: Interval, run: (onResponse: (res: Response) => void) => Promise<T>): Promise<[T, Timing]> {
  const t0 = performance.now();
  let st: Record<string, number> = {};
  const body = await run((res) => {
    st = serverTiming(res);
  });
  return [body, { totalMs: Math.round(performance.now() - t0), apiMs: st.api, upstreamMs: st.upstream, interval }];
}

function bytesOf(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

function note(interval: Interval, open: string, high: string, low: string, last: string, source: string): string {
  const src = SOURCE_LABEL[source] ?? source;
  return interval === "day" ? src : `open ${open}, high ${high}, low ${low}; close on ${last} (${src})`;
}

function StatsLine({ stats, interval }: { stats: Stats; interval: Interval | null }) {
  const last = stats.last;
  return (
    <div className="lab-stats" aria-live="polite">
      <p>
        Showing <strong>{interval ? `${INTERVAL_LABEL[interval]} bars` : "…"}</strong>. {stats.requests} request
        {stats.requests === 1 ? "" : "s"} so far, {(stats.bytes / 1024).toFixed(0)} KB in all.
      </p>
      {last && (
        <p className="muted">
          Last request ({INTERVAL_LABEL[last.interval]}): {last.totalMs} ms in all
          {last.apiMs !== undefined && (
            <>
              ; mkt-api {Math.round(last.apiMs)} ms, of which {Math.round(last.upstreamMs ?? 0)} ms waiting on quote-svc;
              the network and the browser the other {Math.max(0, last.totalMs - Math.round(last.apiMs))} ms
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}

function LabPage({ location }: { location: Location }) {
  const setQuery = useQueryUpdater();
  const names = (location.query.get("names") ?? "UST-10Y-CMT").split(",").filter(Boolean).slice(0, MAX_SERIES);
  const ohlc = location.query.get("style") === "ohlc";
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const key = names.join(",");
  const approach = location.query.get("approach") === "b" ? "b" : "a";

  // A: bars from mkt-api, one request per zoom level and window.
  const a = useStats();
  const [aInterval, setAInterval] = useState<Interval | null>(null);
  const loaderA = useCallback<Loader>(
    async (interval, from, to) => {
      const [r, timing] = await timed(interval, (onResponse) =>
        apiGet("/api/series", { query: { name: key.split(","), start: from, end: to, interval }, onResponse }),
      );
      a.record(bytesOf(r), timing);
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
        const data = timed("day", (onResponse) =>
          apiGet("/api/series/daily", { query: { name: key.split(","), start: FIRST }, onResponse }),
        ).then(([r, timing]) => {
          b.record(bytesOf(r), timing);
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
          Two ways to show all of history and zoom in fast, one at a time. Both open on monthly bars back to 1962; zoom
          with the buttons (10Y, 2Y and 3M jump there), the scroll wheel or a pinch, and drag to pan. Weekly bars appear
          once about 15 years are on screen, daily ones under about 3.
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

      <div className="controls" role="group" aria-label="Approach">
        <span className="control-label">Approach</span>
        <button type="button" className="chip" aria-pressed={approach === "a"} onClick={() => setQuery({ approach: null })}>
          A: ask at each zoom
        </button>
        <button type="button" className="chip" aria-pressed={approach === "b"} onClick={() => setQuery({ approach: "b" })}>
          B: load every day once
        </button>
      </div>

      {approach === "a" ? (
        <>
          <p className="muted">
            Asks mkt-api for bars at each zoom level, for the window on screen and as much again either side: small answers,
            but the first zoom into a new stretch waits for one.
          </p>
          <ZoomChart key={`a:${key}`} loader={loaderA} first={FIRST} today={today} unit="%" bars={ohlc} onInterval={setAInterval} presets={PRESETS} />
          <StatsLine stats={a.stats} interval={aInterval} />
        </>
      ) : (
        <>
          <p className="muted">
            Loads every day since 1962 once and makes the bars here: one bigger answer up front, then every zoom is made in the
            browser with no further requests.
          </p>
          <ZoomChart key={`b:${key}`} loader={loaderB} first={FIRST} today={today} unit="%" bars={ohlc} onInterval={setBInterval} presets={PRESETS} />
          <StatsLine stats={b.stats} interval={bInterval} />
        </>
      )}
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
