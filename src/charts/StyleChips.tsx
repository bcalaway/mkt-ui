// Lines or OHLC bars for a history chart, kept in the address bar (`?style=ohlc`) so a view can be shared.
// The toggle sits in the chart's own toolbar, by the span buttons (Bill, 2026-10-10).
import { useQueryUpdater, type Location } from "../router";
import { BarsIcon, LineIcon } from "./icons";

export function isOhlc(location: Location): boolean {
  return location.query.get("style") === "ohlc";
}

export function StyleToggle({ ohlc }: { ohlc: boolean }) {
  const setQuery = useQueryUpdater();
  return (
    <div className="tool-group" role="group" aria-label="Chart style">
      <button type="button" className="tool icon" aria-pressed={!ohlc} aria-label="Lines" title="Lines"
              onClick={() => setQuery({ style: null })}>
        <LineIcon />
      </button>
      <button type="button" className="tool icon" aria-pressed={ohlc} aria-label="OHLC bars" title="OHLC bars"
              onClick={() => setQuery({ style: "ohlc" })}>
        <BarsIcon />
      </button>
    </div>
  );
}
