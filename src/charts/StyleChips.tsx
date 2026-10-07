// Lines or OHLC bars for a history chart, kept in the address bar (`?style=ohlc`) so a view can be shared.
import { useQueryUpdater, type Location } from "../router";

export function isOhlc(location: Location): boolean {
  return location.query.get("style") === "ohlc";
}

export default function StyleChips({ ohlc }: { ohlc: boolean }) {
  const setQuery = useQueryUpdater();
  return (
    <>
      <span className="control-label">Show</span>
      <button type="button" className="chip" aria-pressed={!ohlc} onClick={() => setQuery({ style: null })}>
        Lines
      </button>
      <button type="button" className="chip" aria-pressed={ohlc} onClick={() => setQuery({ style: "ohlc" })}>
        OHLC bars
      </button>
    </>
  );
}
