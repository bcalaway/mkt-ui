// @vitest-environment jsdom
// The Calendars screen's year page: each close's source, the calendar's sources, a day's history and disagreements.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/charts/CurveChart", () => ({ default: () => <div>curve chart</div> }));
vi.mock("../src/charts/ZoomChart", () => ({ default: () => <div>series chart</div> }));

import App from "../src/App";

const close = (date: string, status: string, holiday: string, close_time = "") =>
  ({ date, status, holiday, close_time, projected: false, source: "SIFMA-US-HOLIDAYS" });

const ANSWERS: Record<string, unknown> = {
  "/api/calendars/SIFMA-US/2026": {
    calendar: "SIFMA-US", timezone: "America/New_York", year: 2026, source: "SIFMA-US-HOLIDAYS", kind: "published",
    closes: [close("2026-04-03", "early_close", "Good Friday", "12:00"), close("2026-10-12", "closed", "Columbus Day")],
  },
  "/api/calendars/SIFMA-US/sources": {
    calendar: "SIFMA-US",
    sources: [
      { name: "SIFMA-US-HOLIDAYS", kind: "published", rank: 1, years: 2, first_year: 2026, last_year: 2027 },
      { name: "SIFMA-US-PROJECTED", kind: "projected", rank: 2, years: 0, first_year: 0, last_year: 0 },
    ],
  },
  "/api/calendars/SIFMA-US/days/2026-04-03": {
    calendar: "SIFMA-US", date: "2026-04-03",
    versions: [
      { status: "closed", holiday: "Good Friday", close_time: "", source: "SIFMA-US-RULES", capture_id: 7,
        valid_from: "2025-12-01T00:00:00+00:00", valid_to: "2026-01-15T00:00:00+00:00" },
      { status: "early_close", holiday: "Good Friday", close_time: "12:00", source: "SIFMA-US-HOLIDAYS", capture_id: 9,
        valid_from: "2026-01-15T00:00:00+00:00", valid_to: "" },
    ],
  },
  "/api/calendars/SIFMA-US/disagreements": {
    calendar: "SIFMA-US",
    days: [
      { date: "2026-04-03", source: "SIFMA-US-RULES", differs: "status", source_says: "closed", source_holiday: "Good Friday",
        calendar_says: "early_close 12:00", calendar_holiday: "Good Friday", decided_by: "SIFMA-US-HOLIDAYS", decided_by_higher: true },
      { date: "2026-11-27", source: "SIFMA-US-HOLIDAYS", differs: "status", source_says: "open", source_holiday: "",
        calendar_says: "early_close 14:00", calendar_holiday: "Day after Thanksgiving", decided_by: "SIFMA-US-RULES",
        decided_by_higher: false },
      { date: "2019-12-24", source: "SIFMA-US-RULES", differs: "name", source_says: "early_close 14:00", source_holiday: "Christmas Eve",
        calendar_says: "early_close 14:00", calendar_holiday: "Christmas Eve (SIFMA recommendation)", decided_by: "SIFMA-US-ARCHIVE",
        decided_by_higher: true },
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

describe("Calendars year page", () => {
  it("names the source of each close and lists the calendar's sources", async () => {
    serve();
    window.history.replaceState(null, "", "/calendars/SIFMA-US/2026");
    render(<App />);
    expect((await screen.findAllByText("SIFMA-US-HOLIDAYS")).length).toBeGreaterThan(0);
    expect(screen.getByTitle("Early close 12:00: Good Friday, from SIFMA-US-HOLIDAYS")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "SIFMA-US-PROJECTED" })).toHaveAttribute("href", "/sources/SIFMA-US-PROJECTED");
    expect(screen.getByText("2 (2026 to 2027)")).toBeInTheDocument();
  });

  it("shows how a day's status changed", async () => {
    serve();
    window.history.replaceState(null, "", "/calendars/SIFMA-US/2026?day=2026-04-03");
    render(<App />);
    expect(await screen.findByText("#9")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  it("checks disagreements on request, this year first, flagging a lower source deciding", async () => {
    serve();
    window.history.replaceState(null, "", "/calendars/SIFMA-US/2026");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Check every year" }));
    expect(await screen.findByText("lower source")).toBeInTheDocument();
    expect(screen.getByText("3 days across every year", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Christmas Eve (SIFMA recommendation)", { exact: false })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Every year"));
    expect(screen.getByText("Christmas Eve (SIFMA recommendation)", { exact: false })).toBeInTheDocument();
  });
});
