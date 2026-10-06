// What a zooming chart has loaded and how long the last load took, split into
// mkt-api's time, the time waiting on quote-svc, and the network: to see the
// block cache at work and where time goes.
import { useCallback, useRef, useState } from "react";
import type { Interval } from "./bars";
import type { RequestStat } from "./loaders";

const INTERVAL_LABEL: Record<Interval, string> = { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly", year: "yearly" };

interface Totals {
  requests: number;
  ahead: number; // of the requests, those fetched ahead of need (not waited for)
  cached: number; // loads answered wholly from the cache: no request
  bytes: number;
  last: RequestStat | null; // the last request a chart waited for
}

const EMPTY: Totals = { requests: 0, ahead: 0, cached: 0, bytes: 0, last: null };

/** Totals of a chart's requests; `record` is stable, `reset` starts again (new tenors or source). */
export function useLoadStats() {
  const ref = useRef<Totals>(EMPTY);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const record = useCallback((stat: RequestStat) => {
    const t = ref.current;
    ref.current = stat.cached
      ? { ...t, cached: t.cached + 1 }
      : {
          ...t,
          requests: t.requests + 1,
          ahead: t.ahead + (stat.prefetch ? 1 : 0),
          bytes: t.bytes + stat.bytes,
          last: stat.prefetch ? t.last : stat,
        };
    setTotals(ref.current);
  }, []);
  const reset = useCallback(() => {
    ref.current = EMPTY;
    setTotals(EMPTY);
  }, []);
  const [interval, setShown] = useState<Interval | null>(null);
  return { totals, record, reset, interval, setShown };
}

export default function LoadStats({
  totals,
  interval,
}: {
  totals: Totals;
  interval: Interval | null;
}) {
  const last = totals.last;
  return (
    <p className="muted load-stats" aria-live="polite">
      {interval ? `${INTERVAL_LABEL[interval]} bars` : "Loading"}. {totals.requests} request
      {totals.requests === 1 ? "" : "s"}
      {totals.ahead > 0 && ` (${totals.ahead} ahead)`}, {(totals.bytes / 1024).toFixed(0)} KB
      {totals.cached > 0 && `, ${totals.cached} block load${totals.cached === 1 ? "" : "s"} from the cache`}
      {last && (
        <>
          ; the last ({INTERVAL_LABEL[last.interval]}) {last.totalMs} ms
          {last.apiMs !== undefined &&
            ` = mkt-api ${Math.round(last.apiMs)} (quote-svc ${Math.round(last.upstreamMs ?? 0)}) + network ${Math.max(0, last.totalMs - Math.round(last.apiMs))}`}
        </>
      )}
      .
    </p>
  );
}
