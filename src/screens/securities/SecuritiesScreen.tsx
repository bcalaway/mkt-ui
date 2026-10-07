// The security master: find an instrument by name, alias or identifier, and
// see its identifiers in each source, its notes and its latest value.
import { useEffect, useState } from "react";
import { ApiError, apiGet, type InstrumentDetail, type InstrumentSummary } from "../../api/client";
import { SOURCE_LABEL, tenorLabel } from "../../format";
import { linkProps, useQueryUpdater, type Location } from "../../router";
import type { Screen } from "../types";

const PREFIX = "/instruments";

const SCHEME_LABEL: Record<string, string> = {
  "UST-PAR": "Treasury par curve",
  "H15-TCM": "Fed H.15",
  FRED: "FRED",
};

function ListPage({ query }: { query: string }) {
  const setQuery = useQueryUpdater();
  const [text, setText] = useState(query);
  const [rows, setRows] = useState<InstrumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    const req = query
      ? apiGet("/api/search", { query: { q: query, limit: 50 }, signal: ctl.signal })
      : apiGet("/api/instruments", { query: { type: "cmt_yield" }, signal: ctl.signal });
    req.then(setRows).catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [query]);

  return (
    <section>
      <header className="screen-head">
        <h1>Instruments</h1>
        <p className="lede">
          The curve's tenors, with the name each source uses for each. Thousands of Treasury securities are in the security master too: find one by
          short name, CUSIP or an on-the-run alias like UST-10Y-OTR.
        </p>
      </header>
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
            Show the tenors
          </button>
        )}
      </form>
      {error && <p className="error">Couldn't load instruments: {error}</p>}
      {!error && !rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">Nothing matches “{query}”. Try a tenor like 10Y or a source key like BC_10YEAR.</p>}
      {rows && rows.length > 0 && (
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
  const rest = location.path.slice(PREFIX.length).replace(/^\//, "");
  if (rest) return <DetailPage name={decodeURIComponent(rest)} />;
  return <ListPage query={location.query.get("q") ?? ""} />;
}

export const securitiesScreen: Screen = {
  id: "instruments",
  title: "Instruments",
  path: PREFIX,
  matches: (path) => path === PREFIX || path.startsWith(`${PREFIX}/`),
  Component: SecuritiesPage,
};
