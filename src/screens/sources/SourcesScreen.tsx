// Sources (mkt-data's docs/phase-3.md, step 8): every source mkt-data
// captures (the calendar pages, the CMT yields, the Treasury securities
// sources), with how its captures are going: the last successful fetch, the
// last check and any error, errors this week, what's stored and the periods
// covered. A source's page lists its newest fetch attempts and its periods by
// year. The same facts as Grafana's Captures row and home-mcp's
// mkt_data_checks, readable without either.
import { useEffect, useState } from "react";
import { ApiError, apiGet, type Schemas } from "../../api/client";
import { linkProps, type Location } from "../../router";
import type { Screen } from "../types";

const PREFIX = "/sources";
type Source = Schemas["SourceOut"];
type Detail = Schemas["SourceDetailOut"];

const GROUPS: { key: string; title: string; note: string }[] = [
  { key: "securities", title: "Treasury securities", note: "Auctions, prices, STRIPS and CPI: a page a day, month or year." },
  { key: "rates", title: "CMT yields", note: "Treasury's par curve and the Fed's H.15, a month at a time." },
  { key: "calendars", title: "Calendars", note: "Holiday and early-close pages, and the rules files." },
];

const STATUS_LABEL: Record<string, string> = { ok: "OK", error: "Error", never: "Not captured yet", raw: "Kept raw" };
const PERIOD_LABEL: Record<string, string> = { day: "By day", month: "By month", year: "By year" };

