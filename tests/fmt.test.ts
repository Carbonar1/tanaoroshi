import { describe, it, expect } from "vitest";
import { fmtQtyByUnit } from "../src/lib/fmt";

describe("fmtQtyByUnit", () => {
  it("kg は 3 桁まで、末尾 0 落とす", () => {
    expect(fmtQtyByUnit(1.111, "kg", 1)).toBe("1.111");
    expect(fmtQtyByUnit(1.5, "kg", 1)).toBe("1.5");
    expect(fmtQtyByUnit(2, "kg", 1)).toBe("2");
    expect(fmtQtyByUnit(0.45, "kg", 1)).toBe("0.45");
    expect(fmtQtyByUnit(0, "kg", 1)).toBe("0");
  });
  it("450g は 450", () => {
    expect(fmtQtyByUnit(450, "g", 1)).toBe("450");
  });
  it("箱は整数", () => {
    expect(fmtQtyByUnit(7, "箱", 0)).toBe("7");
  });
  it("P は整数", () => {
    expect(fmtQtyByUnit(3, "P", 0)).toBe("3");
  });
});
