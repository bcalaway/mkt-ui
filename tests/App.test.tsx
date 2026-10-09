// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
  "/api/sources": {
    sources: [
      { name: "TD-PRICES", group: "securities", calendar: "SIFMA-US", kind: "published", period_kind: "day", url: "https://www.treasurydirect.gov/",
        description: "FedInvest prices", parsed: true, status: "error", captures: 4800, capture_bytes: 520000000, latest_capture_id: 8100,
        latest_capture_at: "2026-10-07T23:16:00+00:00", last_success_at: "2026-10-06T23:16:00+00:00", last_check_at: "2026-10-07T23:16:00+00:00",
        last_outcome: "error", last_parse_outcome: "", last_error: "HTTP 503 from FedInvest", checks_7d: 40, errors_7d: 1, periods: 4700,
        first_period: "2008-01-02", last_period: "2026-10-07" },
      { name: "FED-K8", group: "calendars", calendar: "FED", kind: "published", period_kind: "", url: "https://www.federalreserve.gov/",
        description: "K.8", parsed: true, status: "ok", captures: 12, capture_bytes: 600000, latest_capture_id: 40,
        latest_capture_at: "2026-10-01T00:00:00+00:00", last_success_at: "2026-10-07T00:00:00+00:00", last_check_at: "2026-10-07T00:00:00+00:00",
        last_outcome: "unchanged", last_parse_outcome: "ok", last_error: "", checks_7d: 1, errors_7d: 0, periods: 0, first_period: "", last_period: "" },
    ],
  },
  "/api/sources/TD-PRICES": {
    source: { name: "TD-PRICES", group: "securities", calendar: "SIFMA-US", kind: "published", period_kind: "day", url: "https://www.treasurydirect.gov/",
      description: "FedInvest prices", parsed: true, status: "error", captures: 4800, capture_bytes: 520000000, latest_capture_id: 8100,
      latest_capture_at: "2026-10-07T23:16:00+00:00", last_success_at: "2026-10-06T23:16:00+00:00", last_check_at: "2026-10-07T23:16:00+00:00",
      last_outcome: "error", last_parse_outcome: "", last_error: "HTTP 503 from FedInvest", checks_7d: 40, errors_7d: 1, periods: 4700,
      first_period: "2008-01-02", last_period: "2026-10-07" },
    checks: [
      { id: 9, checked_at: "2026-10-07T23:16:00+00:00", outcome: "error", capture_id: 0, period: "2026-10-07", detail: "HTTP 503 from FedInvest",
        parse_outcome: "", parse_detail: "" },
      { id: 8, checked_at: "2026-10-06T23:16:00+00:00", outcome: "new", capture_id: 8099, period: "2026-10-06", detail: "",
        parse_outcome: "ok", parse_detail: "" },
    ],
    years: [{ year: "2026", periods: 190, captures: 200, capture_bytes: 21000000 }],
  },
  "/api/calendars": {
    as_of: "2026-10-07",
    calendars: [
      { name: "SIFMA-US", description: "SIFMA US bond market", timezone: "America/New_York", first_year: 1990, last_year: 2100,
        coverage: { published: 30, rules: 7, projected: 74, last_published_year: 2027 },
        next_close: { date: "2026-10-12", status: "closed", holiday: "Columbus Day", close_time: "", projected: false },
        next_early_close: { date: "2026-11-27", status: "early_close", holiday: "Day after Thanksgiving", close_time: "14:00", projected: false } },
    ],
  },
  "/api/calendars/upcoming": {
    start: "2026-10-07", end: "2027-04-05", calendars: ["FED", "SIFMA-US"],
    days: [{ date: "2026-10-12", calendars: { "SIFMA-US": { date: "2026-10-12", status: "closed", holiday: "Columbus Day", close_time: "", projected: false } } }],
  },
  "/api/calendars/day": {
    date: "2026-10-12", weekday: "Monday",
    calendars: [
      { calendar: "FED", covered: true, business_day: true, status: "open", holiday: "", close_time: "", projected: false },
      { calendar: "SIFMA-US", covered: true, business_day: false, status: "closed", holiday: "Columbus Day", close_time: "", projected: false },
    ],
  },
  "/api/calendars/SIFMA-US/2026": {
    calendar: "SIFMA-US", timezone: "America/New_York", year: 2026, source: "SIFMA-US", kind: "published",
    closes: [
      { date: "2026-10-12", status: "closed", holiday: "Columbus Day", close_time: "", projected: false },
      { date: "2026-11-27", status: "early_close", holiday: "Day after Thanksgiving", close_time: "14:00", projected: false },
    ],
  },
  "/api/instruments/UST-10Y-CMT": {
    name: "UST-10Y-CMT", aliases: [], tenor: "P10Y", description: "US Treasury 10-year constant maturity yield", status: "active",
    type: "cmt_yield", curve: "UST", currency: "USD", country: "US", calendar: "SIFMA-US",
    identifiers: [{ scheme: "UST-PAR", value: "BC_10YEAR", valid_from: null, valid_to: null }], notes: [],
    latest: { date: "2026-10-06", value: "0.041", display: "4.10", source: "UST-PAR" },
  },
  "/api/instruments/UST-4.25-2035-08-15": {
    name: "UST-4.25-2035-08-15", aliases: ["UST-10Y-OTR"], tenor: "", description: "US Treasury note 4.25% due 2035-08-15",
    status: "active", type: "ust_note", identifiers: [], notes: [], latest: null,
  },
  "/api/securities/UST-4.25-2035-08-15": {
    name: "UST-4.25-2035-08-15", aliases: ["UST-10Y-OTR"], description: "US Treasury note 4.25% due 2035-08-15", status: "active",
    type: "ust_note", identifiers: [], terms: { maturity_date: "2035-08-15" }, provenance: {}, checks: [], auctions: [],
    on_the_run: [], index_ratio: null, strip: null,
    price: { date: "2026-10-06", value: "99.828125", display: "99.828125", source: "TD-PRICES" },
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

  it("lists Treasury securities on Instruments with coupons, on-the-runs and prices", async () => {
    serve();
    window.history.replaceState(null, "", "/instruments?type=ust");
    render(<App />);
    const link = await screen.findByRole("link", { name: "UST-4.25-2035-08-15" });
    expect(link.getAttribute("href")).toBe("/instruments/UST-4.25-2035-08-15");
    expect(screen.getByText("4.25%")).toBeInTheDocument();
    expect(screen.getByText("10Y")).toBeInTheDocument(); // the on-the-run badge; the issued variant isn't shown
    expect(screen.getByText("99.978944")).toBeInTheDocument();
    expect(screen.getByText("2 securities.")).toBeInTheDocument();
  });

  it("sends the old Treasuries screen's links to Instruments", async () => {
    serve();
    window.history.replaceState(null, "", "/treasuries?type=note");
    render(<App />);
    await screen.findByRole("link", { name: "UST-4.25-2035-08-15" });
    expect(window.location.pathname + window.location.search).toBe("/instruments?type=note");
  });

  it("lists sources by group, with failing ones called out", async () => {
    serve();
    window.history.replaceState(null, "", "/sources");
    render(<App />);
    const link = await screen.findByRole("link", { name: "TD-PRICES" });
    expect(link.getAttribute("href")).toBe("/sources/TD-PRICES");
    expect(screen.getByText("the last check failed for TD-PRICES.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Treasury securities" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calendars" })).toBeInTheDocument();
    expect(screen.getByText("4,700 (2008-01-02 to 2026-10-07)")).toBeInTheDocument();
  });

  it("shows a source's recent fetches and periods by year", async () => {
    serve();
    window.history.replaceState(null, "", "/sources/TD-PRICES");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "TD-PRICES" })).toBeInTheDocument();
    expect(screen.getByText("Last check: HTTP 503 from FedInvest")).toBeInTheDocument();
    expect(screen.getByText("#8099")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Periods by year" })).toBeInTheDocument();
    const asked = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(([u]) => u);
    expect(asked).toContain("/api/sources/TD-PRICES?checks=100");
  });

  it("lists calendars with coverage, and what's coming up on each", async () => {
    serve();
    window.history.replaceState(null, "", "/calendars?date=2026-10-12");
    render(<App />);
    const link = await screen.findByRole("link", { name: "SIFMA-US" });
    expect(link.getAttribute("href")).toBe("/calendars/SIFMA-US/2026");
    expect(screen.getByText("30 · 7 · 74")).toBeInTheDocument();
    expect(screen.getByText("2026-10-12 Mon, Columbus Day")).toBeInTheDocument();
    expect((await screen.findAllByText("Closed: Columbus Day")).length).toBeGreaterThan(0);
  });

  it("shows a calendar's year as month grids with its closes", async () => {
    serve();
    window.history.replaceState(null, "", "/calendars/sifma-us/2026");
    render(<App />);
    expect(await screen.findByText("Published, from SIFMA-US", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("October")).toBeInTheDocument();
    expect(screen.getByTitle("Early close 14:00: Day after Thanksgiving")).toHaveClass("early");
    expect(screen.getByRole("link", { name: "2027 →" }).getAttribute("href")).toBe("/calendars/SIFMA-US/2027");
  });

  it("charts a security's price with zoom buttons and lines or OHLC bars", async () => {
    serve();
    window.history.replaceState(null, "", "/instruments/UST-4.25-2035-08-15");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Price" })).toBeInTheDocument();
    const bars = screen.getByRole("button", { name: "OHLC bars" });
    expect(bars).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bars);
    expect(window.location.search).toBe("?style=ohlc");
    expect(await screen.findByRole("button", { name: "OHLC bars" })).toHaveAttribute("aria-pressed", "true");
  });

  it("charts a CMT's yield with the same controls", async () => {
    serve();
    window.history.replaceState(null, "", "/instruments/UST-10Y-CMT");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Yield" })).toBeInTheDocument();
    expect(screen.getByText("series chart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OHLC bars" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("BC_10YEAR")).toBeInTheDocument();
  });
});
