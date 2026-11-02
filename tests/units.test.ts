import { describe, it, expect } from "vitest";
import { altUnit, convertToItemUnit } from "../src/lib/units";

describe("altUnit", () => {
  it("kg の相方は g", () => {
    expect(altUnit("kg")).toBe("g");
  });
  it("g の相方は kg", () => {
    expect(altUnit("g")).toBe("kg");
  });
  it("他の単位には相方なし", () => {
    expect(altUnit("箱")).toBeNull();
    expect(altUnit("P")).toBeNull();
  });
});

describe("convertToItemUnit", () => {
  it("同単位は変換しない", () => {
    expect(convertToItemUnit(5, "kg", "kg")).toBe(5);
    expect(convertToItemUnit(10, "箱", "箱")).toBe(10);
  });
  it("g → kg は 1/1000", () => {
    expect(convertToItemUnit(450, "g", "kg")).toBe(0.45);
    expect(convertToItemUnit(1500, "g", "kg")).toBe(1.5);
  });
  it("kg → g は 1000 倍", () => {
    expect(convertToItemUnit(1.5, "kg", "g")).toBe(1500);
    expect(convertToItemUnit(0.45, "kg", "g")).toBe(450);
  });
  it("対応外は値そのまま", () => {
    expect(convertToItemUnit(3, "箱", "缶")).toBe(3);
  });
});
