// The security master: find an instrument by name, alias or identifier, and
// see its identifiers in each source, its notes and its latest value. By
// type: the curve's CMT tenors (`type=cmt`, the default) or the Treasury
// securities (`type=ust`, or one kind: bill, note, bond, tips, frn), whose
// list and pages are in ./Treasuries.tsx. A CMT's page charts its yield
// with the same controls as Over time.
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, type InstrumentDetail, type InstrumentSummary } from "../../api/client";
import LoadStats, { useLoadStats } from "../../charts/LoadStats";
import { FIRST_DAY, FIXINGS_FIRST_DAY, fixingLoader, seriesLoader } from "../../charts/loaders";
import { OPEN_ON_DAYS, PRESETS } from "../../charts/presets";
import { isOhlc } from "../../charts/StyleChips";
import ZoomChart from "../../charts/ZoomChart";
import { SOURCE_LABEL, instrumentType, tenorLabel } from "../../format";
import Pager, { PAGE_SIZE } from "../../Pager";
import { linkProps, useLocation, useQueryUpdater, type Location } from "../../router";
import { CalendarLink, SourceLink } from "../../links";
import type { Screen } from "../types";
import { TreasuryDetail, TreasuryList } from "./Treasuries";

const PREFIX = "/instruments";
// Where the Treasuries screen used to be (2026-10-07, before it joined Instruments): links there still work.
const OLD_TREASURIES = "/treasuries";

// Fixings (phase 4, step 4): the reference rates, FX rates and dollar indexes, one list (Bill, 2026-10-10).
const FIXING_TYPES = ["rate_fixing", "fx_fixing", "fx_index"];

// The Treasury kinds the `type` filter takes (besides `cmt`, the default); `ust` is all of them.
const TREASURY_TYPES = ["ust", "bill", "note", "bond", "tips", "frn"];
const TYPES: { key: string; label: string }[] = [
  { key: "cmt", label: "CMT yields" },
  { key: "fixing", label: "Fixings" },
  { key: "ust", label: "All Treasuries" },
  { key: "bill", label: "Bills" },
  { key: "note", label: "Notes" },
  { key: "bond", label: "Bonds" },
  { key: "tips", label: "TIPS" },
  { key: "frn", label: "FRNs" },
];

const SCHEME_LABEL: Record<string, string> = {
  "UST-PAR": "Treasury par curve",
  "H15-TCM": "Fed H.15",
  FRED: "FRED",
};

