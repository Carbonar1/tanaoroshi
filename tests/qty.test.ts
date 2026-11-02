import { describe, it, expect } from "vitest";
import { computeQty } from "../src/lib/qty";

describe("computeQty", () => {
  it("空は null", () => {
    expect(computeQty([])).toBeNull();
  });

  it("add のみは和", () => {
    expect(
      computeQty([
        { qty: 5, mode: "add", counted_at: 1 },
        { qty: 2, mode: "add", counted_at: 2 },
      ]),
    ).toBe(7);
  });

  it("set のみはその値", () => {
    expect(computeQty([{ qty: 3, mode: "set", counted_at: 1 }])).toBe(3);
  });

  it("set のあとの add を足す", () => {
    expect(
      computeQty([
        { qty: 5, mode: "set", counted_at: 1 },
        { qty: 2, mode: "add", counted_at: 2 },
      ]),
    ).toBe(7);
  });

  it("set 前の add は無視", () => {
    expect(
      computeQty([
        { qty: 100, mode: "add", counted_at: 1 },
        { qty: 5, mode: "set", counted_at: 2 },
        { qty: 2, mode: "add", counted_at: 3 },
      ]),
    ).toBe(7);
  });

  it("最後の set 以降だけ採用", () => {
    expect(
      computeQty([
        { qty: 10, mode: "set", counted_at: 1 },
        { qty: 1, mode: "add", counted_at: 2 },
        { qty: 5, mode: "set", counted_at: 3 },
        { qty: 2, mode: "add", counted_at: 4 },
      ]),
    ).toBe(7);
  });

  it("順序不同でも counted_at で並べる", () => {
    expect(
      computeQty([
        { qty: 2, mode: "add", counted_at: 4 },
        { qty: 5, mode: "set", counted_at: 3 },
        { qty: 1, mode: "add", counted_at: 2 },
        { qty: 10, mode: "set", counted_at: 1 },
      ]),
    ).toBe(7);
  });

  it("なし（set 0）は 0", () => {
    expect(computeQty([{ qty: 0, mode: "set", counted_at: 1 }])).toBe(0);
  });
});
