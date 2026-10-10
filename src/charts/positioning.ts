// A futures product's weekly CFTC positioning (mkt-api's /api/futures/{root}/positioning): every
// report since 2006 in one request (about 1,000 weeks a field), kept for the page, so zooming and
// panning need nothing new. Positions are contracts, shown as reported with thousands separators.
import { apiGet } from "../api/client";
import type { TimeLine } from "./types";
import type { Loader } from "./ZoomChart";

export const POSITIONING_FIRST_DAY = "2006-06-13"; // the TFF report's first week

const LABEL: Record<string, string> = {
  oi: "Open interest",
  dealer_long: "Dealers long", dealer_short: "Dealers short",
  asset_mgr_long: "Asset managers long", asset_mgr_short: "Asset managers short",
  lev_funds_long: "Leveraged funds long", lev_funds_short: "Leveraged funds short",
  other_long: "Other long", other_short: "Other short",
  nonrept_long: "Nonreportable long", nonrept_short: "Nonreportable short",
};

/** "5100000" -> "5,100,000": digits grouped in the string, never through a float. */
export function groupDigits(v: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(v);
  if (!m) return v;
  return `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${m[3] ?? ""}`;
}

const cache = new Map<string, Promise<TimeLine[]>>();

export function positioningLoader(root: string, source: string, fields: string[]): Loader {
  const key = `${root}|${source}|${fields.join(",")}`;
  const today = new Date().toISOString().slice(0, 10);
  return async () => {
    let got = cache.get(key);
    if (!got) {
      got = apiGet("/api/futures/{root}/positioning", { path: { root }, query: { source: source as "CFTC-TFF", field: fields } })
        .then((r) => fields.map((f, k) => ({
          key: f,
          label: LABEL[f] ?? f,
          slot: k,
          points: (r.fields[f] ?? []).map((p) => ({ date: p.date, plot: Number(p.value), text: groupDigits(p.value) })),
        })));
      got.catch(() => cache.delete(key));
      cache.set(key, got);
    }
    return { lines: await got, from: POSITIONING_FIRST_DAY, to: today };
  };
}