function ListPage({ query, type, all, start }: { query: string; type: string; all: boolean; start: number }) {
  const setQuery = useQueryUpdater();
  const treasuries = !query && TREASURY_TYPES.includes(type);
  const [text, setText] = useState(query);
  const [rows, setRows] = useState<InstrumentSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (treasuries) return; // TreasuryList loads its own
    const ctl = new AbortController();
    setError(null);
    // A search is paged by secmaster-svc (X-Total-Count says how many in all); the CMT and fixing lists are
    // short, so they come whole and are paged here, the same way.
    const req = query
      ? apiGet("/api/search", {
          query: { q: query, limit: PAGE_SIZE, offset: start },
          signal: ctl.signal,
          onResponse: (res) => setTotal(Number(res.headers?.get("X-Total-Count") ?? 0)),
        })
      : (type === "fixing"
          ? Promise.all(FIXING_TYPES.map((t) => apiGet("/api/instruments", { query: { type: t }, signal: ctl.signal }))).then(
              (lists) => lists.flat(),
            )
          : apiGet("/api/instruments", { query: { type: "cmt_yield" }, signal: ctl.signal })
        ).then((all) => {
          setTotal(all.length);
          return all.slice(start, start + PAGE_SIZE);
        });
    req.then(setRows).catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [query, treasuries, start, type]);
  const shown = rows;
  const onGo = (to: number) => setQuery({ start: to ? String(to) : null });
  const pager = rows && <Pager start={start} total={Math.max(total, start + rows.length)} shown={rows.length} noun="instruments" onGo={onGo} />;

  return (
    <section>
      <header className="screen-head">
        <h1>Instruments</h1>
        <p className="lede">
          {treasuries
            ? `${all ? "Every marketable Treasury security since 1980" : "The marketable Treasury securities outstanding"}, by maturity, with the on-the-run issues marked and FedInvest's latest end-of-day price per 100. Open one for its terms, auctions and price history.`
            : !query && type === "fixing"
              ? "The fixings: SOFR and EFFR from the New York Fed, the Fed's H.10 exchange rates and dollar indexes, and the ECB's euro rates, each quoted the way its source prints it (EURUSD-H10 is dollars per euro)."
              : "The curve's tenors, with the name each source uses for each, or the Treasury securities by type. Search finds any instrument by short name, CUSIP or an on-the-run alias like UST-10Y-OTR."}
        </p>
      </header>
      <div className="controls" role="group" aria-label="Type">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="chip"
            aria-pressed={!query && type === t.key}
            onClick={() => setQuery({ type: t.key === "cmt" ? null : t.key, q: null, start: null, all: TREASURY_TYPES.includes(t.key) && all ? "1" : null })}
          >
            {t.label}
          </button>
        ))}
        {treasuries && (
          <label>
            <input type="checkbox" checked={all} onChange={(e) => setQuery({ all: e.target.checked ? "1" : null, start: null })} />
            Include matured
          </label>
        )}
      </div>
      <form
        className="controls"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ q: text.trim() || null, start: null });
        }}
      >
        <label>
          Find
          <input type="search" value={text} placeholder="UST-10Y-CMT, 6W, BC_10YEAR, UST-10Y-OTR, 91282CQC8" onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit">Search</button>
        {query && (
          <button type="button" className="quiet" onClick={() => { setText(""); setQuery({ q: null, start: null }); }}>
            Clear the search
          </button>
        )}
      </form>
      {treasuries && <TreasuryList type={type} all={all} start={start} onGo={(to) => setQuery({ start: to ? String(to) : null })} />}
      {!treasuries && error && <p className="error">Couldn't load instruments: {error}</p>}
      {!treasuries && !error && !rows && <p className="muted">Loading…</p>}
      {!treasuries && rows && rows.length === 0 && start === 0 && <p className="muted">Nothing matches “{query}”. Try a tenor like 10Y or a source key like BC_10YEAR.</p>}
      {!treasuries && pager}
      {!treasuries && shown && shown.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Tenor</th>
              <th scope="col">Description</th>
              <th scope="col">Also known as</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <th scope="row">
                  <a {...linkProps(`${PREFIX}/${encodeURIComponent(r.name)}`)}>{r.name}</a>
                </th>
                <td>{instrumentType(r.type)}</td>
                <td>{tenorLabel(r.tenor)}</td>
                <td>{r.description}</td>
                <td className="muted">{r.aliases.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!treasuries && shown && shown.length > 20 && total > PAGE_SIZE && pager}
    </section>
  );
}

/** A yield's history (golden values, since 1962), zoomable, as lines or OHLC bars. */
function YieldHistory({ name }: { name: string }) {
  const stats = useLoadStats();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ohlc = isOhlc(useLocation());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loader = useMemo(() => seriesLoader([name], "", stats.record), [name]);
  return (
    <>
      <h2>Yield</h2>
      <ZoomChart
        loader={loader}
        first={FIRST_DAY}
        today={today}
        unit="%"
        bars={ohlc}
        styleToggle
        presets={PRESETS}
        initialDays={OPEN_ON_DAYS}
        onInterval={stats.setShown}
      />
      <LoadStats totals={stats.totals} interval={stats.interval} />
    </>
  );
}

/** A fixing's history (golden values from its one source), zoomable, in its unit: a rate in percent, an FX rate or index as printed. */
function FixingHistory({ name, unit, heading }: { name: string; unit: string; heading: string }) {
  const stats = useLoadStats();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ohlc = isOhlc(useLocation());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loader = useMemo(() => fixingLoader(name, unit, stats.record), [name, unit]);
  return (
    <>
      <h2>{heading}</h2>
      <ZoomChart
        loader={loader}
        first={FIXINGS_FIRST_DAY}
        today={today}
        unit={unit}
        bars={ohlc}
        styleToggle
        presets={PRESETS}
        initialDays={OPEN_ON_DAYS}
        onInterval={stats.setShown}
      />
      <LoadStats totals={stats.totals} interval={stats.interval} />
    </>
  );
}

