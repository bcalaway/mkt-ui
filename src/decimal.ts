// Exact arithmetic on the API's decimal strings, for the few differences the
// screens show (a curve's change in basis points). Scaled BigInts, never
// floats, so what's shown is exactly what the strings say.

function scaled(s: string, places: number): bigint {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s.trim());
  if (!m) throw new Error(`not a decimal: ${s}`);
  const frac = (m[3] ?? "").padEnd(places, "0");
  if (frac.length > places) throw new Error(`more than ${places} places: ${s}`);
  const n = BigInt((m[2] || "0") + frac);
  return m[1] ? -n : n;
}

/** (a - b) in basis points, for two percent strings ("4.10", "3.58" -> "52"); exact. */
export function bpChange(aPercent: string, bPercent: string): string {
  const places = 6; // percent to 6 places = 4 places of a bp
  const diff = (scaled(aPercent, places) - scaled(bPercent, places)) * 100n; // bp, scaled by 10^6
  const neg = diff < 0n;
  const abs = neg ? -diff : diff;
  const whole = abs / 1000000n;
  const frac = (abs % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : `${whole}`;
  if (body === "0") return "0";
  return `${neg ? "-" : "+"}${body}`;
}

/** Compare two decimal strings exactly: negative, zero or positive, like a sort comparator. */
export function compareDecimal(a: string, b: string): number {
  const places = 8;
  const d = scaled(a, places) - scaled(b, places);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}
