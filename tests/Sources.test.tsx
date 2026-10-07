// @vitest-environment jsdom
// The Sources screen's schedule, late status and a capture's text.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/charts/CurveChart", () => ({ default: () => <div>curve chart</div> }));
vi.mock("../src/charts/ZoomChart", () => ({ default: () => <div>series chart</div> }));

import App from "../src/App";

const PRICES = {
  name: "TD-PRICES", group: "securities", calendar: "SIFMA-US", kind: "published", period_kind: "day", url: "https://www.treasurydirect.gov/",
  description: "FedInvest prices", parsed: true, status: "late", captures: 4800, capture_bytes: 520000000, latest_capture_id: 8100,
  latest_capture_at: "2026-10-01T23:16:00+00:00", last_success_at: "2026-10-01T23:16:00+00:00", last_check_at: "2026-10-01T23:16:00+00:00",
  last_outcome: "new", last_parse_outcome: "ok", last_error: "", checks_7d: 5, errors_7d: 0, periods: 4700, first_period: "2008-01-02",
  last_period: "2026-10-01", pulls: "FedInvest's buy, sell and end-of-day price per CUSIP. quote-svc reads them.",
  dag: "mkt_data__treasury_securities_capture", schedule: "Weekdays 7:15 p.m. New York", late_after_hours: 96, late: true,
};

const ANSWERS: Record<string, unknown> = {
  "/api/sources": { sources: [PRICES] },
  "/api/sources/TD-PRICES": {
    source: PRICES,
    checks: [{ id: 8, checked_at: "2026-10-01T23:16:00+00:00", outcome: "new", capture_id: 8099, period: "2026-10-01", detail: "",
      parse_outcome: "ok", parse_detail: "" }],
    years: [],
  },
  "/api/captures/8099/text": {
    capture_id: 8099, source: "TD-PRICES", period: "2026-10-01", fetched_at: "2026-10-01T23:16:00+00:00", view: "visible",
    lines_total: 3020, matches: null, offset: 0, shown_of: 3020,
    lines: [{ n: 47, text: "Historical Prices" }, { n: 48, text: "Prices For: October 1, 2026" }],
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

const asked = () => (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(([u]) => u);

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Sources", () => {
  it("calls out a source late against its schedule", async () => {
    serve();
    window.history.replaceState(null, "", "/sources");
    render(<App />);
    expect(await screen.findByText("Late")).toBeInTheDocument();
    expect(screen.getByText("Late against their schedule: TD-PRICES.", { exact: false })).toBeInTheDocument();
  });

  it("says what a source gives and when it's fetched, and links each capture to its text", async () => {
    serve();
    window.history.replaceState(null, "", "/sources/TD-PRICES");
    render(<App />);
    expect(await screen.findByText(PRICES.pulls)).toBeInTheDocument();
    expect(screen.getByText("Weekdays 7:15 p.m. New York", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#8099" })).toHaveAttribute("href", "/sources/TD-PRICES/captures/8099");
  });

  it("shows a capture's text and searches it", async () => {
    serve();
    window.history.replaceState(null, "", "/sources/TD-PRICES/captures/8099");
    render(<App />);
    expect(await screen.findByText("Prices For: October 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("1 to 2 of 3,020")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next 200" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "912828" } });
    fireEvent.submit(screen.getByRole("searchbox").closest("form")!);
    expect(window.location.search).toBe("?q=912828");
    await screen.findByText("Prices For: October 1, 2026");
    expect(asked()).toContain("/api/captures/8099/text?contains=912828&context=2&offset=0&limit=200");
  });
});
