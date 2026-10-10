// Yields over time for up to four tenors, and the curve's two common spreads.
// Both charts open on the last year and zoom from all of history (since 1962)
// down to days, in cached blocks of bars from mkt-api.
import { useEffect, useMemo, useState } from "react";
import { apiGet, type ChartEventOut, type InstrumentSummary } from "../../api/client";
import LoadStats, { useLoadStats } from "../../charts/LoadStats";
import { seriesLoader, spreadLoader } from "../../charts/loaders";
import { OPEN_ON_DAYS, PRESETS } from "../../charts/presets";
import { isOhlc } from "../../charts/StyleChips";
import { MAX_SERIES } from "../../charts/theme";
import type { ChartEvent } from "../../charts/types";
import ZoomChart from "../../charts/ZoomChart";
import { SOURCE_LABEL, shortTenor } from "../../format";
import { useQueryUpdater, type Location } from "../../router";
import { InstrumentLink, SourceLink } from "../../links";
import type { Screen } from "../types";

const FIRST = "1962-01-01";
const SPREADS: { key: string; long: string; short: string; label: string }[] = [
  { key: "2s10s", long: "UST-10Y-CMT", short: "UST-2Y-CMT", label: "10-year minus 2-year" },
  { key: "3m10y", long: "UST-10Y-CMT", short: "UST-3M-CMT", label: "10-year minus 3-month" },
];
const DEFAULT_NAMES = ["UST-2Y-CMT", "UST-10Y-CMT", "UST-30Y-CMT"];

/** The events (security master notes) for a chart's series; [] until they arrive, or if they can't. */
function useEvents(series: string[], lines: (e: ChartEventOut) => string[]): { marks: ChartEvent[]; list: ChartEventOut[] } {
  const key = series.join("|");
  const [list, setList] = useState<ChartEventOut[]>([]);
  useEffect(() => {
    if (!key) return setList([]);
    const ctl = new AbortController();
    apiGet("/api/events", { query: { series: key.split("|") }, signal: ctl.signal })
      .then((r) => setList(r.events))
      .catch(() => setList([])); // markers are extra: a chart without them is still right
    return () => ctl.abort();
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marks = useMemo(() => list.map((e) => ({ date: e.date, title: e.title, text: e.text, lines: lines(e) })), [list]);
  return { marks, list };
}

interface LatestRow {
  name: string;
  display: string; // in percent
  date: string;
  source: string;
}

function SeriesPage({ location }: { location: Location }) {
  const setQuery = useQueryUpdater();
  // Each position is a color slot; an empty position keeps the others' colors when a line is removed.
  const slots = (location.query.get("names") ?? DEFAULT_NAMES.join(",")).split(",").slice(0, MAX_SERIES);
  const names = slots.filter(Boolean);
  const source = location.query.get("source") ?? "";
  const spreadKey = location.query.get("spread") ?? "2s10s";
  const ohlc = isOhlc(location);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [instruments, setInstruments] = useState<InstrumentSummary[]>([]);
  const [latest, setLatest] = useState<LatestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only the curve's tenors: the thousands of Treasury securities aren't yields over time.
    apiGet("/api/instruments", { query: { type: "cmt_yield" } }).then(setInstruments).catch((e: Error) => setError(e.message));
  }, []);

  // The latest value of each tenor shown, from today's curve: a table beside the chart.
  useEffect(() => {
    const ctl = new AbortController();
    apiGet("/api/curve", { signal: ctl.signal })
      .then((r) =>
        setLatest(
          (r.curves[0]?.points ?? []).map((p) => ({ name: p.name, display: p.display, date: r.curves[0].date ?? "", source: p.source })),
        ),
      )
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, []);

  const yields = useLoadStats();
  const spreadStats = useLoadStats();
  const slotsKey = slots.join(",");
  const yieldLoader = useMemo(
    () => seriesLoader(slotsKey.split(","), source, yields.record),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotsKey, source],
  );
  // New tenors or source: the counts start again (before the new chart's first answer arrives).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => yields.reset(), [yieldLoader]);

  const yieldEvents = useEvents(names, (e) => e.series);
  const spreadDef = SPREADS.find((s) => s.key === spreadKey);
  const spreadEvents = useEvents(spreadDef ? [`spread(${spreadDef.long},${spreadDef.short})`] : [], () => []);
  const spreadLoad = useMemo(
    () => (spreadDef ? spreadLoader(spreadDef.long, spreadDef.short, spreadDef.key, spreadStats.record) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spreadDef],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => spreadStats.reset(), [spreadLoad]);

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
        <p className="lede">
          Constant-maturity yields since 1962. Jump to a span with the buttons, or zoom with the scroll wheel or a pinch: months for decades, weeks for
          years, days for months. Hover to see each value and which publisher it came from; dots mark the security master's notes (first published, gaps, method changes), listed under the chart.
        </p>
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
      <div className="controls" role="group" aria-label="Display">
        <label>
          Source
          <select value={source} onChange={(e) => setQuery({ source: e.target.value || null })}>
            <option value="">Best available</option>
            <option value="UST-PAR">Treasury only</option>
            <option value="H15-TCM">Fed H.15 only</option>
          </select>
        </label>
      </div>

      {error && <p className="error">Couldn't load: {error}</p>}
      <Legend slots={slots} />
      <ZoomChart
        loader={yieldLoader}
        first={FIRST}
        today={today}
        unit="%"
        bars={ohlc}
        styleToggle
        presets={PRESETS}
        initialDays={OPEN_ON_DAYS}
        onInterval={yields.setShown}
        events={yieldEvents.marks}
      />
      <LoadStats totals={yields.totals} interval={yields.interval} />
      <EventList events={yieldEvents.list} />
      <LatestTable rows={(latest ?? []).filter((r) => names.includes(r.name))} />

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
      {spreadDef && spreadLoad && (
        <>
          <p className="muted">{spreadDef.label}, in basis points, on days both have a value.</p>
          <ZoomChart
            loader={spreadLoad}
            first={FIRST}
            today={today}
            unit="bp"
            bars={ohlc}
            styleToggle
            height={260}
            presets={PRESETS}
            initialDays={OPEN_ON_DAYS}
            onInterval={spreadStats.setShown}
            events={spreadEvents.marks}
          />
          <LoadStats totals={spreadStats.totals} interval={spreadStats.interval} />
          <EventList events={spreadEvents.list} />
        </>
      )}
    </section>
  );
}

