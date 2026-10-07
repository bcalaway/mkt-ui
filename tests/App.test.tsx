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
});
