// Futures (mkt-data's docs/phase-4.md, step 7): secmaster-svc's futures products, generated from
// their rules (seeds/futures.toml). The list is every product by kind with today's front contract;
// a product's page has its generics, its contracts and their dates, the rules they come from, and
// the CFTC's weekly positioning; a Treasury contract's basket is its deliverables with their
// conversion factors. Values are shown as the API gives them.
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, type Schemas } from "../../api/client";
import { positioningLoader, POSITIONING_FIRST_DAY } from "../../charts/positioning";
import { PRESETS } from "../../charts/presets";
import ZoomChart from "../../charts/ZoomChart";
import Pager, { PAGE_SIZE } from "../../Pager";
import { linkProps, useQueryUpdater, type Location } from "../../router";
import { InstrumentLink, SourceLink } from "../../links";
import type { Screen } from "../types";

const PREFIX = "/futures";
type Product = Schemas["FuturesProductOut"];
type Contract = Schemas["FuturesContractOut"];

export const KIND_LABEL: Record<string, string> = {
  treasury: "Treasury, deliverable",
  treasury_cash: "Treasury, cash-settled",
  stir: "Interest rate",
  fx: "FX, deliverable",
  fx_cash: "FX, cash-settled",
};
const KIND_ORDER = Object.keys(KIND_LABEL);

// A contract's dates, in the order they happen; a column shows only if some contract has it.
const DATE_COLUMNS: [keyof Contract, string][] = [
  ["first_trade_date", "First trade"],
  ["reference_start", "Reference starts"],
  ["first_intention_date", "First intention"],
  ["first_notice_date", "First notice"],
  ["first_delivery_date", "First delivery"],
  ["last_trade_date", "Last trade"],
  ["reference_end", "Reference ends"],
  ["final_settlement_date", "Final settlement"],
  ["settlement_date", "Settlement"],
  ["last_delivery_date", "Last delivery"],
];

// The TFF report's trader categories (quote-svc's CFTC field names), each a long and a short line.
export const CATEGORIES: { id: string; label: string; fields: string[] }[] = [
  { id: "oi", label: "Open interest", fields: ["oi"] },
  { id: "dealer", label: "Dealers", fields: ["dealer_long", "dealer_short"] },
  { id: "asset_mgr", label: "Asset managers", fields: ["asset_mgr_long", "asset_mgr_short"] },
  { id: "lev_funds", label: "Leveraged funds", fields: ["lev_funds_long", "lev_funds_short"] },
  { id: "other", label: "Other reportables", fields: ["other_long", "other_short"] },
  { id: "nonrept", label: "Nonreportable", fields: ["nonrept_long", "nonrept_short"] },
];
const POSITIONING_SOURCES = [
  { name: "CFTC-TFF", label: "Futures only" },
  { name: "CFTC-TFF-COMBINED", label: "Futures and options" },
];

