// Yields over time for up to four tenors, and the curve's two common spreads.
import { useEffect, useMemo, useState } from "react";
import { apiGet, type InstrumentSummary, type SeriesResponse, type SpreadResponse } from "../../api/client";
import TimeSeriesChart, { type TimeLine } from "../../charts/TimeSeriesChart";
import { MAX_SERIES } from "../../charts/theme";
import { SOURCE_LABEL, before, shortTenor } from "../../format";
import { linkProps, useQueryUpdater, type Location } from "../../router";
import type { Screen } from "../types";

// Each range's bars: about 800 or fewer, so the whole range fits the chart.
const RANGES: { key: string; months: number | null; interval: "day" | "week" | "month" }[] = [
  { key: "1M", months: 1, interval: "day" },
  { key: "6M", months: 6, interval: "day" },
  { key: "1Y", months: 12, interval: "day" },
  { key: "5Y", months: 60, interval: "week" },
  { key: "10Y", months: 120, interval: "week" },
  { key: "All", months: null, interval: "month" },
];
const INTERVAL_LABEL = { day: "daily", week: "weekly", month: "monthly" };
const SPREADS: { key: string; long: string; short: string; label: string }[] = [
  { key: "2s10s", long: "UST-10Y-CMT", short: "UST-2Y-CMT", label: "10-year minus 2-year" },
  { key: "3m10y", long: "UST-10Y-CMT", short: "UST-3M-CMT", label: "10-year minus 3-month" },
];
const DEFAULT_NAMES = ["UST-2Y-CMT", "UST-10Y-CMT"];
const FIRST_DATE = "1962-01-01";

function rangeFor(key: string): { start: string; end: string; interval: "day" | "week" | "month" } {
  const today = new Date();
  const range = RANGES.find((r) => r.key === key) ?? RANGES[2];
  return {
    start: range.months === null ? FIRST_DATE : before(today, range.months),
    end: today.toISOString().slice(0, 10),
    interval: range.interval,
  };
}

