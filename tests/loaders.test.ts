// The EFFR chart's target range: each bound as it stood at the end of each of the fixing's bars.
import { describe, expect, it } from "vitest";
import { asOf } from "../src/charts/loaders";

describe("asOf", () => {
  it("takes the latest value on or before each date", () => {
    const points = [{ date: "2026-01-02", display: "4.25" }, { date: "2026-03-19", display: "4.00" }];
    expect(asOf(points, ["2026-01-01", "2026-01-31", "2026-03-19", "2026-04-30"])).toEqual([null, "4.25", "4.00", "4.00"]);
    expect(asOf([], ["2026-01-01"])).toEqual([null]);
  });
});
