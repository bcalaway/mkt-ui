// Display helpers. Values from mkt-api are decimal strings and are shown as
// given; nothing here does arithmetic on a number that's shown back.

/** An ISO 8601 tenor as traders write it: P10Y -> 10Y, P6W -> 6W, P3M -> 3M. */
export function tenorLabel(iso: string): string {
  const m = /^P(\d+)([YMWD])$/.exec(iso);
  return m ? `${m[1]}${m[2]}` : iso;
}

/** "UST-10Y-CMT" -> "10Y": the short name's tenor part, for compact labels. */
export function shortTenor(name: string): string {
  const m = /^UST-(.+)-CMT$/.exec(name);
  return m ? m[1] : name;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A date `years` / `months` before today, as YYYY-MM-DD (for range presets). */
export function before(today: Date, months: number): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate()));
  return isoDate(d);
}

export const SOURCE_LABEL: Record<string, string> = {
  "UST-PAR": "Treasury",
  "H15-TCM": "Fed H.15",
};
