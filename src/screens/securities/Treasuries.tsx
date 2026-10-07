// Treasury securities on the Instruments screen (mkt-data's docs/phase-3.md,
// step 9): the outstanding bills, notes, bonds, TIPS and FRNs by maturity,
// with the on-the-runs marked and the latest FedInvest price
// (/instruments?type=ust, or one kind); and a security's page: its terms
// (with where each came from), auctions, identifiers and price over time.
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, type Schemas } from "../../api/client";
import LoadStats, { useLoadStats } from "../../charts/LoadStats";
import { PRICES_FIRST_DAY, priceLoader } from "../../charts/loaders";
import { OPEN_ON_DAYS, PRESETS } from "../../charts/presets";
import StyleChips, { isOhlc } from "../../charts/StyleChips";
import ZoomChart from "../../charts/ZoomChart";
import { linkProps, useLocation } from "../../router";

const PREFIX = "/instruments";
type Row = Schemas["SecurityRow"];
type Detail = Schemas["SecurityDetail"];

const TYPE_LABEL: Record<string, string> = { bill: "Bill", note: "Note", bond: "Bond", tips: "TIPS", frn: "FRN" };

/** "UST-10Y-OTR" -> "10Y", "UST-5Y-TII-OTR" -> "5Y TIPS", "UST-2Y-FRN-OTR" -> "2Y FRN"; issued variants left out. */
function otrLabel(alias: string): string | null {
  const m = /^UST-(\w+?)(-TII|-FRN)?-OTR$/.exec(alias);
  if (!m) return null;
  return `${m[1]}${m[2] === "-TII" ? " TIPS" : m[2] === "-FRN" ? " FRN" : ""}`;
}

/** Coupon as Treasury quotes it: "4.25%", a bill "Bill", an FRN its spread. */
function couponText(r: Row): string {
  if (r.coupon_display) return `${r.coupon_display}%`;
  if (r.type === "frn") return r.frn_spread ? `FRN +${r.frn_spread}` : "FRN";
  return r.cmb ? "CMB" : "Bill";
}

