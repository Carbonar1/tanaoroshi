import { describe, it, expect } from "vitest";
import { computeTotals, lineAmount } from "../src/lib/tax";

// 業者ごとの行から全体合計を手計算した結果と、computeTotals が返す値が一致する。

type Line = { qty: number; unit_price: number };

function manualTotals(lines: Line[], mode: "included" | "excluded", rate: number) {
  const sum = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  if (mode === "excluded") {
    return {
      excluded: Math.round(sum),
      included: Math.round(sum * (1 + rate / 100)),
    };
  }
  return {
    included: Math.round(sum),
    excluded: Math.round(sum / (1 + rate / 100)),
  };
}

describe("出力の金額（単価×数量、業者合計、税の切替）", () => {
  it("小数の数量と税抜入力でも、丸めと合計が合う（手計算）", () => {
    const lines: Line[] = [
      { qty: 7, unit_price: 3800 }, // 濃口醤油
      { qty: 2, unit_price: 2600 }, // 薄口醤油
      { qty: 1.5, unit_price: 480 }, // 片栗粉 1.5kg
      { qty: 11, unit_price: 320 }, // 白砂糖
    ];
    const r = computeTotals(lines, "excluded", 8);
    const m = manualTotals(lines, "excluded", 8);
    expect(r.excluded).toBe(m.excluded);
    expect(r.included).toBe(m.included);
    expect(r.tax).toBe(m.included - m.excluded);
  });

  it("税込入力の切替で、合計表示だけが変わる（単価は保持）", () => {
    const lines: Line[] = [
      { qty: 3, unit_price: 1080 }, // 税込単価
      { qty: 2, unit_price: 540 },
    ];
    const r = computeTotals(lines, "included", 8);
    const m = manualTotals(lines, "included", 8);
    expect(r.included).toBe(m.included);
    expect(r.excluded).toBe(m.excluded);
  });

  it("1 行だけ、業者小計 = 単価×数量 の丸め", () => {
    expect(lineAmount(2.35, 320)).toBe(Math.round(2.35 * 320));
    expect(lineAmount(1, 100)).toBe(100);
    expect(lineAmount(0, 999)).toBe(0);
  });

  it("業者ごとの合計を足し上げると全体合計と一致（部分和の整合）", () => {
    const supplierA: Line[] = [
      { qty: 7, unit_price: 3800 },
      { qty: 2, unit_price: 2600 },
    ];
    const supplierB: Line[] = [
      { qty: 20, unit_price: 280 }, // じゃがいも
      { qty: 15, unit_price: 220 }, // 玉ねぎ
    ];
    const all = [...supplierA, ...supplierB];
    const rA = computeTotals(supplierA, "excluded", 8);
    const rB = computeTotals(supplierB, "excluded", 8);
    const rAll = computeTotals(all, "excluded", 8);
    // 税抜は 1 円ズレの可能性もあるので誤差 1 まで許容
    expect(Math.abs(rA.excluded + rB.excluded - rAll.excluded)).toBeLessThanOrEqual(1);
  });

  it("税率 10% も OK（軽減税率ではない品目を想定）", () => {
    const lines: Line[] = [{ qty: 3, unit_price: 1000 }];
    const r = computeTotals(lines, "excluded", 10);
    expect(r.excluded).toBe(3000);
    expect(r.included).toBe(3300);
    expect(r.tax).toBe(300);
  });
});
