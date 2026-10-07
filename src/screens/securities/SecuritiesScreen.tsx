// The security master: find an instrument by name, alias or identifier, and
// see its identifiers in each source, its notes and its latest value. By
// type: the curve's CMT tenors (`type=cmt`, the default) or the Treasury
// securities (`type=ust`, or one kind: bill, note, bond, tips, frn), whose
// list and pages are in ./Treasuries.tsx.
import { useEffect, useState } from "react";
import { ApiError, apiGet, type InstrumentDetail, type InstrumentSummary } from "../../api/client";
import { SOURCE_LABEL, tenorLabel } from "../../format";
import { linkProps, navigate, useQueryUpdater, type Location } from "../../router";
import type { Screen } from "../types";
import { TreasuryDetail, TreasuryList } from "./Treasuries";

const PREFIX = "/instruments";
// Where the Treasuries screen used to be (2026-10-07, before it joined Instruments): links there still work.
const OLD_TREASURIES = "/treasuries";

// The Treasury kinds the `type` filter takes (besides `cmt`, the default); `ust` is all of them.
const TREASURY_TYPES = ["ust", "bill", "note", "bond", "tips", "frn"];
const TYPES: { key: string; label: string }[] = [
  { key: "cmt", label: "CMT yields" },
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

function ListPage({ query, type, all }: { query: string; type: string; all: boolean }) {
  const setQuery = useQueryUpdater();
  const treasuries = !query && TREASURY_TYPES.includes(type);
  const [text, setText] = useState(query);
  const [rows, setRows] = useState<InstrumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (treasuries) return; // TreasuryList loads its own
    const ctl = new AbortController();
    setError(null);
    const req = query
      ? apiGet("/api/search", { query: { q: query, limit: 50 }, signal: ctl.signal })
      : apiGet("/api/instruments", { query: { type: "cmt_yield" }, signal: ctl.signal });
    req.then(setRows).catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [query, treasuries]);

  return (
    <section>
      <header className="screen-head">
        <h1>Instruments</h1>
        <p className="lede">
          {treasuries
            ? `${all ? "Every marketable Treasury security since 1980" : "The marketable Treasury securities outstanding"}, by maturity, with the on-the-run issues marked and FedInvest's latest end-of-day price per 100. Open one for its terms, auctions and price history.`
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
            onClick={() => setQuery({ type: t.key === "cmt" ? null : t.key, q: null, all: TREASURY_TYPES.includes(t.key) && all ? "1" : null })}
          >
            {t.label}
          </button>
        ))}
        {treasuries && (
          <label>
            <input type="checkbox" checked={all} onChange={(e) => setQuery({ all: e.target.checked ? "1" : null })} />
            Include matured
          </label>
        )}
      </div>
      <form
        className="controls"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ q: text.trim() || null });
        }}
      >
        <label>
          Find
          <input type="search" value={text} placeholder="UST-10Y-CMT, 6W, BC_10YEAR, UST-10Y-OTR, 91282CQC8" onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit">Search</button>
        {query && (
          <button type="button" className="quiet" onClick={() => { setText(""); setQuery({ q: null }); }}>
            Clear the search
          </button>
        )}
      </form>
      {treasuries && <TreasuryList type={type} all={all} />}
      {!treasuries && error && <p className="error">Couldn't load instruments: {error}</p>}
      {!treasuries && !error && !rows && <p className="muted">Loading…</p>}
      {!treasuries && rows && rows.length === 0 && <p className="muted">Nothing matches “{query}”. Try a tenor like 10Y or a source key like BC_10YEAR.</p>}
      {!treasuries && rows && rows.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Tenor</th>
              <th scope="col">Description</th>
              <th scope="col">Also known as</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">
                  <a {...linkProps(`${PREFIX}/${encodeURIComponent(r.name)}`)}>{r.name}</a>
                </th>
                <td>{tenorLabel(r.tenor)}</td>
                <td>{r.description}</td>
                <td className="muted">{r.aliases.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
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
              <span className="figure-value">{inst.latest.display}%</span>
              <span className="figure-note">
                on {inst.latest.date}, from {SOURCE_LABEL[inst.latest.source] ?? inst.latest.source}.{" "}
                <a {...linkProps(`/series?names=${encodeURIComponent(inst.name)}`)}>See it over time</a>
              </span>
            </p>
          )}
          <dl className="facts">
            <dt>Tenor</dt>
            <dd>{tenorLabel(inst.tenor)}</dd>
            <dt>Curve</dt>
            <dd>{inst.curve} ({inst.currency}, {inst.country})</dd>
            <dt>Business days</dt>
            <dd>{inst.calendar}</dd>
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
                  <td>{SCHEME_LABEL[i.scheme] ?? i.scheme}</td>
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

function SecuritiesPage({ location }: { location: Location }) {
  // The old Treasuries screen's links: /treasuries?type=note -> /instruments?type=note, /treasuries/X -> /instruments/X.
  const old = location.path === OLD_TREASURIES || location.path.startsWith(`${OLD_TREASURIES}/`);
  useEffect(() => {
    if (!old) return;
    const q = new URLSearchParams(location.query);
    if (!q.get("type")) q.set("type", "ust");
    const rest = location.path.slice(OLD_TREASURIES.length);
    navigate(rest ? `${PREFIX}${rest}` : `${PREFIX}?${q.toString()}`, { replace: true });
  }, [old, location]);
  if (old) return null;
  const rest = location.path.slice(PREFIX.length).replace(/^\//, "");
  if (rest) return <DetailPage name={decodeURIComponent(rest)} />;
  return (
    <ListPage
      query={location.query.get("q") ?? ""}
      type={location.query.get("type") ?? "cmt"}
      all={location.query.get("all") === "1"}
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