/** Treasury securities of one kind (or every kind, `ust`), outstanding or with matured ones too. */
export function TreasuryList({ type, all }: { type: string; all: boolean }) {
  const kind = type === "ust" ? "" : type;
  const [data, setData] = useState<Schemas["SecurityListResponse"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null);
    setError(null);
    apiGet("/api/securities", {
      query: { type: (kind || undefined) as Row["type"] | undefined, include_inactive: all || undefined, limit: all ? 6000 : 1000 },
      signal: ctl.signal,
    })
      .then(setData)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [kind, all]);

  return (
    <>
      {error && <p className="error">Couldn't load securities: {error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <p className="muted">
            {data.securities.length === data.total ? `${data.total} securities` : `${data.securities.length} of ${data.total} securities`}.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Security</th>
                <th scope="col">Type</th>
                <th scope="col" className="num">Coupon</th>
                <th scope="col">Matures</th>
                <th scope="col">Issued</th>
                <th scope="col">CUSIP</th>
                <th scope="col">On the run</th>
                <th scope="col" className="num">Price</th>
              </tr>
            </thead>
            <tbody>
              {data.securities.map((r) => (
                <tr key={r.cusip}>
                  <th scope="row">
                    <a {...linkProps(`${PREFIX}/${encodeURIComponent(r.name)}`)}>{r.name}</a>
                  </th>
                  <td>
                    {TYPE_LABEL[r.type] ?? r.type}
                    {r.term && <span className="muted"> · {r.original_term || r.term}</span>}
                  </td>
                  <td className="num">{couponText(r)}</td>
                  <td>{r.maturity_date}</td>
                  <td className="muted">{r.issue_date}</td>
                  <td>
                    <code>{r.cusip}</code>
                  </td>
                  <td>
                    {r.on_the_run
                      .map(otrLabel)
                      .filter(Boolean)
                      .map((l) => (
                        <span key={l} className="badge">
                          {l}
                        </span>
                      ))}
                  </td>
                  <td className="num">{r.price ? r.price.display : <span className="muted">{r.status === "active" ? "—" : r.status}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// The terms worth a line on the page, in reading order, with their labels; the rest are listed under "All terms".
const MAIN_TERMS: [string, string][] = [
  ["cusip", "CUSIP"],
  ["security_type", "Type"],
  ["original_term", "Original term"],
  ["coupon_rate", "Coupon rate"],
  ["frn_spread", "FRN spread"],
  ["frn_index", "FRN index"],
  ["announcement_date", "Announced"],
  ["auction_date", "First auction"],
  ["issue_date", "Issued"],
  ["dated_date", "Dated (accrual from)"],
  ["first_coupon_date", "First coupon"],
  ["first_period_type", "First period"],
  ["penultimate_coupon_date", "Penultimate coupon"],
  ["maturity_date", "Matures"],
  ["coupon_frequency", "Coupons a year"],
  ["day_count", "Day count"],
  ["tips_base_cpi", "Base reference CPI"],
  ["redemption", "Redemption"],
  ["settlement_days", "Settlement (days)"],
  ["calendar", "Calendar"],
];

const AUCTION_COLUMNS: [string, string][] = [
  ["auction_date", "Auction"],
  ["issue_date", "Issued"],
  ["reopening", "Reopening"],
  ["offering_amount", "Offered"],
  ["total_accepted", "Accepted"],
  ["bid_to_cover", "Bid to cover"],
  ["high_yield", "High yield"],
  ["high_discount_rate", "High discount rate"],
  ["high_discount_margin", "High discount margin"],
  ["price_per_100", "Price per 100"],
];

/** Money in dollars as Treasury prints it, grouped: "42000000000" -> "42,000,000,000"; anything else as given. */
function amount(v: string): string {
  return /^\d+(\.0+)?$/.test(v) ? v.replace(/\.0+$/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") : v;
}

/** A Treasury security's page: price, price over time, terms, auctions, identifiers. */
export function TreasuryDetail({ name }: { name: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stats = useLoadStats();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ohlc = isOhlc(useLocation());

  useEffect(() => {
    const ctl = new AbortController();
    setD(null);
    setError(null);
    apiGet("/api/securities/{name}", { path: { name }, signal: ctl.signal })
      .then(setD)
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e instanceof ApiError && e.status === 404 ? `There's no Treasury security called ${name}.` : e.message);
      });
    return () => ctl.abort();
  }, [name]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loader = useMemo(() => (d ? priceLoader(d.name, stats.record) : null), [d?.name]);
  const shownAuctionColumns = d ? AUCTION_COLUMNS.filter(([k]) => d.auctions.some((a) => a[k])) : [];
  const listed = new Set(MAIN_TERMS.map(([k]) => k));

  return (
    <section>
      <p>
        <a {...linkProps(`${PREFIX}?type=ust`)}>All Treasury securities</a>
      </p>
      {error && <p className="error">{error}</p>}
      {!error && !d && <p className="muted">Loading…</p>}
      {d && (
        <>
          <header className="screen-head">
            <h1>{d.name}</h1>
            <p className="lede">
              {d.description}
              {d.on_the_run.length > 0 && <> On the run: {d.on_the_run.map((o) => o.alias).join(", ")}.</>}
              {d.status !== "active" && <> Status: {d.status}.</>}
            </p>
          </header>
          {d.price && (
            <p className="figure">
              <span className="figure-value">{d.price.display}</span>
              <span className="figure-note">per 100, FedInvest's end of day on {d.price.date}.</span>
            </p>
          )}
          {d.index_ratio && (
            <p className="muted">
              Index ratio today {d.index_ratio.index_ratio} (reference CPI {d.index_ratio.ref_cpi} over base {d.index_ratio.base_cpi}
              {d.index_ratio.method === "fallback" ? ", using the CFR fallback for a month BLS didn't publish" : ""}).
            </p>
          )}

          {loader && (
            <>
              <h2>Price</h2>
              <div className="controls" role="group" aria-label="Display">
                <StyleChips ohlc={ohlc} />
              </div>
              <ZoomChart
                loader={loader}
                first={PRICES_FIRST_DAY}
                today={today}
                unit="price"
                bars={ohlc}
                presets={PRESETS}
                initialDays={OPEN_ON_DAYS}
                onInterval={stats.setShown}
              />
              <LoadStats totals={stats.totals} interval={stats.interval} />
            </>
          )}

          <h2>Terms</h2>
          <dl className="facts">
            {MAIN_TERMS.filter(([k]) => d.terms[k]).map(([k, label]) => (
              <div key={k} className="fact" title={d.provenance[k] ?? ""}>
                <dt>{label}</dt>
                <dd>{d.terms[k]}</dd>
              </div>
            ))}
          </dl>
          {d.checks.length > 0 && (
            <p className="muted">Checks: {d.checks.join("; ")}</p>
          )}
          <details className="events">
            <summary>All terms and where each came from</summary>
            <table className="data">
              <tbody>
                {Object.keys(d.terms)
                  .sort((a, b) => Number(listed.has(b)) - Number(listed.has(a)) || a.localeCompare(b))
                  .map((k) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td>{d.terms[k] || <span className="muted">—</span>}</td>
                      <td className="muted">{d.provenance[k] ?? ""}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>

          <h2>Auctions</h2>
          <table className="data">
            <thead>
              <tr>
                {shownAuctionColumns.map(([, label]) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.auctions.map((a, n) => (
                <tr key={`${a.issue_date}-${n}`}>
                  {shownAuctionColumns.map(([k]) => (
                    <td key={k} className={k.endsWith("date") || k === "reopening" ? "" : "num"}>
                      {k === "reopening" ? (a[k] === "true" ? "Yes" : "No") : k.endsWith("amount") || k === "total_accepted" ? amount(a[k] ?? "") : a[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Identifiers</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Scheme</th>
                <th scope="col">Value</th>
                <th scope="col">Valid</th>
              </tr>
            </thead>
            <tbody>
              {d.identifiers.map((i) => (
                <tr key={`${i.scheme}:${i.value}:${i.valid_from ?? ""}`}>
                  <td>{i.scheme}</td>
                  <td>
                    <code>{i.value}</code>
                  </td>
                  <td className="muted">{i.valid_from || i.valid_to ? `${i.valid_from ?? "…"} to ${i.valid_to ?? "now"}` : "Always"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
