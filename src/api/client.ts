// The typed client for mkt-api, through mkt-ui's own server (/api/* is
// proxied to mkt-api for the signed-in user). The types come from mkt-api's
// OpenAPI schema (api/openapi.json, vendored from bcalaway/mkt-api; `npm run
// gen:api` writes src/api/schema.d.ts), so a breaking API change fails the
// build here. Values arrive as decimal strings and are shown as given.
import type { components, paths } from "./schema";

type GetOp<P extends keyof paths> = paths[P] extends { get: infer G } ? G : never;
export type Ok<P extends keyof paths> =
  GetOp<P> extends { responses: { 200: { content: { "application/json": infer R } } } } ? R : never;
type Query<P extends keyof paths> = GetOp<P> extends { parameters: { query?: infer Q } } ? Q : never;
type PathParams<P extends keyof paths> = GetOp<P> extends { parameters: { path: infer A } } ? A : never;

export type Schemas = components["schemas"];
export type InstrumentSummary = Schemas["InstrumentSummary"];
export type InstrumentDetail = Schemas["InstrumentDetail"];
export type CurveResponse = Schemas["CurveResponse"];
export type Curve = Schemas["CurveOut"];
export type SeriesResponse = Schemas["SeriesResponse"];
export type SpreadResponse = Schemas["SpreadResponse"];

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function queryString(query: Record<string, unknown> | undefined): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, String(item));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function apiGet<P extends keyof paths>(
  path: P,
  options: { query?: Query<P>; path?: PathParams<P>; signal?: AbortSignal; onResponse?: (res: Response) => void } = {},
): Promise<Ok<P>> {
  let url = String(path);
  for (const [k, v] of Object.entries((options.path ?? {}) as Record<string, string>)) {
    url = url.replace(`{${k}}`, encodeURIComponent(v));
  }
  const res = await fetch(url + queryString(options.query as Record<string, unknown> | undefined), {
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  options.onResponse?.(res);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : res.statusText;
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return body as Ok<P>;
}

/** A Server-Timing header as name -> milliseconds ("api;dur=5.0, upstream;dur=4.0"). */
export function serverTiming(res: Response): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (res.headers.get("server-timing") ?? "").split(",")) {
    const m = /^\s*([\w-]+)\s*;\s*dur=([\d.]+)/.exec(part);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}
