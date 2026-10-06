import { describe, expect, it } from "vitest";
import { daysBetween, periodStart, pickInterval } from "../src/charts/bars";

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
});