function Legend({ slots }: { slots: string[] }) {
  const shown = slots.map((name, slot) => ({ name, slot })).filter((x) => x.name);
  if (shown.length < 2) return null;
  return (
    <ul className="legend" aria-label="Legend">
      {shown.map((x) => (
        <li key={x.name}>
          <span className={`swatch slot-${x.slot}`} />
          {shortTenor(x.name)}
        </li>
      ))}
    </ul>
  );
}

function EventList({ events }: { events: ChartEventOut[] }) {
  if (!events.length) return null;
  return (
    <details className="events">
      <summary>
        Marked on the chart ({events.length}): {events.map((e) => e.title).filter((t, i, all) => all.indexOf(t) === i).join(", ")}
      </summary>
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Event</th>
            <th scope="col">Tenors</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={`${e.date}-${e.key}`}>
              <td>{e.date}</td>
              <th scope="row">{e.title}</th>
              <td>{e.series.map(shortTenor).join(", ")}</td>
              <td className="muted">{e.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function LatestTable({ rows }: { rows: LatestRow[] }) {
  if (!rows.length) return null;
  return (
    <table className="data">
      <caption>Latest values.</caption>
      <thead>
        <tr>
          <th scope="col">Tenor</th>
          <th scope="col" className="num">Yield</th>
          <th scope="col">On</th>
          <th scope="col">From</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <th scope="row"><InstrumentLink name={r.name} label={shortTenor(r.name)} /></th>
            <td className="num">{r.display}%</td>
            <td>{r.date}</td>
            <td className="muted"><SourceLink name={r.source} label={SOURCE_LABEL[r.source] ?? r.source} /></td>
          </tr>
        ))}
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