/** "3 h ago", "2 days ago": how long before now an ISO timestamp was; "" for none. */
export function ago(iso: string, now: Date = new Date()): string {
  if (!iso) return "";
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** 520000000 -> "496 MB": bytes stored, in binary units. */
export function size(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v : v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function when(iso: string): string {
  return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

function StatusBadge({ s }: { s: Source }) {
  return <span className={`badge status-${s.status}`}>{STATUS_LABEL[s.status] ?? s.status}</span>;
}

function periodsText(s: Source): string {
  if (!s.period_kind) return "One page";
  if (!s.periods) return PERIOD_LABEL[s.period_kind] ?? s.period_kind;
  return `${s.periods.toLocaleString()} (${s.first_period} to ${s.last_period})`;
}

function ListPage() {
  const [rows, setRows] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    apiGet("/api/sources", { signal: ctl.signal })
      .then((r) => setRows(r.sources))
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, []);

  const failing = rows?.filter((s) => s.status === "error") ?? [];
  return (
    <section>
      <header className="screen-head">
        <h1>Sources</h1>
        <p className="lede">
          Every page and file mkt-data captures, with its last successful fetch, its last check and any error, and what's
          stored. Open one for its recent fetches and the periods it covers.
        </p>
      </header>
      {error && <p className="error">Couldn't load sources: {error}</p>}
      {!error && !rows && <p className="muted">Loading…</p>}
      {rows && (
        <>
          <p className={failing.length ? "error" : "muted"}>
            {rows.length} sources;{" "}
            {failing.length ? `the last check failed for ${failing.map((s) => s.name).join(", ")}.` : "every last check worked."}
          </p>
          {GROUPS.map((g) => {
            const group = rows.filter((s) => s.group === g.key);
            if (!group.length) return null;
            return (
              <section key={g.key}>
                <h2>{g.title}</h2>
                <p className="muted">{g.note}</p>
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Calendar</th>
                      <th scope="col">Status</th>
                      <th scope="col">Last fetch that worked</th>
                      <th scope="col" className="num">Errors, 7 days</th>
                      <th scope="col">Periods</th>
                      <th scope="col" className="num">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((s) => (
                      <tr key={s.name}>
                        <td>
                          <a {...linkProps(`${PREFIX}/${s.name}`)}>{s.name}</a>
                          {s.kind !== "published" && <span className="muted"> · {s.kind}</span>}
                        </td>
                        <td className="muted">{s.calendar}</td>
                        <td title={s.last_error}>
                          <StatusBadge s={s} />
                        </td>
                        <td title={when(s.last_success_at)}>{ago(s.last_success_at) || <span className="muted">—</span>}</td>
                        <td className={`num${s.errors_7d ? " error" : ""}`}>
                          {s.errors_7d} of {s.checks_7d}
                        </td>
                        <td className="muted">{periodsText(s)}</td>
                        <td className="num">
                          {s.captures.toLocaleString()} · {size(s.capture_bytes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}

function DetailPage({ name }: { name: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setD(null);
    setError(null);
    apiGet("/api/sources/{name}", { path: { name }, query: { checks: 100 }, signal: ctl.signal })
      .then(setD)
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e instanceof ApiError && e.status === 404 ? `There's no source named ${name}.` : e.message);
      });
    return () => ctl.abort();
  }, [name]);

  const s = d?.source;
  return (
    <section>
      <p>
        <a {...linkProps(PREFIX)}>All sources</a>
      </p>
      {error && <p className="error">{error}</p>}
      {!error && !d && <p className="muted">Loading…</p>}
      {d && s && (
        <>
          <header className="screen-head">
            <h1>{s.name}</h1>
            <p className="lede">
              {s.description} <StatusBadge s={s} />
            </p>
            {s.last_error && <p className="error">Last check: {s.last_error}</p>}
          </header>
          <dl className="facts">
            <dt>Captured for</dt>
            <dd>
              {s.calendar} ({s.group}, {s.kind})
            </dd>
            <dt>Fetched</dt>
            <dd>{s.period_kind ? PERIOD_LABEL[s.period_kind] ?? s.period_kind : "As one page"}</dd>
            <dt>From</dt>
            <dd className="muted">{s.url}</dd>
            <dt>Parser</dt>
            <dd>{s.parsed ? "Yes" : "Not yet: kept raw"}</dd>
            <dt>Last fetch that worked</dt>
            <dd>{s.last_success_at ? `${when(s.last_success_at)} (${ago(s.last_success_at)})` : "Never"}</dd>
            <dt>Last check</dt>
            <dd>
              {s.last_check_at ? `${when(s.last_check_at)}: ${s.last_outcome}${s.last_parse_outcome ? `, parse ${s.last_parse_outcome}` : ""}` : "None"}
            </dd>
            <dt>This week</dt>
            <dd>
              {s.checks_7d} checks, {s.errors_7d} with errors
            </dd>
            <dt>Stored</dt>
            <dd>
              {s.captures.toLocaleString()} captures, {size(s.capture_bytes)}
              {s.latest_capture_id ? `; the latest #${s.latest_capture_id} on ${when(s.latest_capture_at)}` : ""}
            </dd>
            {s.period_kind ? (
              <>
                <dt>Periods</dt>
                <dd>{periodsText(s)}</dd>
              </>
            ) : null}
          </dl>

          {d.years.length > 0 && (
            <>
              <h2>Periods by year</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col" className="num">Periods</th>
                    <th scope="col" className="num">Captures</th>
                    <th scope="col" className="num">Stored</th>
                  </tr>
                </thead>
                <tbody>
                  {d.years.map((y) => (
                    <tr key={y.year}>
                      <td>{y.year}</td>
                      <td className="num">{y.periods}</td>
                      <td className="num">{y.captures}</td>
                      <td className="num">{size(y.capture_bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2>Recent fetches</h2>
          {d.checks.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  {s.period_kind ? <th scope="col">Period</th> : null}
                  <th scope="col">Outcome</th>
                  <th scope="col">Parse</th>
                  <th scope="col" className="num">Capture</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {d.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{when(c.checked_at)}</td>
                    {s.period_kind ? <td>{c.period}</td> : null}
                    <td className={c.outcome === "error" ? "error" : undefined}>{c.outcome}</td>
                    <td className={c.parse_outcome === "error" ? "error" : "muted"}>{c.parse_outcome || "—"}</td>
                    <td className="num">{c.capture_id ? `#${c.capture_id}` : ""}</td>
                    <td className="muted">{c.detail || c.parse_detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function SourcesScreen({ location }: { location: Location }) {
  const rest = location.path.slice(PREFIX.length).replace(/^\/+/, "");
  return rest ? <DetailPage name={decodeURIComponent(rest)} /> : <ListPage />;
}

export const sourcesScreen: Screen = {
  id: "sources",
  title: "Sources",
  path: PREFIX,
  matches: (path) => path === PREFIX || path.startsWith(`${PREFIX}/`),
  Component: SourcesScreen,
};
