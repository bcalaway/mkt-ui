import { describe, expect, it } from "vitest";
import { daysBetween, periodStart, pickInterval, toBars } from "../src/charts/bars";
import { compareDecimal } from "../src/decimal";

describe("bars made in the browser", () => {
  it("start periods as the API does", () => {
    expect(periodStart("2026-10-02", "week")).toBe("2026-09-28"); // Friday -> Monday
    expect(periodStart("2026-09-28", "week")).toBe("2026-09-28");
    expect(periodStart("2026-10-04", "week")).toBe("2026-09-28"); // Sunday
    expect(periodStart("2026-10-02", "month")).toBe("2026-10-01");
    expect(periodStart("2026-08-31", "quarter")).toBe("2026-07-01");
    expect(periodStart("2026-10-02", "year")).toBe("2026-01-01");
  });

  it("pick about 800 bars or fewer", () => {
    expect(pickInterval(365)).toBe("day");
    expect(pickInterval(daysBetween("2016-10-06", "2026-10-06"))).toBe("week");
    expect(pickInterval(daysBetween("1962-01-01", "2026-10-06"))).toBe("month");
  });

  it("sum days into open, high, low and close, comparing exactly", () => {
    const dates = ["2026-09-30", "2026-10-01", "2026-10-02"];
    const pcts = ["4.15", "4.2", "4.10"];
    const src = (i: number) => (i < 2 ? "UST-PAR" : "H15-TCM");
    expect(toBars(dates, pcts, src, "month")).toEqual([
      { date: "2026-09-01", last: "2026-09-30", open: "4.15", high: "4.15", low: "4.15", close: "4.15", source: "UST-PAR" },
      { date: "2026-10-01", last: "2026-10-02", open: "4.2", high: "4.2", low: "4.10", close: "4.10", source: "H15-TCM" },
    ]);
    expect(toBars(dates, pcts, src, "week")).toHaveLength(1);
    expect(compareDecimal("4.10", "4.1")).toBe(0);
    expect(compareDecimal("-0.5", "0.25")).toBe(-1);
  });
});
