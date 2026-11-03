import { describe, it, expect } from "vitest";
import { computeQty } from "../src/lib/qty";

describe("3 端末が決定／足す／なし を混ぜる", () => {
  it("A: set 5 @ t1、B: add 2 @ t2、C: なし(set 0) @ t3 → 合計 0（最後の set=0 以降 add なし）", () => {
    const r = computeQty([
      { qty: 5, mode: "set", counted_at: 1 },
      { qty: 2, mode: "add", counted_at: 2 },
      { qty: 0, mode: "set", counted_at: 3 },
    ]);
    expect(r).toBe(0);
  });

  it("A: なし(set 0) @ t1、B: add 3 @ t2、C: add 2 @ t3 → 合計 5", () => {
    const r = computeQty([
      { qty: 0, mode: "set", counted_at: 1 },
      { qty: 3, mode: "add", counted_at: 2 },
      { qty: 2, mode: "add", counted_at: 3 },
    ]);
    expect(r).toBe(5);
  });

  it("A: add 5、B: add 3、C: set 10（決定で上書き）→ 10", () => {
    const r = computeQty([
      { qty: 5, mode: "add", counted_at: 1 },
      { qty: 3, mode: "add", counted_at: 2 },
      { qty: 10, mode: "set", counted_at: 3 },
    ]);
    expect(r).toBe(10);
  });

  it("時刻ずれ：C の set が最初に来るように counted_at が小さい場合、以降の add が加算される", () => {
    const r = computeQty([
      { qty: 10, mode: "set", counted_at: 1 },
      { qty: 5, mode: "add", counted_at: 2 },
      { qty: 3, mode: "add", counted_at: 3 },
    ]);
    expect(r).toBe(18);
  });

  it("同じ counted_at の set と add：sort は stable、挿入順が保たれる", () => {
    // 現在の実装は Array.sort。stable。
    // JavaScript の .sort() は ES2019 以降で stable。
    const r = computeQty([
      { qty: 10, mode: "set", counted_at: 100 },
      { qty: 5, mode: "add", counted_at: 100 },
    ]);
    expect(r).toBe(15);
  });

  it("A が『足す 5』、B が『なし』→ B の 0 が勝ち、合計 0", () => {
    const r = computeQty([
      { qty: 5, mode: "add", counted_at: 1 },
      { qty: 0, mode: "set", counted_at: 2 },
    ]);
    expect(r).toBe(0);
  });

  it("4 端末：set 10, add 3, add 2, set 5 → 最後の set 以降 → 5", () => {
    const r = computeQty([
      { qty: 10, mode: "set", counted_at: 1 },
      { qty: 3, mode: "add", counted_at: 2 },
      { qty: 2, mode: "add", counted_at: 3 },
      { qty: 5, mode: "set", counted_at: 4 },
    ]);
    expect(r).toBe(5);
  });
});
