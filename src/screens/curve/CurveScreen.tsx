// The yield curve on a date, with comparison curves before it.
import { useEffect, useMemo, useState } from "react";
import { apiGet, type Curve, type CurveResponse } from "../../api/client";
import CurveChart, { type CurveLine } from "../../charts/CurveChart";
import { bpChange } from "../../decimal";
import { SOURCE_LABEL, shortTenor } from "../../format";
import { useQueryUpdater, type Location } from "../../router";
import type { Screen } from "../types";

const COMPARE_CHOICES = ["1W", "1M", "3M", "1Y"];
const DEFAULT_COMPARE = ["1W", "1M", "1Y"];

function curveName(c: Curve): string {
  return c.label === "latest" || c.label === "date" ? "Selected" : `${c.label} earlier`;
}

function CurvePage({ location }: { location: Location }) {
  const setQuery = useQueryUpdater();
  const date = location.query.get("date") ?? "";
  const compare = location.query.has("compare")
    ? (location.query.get("compare") ?? "").split(",").filter((c) => COMPARE_CHOICES.includes(c))
    : DEFAULT_COMPARE;
  const [data, setData] = useState<CurveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    apiGet("/api/curve", { query: { date: date || undefined, compare }, signal: ctl.signal })
      .then(setData)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
    // compare is derived from the query string; its joined form is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, compare.join(",")]);

  const view = useMemo(() => {
    if (!data) return null;
    const curves = data.curves.filter((c) => c.date);
    const first = curves[0];
    const tenors = first ? first.points.map((p) => shortTenor(p.name)) : [];
    for (const c of curves.slice(1)) {
      for (const p of c.points) if (!tenors.includes(shortTenor(p.name))) tenors.push(shortTenor(p.name));
    }
    const lines: CurveLine[] = curves.map((c, i) => ({
      key: c.label,
      label: `${curveName(c)} (${c.date})`,
      short: i === 0 ? c.date! : c.label,
      slot: i,
      values: Object.fromEntries(c.points.map((p) => [shortTenor(p.name), { text: p.percent, source: p.source }])),
    }));
    return { curves, tenors, lines };
  }, [data]);

  const toggle = (c: string) => {
    const next = compare.includes(c) ? compare.filter((x) => x !== c) : [...compare, c];
    setQuery({ compare: COMPARE_CHOICES.filter((x) => next.includes(x)).join(",") || "none" });
  };

  const latest = view?.curves[0];
  return (
    <section>
      <header className="screen-head">
        <h1>Treasury yield curve</h1>
        <p className="lede">
          {latest ? <>Constant-maturity yields on {latest.date}{date && latest.date !== date ? `, the last business day on or before ${date}` : ""}.</> : "Constant-maturity yields."}
        </p>
      </header>

      <div className="controls" role="group" aria-label="Curve options">
        <label>
          Date
          <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setQuery({ date: e.target.value || null })} />
        </label>
        {date && (
          <button type="button" className="quiet" onClick={() => setQuery({ date: null })}>
            Latest
          </button>
        )}
        <span className="control-label">Compare with</span>
        {COMPARE_CHOICES.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={compare.includes(c)} onClick={() => toggle(c)}>
            {c} earlier
          </button>
        ))}
      </div>

      {error && <p className="error">Couldn't load the curve: {error}</p>}
      {!error && !view && <p className="muted">Loading…</p>}
      {view && view.curves.length === 0 && <p className="muted">No yields on or in the ten days before that date. Pick a later one.</p>}
      {view && view.curves.length > 0 && (
        <>
          <CurveChart tenors={view.tenors} lines={view.lines} />
          <CurveTable curves={view.curves} tenors={view.tenors} />
        </>
      )}
    </section>
  );
}

function CurveTable({ curves, tenors }: { curves: Curve[]; tenors: string[] }) {
  const [base, ...others] = curves;
  const at = (c: Curve, t: string) => c.points.find((p) => shortTenor(p.name) === t);
  return (
    <table className="data">
      <caption>Yields in percent; changes from each earlier curve to the selected one, in basis points.</caption>
      <thead>
        <tr>
          <th scope="col">Tenor</th>
          <th scope="col" className="num">{base.date}</th>
          {others.map((c) => (
            <th key={c.label} scope="col" className="num">
              {c.label} earlier ({c.date})
            </th>
          ))}
          <th scope="col">Source</th>
        </tr>
      </thead>
      <tbody>
        {tenors.map((t) => {
          const now = at(base, t);
          return (
            <tr key={t}>
              <th scope="row">{t}</th>
              <td className="num">{now ? `${now.percent}%` : "–"}</td>
              {others.map((c) => {
                const then = at(c, t);
                return (
                  <td key={c.label} className="num">
                    {then ? `${then.percent}%` : "–"}
                    {now && then && <span className="change"> {bpChange(now.percent, then.percent)}</span>}
                  </td>
                );
              })}
              <td className="muted">{now ? SOURCE_LABEL[now.source] ?? now.source : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const curveScreen: Screen = {
  id: "curve",
  title: "Curve",
  path: "/",
  matches: (path) => path === "/" || path.startsWith("/curve"),
  Component: CurvePage,
};
