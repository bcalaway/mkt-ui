// @vitest-environment jsdom
// The Futures screen: products by kind, a product's generics, contracts and rules, and a basket.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/charts/CurveChart", () => ({ default: () => <div>curve chart</div> }));
vi.mock("../src/charts/ZoomChart", () => ({ default: () => <div>positioning chart</div> }));

import App from "../src/App";
import { groupDigits } from "../src/charts/positioning";

const DATES = { first_trade_date: "", last_trade_date: "", first_intention_date: "", first_notice_date: "",
  first_delivery_date: "", last_delivery_date: "", reference_start: "", reference_end: "", final_settlement_date: "",
  settlement_date: "" };
const TY = { root: "TY", cme_code: "ZN", name: "10-Year T-Note Futures", kind: "treasury", currency: "USD",
  cftc_code: "043602", front: "TYZ26", status: "listed" };
const SR3 = { root: "SFR", cme_code: "SR3", name: "Three-Month SOFR Futures", kind: "stir", currency: "USD",
  cftc_code: "", front: "SFRZ26", status: "listed" };

const ANSWERS: Record<string, unknown> = {
  "/api/futures": [TY, SR3],
  "/api/futures/TY": {
    ...TY, rules: { last_trade_date: "last_bd_minus:7" }, rule_sources: { last_trade_date: "CBOT Rulebook 19102.D." },
    basket_rule: "6.5y-10y", basket_source: "CBOT Rulebook 19104.",
    generics: [{ generic: "TY1", contract: "TYZ26" }],
    contracts: [{ name: "TYZ26", cme_code: "ZNZ6", month: "2026-12", status: "listed", basket_size: 14, ...DATES,
      last_trade_date: "2026-12-19", first_notice_date: "2026-11-30" }],
  },
  "/api/futures/contracts/TYZ26/basket": {
    contract: "TYZ26", product: "TY", month: "2026-12", status: "listed", rule: "6.5y-10y",
    deliverables: [{ security: "UST-4.25-2035-08-15", cusip: "91282CNC1", coupon: "0.0425", coupon_display: "4.25",
      maturity_date: "2035-08-15", issue_date: "2025-08-15", conversion_factor: "0.8732", remaining_months: 104 }],
  },
  "/api/sources": { sources: [] },
};

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = ANSWERS[url.split("?")[0]];
      return Promise.resolve({ ok: body !== undefined, status: body ? 200 : 404, statusText: "", headers: new Headers(),
        json: () => Promise.resolve(body ?? {}) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Futures", () => {
  it("groups digits in the string", () => {
    expect(groupDigits("5100000")).toBe("5,100,000");
    expect(groupDigits("-400")).toBe("-400");
    expect(groupDigits("12345.5")).toBe("12,345.5");
  });

  it("lists products by kind, with a Treasury front linked to its basket", async () => {
    serve();
    window.history.replaceState(null, "", "/futures");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Treasury, deliverable" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interest rate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TYZ26" })).toHaveAttribute("href", "/futures/TY/TYZ26");
    expect(screen.getByText("SFRZ26")).not.toHaveAttribute("href");
    expect(screen.getByText("Not reported")).toBeInTheDocument();
  });

  it("shows a product's generics, contracts with only the dates it has, rules and positioning", async () => {
    serve();
    window.history.replaceState(null, "", "/futures/ty");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "TY: 10-Year T-Note Futures" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "First notice" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Reference starts" })).not.toBeInTheDocument();
    expect(screen.getByText("CBOT Rulebook 19102.D.")).toBeInTheDocument();
    expect(screen.getByText("positioning chart")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dealers" }));
    expect(window.location.search).toBe("?who=dealer");
  });

  it("shows a basket with each conversion factor as given", async () => {
    serve();
    window.history.replaceState(null, "", "/futures/TY/TYZ26");
    render(<App />);
    expect(await screen.findByText("0.8732")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "UST-4.25-2035-08-15" })).toHaveAttribute("href", "/instruments/UST-4.25-2035-08-15");
    expect(screen.getByText("4.25%")).toBeInTheDocument();
  });
});
