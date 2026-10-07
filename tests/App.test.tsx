// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Charts draw on canvas/SVG measurements jsdom doesn't have: stand-ins here.
vi.mock("../src/charts/CurveChart", () => ({ default: () => <div>curve chart</div> }));
vi.mock("../src/charts/ZoomChart", () => ({ default: () => <div>series chart</div> }));

import App from "../src/App";

const ANSWERS: Record<string, unknown> = {
  "/api/instruments": [
    { name: "UST-1.5M-CMT", aliases: ["UST-6W-CMT"], tenor: "P6W", description: "1.5-month", status: "active" },
    { name: "UST-10Y-CMT", aliases: [], tenor: "P10Y", description: "10-year", status: "active" },
  ],
  "/api/securities": {
    as_of: "2026-10-07",
    total: 2,
    securities: [
      { name: "UST-B-2026-10-08", cusip: "912797UJ4", type: "bill", cmb: false, term: "26-Week", original_term: "26-Week", coupon: "",
        coupon_display: "", frn_spread: "", issue_date: "2026-04-09", maturity_date: "2026-10-08", status: "active", on_the_run: [],
        price: { date: "2026-10-06", value: "99.978944", display: "99.978944", source: "TD-PRICES" } },
      { name: "UST-4.25-2035-08-15", cusip: "91282CNC1", type: "note", cmb: false, term: "10-Year", original_term: "10-Year",
        coupon: "0.0425", coupon_display: "4.25", frn_spread: "", issue_date: "2025-08-15", maturity_date: "2035-08-15", status: "active",
        on_the_run: ["UST-10Y-OTR", "UST-10Y-OTR-ISSUED"], price: null },
    ],
  },
  "/api/curve": {
    curves: [
      { label: "latest", requested: "2026-10-03", date: "2026-10-02", missing: [],
        points: [{ name: "UST-10Y-CMT", tenor: "P10Y", value: "0.041", display: "4.10", source: "UST-PAR" }] },
      { label: "1W", requested: "2026-09-26", date: "2026-09-25", missing: [],
        points: [{ name: "UST-10Y-CMT", tenor: "P10Y", value: "0.0415", display: "4.15", source: "UST-PAR" }] },
    ],
  },
};

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = ANSWERS[url.split("?")[0]];
      return Promise.resolve({ ok: body !== undefined, status: body ? 200 : 404, statusText: "", json: () => Promise.resolve(body ?? {}) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("opens on the curve, with its table and exact changes", async () => {
    serve();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Treasury yield curve" })).toBeInTheDocument();
    expect(await screen.findByText("curve chart")).toBeInTheDocument();
    expect(screen.getByText("4.10%")).toBeInTheDocument();
    expect(screen.getByText("-5", { exact: false })).toBeInTheDocument();
  });

  it("lists instruments by short name, linking to each", async () => {
    serve();
    window.history.replaceState(null, "", "/instruments");
    render(<App />);
    const link = await screen.findByRole("link", { name: "UST-1.5M-CMT" });
    expect(link.getAttribute("href")).toBe("/instruments/UST-1.5M-CMT");
    expect(screen.getByText("UST-6W-CMT")).toBeInTheDocument();
    // Only the curve's tenors: thousands of Treasury securities are found by search instead.
    const asked = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(([u]) => u);
    expect(asked).toContain("/api/instruments?type=cmt_yield");
  });

  it("lists Treasury securities with coupons, on-the-runs and prices", async () => {
    serve();
    window.history.replaceState(null, "", "/treasuries");
    render(<App />);
    const link = await screen.findByRole("link", { name: "UST-4.25-2035-08-15" });
    expect(link.getAttribute("href")).toBe("/treasuries/UST-4.25-2035-08-15");
    expect(screen.getByText("4.25%")).toBeInTheDocument();
    expect(screen.getByText("10Y")).toBeInTheDocument(); // the on-the-run badge; the issued variant isn't shown
    expect(screen.getByText("99.978944")).toBeInTheDocument();
    expect(screen.getByText("2 securities.")).toBeInTheDocument();
  });
});
