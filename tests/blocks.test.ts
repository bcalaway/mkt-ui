import { afterEach, describe, expect, it, vi } from "vitest";
import { blockOf, blockRange, blocksCovering, clearBlockCache, getBlock, stepBlock } from "../src/charts/blocks";

describe("blocks, as mkt-api's app/blocks.py has them", () => {
  it("are a year of days and a decade of weeks or months", () => {
    expect(blockOf("day", "2026-10-02")).toBe("2026");
    expect(blockRange("day", "2026")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(blockOf("month", "2026-10-02")).toBe("2020");
    expect(blockRange("month", "2020")).toEqual({ start: "2020-01-01", end: "2029-12-31" });
    // A week belongs to the decade its Monday is in.
    expect(blockRange("week", "2020")).toEqual({ start: "2020-01-06", end: "2030-01-06" });
    expect(blockOf("week", "2020-01-03")).toBe("2010");
    expect(blockOf("week", "2030-01-06")).toBe("2020");
    expect(stepBlock("day", "2026", -1)).toBe("2025");
    expect(stepBlock("week", "2020", 1)).toBe("2030");
  });

  it("cover a window", () => {
    expect(blocksCovering("day", "2023-10-06", "2026-10-06")).toEqual(["2023", "2024", "2025", "2026"]);
    expect(blocksCovering("month", "1962-01-01", "2026-10-06")).toEqual(["1960", "1970", "1980", "1990", "2000", "2010", "2020"]);
  });
});

describe("the block cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearBlockCache();
  });

  const bars = (key: string) => ({ key, label: key, unit: "%", inputs: [], bars: [{ date: "1990-01-01", last_date: "1990-01-31", open: "8.00", high: "8.10", low: "7.90", close: "8.05", source: "H15-TCM", inputs: [] }] });

  it("asks once per series per block, and only for the series it doesn't have", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      const series = new URL(url, "http://x").searchParams.getAll("series");
      return new Response(JSON.stringify({ interval: "month", block: "1990", start: "1990-01-01", end: "1999-12-31", final: true, series: series.map(bars) }), { headers: { "content-type": "application/json" } });
    });
    const record = vi.fn();
    const [ten] = await getBlock("month", "1990", "", ["UST-10Y-CMT"], record);
    expect(ten.bars[0].close).toBe("8.05");
    const [again, two] = await getBlock("month", "1990", "", ["UST-10Y-CMT", "UST-2Y-CMT"], record);
    expect([again.key, two.key]).toEqual(["UST-10Y-CMT", "UST-2Y-CMT"]);
    expect(urls).toEqual([
      "/api/bars?series=UST-10Y-CMT&interval=month&block=1990",
      "/api/bars?series=UST-2Y-CMT&interval=month&block=1990",
    ]);
    await getBlock("month", "1990", "", ["UST-2Y-CMT"], record);
    expect(urls).toHaveLength(2);
    expect(record.mock.calls.at(-1)[0]).toMatchObject({ cached: true });
  });

  it("doesn't keep a failure", async () => {
    let fail = true;
    vi.stubGlobal("fetch", async () =>
      fail
        ? new Response(JSON.stringify({ detail: "a service didn't answer" }), { status: 502 })
        : new Response(JSON.stringify({ final: true, series: [bars("UST-10Y-CMT")] })),
    );
    await expect(getBlock("month", "1990", "", ["UST-10Y-CMT"], () => {})).rejects.toThrow(/didn't answer/);
    fail = false;
    const [ten] = await getBlock("month", "1990", "", ["UST-10Y-CMT"], () => {});
    expect(ten.key).toBe("UST-10Y-CMT");
  });
});
