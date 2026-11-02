import { describe, it, expect } from "vitest";
import { computeTotals, lineAmount } from "../src/lib/tax";

describe("lineAmount", () => {
  it("数量×単価を丸める", () => {
    expect(lineAmount(3, 100)).toBe(300);
    expect(lineAmount(2.5, 299)).toBe(748);
  });
});

describe("computeTotals (税抜入力)", () => {
  it("税抜合計 + 税 = 税込合計", () => {
    const r = computeTotals(
      [
        { qty: 3, unit_price: 100 },
        { qty: 2, unit_price: 200 },
      ],
      "excluded",
      8,
    );
    expect(r.excluded).toBe(700);
    expect(r.included).toBe(756);
    expect(r.tax).toBe(56);
  });

  it("税率 10% も計算", () => {
    const r = computeTotals(
      [{ qty: 1, unit_price: 1000 }],
      "excluded",
      10,
    );
    expect(r.excluded).toBe(1000);
    expect(r.included).toBe(1100);
    expect(r.tax).toBe(100);
  });
});

describe("computeTotals (税込入力)", () => {
  it("税込から税抜を逆算", () => {
    const r = computeTotals(
      [{ qty: 1, unit_price: 1080 }],
      "included",
      8,
    );
    expect(r.included).toBe(1080);
    expect(r.excluded).toBe(1000);
    expect(r.tax).toBe(80);
  });
});