function SeriesPage({ location }: { location: Location }) {
  const setQuery = useQueryUpdater();
  // Each position is a color slot; an empty position keeps the others' colors when a line is removed.
  const slots = (location.query.get("names") ?? DEFAULT_NAMES.join(",")).split(",").slice(0, MAX_SERIES);
  const names = slots.filter(Boolean);
  const rangeKey = location.query.get("range") ?? "1Y";
  const source = location.query.get("source") ?? "";
  const spreadKey = location.query.get("spread") ?? "2s10s";
  const { start, end, interval } = rangeFor(rangeKey);
  const ohlc = location.query.get("style") === "ohlc";

  const [instruments, setInstruments] = useState<InstrumentSummary[]>([]);
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [spread, setSpread] = useState<SpreadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/instruments").then(setInstruments).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!names.length) return;
    const ctl = new AbortController();
    setError(null);
    apiGet("/api/series", { query: { name: names, start, end, interval, source: source || undefined }, signal: ctl.signal })
      .then(setSeries)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join(","), start, end, interval, source]);

  const spreadDef = SPREADS.find((s) => s.key === spreadKey);
  useEffect(() => {
    if (!spreadDef) {
      setSpread(null);
      return;
    }
    const ctl = new AbortController();
    apiGet("/api/spread", { query: { long: spreadDef.long, short: spreadDef.short, start, end, interval }, signal: ctl.signal })
      .then(setSpread)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [spreadDef, start, end, interval]);

  // A line keeps its color while others come and go.
  const slotOf = (name: string) => Math.max(0, slots.indexOf(name));
  const lines: TimeLine[] = useMemo(
    () =>
      (series?.series ?? []).map((s) => ({
        key: s.name,
        label: shortTenor(s.name),
        slot: slotOf(s.name),
        points: s.points.map((p) => ({
          date: p.date,
          plot: Number(p.percent),
          bar: { open: Number(p.open_percent), high: Number(p.high_percent), low: Number(p.low_percent) },
          text: `${p.percent}%`,
          note:
            series?.interval === "day"
              ? SOURCE_LABEL[p.source] ?? p.source
              : `open ${p.open_percent}, high ${p.high_percent}, low ${p.low_percent}; close on ${p.last_date}`,
        })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, slots.join(",")],
  );
  const spreadLines: TimeLine[] = useMemo(
    () =>
      spread
        ? [{
            key: spread.name,
            label: spreadDef?.key ?? spread.name,
            slot: 0,
            points: spread.points.map((p) => ({
              date: p.date,
              plot: Number(p.bp),
              bar: { open: Number(p.open_bp), high: Number(p.high_bp), low: Number(p.low_bp) },
              text: `${p.bp} bp`,
              note:
                spread.interval === "day"
                  ? `${p.long}% − ${p.short}%`
                  : `open ${p.open_bp}, high ${p.high_bp}, low ${p.low_bp}; close on ${p.last_date}`,
            })),
          }]
        : [],
    [spread, spreadDef],
  );

  const toggleName = (name: string) => {
    const next = [...slots];
    const at = next.indexOf(name);
    if (at >= 0) {
      if (names.length === 1) return; // keep at least one line
      next[at] = "";
    } else {
      const free = next.indexOf("");
      if (free >= 0) next[free] = name;
      else if (next.length < MAX_SERIES) next.push(name);
      else return;
    }
    while (next.length && !next[next.length - 1]) next.pop();
    setQuery({ names: next.join(",") });
  };

  return (
    <section>
      <header className="screen-head">
        <h1>Yields over time</h1>
        <p className="lede">Daily constant-maturity yields. Hover a day to see each value and which publisher it came from.</p>
      </header>

      <div className="controls" role="group" aria-label="Tenors">
        <span className="control-label">Tenors (up to {MAX_SERIES})</span>
        {instruments
          .filter((i) => i.status === "active")
          .map((i) => (
            <button
              key={i.name}
              type="button"
              className="chip"
              aria-pressed={names.includes(i.name)}
              disabled={!names.includes(i.name) && names.length >= MAX_SERIES}
              onClick={() => toggleName(i.name)}
              title={i.description}
            >
              {shortTenor(i.name)}
            </button>
          ))}
      </div>
      <div className="controls" role="group" aria-label="Range and source">
        <span className="control-label">Range</span>
        {RANGES.map((r) => (
          <button key={r.key} type="button" className="chip" aria-pressed={rangeKey === r.key} onClick={() => setQuery({ range: r.key })}>
            {r.key}
          </button>
        ))}
        <span className="control-label">Show</span>
        <button type="button" className="chip" aria-pressed={!ohlc} onClick={() => setQuery({ style: null })}>
          Lines
        </button>
        <button type="button" className="chip" aria-pressed={ohlc} onClick={() => setQuery({ style: "ohlc" })}>
          OHLC bars
        </button>
        <label>
          Source
          <select value={source} onChange={(e) => setQuery({ source: e.target.value || null })}>
            <option value="">Best available</option>
            <option value="UST-PAR">Treasury only</option>
            <option value="H15-TCM">Fed H.15 only</option>
          </select>
        </label>
      </div>

      {error && <p className="error">Couldn't load the yields: {error}</p>}
      {!error && !series && <p className="muted">Loading…</p>}
      {series && (
        <>
          <Legend lines={lines} />
          <p className="muted chart-note">
            {INTERVAL_LABEL[interval]} {ohlc ? "bars" : "closes"}, {series.start} to {series.end}. For finer detail
            on a stretch of history, try the <a {...linkProps("/lab/zoom")}>zoom lab</a>.
          </p>
          <TimeSeriesChart lines={lines} unit="%" bars={ohlc} />
          <LatestTable series={series} />
        </>
      )}

      <h2>Spread</h2>
      <div className="controls" role="group" aria-label="Spread">
        {SPREADS.map((s) => (
          <button key={s.key} type="button" className="chip" aria-pressed={spreadKey === s.key} onClick={() => setQuery({ spread: s.key })} title={s.label}>
            {s.key}
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={spreadKey === "none"} onClick={() => setQuery({ spread: "none" })}>
          Hide
        </button>
      </div>
      {spread && spreadDef && (
        <>
          <p className="muted">
            {spreadDef.label}, in basis points, on days both have a value ({INTERVAL_LABEL[interval]}).
          </p>
          <TimeSeriesChart lines={spreadLines} unit="bp" bars={ohlc} height={240} />
        </>
      )}
    </section>
  );
}

function Legend({ lines }: { lines: TimeLine[] }) {
  if (lines.length < 2) return null;
  return (
    <ul className="legend" aria-label="Legend">
      {lines.map((l) => (
        <li key={l.key}>
          <span className={`swatch slot-${l.slot}`} />
          {l.label}
        </li>
      ))}
    </ul>
  );
}

function LatestTable({ series }: { series: SeriesResponse }) {
  return (
    <table className="data">
      <caption>Each tenor's first and last value in the range.</caption>
      <thead>
        <tr>
          <th scope="col">Tenor</th>
          <th scope="col" className="num">First</th>
          <th scope="col" className="num">Last</th>
          <th scope="col">Last from</th>
        </tr>
      </thead>
      <tbody>
        {series.series.map((s) => {
          const first = s.points[0];
          const last = s.points[s.points.length - 1];
          return (
            <tr key={s.name}>
              <th scope="row">{shortTenor(s.name)}</th>
              <td className="num">
                {first ? `${first.open_percent}% (${series.interval === "day" ? first.date : `${series.interval} of ${first.date}`})` : "–"}
              </td>
              <td className="num">{last ? `${last.percent}% (${last.last_date})` : "–"}</td>
              <td className="muted">{last ? SOURCE_LABEL[last.source] ?? last.source : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const seriesScreen: Screen = {
  id: "series",
  title: "Over time",
  path: "/series",
  matches: (path) => path.startsWith("/series"),
  Component: SeriesPage,
};