function DetailPage({ name }: { name: string }) {
  // A Treasury security has its own page (price, terms, auctions); a CMT or anything else, this one.
  // The list links them alike, so it's decided by the instrument's type once it arrives.
  const [inst, setInst] = useState<InstrumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setInst(null);
    setError(null);
    apiGet("/api/instruments/{name}", { path: { name }, signal: ctl.signal })
      .then(setInst)
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e instanceof ApiError && e.status === 404 ? `There's no instrument called ${name}.` : e.message);
      });
    return () => ctl.abort();
  }, [name]);

  if (inst?.type.startsWith("ust_")) return <TreasuryDetail name={inst.name} />;

  return (
    <section>
      <p>
        <a {...linkProps(PREFIX)}>All instruments</a>
      </p>
      {error && <p className="error">{error}</p>}
      {!error && !inst && <p className="muted">Loading…</p>}
      {inst && (
        <>
          <header className="screen-head">
            <h1>{inst.name}</h1>
            <p className="lede">
              {inst.description}
              {inst.aliases.length > 0 && <>, also {inst.aliases.join(", ")}</>}.
            </p>
          </header>
          {inst.latest && (
            <p className="figure">
              <span className="figure-value">
                {inst.latest.display}
                {inst.unit === "%" ? "%" : ""}
              </span>
              <span className="figure-note">
                on {inst.latest.date}, from <SourceLink name={inst.latest.source} label={SOURCE_LABEL[inst.latest.source] ?? inst.latest.source} />.{" "}
                {inst.type === "cmt_yield" && <a {...linkProps(`/series?names=${encodeURIComponent(inst.name)}`)}>See it over time</a>}
              </span>
            </p>
          )}
          {inst.type === "cmt_yield" && <YieldHistory name={inst.name} />}
          {FIXING_TYPES.includes(inst.type) && (
            <FixingHistory name={inst.name} unit={inst.unit ?? "%"} heading={inst.type === "fx_index" ? "Index" : "Rate"} />
          )}

          <h2>About</h2>
          <dl className="facts">
            <dt>Type</dt>
            <dd>{instrumentType(inst.type)}</dd>
            {inst.tenor && (
              <>
                <dt>Tenor</dt>
                <dd>{tenorLabel(inst.tenor)}</dd>
              </>
            )}
            {inst.curve ? (
              <>
                <dt>Curve</dt>
                <dd>{inst.curve} ({inst.currency}, {inst.country})</dd>
              </>
            ) : (
              <>
                <dt>Currency</dt>
                <dd>{inst.currency} ({inst.country})</dd>
              </>
            )}
            <dt>Business days</dt>
            <dd><CalendarLink name={inst.calendar} /></dd>
            <dt>Status</dt>
            <dd>{inst.status}</dd>
          </dl>

          <h2>Identifiers</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Key</th>
                <th scope="col">Valid</th>
              </tr>
            </thead>
            <tbody>
              {inst.identifiers.map((i) => (
                <tr key={`${i.scheme}:${i.value}`}>
                  <td><SourceLink name={i.scheme} label={SCHEME_LABEL[i.scheme] ?? i.scheme} /></td>
                  <td>
                    <code>{i.value}</code>
                  </td>
                  <td className="muted">{i.valid_from || i.valid_to ? `${i.valid_from ?? "…"} to ${i.valid_to ?? "now"}` : "Always"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {inst.notes.length > 0 && (
            <>
              <h2>Notes</h2>
              <ol className="notes">
                {inst.notes.map((n) => (
                  <li key={n.key}>
                    <time dateTime={n.date}>{n.date}</time>
                    <p>{n.text}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The old Treasuries screen's links (/treasuries?type=note, /treasuries/X) as Instruments ones; others as they are. */
function fromOldTreasuries(location: Location): Location {
  if (location.path !== OLD_TREASURIES && !location.path.startsWith(`${OLD_TREASURIES}/`)) return location;
  const query = new URLSearchParams(location.query);
  if (!query.get("type")) query.set("type", "ust");
  return { path: PREFIX + location.path.slice(OLD_TREASURIES.length), query };
}

function SecuritiesPage({ location: asked }: { location: Location }) {
  const location = fromOldTreasuries(asked);
  const moved = location !== asked;
  useEffect(() => {
    // Show the new address too, without a history entry. (Rendered from the rewritten location above, so
    // nothing waits on the navigation event, which can fire before the app has started listening.)
    if (moved) {
      const s = location.query.toString();
      window.history.replaceState(null, "", location.path === PREFIX && s ? `${PREFIX}?${s}` : location.path);
    }
  }, [moved, location]);
  const rest = location.path.slice(PREFIX.length).replace(/^\//, "");
  if (rest) return <DetailPage name={decodeURIComponent(rest)} />;
  return (
    <ListPage
      query={location.query.get("q") ?? ""}
      type={location.query.get("type") ?? "cmt"}
      all={location.query.get("all") === "1"}
      start={Math.max(0, Number.parseInt(location.query.get("start") ?? "0", 10) || 0)}
    />
  );
}

export const securitiesScreen: Screen = {
  id: "instruments",
  title: "Instruments",
  path: PREFIX,
  matches: (path) =>
    path === PREFIX || path.startsWith(`${PREFIX}/`) || path === OLD_TREASURIES || path.startsWith(`${OLD_TREASURIES}/`),
  Component: SecuritiesPage,
};