function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    setData(null);
    setError(null);
    load(ctl.signal)
      .then(setData)
      .catch((e: Error) => e.name !== "AbortError" && setError(e instanceof ApiError ? e.message : String(e.message)));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function ListPage() {
  const { data, error } = useApi((signal) => apiGet("/api/futures", { signal }), []);
  const kinds = useMemo(() => {
    const by = new Map<string, Product[]>();
    for (const p of data ?? []) by.set(p.kind, [...(by.get(p.kind) ?? []), p]);
    return [...by.entries()].sort(([a], [b]) => (KIND_ORDER.indexOf(a) + 99) % 99 - (KIND_ORDER.indexOf(b) + 99) % 99);
  }, [data]);
  return (
    <section>
      <header>
        <h1>Futures</h1>
        <p className="lede">
          CME's Treasury, rate and FX futures, their contracts generated from each product's rules. The front is
          today's first generic.
        </p>
      </header>
      {error && <p className="error">{error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {kinds.map(([kind, products]) => (
        <div key={kind}>
          <h2>{KIND_LABEL[kind] ?? kind}</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Root</th>
                <th scope="col">CME code</th>
                <th scope="col">Name</th>
                <th scope="col">Currency</th>
                <th scope="col">Front</th>
                <th scope="col">CFTC code</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.root}>
                  <td><a {...linkProps(`${PREFIX}/${encodeURIComponent(p.root)}`)}>{p.root}</a></td>
                  <td>{p.cme_code}</td>
                  <td>{p.name}</td>
                  <td>{p.currency}</td>
                  <td>{p.front ? <ContractName product={p.root} name={p.front} basket={kind === "treasury"} /> : <span className="muted">{p.status}</span>}</td>
                  <td>{p.cftc_code || <span className="muted">Not reported</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

/** A contract's name, linked to its basket for a deliverable Treasury contract. */
function ContractName({ product, name, basket }: { product: string; name: string; basket: boolean }) {
  if (!basket) return <>{name}</>;
  return <a {...linkProps(`${PREFIX}/${encodeURIComponent(product)}/${encodeURIComponent(name)}`)} title="Its deliverable basket">{name}</a>;
}

function ProductPage({ root, all, start, who, source }: { root: string; all: boolean; start: number; who: string; source: string }) {
  const update = useQueryUpdater();
  const { data, error } = useApi((signal) => apiGet("/api/futures/{root}", { path: { root }, query: { include_expired: all }, signal }), [root, all]);
  const columns = useMemo(() => DATE_COLUMNS.filter(([k]) => data?.contracts.some((c) => c[k])), [data]);
  const page = data?.contracts.slice(start, start + PAGE_SIZE) ?? [];
  const deliverable = data?.kind === "treasury";
  return (
    <section>
      <header>
        <p className="muted"><a {...linkProps(PREFIX)}>Futures</a></p>
        <h1>{data ? `${data.root}: ${data.name}` : root}</h1>
      </header>
      {error && <p className="error">{error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <dl className="facts">
            <dt>Kind</dt>
            <dd>{KIND_LABEL[data.kind] ?? data.kind}</dd>
            <dt>CME code</dt>
            <dd>{data.cme_code}</dd>
            <dt>Currency</dt>
            <dd>{data.currency}</dd>
            <dt>Instrument</dt>
            <dd><InstrumentLink name={data.root} /></dd>
            <dt>CFTC code</dt>
            <dd>{data.cftc_code || "Not reported"}</dd>
            {data.basket_rule && (
              <>
                <dt>Deliverable</dt>
                <dd>{data.basket_rule} <span className="muted">({data.basket_source})</span></dd>
              </>
            )}
          </dl>

          <h2>Generics</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Generic</th>
                <th scope="col">Contract today</th>
              </tr>
            </thead>
            <tbody>
              {data.generics.map((g) => (
                <tr key={g.generic}>
                  <td>{g.generic}</td>
                  <td><ContractName product={data.root} name={g.contract} basket={deliverable} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Contracts</h2>
          <label className="controls">
            <input type="checkbox" checked={all} onChange={(e) => update({ all: e.target.checked ? "1" : null, start: null })} />
            Include expired
          </label>
          <Pager start={start} total={data.contracts.length} shown={page.length} noun="contracts" onGo={(s) => update({ start: s ? String(s) : null })} />
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Contract</th>
                <th scope="col">CME code</th>
                <th scope="col">Month</th>
                <th scope="col">Status</th>
                {deliverable && <th scope="col">Basket</th>}
                {columns.map(([k, label]) => <th key={k} scope="col">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {page.map((c) => (
                <tr key={c.name}>
                  <td><ContractName product={data.root} name={c.name} basket={deliverable} /></td>
                  <td>{c.cme_code}</td>
                  <td>{c.month}</td>
                  <td>{c.status}</td>
                  {deliverable && <td>{c.basket_size ?? ""}</td>}
                  {columns.map(([k]) => <td key={k}>{c[k] as string}</td>)}
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Rules</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Rule</th>
                <th scope="col">From</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.rules).map(([field, rule]) => (
                <tr key={field}>
                  <td>{DATE_COLUMNS.find(([k]) => k === field)?.[1] ?? field}</td>
                  <td><code>{rule}</code></td>
                  <td className="muted">{data.rule_sources[field] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.cftc_code && <Positioning root={data.root} who={who} source={source} />}
        </>
      )}
    </section>
  );
}

function Positioning({ root, who, source }: { root: string; who: string; source: string }) {
  const update = useQueryUpdater();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const category = CATEGORIES.find((c) => c.id === who) ?? CATEGORIES[3];
  const src = POSITIONING_SOURCES.find((s) => s.name === source) ?? POSITIONING_SOURCES[0];
  const loader = useMemo(() => positioningLoader(root, src.name, category.fields), [root, src.name, category]);
  return (
    <>
      <h2>Positioning</h2>
      <p className="lede">
        The CFTC's Traders in Financial Futures report, weekly as of each Tuesday, in contracts as reported, from{" "}
        <SourceLink name={src.name} />.
      </p>
      <div className="controls" role="group" aria-label="Traders">
        <span className="control-label">Traders</span>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={c.id === category.id}
            onClick={() => update({ who: c.id === "lev_funds" ? null : c.id })}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="controls" role="group" aria-label="Report">
        <span className="control-label">Report</span>
        {POSITIONING_SOURCES.map((s) => (
          <button key={s.name} type="button" className="chip" aria-pressed={s.name === src.name}
            onClick={() => update({ report: s.name === "CFTC-TFF" ? null : s.name })}>
            {s.label}
          </button>
        ))}
      </div>
      <ZoomChart loader={loader} first={POSITIONING_FIRST_DAY} today={today} unit="contracts" presets={PRESETS} initialDays={1826} />
    </>
  );
}

function BasketPage({ root, contract }: { root: string; contract: string }) {
  const { data, error } = useApi((signal) => apiGet("/api/futures/contracts/{contract}/basket", { path: { contract }, signal }), [contract]);
  // The latest MSPD month among the deliverables (ISO dates compare as strings); a new issue has none yet.
  const asOf = data ? data.deliverables.reduce((m, d) => (d.outstanding_as_of > m ? d.outstanding_as_of : m), "") : "";
  return (
    <section>
      <header>
        <p className="muted">
          <a {...linkProps(PREFIX)}>Futures</a> / <a {...linkProps(`${PREFIX}/${encodeURIComponent(root)}`)}>{root}</a>
        </p>
        <h1>{contract} basket</h1>
        {data && (
          <p className="lede">
            {data.deliverables.length} deliverable securities for {data.month} ({data.status}): {data.rule}.
            {asOf && <> Amounts outstanding from <SourceLink name="FD-MSPD-STRIPS" label="MSPD" /> as of {asOf}, in $ billions.</>}
          </p>
        )}
      </header>
      {error && <p className="error">{error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Security</th>
              <th scope="col">CUSIP</th>
              <th scope="col">Coupon</th>
              <th scope="col">Maturity</th>
              <th scope="col">Issued</th>
              <th scope="col">Joined</th>
              <th scope="col">Months</th>
              <th scope="col">Conversion factor</th>
              <th scope="col">Outstanding</th>
              <th scope="col">Unstripped</th>
            </tr>
          </thead>
          <tbody>
            {data.deliverables.map((d) => (
              <tr key={d.cusip}>
                <td><InstrumentLink name={d.security} /></td>
                <td>{d.cusip}</td>
                <td>{d.coupon_display ? `${d.coupon_display}%` : ""}</td>
                <td>{d.maturity_date}</td>
                <td>{d.issue_date}</td>
                <td>{d.joined}</td>
                <td>{d.remaining_months}</td>
                <td>{d.conversion_factor}</td>
                <td className="num" title={d.outstanding ? `$${d.outstanding} on ${d.outstanding_as_of}` : "Not in MSPD yet"}>{d.outstanding_display || <span className="muted">—</span>}</td>
                <td className="num">{d.unstripped_display || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
          {data.outstanding_total && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={8}>Total</th>
                <td className="num">{data.outstanding_total_display}</td>
                <td className="num">{data.unstripped_total_display}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </section>
  );
}

function FuturesScreen({ location }: { location: Location }) {
  const [root, contract] = location.path.slice(PREFIX.length).replace(/^\/+/, "").split("/").map(decodeURIComponent);
  if (root && contract) return <BasketPage root={root.toUpperCase()} contract={contract.toUpperCase()} />;
  if (root) {
    const q = location.query;
    return (
      <ProductPage
        root={root.toUpperCase()}
        all={q.get("all") === "1"}
        start={Math.max(0, Number(q.get("start")) || 0)}
        who={q.get("who") ?? "lev_funds"}
        source={q.get("report") ?? "CFTC-TFF"}
      />
    );
  }
  return <ListPage />;
}

export const futuresScreen: Screen = {
  id: "futures",
  title: "Futures",
  path: PREFIX,
  matches: (path) => path === PREFIX || path.startsWith(`${PREFIX}/`),
  Component: FuturesScreen,
};
