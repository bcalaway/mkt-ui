import { describe, expect, it } from "vitest";
import { bpChange, compareDecimal } from "../src/decimal";
import { shortTenor, tenorLabel } from "../src/format";

describe("bpChange", () => {
  it("is exact, signed, in basis points", () => {
    expect(bpChange("4.10", "3.58")).toBe("+52");
    expect(bpChange("3.58", "4.10")).toBe("-52");
    expect(bpChange("4.10", "4.1")).toBe("0");
    expect(bpChange("4.125", "4.10")).toBe("+2.5");
    expect(bpChange("0.07", "0.1")).toBe("-3"); // floats would say -2.9999999999999996
  });
});

describe("compareDecimal", () => {
  it("compares exactly", () => {
    expect(compareDecimal("4.10", "4.1")).toBe(0);
    expect(compareDecimal("-0.5", "0.25")).toBe(-1);
  });
});

describe("labels", () => {
  it("shortens tenors and names", () => {
    expect(tenorLabel("P10Y")).toBe("10Y");
    expect(tenorLabel("P6W")).toBe("6W");
    expect(shortTenor("UST-1.5M-CMT")).toBe("1.5M");
    expect(shortTenor("OTHER")).toBe("OTHER");
  });
});
