import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// api/openapi.json is mkt-api's schema, vendored: the typed client
// (src/api/schema.d.ts) is generated from it, so the build type-checks
// against it. This fails when mkt-api's main has moved on, so a change there
// is picked up here (copy its openapi.json and fix what no longer compiles).
const MKT_API_SCHEMA = "https://raw.githubusercontent.com/bcalaway/mkt-api/main/openapi.json";

describe("mkt-api schema", () => {
  it("matches mkt-api's main", async () => {
    const res = await fetch(MKT_API_SCHEMA);
    expect(res.ok).toBe(true);
    const theirs = await res.json();
    const ours = JSON.parse(readFileSync(new URL("../api/openapi.json", import.meta.url), "utf8"));
    expect(ours).toEqual(theirs);
  });
});
