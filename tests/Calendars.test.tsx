// @vitest-environment jsdom
// The Calendars screen: the list's "Coming up" table (calendars as rows), and the year page's sources, a day's
// history and disagreements. Dates are YYYY-MM-DD with the weekday on this screen.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/charts/CurveChart", () => ({ default: () => <div>curve chart</div> }));
vi.mock("../src/charts/ZoomChart", () => ({ default: () => <div>series chart</div> }));

import App from "../src/App";
import { dayDate, weekdaysFrom } from "../src/screens/calendars/CalendarsScreen";

const close = (date: string, status: string, holiday: string, close_time = "") =>
  ({ date, status, holiday, close_time, projected: false, source: "SIFMA-US-HOLIDAYS" });

const ANSWERS: Record<string, unknown> = {
  "/api/calendars": {
    as_of: "2026-10-09",
    calendars: [
      { name: "SIFMA-US", description: "US bond market", timezone: "America/New_York", first_year: 1990, last_year: 2100,
        coverage: { published: 2, rules: 30, projected: 70, last_published_year: 2027 },
        next_close: close("2026-10-12", "closed", "Columbus Day"), next_early_close: close("2026-11-27", "early_close", "Day after Thanksgiving", "14:00") },
      { name: "KR", description: "Korean won", timezone: "Asia/Seoul", first_year: 2010, last_year: 2035,
        coverage: { published: 0, rules: 18, projected: 8, last_published_year: 0 },
        next_close: close("2026-10-09", "closed", "Hangul Day"), next_early_close: null },
    ],
  },
  "/api/calendars/upcoming": {
    start: "2026-10-09", end: "2026-10-23", calendars: ["SIFMA-US", "KR"],
    days: [
      { date: "2026-10-09", calendars: { KR: close("2026-10-09", "closed", "Hangul Day") } },
      { date: "2026-10-12", calendars: { "SIFMA-US": close("2026-10-12", "closed", "Columbus Day") } },
    ],
  },
  "/api/calendars/day": {
    date: "2026-12-25", weekday: "Friday",
    calendars: [
      { calendar: "SIFMA-US", covered: true, business_day: false, status: "closed", holiday: "Christmas Day", close_time: "", projected: false },
      { calendar: "KR", covered: true, business_day: false, status: "closed", holiday: "Christmas Day", close_time: "", projected: false },
    ],
  },
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

describe("Calendars list", () => {
  it("formats dates as YYYY-MM-DD with the weekday, and counts weekdays", () => {
    expect(dayDate("2026-10-12")).toBe("2026-10-12 Mon");
    expect(weekdaysFrom("2026-10-09", 3)).toEqual(["2026-10-09", "2026-10-12", "2026-10-13"]);
  });

  it("shows calendars as rows: the next weekdays, a picked day, the next close and early close", async () => {
    serve();
    window.history.replaceState(null, "", "/calendars?date=2026-12-25");
    render(<App />);
    expect(await screen.findByRole("columnheader", { name: "2026-10-12 Mon" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Next close" })).toBeInTheDocument();
    expect(await screen.findByText("Closed: Hangul Day")).toBeInTheDocument();
    expect(screen.getAllByText("Closed: Christmas Day")).toHaveLength(2);
    expect(screen.getByText("2026-10-12 Mon, Columbus Day")).toBeInTheDocument();
    expect(screen.getByText("2026-11-27 Fri, 14:00")).toBeInTheDocument();
    expect(screen.queryByText("Is it a business day?")).not.toBeInTheDocument();
  });
});
